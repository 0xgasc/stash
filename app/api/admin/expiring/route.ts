import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/app/lib/admin-auth'

const UPLOAD_SERVER = process.env.NEXT_PUBLIC_UPLOAD_SERVER || 'http://localhost:5050'
const ADMIN_SECRET = process.env.ADMIN_BACKEND_SECRET || ''

export async function GET(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const limit = req.nextUrl.searchParams.get('limit') || '20'

  const BACKEND_URLS = [
    UPLOAD_SERVER,
    'https://stash-production-47fc.up.railway.app',
  ].filter(Boolean)

  for (const backend of BACKEND_URLS) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10_000)

      const res = await fetch(`${backend}/api/v1/uploads/expiring?limit=${limit}`, {
        headers: { 'X-Admin-Secret': ADMIN_SECRET },
        signal: controller.signal,
      })
      clearTimeout(timeout)

      const data = await res.json()
      return NextResponse.json(data, { status: res.status })
    } catch (err: any) {
      console.warn(`expiring proxy to ${backend} failed:`, err.message)
    }
  }

  return NextResponse.json(
    { error: 'Backend unavailable', uploads: [] },
    { status: 502 },
  )
}