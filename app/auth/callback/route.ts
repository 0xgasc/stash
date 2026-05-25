/**
 * GET /auth/callback
 *
 * Supabase OAuth + magic-link redirect handler. Exchanges the code for
 * a session, bootstraps the SQLite users row, optionally claims an
 * anonymous upload via claim_token, then routes:
 *   - /me/setup  if the user hasn't picked a handle yet
 *   - /me        otherwise (or whatever ?redirect_to specifies, if relative + safe)
 */
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { backendJson } from '@/app/lib/backend'
import { NextRequest, NextResponse } from 'next/server'

function safeRedirect(raw: string | null): string {
  if (!raw) return '/me'
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw
  return '/me'
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const claimToken = url.searchParams.get('claim_token')
  const redirectTo = safeRedirect(url.searchParams.get('redirect_to'))

  const supabase = await createServerSupabaseClient()
  if (!supabase || !code) {
    return NextResponse.redirect(new URL('/auth', url.origin))
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data.user) {
    return NextResponse.redirect(new URL('/auth?error=exchange', url.origin))
  }

  // Bootstrap SQLite users row (idempotent upsert via backend)
  const bootRes = await backendJson<{ user: { id: string; handle: string | null } }>(
    '/api/v1/users/bootstrap',
    {
      method: 'POST',
      body: JSON.stringify({
        id: data.user.id,
        email: data.user.email,
        display_name:
          data.user.user_metadata?.full_name ||
          data.user.user_metadata?.name ||
          null,
      }),
    }
  )

  // Legacy: claim anonymous Supabase `files` row if a claim token came along.
  if (claimToken) {
    try {
      await supabase
        .from('files')
        .update({ user_id: data.user.id, claimed_at: new Date().toISOString() })
        .eq('claim_token', claimToken)
        .is('user_id', null)
    } catch { /* table may not exist — ignore */ }
  }

  const handle = bootRes.data?.user?.handle
  if (!handle) {
    return NextResponse.redirect(new URL('/me/setup', url.origin))
  }
  return NextResponse.redirect(new URL(redirectTo, url.origin))
}
