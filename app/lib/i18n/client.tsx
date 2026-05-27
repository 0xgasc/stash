'use client'

/**
 * Client-side i18n: provides a context with the active locale + t() function.
 * Set the locale at app root by wrapping with <I18nProvider locale=...>.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { makeT, type Locale } from './index'

interface Ctx {
  locale: Locale
  t: ReturnType<typeof makeT>
}

const I18nContext = createContext<Ctx | null>(null)

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo(() => ({ locale, t: makeT(locale) }), [locale])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    // Render before provider mounted; fall back to English so we
    // don't crash. The provider rehydrates on first render anyway.
    return { locale: 'en', t: makeT('en') }
  }
  return ctx
}
