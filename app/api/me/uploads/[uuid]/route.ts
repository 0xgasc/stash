import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/app/lib/auth'
import { backendJson } from '@/app/lib/backend'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ uuid: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { uuid } = await params
  const res = await backendJson(`/api/v1/me/uploads/${uuid}?user_id=${encodeURIComponent(user.id)}`)
  return NextResponse.json(res.data || { error: res.error }, { status: res.status })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ uuid: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { uuid } = await params
  const body = await req.json().catch(() => ({}))
  const res = await backendJson(`/api/v1/me/uploads/${uuid}`, {
    method: 'PATCH',
    body: JSON.stringify({ ...body, user_id: user.id }),
  })
  return NextResponse.json(res.data || { error: res.error }, { status: res.status })
}
