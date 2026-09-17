/**
 * Upload-token tests: mint, verify, tamper/expiry rejection, and cap checks.
 *
 * These cover the browser-upload credential for external tenants (FlyIn):
 * an opaque, expiring, HMAC-signed token minted with a tenant's API key and
 * spent on the TUS endpoint via X-Upload-Token — so no API key ever goes in
 * a public JS bundle.
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'

process.env.ADMIN_BACKEND_SECRET = 'test-admin-backend-secret-for-tokens'
const require = createRequire(import.meta.url)
const {
  mintUploadToken, verifyToken, checkTokenCaps,
  DEFAULT_EXPIRY_MIN, MAX_EXPIRY_MIN, DEFAULT_MAX_BYTES,
} = require('../utils/uploadToken.js')

const MB = 1024 * 1024

describe('mintUploadToken', () => {
  it('mints an opaque two-part token with the expected scope', () => {
    const { token, exp, maxBytes, source, extensions } = mintUploadToken({
      apiKeyId: 7, source: 'flyin', maxBytes: 50 * MB, expiresInMinutes: 15,
    })
    expect(typeof token).toBe('string')
    expect(token.split('.')).toHaveLength(2)
    expect(source).toBe('flyin')
    expect(maxBytes).toBe(50 * MB)
    expect(extensions).toBeNull()
    expect(exp).toBeGreaterThan(Math.floor(Date.now() / 1000))
  })

  it('clamps maxBytes and expiresInMinutes to safe bounds', () => {
    const tiny = mintUploadToken({ apiKeyId: 1, source: 's', maxBytes: 1, expiresInMinutes: -5 })
    expect(tiny.maxBytes).toBeGreaterThanOrEqual(1024)
    expect(tiny.exp).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + MAX_EXPIRY_MIN * 60)

    const huge = mintUploadToken({ apiKeyId: 1, source: 's', maxBytes: Number.MAX_SAFE_INTEGER, expiresInMinutes: 999999 })
    expect(huge.maxBytes).toBeLessThanOrEqual(DEFAULT_MAX_BYTES())
    expect(huge.exp).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + MAX_EXPIRY_MIN * 60)
  })

  it('normalizes allowed extensions (strips dots, lowercases, drops empties)', () => {
    const { extensions } = mintUploadToken({
      apiKeyId: 2, source: 'flyin', extensions: ['JPG', '.png', '', '  ', 'mp4'],
    })
    expect(extensions).toEqual(['jpg', 'png', 'mp4'])
  })
})

describe('verifyToken', () => {
  it('accepts a freshly minted token', () => {
    const { token } = mintUploadToken({ apiKeyId: 9, source: 'flyin', maxBytes: 5 * MB })
    const v = verifyToken(token)
    expect(v.ok).toBe(true)
    expect(v.payload.k).toBe(9)
    expect(v.payload.source).toBe('flyin')
    expect(v.payload.mb).toBe(5 * MB)
  })

  it('rejects a token whose signature was altered', () => {
    const { token } = mintUploadToken({ apiKeyId: 9, source: 'flyin' })
    const dot = token.indexOf('.')
    const tampered = token.slice(0, dot) + '.' + (token.slice(dot + 1).endsWith('a') ? 'b' : 'a')
    const v = verifyToken(tampered)
    expect(v.ok).toBe(false)
    expect(v.error).toBe('bad signature')
  })

  it('rejects an expired token', () => {
    const { token } = mintUploadToken({ apiKeyId: 9, source: 'flyin', expiresInMinutes: 1 })
    const v = verifyToken(token, Date.now() + 120 * 1000)
    expect(v.ok).toBe(false)
    expect(v.error).toBe('expired')
  })

  it('rejects garbage and missing tokens', () => {
    expect(verifyToken(null).ok).toBe(false)
    expect(verifyToken('').ok).toBe(false)
    expect(verifyToken('just-one-part').ok).toBe(false)
    expect(verifyToken('a.b.c').ok).toBe(false)
  })
})

describe('checkTokenCaps', () => {
  // checkTokenCaps consumes a *verified* token payload ({mb, ext, source, k}),
  // i.e. the shape verifyToken() returns — same as what server.js feeds it.
  const payload = verifyToken(
    mintUploadToken({ apiKeyId: 3, source: 'flyin', maxBytes: 10 * MB, extensions: ['jpg', 'png', 'mp4'] }).token
  ).payload

  it('passes an in-cap, allowed file', () => {
    expect(checkTokenCaps(payload, { size: 5 * MB, filename: 'photo.JPG' })).toEqual({ ok: true })
  })

  it('rejects an oversized upload', () => {
    const r = checkTokenCaps(payload, { size: 11 * MB, filename: 'a.mp4' })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/allows max/)
  })

  it('rejects a disallowed extension', () => {
    const r = checkTokenCaps(payload, { size: 100, filename: 'pwned.exe' })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/not allowed/)
  })

  it('is size-only when the token has no extension restriction', () => {
    const open = verifyToken(
      mintUploadToken({ apiKeyId: 4, source: 'flyin', maxBytes: 10 * MB }).token
    ).payload
    expect(checkTokenCaps(open, { size: 5 * MB, filename: 'anything.tar.gz' })).toEqual({ ok: true })
    expect(checkTokenCaps(open, { size: 5 * MB, filename: 'no-ext' })).toEqual({ ok: true })
  })
})

describe('DEFAULT_EXPIRY_MIN', () => {
  it('keeps the documented default', () => {
    expect(DEFAULT_EXPIRY_MIN).toBe(15)
  })
})