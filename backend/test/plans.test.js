/**
 * Money-path tests: plan assignment, entitlements, expiry, idempotency.
 *
 * Each vitest worker gets its own temp SQLite DB (DB_PATH is set before
 * db.js is required, and migrations run at require time).
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
import os from 'os'
import path from 'path'

process.env.DB_PATH = path.join(os.tmpdir(), `stash-test-plans-${process.pid}-${Date.now()}.db`)
const require = createRequire(import.meta.url)
const db = require('../db.js')

function makeUser(id) {
  return db.upsertUser({ id, email: `${id}@test.local` })
}

describe('migrations', () => {
  it('migrates a fresh DB to the latest version with seeded plans', () => {
    const plans = db.getAllPlans()
    expect(plans.length).toBe(4)
    expect(plans.map((p) => p.slug).sort()).toEqual(['archive', 'beacon', 'drift', 'signal'])
    expect(db.getDefaultPlan().slug).toBe('drift')
  })
})

describe('getActiveUserPlan entitlements', () => {
  it('a pending (unpaid) plan grants NO entitlements', () => {
    makeUser('u-pending')
    const signal = db.getPlanBySlug('signal')
    db.assignPlan('u-pending', {
      plan_id: signal.id, status: 'pending', payment_status: 'unpaid',
      payment_provider: 'stablepay', payment_reference: 'tx-pending-1',
    })
    expect(db.getActiveUserPlan('u-pending')).toBeNull()
  })

  it('a pending assignment does not displace the current active plan', () => {
    makeUser('u-keep')
    const drift = db.getPlanBySlug('drift')
    const beacon = db.getPlanBySlug('beacon')
    db.assignPlan('u-keep', { plan_id: drift.id, status: 'active' })
    db.assignPlan('u-keep', {
      plan_id: beacon.id, status: 'pending', payment_status: 'unpaid',
      payment_provider: 'stablepay', payment_reference: 'tx-keep-1',
    })
    expect(db.getActiveUserPlan('u-keep').plan_slug).toBe('drift')
  })

  it('activatePendingPlan promotes the pending row and expires the old plan', () => {
    makeUser('u-promote')
    const drift = db.getPlanBySlug('drift')
    const signal = db.getPlanBySlug('signal')
    db.assignPlan('u-promote', { plan_id: drift.id, status: 'active' })
    db.assignPlan('u-promote', {
      plan_id: signal.id, status: 'pending', payment_status: 'unpaid',
      payment_provider: 'stablepay', payment_reference: 'tx-promote-1',
    })
    const promoted = db.activatePendingPlan('u-promote', signal.id, { payment_reference: 'tx-promote-1' })
    expect(promoted).toBe(true)
    const active = db.getActiveUserPlan('u-promote')
    expect(active.plan_slug).toBe('signal')
    expect(active.payment_status).toBe('paid')
  })
})

describe('plan expiry', () => {
  it('expires a plan past ends_at (SQLite datetime format)', () => {
    makeUser('u-expired')
    const signal = db.getPlanBySlug('signal')
    db.assignPlan('u-expired', { plan_id: signal.id, status: 'active', ends_at: '2020-01-01 00:00:00' })
    expect(db.getActiveUserPlan('u-expired')).toBeNull()
  })

  it('normalizes ISO-with-Z ends_at instead of producing Invalid Date (the ZZ bug)', () => {
    makeUser('u-zz')
    const signal = db.getPlanBySlug('signal')
    // Admin route passes ISO strings ending in Z — must still expire correctly
    db.assignPlan('u-zz', { plan_id: signal.id, status: 'active', ends_at: '2020-01-01T00:00:00.000Z' })
    expect(db.getActiveUserPlan('u-zz')).toBeNull()
  })

  it('keeps a plan with a future ends_at active', () => {
    makeUser('u-future')
    const signal = db.getPlanBySlug('signal')
    db.assignPlan('u-future', { plan_id: signal.id, status: 'active', ends_at: '2099-01-01 00:00:00' })
    expect(db.getActiveUserPlan('u-future').plan_slug).toBe('signal')
  })

  it('keeps lifetime plans (null ends_at) active', () => {
    makeUser('u-life')
    const archive = db.getPlanBySlug('archive')
    db.assignPlan('u-life', { plan_id: archive.id, status: 'active', ends_at: null })
    expect(db.getActiveUserPlan('u-life').plan_slug).toBe('archive')
  })
})

describe('payment idempotency', () => {
  it('a duplicate (provider, payment_reference) does not create a second row', () => {
    makeUser('u-idem')
    const signal = db.getPlanBySlug('signal')
    const first = db.assignPlan('u-idem', {
      plan_id: signal.id, status: 'active', payment_status: 'paid',
      payment_provider: 'stripe', payment_reference: 'cs_dup_1',
    })
    const second = db.assignPlan('u-idem', {
      plan_id: signal.id, status: 'active', payment_status: 'paid',
      payment_provider: 'stripe', payment_reference: 'cs_dup_1',
    })
    expect(second.id).toBe(first.id)
    const history = db.getUserPlanHistory('u-idem')
    expect(history.filter((h) => h.payment_reference === 'cs_dup_1').length).toBe(1)
  })
})

describe('visibility whitelist', () => {
  it('rejects malformed visibility values instead of writing them', () => {
    makeUser('u-vis')
    const rec = db.insertUpload({
      source: 'web', filename: 'a.png', content_type: 'image/png', size: 10,
      irys_url: 'https://x/1', arweave_id: 'ar1', ar_url: 'ar://ar1', user_id: 'u-vis',
    })
    const updated = db.updateUserUpload('u-vis', rec.uuid, { visibility: 'Private' })
    expect(updated.visibility).toBe('private') // unchanged default, not 'Private'
  })
})
