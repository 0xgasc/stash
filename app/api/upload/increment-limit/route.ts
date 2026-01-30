/**
 * POST /api/upload/increment-limit
 *
 * Called by the frontend after a successful TUS upload to increment
 * the anonymous upload counter cookie. Since the upload now goes to
 * a separate Express server, this Vercel-side endpoint handles the
 * cookie increment on the Vercel side after each successful upload.
 */
import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/app/lib/admin-auth'
import { buildIncrementedCookie, COOKIE_NAME } from '@/app/lib/upload-limiter'

export async function POST(request: NextRequest) {
  // Admin users don't get rate limited
  const isAdmin = await isAdminAuthenticated()
  if (isAdmin) {
    return NextResponse.json({ success: true, admin: true })
  }

  const currentCookie = request.cookies.get(COOKIE_NAME)?.value
  const { newCount, cookieName, cookieValue, cookieOptions } =
    buildIncrementedCookie(currentCookie)

  const response = NextResponse.json({ success: true, newCount })
  response.cookies.set(cookieName, cookieValue, cookieOptions)
  return response
}
