import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
import os from 'os'
import path from 'path'
import crypto from 'crypto'

process.env.DB_PATH = path.join(os.tmpdir(), `stash-test-wh-${process.pid}-${Date.now()}.db`)
const require = createRequire(import.meta.url)
const { computeEndsAt, timingSafeHex } = require('../routes/webhooks.js')

describe('computeEndsAt', () => {
  it('one_time plans never expire', () => {
    expect(computeEndsAt({ billing_period: 'one_time' })).toBeNull()
  })

  it('monthly plans get ~+1 month in SQLite format', () => {
    const out = computeEndsAt({ billing_period: 'monthly' })
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    const ends = new Date(out.replace(' ', 'T') + 'Z')
    const days = (ends - Date.now()) / 86400000
    expect(days).toBeGreaterThan(27)
    expect(days).toBeLessThan(32)
  })

  it('yearly plans get ~+1 year', () => {
    const out = computeEndsAt({ billing_period: 'yearly' })
    const ends = new Date(out.replace(' ', 'T') + 'Z')
    const days = (ends - Date.now()) / 86400000
    expect(days).toBeGreaterThan(360)
    expect(days).toBeLessThan(370)
  })
})

describe('timingSafeHex', () => {
  it('accepts a matching signature', () => {
    const body = Buffer.from('{"event":"payment.completed"}')
    const sig = crypto.createHmac('sha256', 'secret').update(body).digest('hex')
    expect(timingSafeHex(sig, sig)).toBe(true)
  })

  it('rejects a wrong signature without throwing', () => {
    expect(timingSafeHex('deadbeef', 'cafebabe')).toBe(false)
    expect(timingSafeHex('', 'cafebabe')).toBe(false)
    expect(timingSafeHex(undefined, 'cafebabe')).toBe(false)
  })
})
