/**
 * GET /auth/callback (legacy)
 *
 * Was the Supabase OAuth callback. We no longer use Supabase for auth.
 * Any stale link that lands here just sends the user to the new auth
 * page so the sign-in flow restarts cleanly.
 */
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  return NextResponse.redirect(new URL('/auth', url.origin))
}
