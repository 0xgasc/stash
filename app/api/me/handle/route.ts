/**
 * POST /api/me/handle
 *
 * Claim or change the current user's handle. Verifies the Supabase
 * session, then forwards the request to the Express backend with
 * the verified user_id.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/app/lib/auth'
import { backendJson } from '@/app/lib/backend'

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const handle = String(body.handle || '').trim()
  if (!handle) return NextResponse.json({ error: 'handle required' }, { status: 400 })

  const res = await backendJson('/api/v1/users/handle', {
    method: 'POST',
    body: JSON.stringify({ user_id: user.id, handle }),
  })

  return NextResponse.json(res.data || { error: res.error }, { status: res.status })
}
