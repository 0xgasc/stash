import { NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/app/lib/admin-auth'

const UPLOAD_SERVER = process.env.NEXT_PUBLIC_UPLOAD_SERVER || 'http://localhost:5050'
const ADMIN_SECRET = process.env.ADMIN_BACKEND_SECRET || ''

// GET /api/admin/link-health?uuid=... — probe one devnet copy: is the old
// link still serving the right bytes, or has it been evicted?
export async function GET(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const uuid = searchParams.get('uuid') || ''
  const res = await fetch(`${UPLOAD_SERVER}/api/v1/admin/link-health?uuid=${encodeURIComponent(uuid)}`, {
    headers: { 'X-Admin-Secret': ADMIN_SECRET },
  })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
