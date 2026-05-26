import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/app/lib/admin-auth'
import { backendJson } from '@/app/lib/backend'

export async function GET() {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const res = await backendJson('/api/v1/admin/plans')
  return NextResponse.json(res.data || { error: res.error }, { status: res.status })
}

export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const res = await backendJson('/api/v1/admin/plans', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return NextResponse.json(res.data || { error: res.error }, { status: res.status })
}
