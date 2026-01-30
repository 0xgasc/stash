/**
 * POST /api/admin/logout
 *
 * Ends the admin session by clearing the `admin_token` cookie
 * (sets maxAge to 0).
 */
import { NextResponse } from 'next/server'

export async function POST() {
  const response = NextResponse.json({ success: true })

  response.cookies.set('admin_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 0,
    path: '/',
  })

  return response
}
