/**
 * /auth — primary sign-in page.
 *
 * Single-method magic link via our own Resend-backed flow. No Supabase,
 * no third-party OAuth. Posts to /api/auth/request; the recipient
 * clicks the email link, which goes to /api/auth/verify, which sets
 * the stash_user session cookie and redirects to /me (or /me/setup).
 */
'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, Mail, CheckCircle, AlertTriangle } from 'lucide-react'
import { useI18n } from '@/app/lib/i18n/client'
import LangSwitcher from '@/app/components/LangSwitcher'

function AuthInner() {
  const { t } = useI18n()
  const params = useSearchParams()
  const queryError = params.get('magic_error')
  const errorLabels: Record<string, string> = {
    expired: t('auth.err_expired'),
    bad_signature: t('auth.err_bad_signature'),
    malformed: t('auth.err_malformed'),
    signin_failed: t('auth.err_signin_failed'),
    session_invalid: t('auth.err_session_invalid'),
  }
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(queryError ? (errorLabels[queryError] || `Sign-in error: ${queryError}`) : null)

  useEffect(() => {
    if (queryError) window.history.replaceState({}, '', '/auth')
  }, [queryError])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSending(true)
    try {
      const res = await fetch('/api/auth/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || t('auth.err_signin_failed'))
        return
      }
      setSent(true)
    } catch {
      setError(t('auth.err_connection'))
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-4 relative">
        <div className="absolute top-4 right-4"><LangSwitcher /></div>
        <div className="w-full max-w-sm text-center">
          <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-4" />
          <h1 className="text-xl font-medium text-white mb-2">{t('auth.check_email_title')}</h1>
          <p className="text-gray-500 text-sm">
            {t('auth.check_email_body', { email })}
          </p>
          <button
            onClick={() => { setSent(false); setEmail('') }}
            className="text-gray-600 hover:text-white text-xs mt-6"
          >
            {t('auth.use_different')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4 relative">
      <div className="absolute top-4 right-4"><LangSwitcher /></div>
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-medium text-white">{t('auth.title')}</h1>
          <p className="text-gray-500 text-sm mt-1">{t('auth.subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-950 border border-gray-800 p-6">
          <label className="block text-gray-500 text-xs mb-2">{t('auth.email_label')}</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('auth.email_placeholder')}
            className="w-full bg-black border border-gray-800 text-white px-3 py-2 text-sm focus:outline-none focus:border-gray-600 mb-4"
            autoFocus
          />
          {error && (
            <div className="bg-red-950/30 border border-red-900/50 text-red-300 text-xs p-2.5 mb-4 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={sending || !email}
            className="w-full bg-white hover:bg-gray-200 disabled:bg-gray-700 disabled:text-gray-500 text-black py-2 text-sm font-medium flex items-center justify-center gap-2"
          >
            {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
            {sending ? t('auth.sending') : t('auth.send_button')}
          </button>
        </form>

        <div className="text-center mt-6">
          <Link href="/" className="text-gray-600 hover:text-gray-400 text-xs">
            {t('common.back_to_stash')}
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black" />}>
      <AuthInner />
    </Suspense>
  )
}
