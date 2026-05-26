import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/app/lib/admin-auth'
import { backendJson } from '@/app/lib/backend'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const res = await backendJson(`/api/v1/admin/users/${id}/assign-plan`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return NextResponse.json(res.data || { error: res.error }, { status: res.status })
}
