/**
 * Magic-link auth: emails the admin a one-tap login URL.
 *
 * Token format: `{email-base64url}.{expiresAt}.{hmac}` where hmac is
 * over `email|expiresAt` keyed by ADMIN_PASSWORD. Single-use is enforced
 * by short TTL (15 min) — there's no DB consumption, but a stolen link
 * is only useful for that window.
 *
 * Allowlist via ALLOWED_ADMIN_EMAILS env var (comma-separated). If
 * unset, only the user's primary email (gasolomonc@gmail.com) is allowed.
 */
import { createHmac, timingSafeEqual } from 'crypto'

const TTL_MS = 15 * 60 * 1000

function getSecret(): string {
  const password = process.env.ADMIN_PASSWORD
  if (!password) throw new Error('ADMIN_PASSWORD not configured')
  return password
}

function getAllowlist(): string[] {
  const raw = process.env.ALLOWED_ADMIN_EMAILS || 'gasolomonc@gmail.com'
  return raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
}

export function isAllowedEmail(email: string): boolean {
  return getAllowlist().includes(email.trim().toLowerCase())
}

function b64url(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64url')
}
function fromB64url(s: string): string {
  return Buffer.from(s, 'base64url').toString('utf8')
}

export function createMagicToken(email: string): string {
  const expiresAt = Date.now() + TTL_MS
  const emailEnc = b64url(email.trim().toLowerCase())
  const payload = `${emailEnc}.${expiresAt}`
  const hmac = createHmac('sha256', getSecret()).update(payload).digest('hex')
  return `${payload}.${hmac}`
}

export function verifyMagicToken(token: string): { ok: true; email: string } | { ok: false; reason: string } {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return { ok: false, reason: 'malformed' }
    const [emailEnc, expiresStr, hmac] = parts

    const expected = createHmac('sha256', getSecret()).update(`${emailEnc}.${expiresStr}`).digest('hex')
    const a = Buffer.from(hmac, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, reason: 'bad signature' }
    }

    const expiresAt = parseInt(expiresStr, 10)
    if (Date.now() > expiresAt) return { ok: false, reason: 'expired' }

    return { ok: true, email: fromB64url(emailEnc) }
  } catch {
    return { ok: false, reason: 'malformed' }
  }
}
