import { NextRequest, NextResponse } from 'next/server'
import { backendJson } from '@/app/lib/backend'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ handle: string; slug: string }> }
) {
  const { handle, slug } = await params
  const body = await req.json().catch(() => ({}))
  const password = body.password || ''

  if (!password) {
    return NextResponse.json({ ok: false, error: 'no_password' }, { status: 400 })
  }

  const res = await backendJson<{ user: unknown; folder: unknown; uploads: unknown[] }>(
    `/api/v1/u/${handle}/f/${slug}`,
    {
      cache: 'no-store',
      headers: { 'X-Folder-Password': password },
    }
  )

  if (!res.ok) {
    return NextResponse.json({ ok: false, error: 'wrong_password' }, { status: 403 })
  }

  const response = NextResponse.json({ ok: true })
  const cookieName = `stash_fpw_${handle}_${slug}`
  response.cookies.set(cookieName, password, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: `/u/${handle}/f/${slug}`,
    maxAge: 60 * 60 * 4,
  })

  return response
}
