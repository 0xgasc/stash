/**
 * Admin authentication via HMAC-signed tokens stored in httpOnly cookies.
 *
 * Token format: `{timestamp}:{hmac-sha256(timestamp, ADMIN_PASSWORD)}`
 * Tokens expire after 24 hours based on the embedded timestamp.
 *
 * This is a lightweight alternative to full session management --
 * the ADMIN_PASSWORD env var acts as both the login credential and
 * the HMAC signing secret.
 */
import { createHmac } from 'crypto'
import { cookies } from 'next/headers'

const COOKIE_NAME = 'admin_token'
const TOKEN_MAX_AGE = 60 * 60 * 24

function getSecret(): string {
  const password = process.env.ADMIN_PASSWORD
  if (!password) throw new Error('ADMIN_PASSWORD not configured')
  return password
}

/** Creates an HMAC-signed token embedding the current timestamp. */
export function createToken(): string {
  const timestamp = Date.now().toString()
  const hmac = createHmac('sha256', getSecret()).update(timestamp).digest('hex')
  return `${timestamp}:${hmac}`
}

/** Verifies an HMAC token's signature and checks it hasn't expired (24h TTL). */
export function verifyToken(token: string): boolean {
  try {
    const [timestamp, hmac] = token.split(':')
    if (!timestamp || !hmac) return false

    const age = (Date.now() - parseInt(timestamp)) / 1000
    if (age > TOKEN_MAX_AGE) return false

    const expected = createHmac('sha256', getSecret()).update(timestamp).digest('hex')
    return hmac === expected
  } catch {
    return false
  }
}

/** Reads the admin cookie and verifies the token. Returns false if missing or invalid. */
export async function isAdminAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return false
  return verifyToken(token)
}
