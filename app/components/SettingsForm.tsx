'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Loader2, Save, CheckCircle, AlertTriangle, ExternalLink } from 'lucide-react'

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
        <div className="text-gray-500 text-xs mb-4">Profile</div>
        <div className="space-y-4">
          <div>
            <label className="block text-gray-400 text-sm mb-1">Display name</label>
            <input
              type="text"
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              maxLength={60}
              placeholder="How your name shows on your profile"
              className="w-full bg-black border border-gray-800 text-white px-3 py-2 text-sm focus:outline-none focus:border-gray-600"
            />
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-1">Bio</label>
            <textarea
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              maxLength={500}
              rows={3}
              placeholder="Short description on your /u/handle page"
              className="w-full bg-black border border-gray-800 text-white px-3 py-2 text-sm focus:outline-none focus:border-gray-600 resize-none"
            />
            <div className="text-gray-600 text-xs mt-1">{form.bio.length}/500</div>
          </div>
          <div className="text-xs text-gray-600">
            Handle: <span className="text-gray-300 font-mono">@{handle}</span>
            <span className="ml-3">Public URL: <Link href={`/u/${handle}`} target="_blank" className="text-gray-400 hover:text-white inline-flex items-center gap-1 font-mono">/u/{handle} <ExternalLink className="w-3 h-3" /></Link></span>
          </div>
        </div>
      </div>

      {/* Folder defaults */}
      <div className="bg-gray-950 border border-gray-800 p-5">
        <div className="text-gray-500 text-xs mb-1">Folder defaults</div>
        <p className="text-gray-600 text-xs mb-4">Applied to new folders unless you override per-folder.</p>

        <div className="space-y-4">
          <div>
            <label className="block text-gray-400 text-sm mb-1">Theme</label>
            <div className="grid grid-cols-3 gap-1">
              {(['dark', 'light', 'system'] as const).map((t) => (
                <button
                  type="button" key={t}
                  onClick={() => setForm({ ...form, default_theme: t })}
                  className={`px-2 py-2 text-xs ${form.default_theme === t ? 'bg-white text-black' : 'bg-black border border-gray-800 text-gray-400 hover:border-gray-600'}`}
                >{t}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-gray-400 text-sm mb-1">Accent color</label>
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
            <label className="block text-gray-400 text-sm mb-1">Font</label>
            <div className="grid grid-cols-3 gap-1">
              {(['mono', 'serif', 'sans'] as const).map((f) => (
                <button
                  type="button" key={f}
                  onClick={() => setForm({ ...form, default_font: f })}
                  className={`px-2 py-2 text-xs ${form.default_font === f ? 'bg-white text-black' : 'bg-black border border-gray-800 text-gray-400 hover:border-gray-600'}`}
                  style={{ fontFamily: f === 'mono' ? 'var(--font-mono, monospace)' : f === 'serif' ? 'serif' : 'sans-serif' }}
                >{f}</button>
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
              <span className="text-gray-400 text-sm">CRT scanline effect</span>
              <span className="text-gray-600 text-xs">— enables retro overlay on new folders by default</span>
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
              <CheckCircle className="w-3.5 h-3.5" /> Saved
            </span>
          )}
        </div>
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 bg-white hover:bg-gray-200 disabled:bg-gray-700 disabled:text-gray-500 text-black px-5 py-2 text-sm font-medium"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save settings
        </button>
      </div>
    </form>
  )
}
