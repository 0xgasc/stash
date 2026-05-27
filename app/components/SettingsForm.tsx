'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Loader2, Save, CheckCircle, AlertTriangle, ExternalLink } from 'lucide-react'
import { useI18n } from '@/app/lib/i18n/client'

interface Initial {
  display_name: string
  bio: string
  default_theme: string
  default_accent: string
  default_font: string
  default_fx: boolean
}

const ACCENTS = [
  { value: 'cyan', label: 'Cyan', hex: '#7dd3c0' },
  { value: 'green', label: 'Green', hex: '#86c08e' },
  { value: 'red', label: 'Red', hex: '#d47070' },
  { value: 'blue', label: 'Blue', hex: '#7a9ec2' },
  { value: 'orange', label: 'Orange', hex: '#c4956a' },
]

export default function SettingsForm({ initial, handle }: { initial: Initial; handle: string }) {
  const { t } = useI18n()
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch('/api/me/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: form.display_name || null,
          bio: form.bio || null,
          default_theme: form.default_theme,
          default_accent: form.default_accent,
          default_font: form.default_font,
          default_fx: form.default_fx,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Save failed'); return }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="space-y-6">
      {/* Profile */}
      <div className="bg-gray-950 border border-gray-800 p-5">
        <div className="text-gray-500 text-xs mb-4">{t('settings.profile_section')}</div>
        <div className="space-y-4">
          <div>
            <label className="block text-gray-400 text-sm mb-1">{t('settings.display_name_label')}</label>
            <input
              type="text"
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              maxLength={60}
              placeholder={t('settings.display_name_placeholder')}
              className="w-full bg-black border border-gray-800 text-white px-3 py-2 text-sm focus:outline-none focus:border-gray-600"
            />
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-1">{t('settings.bio_label')}</label>
            <textarea
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              maxLength={500}
              rows={3}
              placeholder={t('settings.bio_placeholder')}
              className="w-full bg-black border border-gray-800 text-white px-3 py-2 text-sm focus:outline-none focus:border-gray-600 resize-none"
            />
            <div className="text-gray-600 text-xs mt-1">{form.bio.length}/500</div>
          </div>
          <div className="text-xs text-gray-600">
            {t('settings.handle_label')} <span className="text-gray-300 font-mono">@{handle}</span>
            <span className="ml-3">{t('settings.public_url_label')} <Link href={`/u/${handle}`} target="_blank" className="text-gray-400 hover:text-white inline-flex items-center gap-1 font-mono">/u/{handle} <ExternalLink className="w-3 h-3" /></Link></span>
          </div>
        </div>
      </div>

      {/* Folder defaults */}
      <div className="bg-gray-950 border border-gray-800 p-5">
        <div className="text-gray-500 text-xs mb-1">{t('settings.defaults_section')}</div>
        <p className="text-gray-600 text-xs mb-4">{t('settings.defaults_help')}</p>

        <div className="space-y-4">
          <div>
            <label className="block text-gray-400 text-sm mb-1">{t('settings.theme_label')}</label>
            <div className="grid grid-cols-3 gap-1">
              {(['dark', 'light', 'system'] as const).map((th) => (
                <button
                  type="button" key={th}
                  onClick={() => setForm({ ...form, default_theme: th })}
                  className={`px-2 py-2 text-xs ${form.default_theme === th ? 'bg-white text-black' : 'bg-black border border-gray-800 text-gray-400 hover:border-gray-600'}`}
                >{t(`settings.theme_${th}` as `settings.theme_dark`)}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-gray-400 text-sm mb-1">{t('settings.accent_label')}</label>
            <div className="flex gap-1.5">
              {ACCENTS.map((a) => (
                <button
                  type="button" key={a.value}
                  onClick={() => setForm({ ...form, default_accent: a.value })}
                  style={{ backgroundColor: a.hex }}
                  className={`w-8 h-8 border-2 ${form.default_accent === a.value ? 'border-white' : 'border-transparent'}`}
                  title={a.label}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-gray-400 text-sm mb-1">{t('settings.font_label')}</label>
            <div className="grid grid-cols-3 gap-1">
              {(['mono', 'serif', 'sans'] as const).map((f) => (
                <button
                  type="button" key={f}
                  onClick={() => setForm({ ...form, default_font: f })}
                  className={`px-2 py-2 text-xs ${form.default_font === f ? 'bg-white text-black' : 'bg-black border border-gray-800 text-gray-400 hover:border-gray-600'}`}
                  style={{ fontFamily: f === 'mono' ? 'var(--font-mono, monospace)' : f === 'serif' ? 'serif' : 'sans-serif' }}
                >{t(`settings.font_${f}` as `settings.font_mono`)}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.default_fx}
                onChange={(e) => setForm({ ...form, default_fx: e.target.checked })}
                className="accent-white"
              />
              <span className="text-gray-400 text-sm">{t('settings.fx_label')}</span>
              <span className="text-gray-600 text-xs">{t('settings.fx_help')}</span>
            </label>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-950/30 border border-red-900/50 text-red-300 text-xs p-2.5 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div>
          {saved && (
            <span className="text-green-400 text-xs flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" /> {t('common.saved')}
            </span>
          )}
        </div>
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 bg-white hover:bg-gray-200 disabled:bg-gray-700 disabled:text-gray-500 text-black px-5 py-2 text-sm font-medium"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {saving ? t('common.saving') : t('settings.save_button')}
        </button>
      </div>
    </form>
  )
}
