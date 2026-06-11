import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
import os from 'os'
import path from 'path'

process.env.DB_PATH = path.join(os.tmpdir(), `stash-test-quota-${process.pid}-${Date.now()}.db`)
process.env.ANON_DAILY_IP_LIMIT = '2'
const require = createRequire(import.meta.url)
const db = require('../db.js')
const { checkUploadQuota } = require('../utils/quota.js')

function seedUpload({ userId = null, ip = null } = {}) {
  return db.insertUpload({
    source: 'web', filename: 'f.bin', content_type: 'application/octet-stream', size: 1,
    irys_url: 'https://x/1', arweave_id: `ar-${Math.random()}`, ar_url: 'ar://x',
    user_id: userId, ip_address: ip,
  })
}

describe('anonymous quota (server-side backstop)', () => {
  it('blocks an IP after the daily cap regardless of cookies', () => {
    seedUpload({ ip: '1.2.3.4' })
    expect(checkUploadQuota(null, '1.2.3.4').ok).toBe(true)
    seedUpload({ ip: '1.2.3.4' })
    expect(checkUploadQuota(null, '1.2.3.4').ok).toBe(false)
    // a different IP is unaffected
    expect(checkUploadQuota(null, '5.6.7.8').ok).toBe(true)
  })
})

describe('plan quota enforcement', () => {
  it('enforces the daily limit from the user plan (drift = 3/day)', () => {
    db.upsertUser({ id: 'q-user', email: 'q@test.local' })
    const drift = db.getPlanBySlug('drift')
    db.assignPlan('q-user', { plan_id: drift.id, status: 'active' })
    for (let i = 0; i < 3; i++) seedUpload({ userId: 'q-user' })
    const verdict = checkUploadQuota('q-user', '9.9.9.9')
    expect(verdict.ok).toBe(false)
    expect(verdict.error).toContain('Daily')
  })

  it('falls back to the default plan for users with no plan row', () => {
    db.upsertUser({ id: 'q-noplan', email: 'q2@test.local' })
    expect(checkUploadQuota('q-noplan', '9.9.9.9').ok).toBe(true)
  })
})
