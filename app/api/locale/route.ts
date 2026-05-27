/**
 * POST /api/locale — set the stash_locale cookie. If the user is
 * logged in, persist the choice to users.preferred_locale.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/app/lib/auth'
import { backendJson } from '@/app/lib/backend'
import { LOCALE_COOKIE, isLocale } from '@/app/lib/i18n'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const locale = body.locale
  if (!isLocale(locale)) return NextResponse.json({ error: 'invalid locale' }, { status: 400 })

  const res = NextResponse.json({ ok: true, locale })
  res.cookies.set(LOCALE_COOKIE, locale, {
    httpOnly: false,           // intentionally readable so client components could honour it
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 365 * 24 * 60 * 60,
  })

  const user = await getSessionUser()
  if (user) {
    await backendJson('/api/v1/users/profile', {
      method: 'PATCH',
      body: JSON.stringify({ user_id: user.id, preferred_locale: locale }),
    })
  }

  return res
}
