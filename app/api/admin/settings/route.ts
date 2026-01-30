/**
 * GET/PUT /api/admin/settings
 *
 * Admin-only endpoint for reading and updating app settings.
 * GET returns current settings, defaults, and whether Vercel KV is configured.
 * PUT validates and persists setting changes to Vercel KV.
 *
 * Settings: MAX_ANONYMOUS_UPLOADS (0-100), MAX_FILE_SIZE_MB (1-10240),
 * LINK_EXPIRY_DAYS (1-365).
 */
import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/app/lib/admin-auth'
import { getSettings, updateSettings, SETTING_DEFAULTS } from '@/app/lib/settings'

export async function GET() {
  const authed = await isAdminAuthenticated()
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const settings = await getSettings()
  const kvConfigured = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
  return NextResponse.json({ settings, defaults: SETTING_DEFAULTS, kvConfigured })
}

export async function PUT(request: NextRequest) {
  const authed = await isAdminAuthenticated()
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const updates: Record<string, number> = {}

    if (body.MAX_ANONYMOUS_UPLOADS !== undefined) {
      const val = parseInt(body.MAX_ANONYMOUS_UPLOADS)
      if (isNaN(val) || val < 0 || val > 100) {
        return NextResponse.json({ error: 'MAX_ANONYMOUS_UPLOADS must be 0-100' }, { status: 400 })
      }
      updates.MAX_ANONYMOUS_UPLOADS = val
    }
    if (body.MAX_FILE_SIZE_MB !== undefined) {
      const val = parseInt(body.MAX_FILE_SIZE_MB)
      if (isNaN(val) || val < 1 || val > 10240) {
        return NextResponse.json({ error: 'MAX_FILE_SIZE_MB must be 1-10240' }, { status: 400 })
      }
      updates.MAX_FILE_SIZE_MB = val
    }
    if (body.LINK_EXPIRY_DAYS !== undefined) {
      const val = parseInt(body.LINK_EXPIRY_DAYS)
      if (isNaN(val) || val < 1 || val > 365) {
        return NextResponse.json({ error: 'LINK_EXPIRY_DAYS must be 1-365' }, { status: 400 })
      }
      updates.LINK_EXPIRY_DAYS = val
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid settings provided' }, { status: 400 })
    }

    const settings = await updateSettings(updates)
    return NextResponse.json({ settings })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
