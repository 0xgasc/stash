/**
 * GET /api/auth/verify?token=...&redirect_to=...
 *
 * Verifies an emailed magic-link token and finalises the sign-in:
 *   - Decodes email (+ optional claim_token) from the HMAC-signed token.
 *   - Calls backend POST /users/email-signin which handles all four
 *     cases (new user / returning user / placeholder auto-claim / explicit claim).
 *   - Sets the httpOnly stash_user session cookie.
 *   - Redirects to /me (or /me/setup if no handle yet) — or to a
 *     same-origin redirect_to passed in the query.
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyMagicLinkToken, createSessionToken, USER_SESSION_COOKIE } from '@/app/lib/user-auth'
import { backendJson } from '@/app/lib/backend'

interface SigninResult { user_id: string; was_new: boolean; was_claim: boolean }
interface StashUser { id: string; handle: string | null }

function safeRedirect(raw: string | null): string {
  if (!raw) return '/me'
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw
  return '/me'
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  const redirectTo = safeRedirect(url.searchParams.get('redirect_to'))

  if (!token) {
    return NextResponse.redirect(new URL('/auth?magic_error=missing', url.origin))
  }

  const verified = verifyMagicLinkToken(token)
  if (!verified.ok) {
    return NextResponse.redirect(new URL(`/auth?magic_error=${encodeURIComponent(verified.reason)}`, url.origin))
  }

  // Resolve email → users.id via the backend (handles all 4 cases)
  const signin = await backendJson<SigninResult>('/api/v1/users/email-signin', {
    method: 'POST',
    body: JSON.stringify({ email: verified.email, claim_token: verified.claimToken }),
  })
  if (!signin.ok || !signin.data) {
    return NextResponse.redirect(new URL(`/auth?magic_error=${encodeURIComponent(signin.error || 'signin_failed')}`, url.origin))
  }

  // Look up handle to decide where to send them
  const userRes = await backendJson<{ user: StashUser }>(
    `/api/v1/users/me?user_id=${encodeURIComponent(signin.data.user_id)}`,
  )
  const handle = userRes.data?.user?.handle

  const sessionCookie = createSessionToken(signin.data.user_id)
  const dest = handle ? redirectTo : '/me/setup'
  const res = NextResponse.redirect(new URL(dest, url.origin))
  res.cookies.set(USER_SESSION_COOKIE, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  })
  return res
}
