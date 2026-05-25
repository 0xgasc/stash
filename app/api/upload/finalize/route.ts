/**
 * POST /api/upload/finalize
 *
 * Called by the browser after a TUS upload succeeds, when the user is
 * logged in. Forwards to the Express backend's /tus-upload/complete
 * with the verified user_id + folder_id (so the upload is stamped
 * with the right owner and dropped into the right folder).
 *
 * Anonymous uploads continue to hit the backend directly — that path
 * remains supported.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/app/lib/auth'

const UPLOAD_SERVER = process.env.NEXT_PUBLIC_UPLOAD_SERVER || 'http://localhost:5050'
const ADMIN_SECRET = process.env.ADMIN_BACKEND_SECRET || ''

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { uploadId, originalFilename, folder_id, source } = body || {}
  if (!uploadId || !originalFilename) {
    return NextResponse.json({ error: 'uploadId and originalFilename required' }, { status: 400 })
  }

  const upstream = await fetch(`${UPLOAD_SERVER}/tus-upload/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Secret': ADMIN_SECRET,
    },
    body: JSON.stringify({
      uploadId,
      originalFilename,
      source: source || 'web',
      user_id: user.id,
      folder_id: folder_id || null,
    }),
  })

  let data: unknown
  try { data = await upstream.json() } catch { data = null }
  return NextResponse.json(data || { error: 'upstream_error' }, { status: upstream.status })
}
