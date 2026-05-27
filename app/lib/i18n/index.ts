/**
 * i18n core — provides `t(key, params?)` and `getLocale()` helpers.
 *
 * Locale resolution (in order):
 *   1. `stash_locale` cookie
 *   2. (server-side only) the user's preferred_locale from SQLite
 *   3. Accept-Language header / navigator.language
 *   4. 'en' fallback
 *
 * Dictionary lookups fall back en for any missing es key.
 */
import { en, es, type Dict, type Locale } from './dict'

export const LOCALE_COOKIE = 'stash_locale'
export const LOCALES: Locale[] = ['en', 'es']

const DICTS = { en, es: { ...en, ...es } as Dict }

export function isLocale(s: string | null | undefined): s is Locale {
  return s === 'en' || s === 'es'
}

export function resolveLocale(rawCookie?: string | null, rawAcceptLanguage?: string | null, userPref?: string | null): Locale {
  if (isLocale(rawCookie)) return rawCookie
  if (isLocale(userPref)) return userPref
  if (rawAcceptLanguage) {
    const lower = rawAcceptLanguage.toLowerCase()
    if (lower.startsWith('es')) return 'es'
  }
  return 'en'
}

type Section = keyof Dict
type KeyOf<S extends Section> = keyof Dict[S]
type Path<S extends Section> = `${S}.${string & KeyOf<S>}`

/** Build a `t()` bound to a specific locale. */
export function makeT(locale: Locale) {
  const dict = DICTS[locale]
  return function t<S extends Section>(path: Path<S>, params?: Record<string, string | number>): string {
    const [section, key] = path.split('.') as [S, KeyOf<S>]
    const sectionDict = dict[section] as Record<string, string>
    let value: string = sectionDict?.[key as string] ?? (DICTS.en[section] as Record<string, string>)?.[key as string] ?? path
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        value = value.replaceAll(`{${k}}`, String(v))
      }
      // Crude plural handling: {count, plural, one {…} other {…}}
      value = value.replace(/\{(\w+), plural, one \{([^}]*)\} other \{([^}]*)\}\}/g, (_m, varName, one, other) => {
        const n = params[varName]
        return Number(n) === 1 ? one.replaceAll('#', String(n)) : other.replaceAll('#', String(n))
      })
    }
    return value
  }
}

export { type Locale, type Dict } from './dict'
