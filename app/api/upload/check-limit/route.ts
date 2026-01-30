/**
 * GET /api/upload/check-limit
 *
 * Public endpoint that returns the current anonymous upload count,
 * remaining uploads, whether the limit has been reached, and the
 * max file size. Used by the client to show "X/Y uploads left".
 */
import { NextResponse } from 'next/server'
import { getAnonymousUploadCount } from '@/app/lib/upload-limiter'
import { getSettings } from '@/app/lib/settings'

export async function GET() {
  const [count, settings] = await Promise.all([
    getAnonymousUploadCount(),
    getSettings(),
  ])

  return NextResponse.json({
    count,
    limit: settings.MAX_ANONYMOUS_UPLOADS,
    remaining: Math.max(0, settings.MAX_ANONYMOUS_UPLOADS - count),
    limitReached: count >= settings.MAX_ANONYMOUS_UPLOADS,
    maxFileSizeMB: settings.MAX_FILE_SIZE_MB,
  })
}
