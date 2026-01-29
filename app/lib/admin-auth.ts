import { createHmac } from 'crypto'
import { cookies } from 'next/headers'

const COOKIE_NAME = 'admin_token'
const TOKEN_MAX_AGE = 60 * 60 * 24 // 24 hours

function getSecret(): string {
  const password = process.env.ADMIN_PASSWORD
  if (!password) throw new Error('ADMIN_PASSWORD not configured')
  return password
}

export function createToken(): string {
  const timestamp = Date.now().toString()
  const hmac = createHmac('sha256', getSecret()).update(timestamp).digest('hex')
  return `${timestamp}:${hmac}`
}

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

export async function isAdminAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return false
  return verifyToken(token)
}
