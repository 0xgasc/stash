import { NextResponse } from 'next/server'
import { USER_SESSION_COOKIE } from '@/app/lib/user-auth'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(USER_SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return res
}
