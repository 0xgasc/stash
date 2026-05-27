'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, AlertTriangle, CheckCircle } from 'lucide-react'
import { useI18n } from '@/app/lib/i18n/client'

export default function HandlePicker({ initial = '' }: { initial?: string }) {
  const { t } = useI18n()
  const router = useRouter()
  const [handle, setHandle] = useState(initial)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const REASON_MESSAGES: Record<string, string> = {
    invalid_format: t('setup.err_invalid_format'),
    too_short: t('setup.err_too_short'),
    reserved: t('setup.err_reserved'),
    reserved_slug: t('setup.err_reserved'),
    taken: t('setup.err_taken'),
    cooldown: t('setup.err_cooldown'),
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/me/handle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: handle.trim() }),
      })
      const data = await res.json()
      if (!res.ok || data.ok === false) {
        const msg = REASON_MESSAGES[data.reason] || data.error || t('setup.claim_button')
        setError(data.daysLeft ? `${msg} (${data.daysLeft}d)` : msg)
        return
      }
      setSuccess(true)
      setTimeout(() => router.push('/me'), 600)
    } catch {
      setError(t('auth.err_connection'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="bg-gray-950 border border-gray-800 p-6">
      <label className="block text-gray-500 text-xs mb-2">{t('setup.handle_label')}</label>
      <div className="flex items-stretch border border-gray-800 focus-within:border-gray-600">
        <span className="bg-black text-gray-600 text-sm px-3 py-2 font-mono border-r border-gray-800">stash.app/u/</span>
        <input
          type="text"
          value={handle}
          onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
          placeholder="your-handle"
          minLength={3}
          maxLength={30}
          required
          autoFocus
          className="flex-1 bg-black text-white px-3 py-2 text-sm font-mono focus:outline-none"
        />
      </div>
      <p className="text-gray-600 text-xs mt-2">{t('setup.handle_help')}</p>

      {error && (
        <div className="mt-4 bg-red-950/30 border border-red-900/50 text-red-300 text-xs p-2.5 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}
      {success && (
        <div className="mt-4 bg-green-950/30 border border-green-900/50 text-green-300 text-xs p-2.5 flex items-center gap-2">
          <CheckCircle className="w-3.5 h-3.5" /> {t('common.saved')}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || !handle || handle.length < 3}
        className="w-full mt-4 bg-white hover:bg-gray-200 disabled:bg-gray-700 disabled:text-gray-500 text-black py-2 text-sm font-medium flex items-center justify-center gap-2"
      >
        {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
        {submitting ? t('setup.claiming') : t('setup.claim_button')}
      </button>
    </form>
  )
}
