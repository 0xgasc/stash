/**
 * Server-side locale resolution + t() factory.
 */
import { cookies, headers } from 'next/headers'
import { LOCALE_COOKIE, makeT, resolveLocale, type Locale } from './index'

export async function getServerLocale(userPref?: string | null): Promise<Locale> {
  const cookieStore = await cookies()
  const headerStore = await headers()
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value || null
  const acceptLanguage = headerStore.get('accept-language')
  return resolveLocale(cookieLocale, acceptLanguage, userPref)
}

export async function getServerT(userPref?: string | null) {
  const locale = await getServerLocale(userPref)
  return { t: makeT(locale), locale }
}
