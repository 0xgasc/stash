/**
 * HMAC-signed cookie-based upload rate limiter for anonymous users.
 *
 * Tracks upload count in an httpOnly cookie with format `count:timestamp:hmac`.
 * The HMAC (SHA-256, keyed with ADMIN_PASSWORD) prevents client-side
 * tampering. Cookie has a 30-day TTL.
 */
import { createHmac } from 'crypto'
import { cookies } from 'next/headers'

const COOKIE_NAME = 'anon_uploads'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

function getSecret(): string {
  const password = process.env.ADMIN_PASSWORD
  if (!password) throw new Error('ADMIN_PASSWORD not configured')
  return password
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('hex')
}

function parseUploadCookie(cookieValue: string): { count: number; createdAt: number } | null {
  try {
    const parts = cookieValue.split(':')
    if (parts.length !== 3) return null
    const [countStr, timestampStr, hmac] = parts
    const payload = `${countStr}:${timestampStr}`
    if (sign(payload) !== hmac) return null
    return { count: parseInt(countStr), createdAt: parseInt(timestampStr) }
  } catch {
    return null
  }
}

function createUploadCookie(count: number, createdAt?: number): string {
  const ts = createdAt ?? Date.now()
  const payload = `${count}:${ts}`
  return `${payload}:${sign(payload)}`
}

export async function getAnonymousUploadCount(): Promise<number> {
  const cookieStore = await cookies()
  const cookie = cookieStore.get(COOKIE_NAME)?.value
  if (!cookie) return 0
  const parsed = parseUploadCookie(cookie)
  return parsed?.count ?? 0
}

export function buildIncrementedCookie(currentCookieValue?: string): {
  newCount: number
  cookieName: string
  cookieValue: string
  cookieOptions: {
    httpOnly: boolean
    secure: boolean
    sameSite: 'strict'
    maxAge: number
    path: string
  }
} {
  const parsed = currentCookieValue ? parseUploadCookie(currentCookieValue) : null
  const currentCount = parsed?.count ?? 0
  const createdAt = parsed?.createdAt ?? Date.now()
  const newCount = currentCount + 1

  return {
    newCount,
    cookieName: COOKIE_NAME,
    cookieValue: createUploadCookie(newCount, createdAt),
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    },
  }
}

export { COOKIE_NAME }
