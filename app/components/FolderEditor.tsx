'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Loader2, Save, Trash2, ExternalLink, Plus, X, Eye, EyeOff, Lock, AlertTriangle, Inbox,
} from 'lucide-react'

interface Folder {
  id: number
  user_id: string
  slug: string
  name: string
  description: string | null
  visibility: 'public' | 'unlisted' | 'private'
  default_layout: 'grid' | 'list' | 'timeline'
  accent_color: string | null
  is_inbox: number
}

interface Upload {
  uuid: string
  filename: string
  content_type: string
  size: number
  irys_url: string
  visibility: string
  created_at: string
}

const ACCENTS = [
  { value: 'cyan', label: 'Cyan', hex: '#7dd3c0' },
  { value: 'green', label: 'Green', hex: '#86c08e' },
  { value: 'red', label: 'Red', hex: '#d47070' },
  { value: 'blue', label: 'Blue', hex: '#7a9ec2' },
  { value: 'orange', label: 'Orange', hex: '#c4956a' },
]

function formatBytes(b: number) {
  if (b === 0) return '0 B'
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(b) / Math.log(k))
  return (b / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i]
}

export default function FolderEditor({
  handle, folder: initial, filesInFolder: initialIn, inboxFiles: initialInbox,
}: {
  handle: string
  folder: Folder
  filesInFolder: Upload[]
  inboxFiles: Upload[]
}) {
  const router = useRouter()
  const [folder, setFolder] = useState<Folder>(initial)
  const [filesInFolder, setFilesInFolder] = useState<Upload[]>(initialIn)
  const [inboxFiles, setInboxFiles] = useState<Upload[]>(initialInbox)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isInbox = !!folder.is_inbox

  const save = async () => {
    setSaving(true); setError(null); setSaved(false)
    try {
      const res = await fetch(`/api/me/folders/${folder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(folder),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Save failed'); return }
      setFolder(data.folder)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally { setSaving(false) }
  }

  const refreshFiles = async () => {
    const [a, b] = await Promise.all([
      fetch(`/api/me/uploads?folder_id=${folder.id}&limit=200`).then(r => r.json()),
      fetch(`/api/me/uploads?limit=200`).then(r => r.json()),
    ])
    setFilesInFolder(a.uploads || [])
    setInboxFiles(b.uploads || [])
  }

  const addFile = async (uuid: string) => {
    setAdding(uuid)
    try {
      await fetch(`/api/me/folders/${folder.id}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', upload_uuid: uuid }),
      })
      await refreshFiles()
    } finally { setAdding(null) }
  }

  const removeFile = async (uuid: string) => {
    setAdding(uuid)
    try {
      await fetch(`/api/me/folders/${folder.id}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', upload_uuid: uuid }),
      })
      await refreshFiles()
    } finally { setAdding(null) }
  }

  const deleteFolder = async () => {
    const res = await fetch(`/api/me/folders/${folder.id}`, { method: 'DELETE' })
    if (res.ok) router.push('/me')
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            {isInbox && <Inbox className="w-5 h-5 text-gray-500" />}
            <h1 className="text-2xl font-medium text-white">{folder.name}</h1>
          </div>
          {!isInbox && (
            <Link href={`/u/${handle}/f/${folder.slug}`} target="_blank" className="text-xs text-gray-500 hover:text-white inline-flex items-center gap-1">
              <span className="font-mono">/u/{handle}/f/{folder.slug}</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          )}
        </div>
        {!isInbox && (
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-gray-600 hover:text-red-400 text-sm flex items-center gap-1 px-2 py-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
        )}
      </div>

      {confirmDelete && (
        <div className="bg-red-950/30 border border-red-900/50 p-4 mb-4 flex items-center justify-between">
          <p className="text-red-300 text-sm">Delete this folder? Files stay in your library.</p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmDelete(false)} className="text-gray-400 text-sm px-3 py-1">Cancel</button>
            <button onClick={deleteFolder} className="bg-red-600 hover:bg-red-500 text-white px-3 py-1 text-sm">Delete</button>
          </div>
        </div>
      )}

      {/* Settings */}
      {!isInbox && (
        <div className="bg-gray-950 border border-gray-800 p-5 mb-6">
          <h2 className="text-gray-500 text-xs mb-4">Settings</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-500 text-xs mb-2">Name</label>
              <input
                type="text"
                value={folder.name}
                onChange={(e) => setFolder({ ...folder, name: e.target.value })}
                maxLength={80}
                className="w-full bg-black border border-gray-800 text-white px-3 py-2 text-sm focus:outline-none focus:border-gray-600"
              />
            </div>
            <div>
              <label className="block text-gray-500 text-xs mb-2">Visibility</label>
              <div className="grid grid-cols-3 gap-1">
                {(['public', 'unlisted', 'private'] as const).map((v) => {
                  const Icon = v === 'public' ? Eye : v === 'unlisted' ? EyeOff : Lock
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setFolder({ ...folder, visibility: v })}
                      className={`px-2 py-2 text-xs flex items-center justify-center gap-1.5 border ${
                        folder.visibility === v
                          ? 'bg-white text-black border-white'
                          : 'bg-black text-gray-400 border-gray-800 hover:border-gray-600'
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      {v}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-gray-500 text-xs mb-2">Description</label>
              <textarea
                value={folder.description || ''}
                onChange={(e) => setFolder({ ...folder, description: e.target.value })}
                maxLength={500}
                rows={2}
                className="w-full bg-black border border-gray-800 text-white px-3 py-2 text-sm focus:outline-none focus:border-gray-600 resize-none"
              />
            </div>
            <div>
              <label className="block text-gray-500 text-xs mb-2">Accent color</label>
              <div className="flex gap-1.5">
                {ACCENTS.map((a) => (
                  <button
                    key={a.value}
                    type="button"
                    onClick={() => setFolder({ ...folder, accent_color: a.value })}
                    style={{ backgroundColor: a.hex }}
                    className={`w-8 h-8 border-2 ${folder.accent_color === a.value ? 'border-white' : 'border-transparent'}`}
                    title={a.label}
                  />
                ))}
              </div>
            </div>
          </div>

          {error && (
            <div className="mt-4 bg-red-950/30 border border-red-900/50 text-red-300 text-xs p-2.5 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 mt-5">
            {saved && <span className="text-green-400 text-xs">Saved ✓</span>}
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1.5 bg-white hover:bg-gray-200 disabled:bg-gray-700 disabled:text-gray-500 text-black px-4 py-1.5 text-sm font-medium"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Save
            </button>
          </div>
        </div>
      )}

      {/* Files in folder */}
      <div className="bg-gray-950 border border-gray-800 p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white text-sm">{filesInFolder.length} {filesInFolder.length === 1 ? 'file' : 'files'} in this folder</h2>
          {!isInbox && (
            <button
              onClick={() => setShowPicker((v) => !v)}
              className="flex items-center gap-1.5 border border-gray-700 hover:border-gray-600 text-gray-300 hover:text-white px-3 py-1.5 text-xs"
            >
              <Plus className="w-3 h-3" />
              Add files
            </button>
          )}
        </div>
        {filesInFolder.length === 0 ? (
          <p className="text-gray-600 text-sm py-4">No files yet. {!isInbox && 'Click "Add files" to pull from your Inbox.'}</p>
        ) : (
          <div className="space-y-1.5">
            {filesInFolder.map((u) => (
              <FileRow key={u.uuid} upload={u} action={!isInbox ? () => removeFile(u.uuid) : undefined} actionIcon={<X className="w-3 h-3" />} actionLabel="Remove" busy={adding === u.uuid} />
            ))}
          </div>
        )}
      </div>

      {/* File picker drawer */}
      {!isInbox && showPicker && (
        <div className="bg-gray-950 border border-gray-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white text-sm">Add from Inbox ({inboxFiles.length} available)</h2>
            <button onClick={() => setShowPicker(false)} className="text-gray-500 hover:text-white text-sm">Close</button>
          </div>
          {inboxFiles.length === 0 ? (
            <p className="text-gray-600 text-sm py-4">
              Inbox is empty. Upload from the <Link href="/" className="text-gray-400 hover:text-white underline">home page</Link>.
            </p>
          ) : (
            <div className="space-y-1.5">
              {inboxFiles.map((u) => (
                <FileRow key={u.uuid} upload={u} action={() => addFile(u.uuid)} actionIcon={<Plus className="w-3 h-3" />} actionLabel="Add" busy={adding === u.uuid} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function FileRow({ upload, action, actionIcon, actionLabel, busy }: {
  upload: Upload
  action?: () => void
  actionIcon: React.ReactNode
  actionLabel: string
  busy: boolean
}) {
  return (
    <div className="flex items-center gap-3 py-2 px-2 hover:bg-gray-900/50 rounded text-sm">
      <span className="text-white truncate flex-1">{upload.filename}</span>
      <span className="text-gray-600 text-xs">{formatBytes(upload.size)}</span>
      <span className="text-gray-700 text-xs font-mono">{upload.content_type}</span>
      <a href={upload.irys_url} target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-white">
        <ExternalLink className="w-3 h-3" />
      </a>
      {action && (
        <button
          onClick={action}
          disabled={busy}
          className="text-gray-500 hover:text-white text-xs flex items-center gap-1 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : actionIcon}
          {actionLabel}
        </button>
      )}
    </div>
  )
}
