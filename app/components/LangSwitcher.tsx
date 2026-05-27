'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useI18n } from '@/app/lib/i18n/client'
import { Globe, Loader2 } from 'lucide-react'

export default function LangSwitcher() {
  const { locale } = useI18n()
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const toggle = async () => {
    const next = locale === 'en' ? 'es' : 'en'
    setBusy(true)
    try {
      await fetch('/api/locale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: next }),
      })
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className="flex items-center gap-1 text-gray-500 hover:text-white text-sm"
      title={locale === 'en' ? 'Cambiar a español' : 'Switch to English'}
    >
      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Globe className="w-3 h-3" />}
      <span className="uppercase font-mono">{locale === 'en' ? 'ES' : 'EN'}</span>
    </button>
  )
}
