import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/app/lib/auth'
import { backendJson } from '@/app/lib/backend'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const res = await backendJson(`/api/v1/me/folders/${id}?user_id=${encodeURIComponent(user.id)}`)
  return NextResponse.json(res.data || { error: res.error }, { status: res.status })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const res = await backendJson(`/api/v1/me/folders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ ...body, user_id: user.id }),
  })
  return NextResponse.json(res.data || { error: res.error }, { status: res.status })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const res = await backendJson(`/api/v1/me/folders/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({ user_id: user.id }),
  })
  return NextResponse.json(res.data || { error: res.error }, { status: res.status })
}
