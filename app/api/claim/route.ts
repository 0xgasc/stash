/**
 * Public claim API used by the /claim page.
 *
 * - GET /api/claim?token=... — returns claim-preview metadata (no auth)
 * - POST /api/claim         — body { token }; requires Supabase session,
 *                              links the session's UUID to the pre-created
 *                              SQLite user record.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/app/lib/auth'
import { backendJson } from '@/app/lib/backend'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })
  const res = await backendJson(`/api/v1/users/claim-preview/${encodeURIComponent(token)}`)
  return NextResponse.json(res.data || { error: res.error }, { status: res.status })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const token = String(body.token || '').trim()
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })
  const res = await backendJson('/api/v1/users/claim', {
    method: 'POST',
    body: JSON.stringify({ claim_token: token, supabase_user_id: user.id }),
  })
  return NextResponse.json(res.data || { error: res.error }, { status: res.status })
}
