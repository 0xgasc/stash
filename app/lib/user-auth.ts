/**
 * Self-contained user auth — no Supabase, no third-party provider.
 *
 * Two token types:
 *   1. Magic-link token (in the email URL) — encodes the recipient's
 *      email and (optionally) a claim_token, HMAC-signed, 15 min TTL.
 *   2. Session token (stored in httpOnly cookie) — encodes the
 *      internal users.id and an expiry, HMAC-signed, 30-day TTL.
 *
 * Both use ADMIN_PASSWORD as the HMAC secret. Tokens are stateless;
 * no server-side session storage required.
 */
import { createHmac, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'

const MAGIC_TTL_MS = 15 * 60 * 1000
const SESSION_TTL_SEC = 30 * 24 * 60 * 60
export const USER_SESSION_COOKIE = 'stash_user'

function getSecret(): string {
  const s = process.env.ADMIN_PASSWORD
  if (!s) throw new Error('ADMIN_PASSWORD not configured')
  return s
}

function b64url(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64url')
}
function fromB64url(s: string): string {
  return Buffer.from(s, 'base64url').toString('utf8')
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
  } catch {
    return false
  }
}

// =====================================================
// Magic-link tokens (used in email URLs)
// =====================================================
export function createMagicLinkToken(email: string, claimToken: string | null = null): string {
  const expiresAt = Date.now() + MAGIC_TTL_MS
  const emailEnc = b64url(email.trim().toLowerCase())
  const claimEnc = b64url(claimToken || '')
  const payload = `user:${emailEnc}:${claimEnc}:${expiresAt}`
  const hmac = createHmac('sha256', getSecret()).update(payload).digest('hex')
  return `${payload}:${hmac}`
}

export function verifyMagicLinkToken(token: string): { ok: true; email: string; claimToken: string | null } | { ok: false; reason: string } {
  try {
    const parts = token.split(':')
    if (parts.length !== 5 || parts[0] !== 'user') return { ok: false, reason: 'malformed' }
    const [, emailEnc, claimEnc, expStr, hmac] = parts
    const expected = createHmac('sha256', getSecret()).update(`user:${emailEnc}:${claimEnc}:${expStr}`).digest('hex')
    if (!safeEqual(hmac, expected)) return { ok: false, reason: 'bad_signature' }
    if (Date.now() > parseInt(expStr, 10)) return { ok: false, reason: 'expired' }
    const email = fromB64url(emailEnc)
    const claimToken = fromB64url(claimEnc) || null
    return { ok: true, email, claimToken }
  } catch {
    return { ok: false, reason: 'malformed' }
  }
}

// =====================================================
// Session tokens (stored in httpOnly cookie)
// =====================================================
export function createSessionToken(userId: string): string {
  const expiresAt = Date.now() + SESSION_TTL_SEC * 1000
  const payload = `${userId}:${expiresAt}`
  const hmac = createHmac('sha256', getSecret()).update(payload).digest('hex')
  return `${payload}:${hmac}`
}

export function verifySessionToken(token: string): { ok: true; userId: string } | { ok: false } {
  try {
    const parts = token.split(':')
    if (parts.length !== 3) return { ok: false }
    const [userId, expStr, hmac] = parts
    const expected = createHmac('sha256', getSecret()).update(`${userId}:${expStr}`).digest('hex')
    if (!safeEqual(hmac, expected)) return { ok: false }
    if (Date.now() > parseInt(expStr, 10)) return { ok: false }
    return { ok: true, userId }
  } catch {
    return { ok: false }
  }
}

export async function getSessionUserId(): Promise<string | null> {
  const c = await cookies()
  const val = c.get(USER_SESSION_COOKIE)?.value
  if (!val) return null
  const r = verifySessionToken(val)
  return r.ok ? r.userId : null
}
