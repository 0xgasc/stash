'use client'

import { useState } from 'react'
import { Mail, Loader2, AlertTriangle, CheckCircle } from 'lucide-react'
import { useI18n } from '@/app/lib/i18n/client'

export default function ClaimClient({
  token, email,
}: {
  token: string
  email: string
}) {
  const { t } = useI18n()
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const sendLink = async () => {
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, claim_token: token }),
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
      <div className="bg-gray-950 border border-gray-800 p-5 text-center">
        <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-3" />
        <p className="text-white mb-1">{t('claim.link_sent_title')}</p>
        <p className="text-gray-500 text-sm">{t('claim.link_sent_body', { email })}</p>
        <p className="text-gray-600 text-xs mt-3">{t('claim.link_expires')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="bg-red-950/30 border border-red-900/50 text-red-300 text-xs p-2.5 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}
      <button
        onClick={sendLink}
        disabled={sending}
        className="w-full bg-white hover:bg-gray-200 disabled:bg-gray-700 disabled:text-gray-500 text-black py-2.5 text-sm font-medium flex items-center justify-center gap-2"
      >
        {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
        {sending ? t('claim.sending') : t('claim.send_link_button', { email })}
      </button>
      <p className="text-xs text-gray-600 text-center">{t('claim.explainer')}</p>
    </div>
  )
}
