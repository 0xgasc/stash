/**
 * POST /api/admin/reset-limit
 *
 * Admin-only endpoint that deletes the `anon_uploads` cookie,
 * resetting the anonymous upload counter for the current browser.
 */
import { NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/app/lib/admin-auth'
import { COOKIE_NAME } from '@/app/lib/upload-limiter'

export async function POST() {
  const isAdmin = await isAdminAuthenticated()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const response = NextResponse.json({ success: true, message: 'Upload limit cookie cleared' })
  response.cookies.delete(COOKIE_NAME)
  return response
}
