'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Lock, Mail, Shield, Loader2 } from 'lucide-react'
import { useI18n } from '@/app/lib/i18n/client'

export default function FolderAccessGate({
  folderName, accessMode, reason, handle, slug, isLoggedIn,
}: {
  folderName: string
  accessMode: string
  reason: string
  handle: string
  slug: string
  isLoggedIn: boolean
}) {
  const { t } = useI18n()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [wrongPassword, setWrongPassword] = useState(false)

  const needsPassword = reason === 'password' || reason === 'password_email'
  const needsEmail = reason === 'email' || reason === 'password_email'

  const tryPassword = () => {
    if (!password) return
    setSubmitting(true)
    setWrongPassword(false)
    const url = `/u/${handle}/f/${slug}?password=${encodeURIComponent(password)}`
    router.push(url)
    setTimeout(() => {
      setSubmitting(false)
      setWrongPassword(true)
    }, 2000)
  }

  return (
    <div className="bg-gray-950 border border-gray-800 p-8 text-center">
      <Shield className="w-10 h-10 text-gray-600 mx-auto mb-4" />
      <h1 className="text-xl font-medium text-white mb-2">{folderName}</h1>
      <p className="text-gray-500 text-sm mb-6">{t('access.protected_folder')}</p>

      {needsPassword && (
        <div className="mb-6">
          <div className="flex items-center gap-2 text-gray-400 text-xs mb-3 justify-center">
            <Lock className="w-3.5 h-3.5" />
            {t('access.enter_password')}
          </div>
          <div className="flex gap-2 max-w-sm mx-auto">
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setWrongPassword(false) }}
              onKeyDown={(e) => e.key === 'Enter' && tryPassword()}
              placeholder={t('access.password_placeholder')}
              className="flex-1 bg-black border border-gray-800 text-white px-3 py-2 text-sm focus:outline-none focus:border-gray-600"
            />
            <button
              onClick={tryPassword}
              disabled={!password || submitting}
              className="bg-white hover:bg-gray-200 text-black px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('access.unlock')}
            </button>
          </div>
          {wrongPassword && (
            <p className="text-red-400 text-xs mt-2">{t('access.wrong_password')}</p>
          )}
        </div>
      )}

      {needsEmail && (
        <div className="mb-4">
          <div className="flex items-center gap-2 text-gray-400 text-xs mb-3 justify-center">
            <Mail className="w-3.5 h-3.5" />
            {t('access.email_required')}
          </div>
          {isLoggedIn ? (
            <p className="text-red-400/70 text-sm">{t('access.email_not_allowed')}</p>
          ) : (
            <Link
              href={`/auth?redirect_to=${encodeURIComponent(`/u/${handle}/f/${slug}`)}`}
              className="inline-block bg-accent-cyan hover:bg-cyan-300 text-black font-bold py-2 px-6 text-sm uppercase tracking-wider transition-colors"
            >
              {t('access.sign_in')}
            </Link>
          )}
        </div>
      )}

      <p className="text-gray-700 text-xs mt-6">
        {t('access.owner_note', { handle })}
      </p>
    </div>
  )
}
