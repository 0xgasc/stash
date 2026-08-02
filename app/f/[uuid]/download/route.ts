import { NextRequest, NextResponse } from 'next/server'

const UPLOAD_SERVER = process.env.NEXT_PUBLIC_UPLOAD_SERVER || 'http://localhost:5050'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  const { uuid } = await params
  if (!/^[A-Za-z0-9-]{8,64}$/.test(uuid)) {
    return new NextResponse('Invalid id', { status: 400 })
  }

  try {
    const res = await fetch(`${UPLOAD_SERVER}/f/${uuid}/raw`, { cache: 'no-store' })
    if (!res.ok) {
      return new NextResponse('Not found', { status: res.status })
    }

    const contentType = res.headers.get('content-type') || 'application/octet-stream'
    const disposition = res.headers.get('content-disposition') || ''
    const filenameMatch = disposition.match(/filename="([^"]+)"/)
    const filename = filenameMatch ? filenameMatch[1] : uuid

    return new NextResponse(res.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch {
    return new NextResponse('Temporarily unavailable', { status: 503 })
  }
}
