'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import * as tus from 'tus-js-client'
import { Upload, Loader2, CheckCircle, Copy, ExternalLink, Inbox, Folder as FolderIcon, X } from 'lucide-react'

const UPLOAD_SERVER = process.env.NEXT_PUBLIC_UPLOAD_SERVER || 'http://localhost:5050'

interface FolderOpt {
  id: number
  name: string
  is_inbox: number
  slug: string
}

interface UploadDone {
  url: string
  filename: string
  size: number
  uuid: string
}

function formatBytes(b: number) {
  if (b === 0) return '0 B'
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(b) / Math.log(k))
  return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export default function MeUploadCard({
  folders, defaultFolderId, handle,
}: {
  folders: FolderOpt[]
  defaultFolderId: number | null
  handle: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(defaultFolderId)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState('')
  const [result, setResult] = useState<UploadDone | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const selectedFolder = folders.find(f => f.id === selectedFolderId)

  const upload = async (file: File) => {
    setError(null)
    setResult(null)
    setUploading(true)
    setProgress(0)
    setStage('Starting upload…')

    try {
      const data = await new Promise<UploadDone>((resolve, reject) => {
        let pollInterval: ReturnType<typeof setInterval> | null = null
        const tusUpload = new tus.Upload(file, {
          endpoint: `${UPLOAD_SERVER}/tus-upload`,
          retryDelays: [0, 1000, 3000, 5000, 10000, 30000],
          chunkSize: 5 * 1024 * 1024,
          metadata: { filename: file.name, filetype: file.type, filesize: file.size.toString() },
          onError: (err) => {
            if (pollInterval) clearInterval(pollInterval)
            reject(new Error(err.message))
          },
          onProgress: (bytesUploaded, bytesTotal) => {
            const pct = Math.round((bytesUploaded / bytesTotal) * 100)
            setProgress(5 + Math.round(pct * 0.65))
            setStage(`Uploading… ${pct}%`)
          },
          onSuccess: async () => {
            if (pollInterval) clearInterval(pollInterval)
            const uploadId = tusUpload.url?.split('/').pop()
            setProgress(72)
            setStage('Pinning on Arweave…')

            pollInterval = setInterval(() => {
              setProgress((p) => p < 95 ? p + Math.random() * 1.5 + 0.3 : p)
            }, 1500)

            try {
              const res = await fetch('/api/upload/finalize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  uploadId,
                  originalFilename: file.name,
                  folder_id: selectedFolderId,
                }),
              })
              if (pollInterval) clearInterval(pollInterval)
              if (!res.ok) {
                const d = await res.json().catch(() => ({}))
                reject(new Error(d.error || 'Pinning failed'))
                return
              }
              const d = await res.json()
              resolve({ url: d.url, filename: d.filename, size: d.size, uuid: d.uuid })
            } catch (err) {
              if (pollInterval) clearInterval(pollInterval)
              reject(err)
            }
          },
        })
        tusUpload.findPreviousUploads().then(prev => {
          const valid = prev.filter(p => p.uploadUrl && !p.uploadUrl.includes('undefined'))
          if (valid.length) tusUpload.resumeFromPreviousUpload(valid[0])
          tusUpload.start()
        })
      })

      setProgress(100)
      setStage('Done')
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) upload(f)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f) upload(f)
  }

  const copyUrl = async () => {
    if (!result) return
    await navigator.clipboard.writeText(result.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-gray-950 border border-gray-800 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-white text-sm">Upload</h2>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500">to</span>
          <select
            value={selectedFolderId ?? ''}
            onChange={(e) => setSelectedFolderId(e.target.value ? Number(e.target.value) : null)}
            disabled={uploading}
            className="bg-black border border-gray-800 text-white px-2 py-1 text-xs focus:outline-none focus:border-gray-600"
          >
            {folders.map(f => (
              <option key={f.id} value={f.id}>
                {f.is_inbox ? '📥 Inbox (private)' : `📁 ${f.name}`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {result ? (
        <div className="bg-black border border-gray-800 p-4">
          <div className="flex items-center gap-2 mb-3 text-green-400 text-sm">
            <CheckCircle className="w-4 h-4" /> Uploaded {result.filename} ({formatBytes(result.size)})
          </div>
          <div className="flex items-center gap-2 bg-gray-950 border border-gray-800 p-2">
            <input type="text" value={result.url} readOnly className="flex-1 bg-transparent text-gray-300 text-xs outline-none font-mono" />
            <button onClick={copyUrl} className="flex items-center gap-1 text-gray-400 hover:text-white text-xs px-2">
              <Copy className="w-3 h-3" /> {copied ? 'Copied' : 'Copy'}
            </button>
            <a href={result.url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white px-2">
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className="flex items-center justify-between gap-2 mt-3 text-xs">
            <div className="text-gray-500">
              In {selectedFolder?.is_inbox ? <><Inbox className="w-3 h-3 inline" /> Inbox</> : <><FolderIcon className="w-3 h-3 inline" /> {selectedFolder?.name}</>}
              {selectedFolder && !selectedFolder.is_inbox && (
                <> · <Link href={`/u/${handle}/f/${selectedFolder.slug}`} target="_blank" className="text-gray-400 hover:text-white">view public</Link></>
              )}
            </div>
            <button onClick={() => setResult(null)} className="text-gray-500 hover:text-white">Upload another</button>
          </div>
        </div>
      ) : uploading ? (
        <div className="border border-gray-800 p-8 text-center">
          <Loader2 className="w-6 h-6 text-gray-400 animate-spin mx-auto mb-3" />
          <p className="text-white text-sm mb-2">{stage}</p>
          <div className="w-full bg-gray-900 h-1 overflow-hidden">
            <div className="bg-accent-cyan h-1 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-gray-500 text-xs mt-2">{progress}%</p>
        </div>
      ) : (
        <div
          onDrop={onDrop}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${isDragging ? 'border-accent-cyan bg-accent-cyan/5' : 'border-gray-800 hover:border-gray-700'}`}
        >
          <input ref={inputRef} type="file" onChange={onFileSelect} className="hidden" />
          <Upload className="w-6 h-6 text-gray-500 mx-auto mb-2" />
          <p className="text-white text-sm">Drop a file or click to upload</p>
          <p className="text-gray-500 text-xs mt-1">Goes to {selectedFolder?.is_inbox ? 'Inbox (private)' : selectedFolder?.name || 'Inbox'} · up to 6GB</p>
        </div>
      )}

      {error && (
        <div className="mt-3 bg-red-950/30 border border-red-900/50 text-red-300 text-xs p-2.5 flex items-start gap-2">
          <X className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}
    </div>
  )
}
