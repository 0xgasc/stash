/**
 * Magic-link verification. On success, sets the same admin cookie used
 * by the password login flow and redirects to /admin.
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyMagicToken } from '@/app/lib/magic-link'
import { createToken } from '@/app/lib/admin-auth'

const COOKIE_NAME = 'admin_token'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) {
    return errorRedirect(req, 'missing-token')
  }

  const result = verifyMagicToken(token)
  if (!result.ok) {
    return errorRedirect(req, result.reason)
  }

  const adminToken = createToken()
  const res = NextResponse.redirect(new URL('/admin', req.url))
  res.cookies.set(COOKIE_NAME, adminToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24,
  })
  return res
}

function errorRedirect(req: NextRequest, reason: string) {
  const url = new URL('/admin', req.url)
  url.searchParams.set('magic_error', reason)
  return NextResponse.redirect(url)
}
