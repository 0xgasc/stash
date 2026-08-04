/**
 * GET /f/:uuid — stable permanent link.
 *
 * 302s to the upload's CURRENT gateway URL (the re-upload cron rewrites
 * it in the backend DB every refresh cycle). Consumers should store
 * https://stash.offsetworks.xyz/f/<uuid> instead of raw gateway URLs so
 * links transparently survive devnet eviction.
 *
 * Deliberately 302 + no-store: a 301 would be cached permanently by
 * browsers/CDNs and recreate the dead-link problem.
 */
import { NextRequest, NextResponse } from 'next/server'

const UPLOAD_SERVER = process.env.NEXT_PUBLIC_UPLOAD_SERVER || 'http://localhost:5050'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  const { uuid } = await params
  if (!/^[A-Za-z0-9-]{8,64}$/.test(uuid)) {
    return new NextResponse('Invalid id', { status: 400 })
  }

  try {
    const headers: Record<string, string> = {}
    const range = req.headers.get('range')
    if (range) headers['Range'] = range

    const res = await fetch(`${UPLOAD_SERVER}/f/${uuid}`, {
      redirect: 'manual',
      cache: 'no-store',
      headers,
    })

    const location = res.headers.get('location')
    if (location) {
      return NextResponse.redirect(location, {
        status: 302,
        headers: { 'Cache-Control': 'no-store', ...CORS_HEADERS },
      })
    }

    if ((res.ok || res.status === 206) && res.body) {
      const respHeaders: Record<string, string> = {
        'Content-Type': res.headers.get('content-type') || 'application/octet-stream',
        'Cache-Control': res.headers.get('cache-control') || 'public, max-age=86400',
        'Accept-Ranges': 'bytes',
        ...CORS_HEADERS,
      }
      const contentRange = res.headers.get('content-range')
      if (contentRange) respHeaders['Content-Range'] = contentRange
      const contentLength = res.headers.get('content-length')
      if (contentLength) respHeaders['Content-Length'] = contentLength

      return new NextResponse(res.body, {
        status: res.status,
        headers: respHeaders,
      })
    }

    return new NextResponse('Not found', { status: 404 })
  } catch {
    return new NextResponse('Temporarily unavailable', { status: 503 })
  }
}
