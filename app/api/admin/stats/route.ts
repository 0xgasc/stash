import { NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/app/lib/admin-auth'

const UPLOAD_SERVER = process.env.NEXT_PUBLIC_UPLOAD_SERVER || 'http://localhost:5050'
const ADMIN_SECRET = process.env.ADMIN_BACKEND_SECRET || ''

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const res = await fetch(`${UPLOAD_SERVER}/api/v1/stats`, {
    headers: { 'X-Admin-Secret': ADMIN_SECRET },
  })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
