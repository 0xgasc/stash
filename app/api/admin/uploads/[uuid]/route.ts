import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/app/lib/admin-auth'

const UPLOAD_SERVER = process.env.NEXT_PUBLIC_UPLOAD_SERVER || 'http://localhost:5050'
const ADMIN_SECRET = process.env.ADMIN_BACKEND_SECRET || ''

export async function GET(_req: NextRequest, { params }: { params: Promise<{ uuid: string }> }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { uuid } = await params
  const res = await fetch(`${UPLOAD_SERVER}/api/v1/uploads/${uuid}`, {
    headers: { 'X-Admin-Secret': ADMIN_SECRET },
  })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ uuid: string }> }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { uuid } = await params
  const res = await fetch(`${UPLOAD_SERVER}/api/v1/uploads/${uuid}/reupload`, {
    method: 'POST',
    headers: { 'X-Admin-Secret': ADMIN_SECRET },
  })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
