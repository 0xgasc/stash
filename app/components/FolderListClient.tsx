'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Folder, Inbox, Eye, EyeOff, Lock, Loader2, AlertTriangle } from 'lucide-react'
import { useI18n } from '@/app/lib/i18n/client'

interface FolderRow {
  id: number
  slug: string
  name: string
  description: string | null
  visibility: 'public' | 'unlisted' | 'private'
  is_inbox: number
  banner_uuid: string | null
  file_count: number
  created_at: string
  updated_at: string
}

const VIS_ICON = {
  public: Eye,
  unlisted: EyeOff,
  private: Lock,
}

export default function FolderListClient({ initialFolders }: { initialFolders: FolderRow[] }) {
  const { t } = useI18n()
  const router = useRouter()

  const VIS_LABEL = {
    public: t('me.visibility_public'),
    unlisted: t('me.visibility_unlisted'),
    private: t('me.visibility_private'),
  }

  const REASON_MESSAGES: Record<string, string> = {
    invalid_slug: 'Slug must be a-z, 0-9, dashes or underscores',
    reserved_slug: 'That slug is reserved',
    slug_taken: 'You already have a folder with that slug',
  }

  const [folders, setFolders] = useState(initialFolders)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')

  const onSlugify = (raw: string) => {
    return raw.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError(null)
    setCreating(true)
    try {
      const finalSlug = slug.trim() || onSlugify(name)
      const res = await fetch('/api/me/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), slug: finalSlug, visibility: 'private' }),
      })
      const data = await res.json()
      if (!res.ok || data.ok === false) {
        setCreateError(REASON_MESSAGES[data.reason] || data.error || 'Could not create folder')
        return
      }
      // Refresh list
      const listRes = await fetch('/api/me/folders')
      const listData = await listRes.json()
      setFolders(listData.folders || [])
      setShowCreate(false)
      setName('')
      setSlug('')
      router.push(`/me/folders/${data.folder.id}`)
    } catch {
      setCreateError('Connection error')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg text-white">{t('me.folders_section_title')}</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 bg-white hover:bg-gray-200 text-black px-3 py-1.5 text-sm font-medium"
        >
          <Plus className="w-3.5 h-3.5" />
          {t('me.new_folder')}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-gray-950 border border-gray-800 p-5 mb-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-500 text-xs mb-2">{t('me.folder_name_label')}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (!slug || slug === onSlugify(name)) setSlug(onSlugify(e.target.value))
                }}
                placeholder={t('me.folder_name_placeholder')}
                maxLength={80}
                autoFocus
                required
                className="w-full bg-black border border-gray-800 text-white px-3 py-2 text-sm focus:outline-none focus:border-gray-600"
              />
            </div>
            <div>
              <label className="block text-gray-500 text-xs mb-2">{t('me.folder_slug_label')}</label>
              <div className="flex items-stretch border border-gray-800 focus-within:border-gray-600">
                <span className="bg-black text-gray-600 text-xs px-2 py-2 font-mono border-r border-gray-800 flex items-center">/f/</span>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(onSlugify(e.target.value))}
                  placeholder={t('me.folder_slug_placeholder')}
                  maxLength={50}
                  required
                  className="flex-1 bg-black text-white px-3 py-2 text-sm font-mono focus:outline-none"
                />
              </div>
            </div>
          </div>
          {createError && (
            <div className="mt-4 bg-red-950/30 border border-red-900/50 text-red-300 text-xs p-2.5 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              {createError}
            </div>
          )}
          <div className="flex items-center justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={() => { setShowCreate(false); setCreateError(null) }}
              className="text-gray-500 hover:text-white text-sm px-3 py-1.5"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={creating || !name}
              className="flex items-center gap-1.5 bg-white hover:bg-gray-200 disabled:bg-gray-700 disabled:text-gray-500 text-black px-4 py-1.5 text-sm font-medium"
            >
              {creating && <Loader2 className="w-3 h-3 animate-spin" />}
              {creating ? t('me.creating') : t('me.create')}
            </button>
          </div>
        </form>
      )}

      {folders.length === 0 ? (
        <div className="bg-gray-950 border border-gray-800 p-12 text-center">
          <Folder className="w-8 h-8 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">{t('me.folders_empty')}</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {folders.map((f) => {
            const VisIcon = VIS_ICON[f.visibility]
            return (
              <Link
                key={f.id}
                href={`/me/folders/${f.id}`}
                className="bg-gray-950 border border-gray-800 hover:border-gray-700 p-5 block transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {f.is_inbox ? <Inbox className="w-4 h-4 text-gray-500" /> : <Folder className="w-4 h-4 text-gray-500" />}
                    <h3 className="text-white text-sm font-medium">{f.name}</h3>
                  </div>
                  {!f.is_inbox && (
                    <div className="flex items-center gap-1 text-gray-600 text-xs">
                      <VisIcon className="w-3 h-3" />
                      {VIS_LABEL[f.visibility]}
                    </div>
                  )}
                </div>
                {f.description && (
                  <p className="text-gray-500 text-xs mb-2 line-clamp-2">{f.description}</p>
                )}
                <div className="flex items-center gap-3 text-xs text-gray-600 mt-2">
                  <span>{t('me.folder_file_count', { count: f.file_count })}</span>
                  <span className="font-mono">{f.is_inbox ? t('me.inbox_unfiled') : `/f/${f.slug}`}</span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
