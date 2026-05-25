import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/app/lib/auth'
import { backendJson } from '@/app/lib/backend'

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const params = new URLSearchParams({ user_id: user.id })
  const folderId = req.nextUrl.searchParams.get('folder_id')
  const limit = req.nextUrl.searchParams.get('limit')
  if (folderId) params.set('folder_id', folderId)
  if (limit) params.set('limit', limit)
  const res = await backendJson(`/api/v1/me/uploads?${params}`)
  return NextResponse.json(res.data || { error: res.error }, { status: res.status })
}
