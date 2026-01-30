/**
 * POST /api/admin/login
 *
 * Authenticates admin users via password. Validates against the
 * ADMIN_PASSWORD env var, then sets an HMAC-signed httpOnly cookie
 * (`admin_token`) with a 24-hour TTL.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createToken } from '@/app/lib/admin-auth'

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json()
    const adminPassword = process.env.ADMIN_PASSWORD

    if (!adminPassword) {
      return NextResponse.json(
        { error: 'ADMIN_PASSWORD not configured' },
        { status: 500 }
      )
    }

    if (password !== adminPassword) {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      )
    }

    const token = createToken()
    const response = NextResponse.json({ success: true })

    response.cookies.set('admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/',
    })

    return response
  } catch {
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    )
  }
}
