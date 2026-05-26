'use client'

import { useState, useCallback, useEffect } from 'react'
import { Upload, Loader2, CheckCircle, Copy, ExternalLink, Folder, Inbox } from 'lucide-react'
import * as tus from 'tus-js-client'
import AuthModal from './AuthModal'
import { useAuth } from './AuthProvider'

const UPLOAD_SERVER = process.env.NEXT_PUBLIC_UPLOAD_SERVER || 'http://localhost:5050'

interface UploadResult {
  url: string
  claimToken: string | null
  filename: string
  size: number
}

interface UploadLimit {
  remaining: number
  limit: number
  limitReached: boolean
  maxFileSizeMB: number
}

interface UserFolder {
  id: number
  slug: string
  name: string
  is_inbox: number
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export default function HomeUploadHero() {
  const { user, isConfigured } = useAuth()
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadStage, setUploadStage] = useState('')
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [uploadLimit, setUploadLimit] = useState<UploadLimit | null>(null)
  const [folders, setFolders] = useState<UserFolder[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null)

  const fetchLimit = useCallback(() => {
    if (!user) {
      fetch('/api/upload/check-limit')
        .then(r => r.json())
        .then(setUploadLimit)
        .catch(() => {})
    }
  }, [user])

  const fetchFolders = useCallback(() => {
    if (!user) { setFolders([]); return }
    fetch('/api/me/folders')
      .then(r => r.ok ? r.json() : { folders: [] })
      .then(d => setFolders(d.folders || []))
      .catch(() => setFolders([]))
  }, [user])

  useEffect(() => { fetchLimit() }, [fetchLimit])
  useEffect(() => { fetchFolders() }, [fetchFolders])

  const handleUpload = async (file: File) => {
    setError(null)
    setUploading(true)
    setProgress(0)
    setUploadStage('Starting upload...')

    const maxSizeBytes = (uploadLimit?.maxFileSizeMB ?? 6144) * 1024 * 1024
    if (file.size > maxSizeBytes) {
      setError(`File exceeds ${((uploadLimit?.maxFileSizeMB ?? 6144) / 1024).toFixed(0)}GB limit`)
      setUploading(false)
      return
    }

    // Check rate limit before starting TUS upload
    if (!user) {
      try {
        const limitRes = await fetch('/api/upload/check-limit')
        const limitData = await limitRes.json()
        if (limitData.limitReached) {
          setUploadLimit({ remaining: 0, limit: limitData.limit, limitReached: true, maxFileSizeMB: limitData.maxFileSizeMB })
          setUploading(false)
          return
        }
      } catch {
        // Continue if check fails
      }
    }

    try {
      const result = await new Promise<UploadResult>((resolve, reject) => {
        let progressInterval: ReturnType<typeof setInterval> | null = null

        const upload = new tus.Upload(file, {
          endpoint: `${UPLOAD_SERVER}/tus-upload`,
          retryDelays: [0, 1000, 3000, 5000, 10000, 30000],
          chunkSize: 5 * 1024 * 1024, // 5MB chunks
          metadata: {
            filename: file.name,
            filetype: file.type,
            filesize: file.size.toString(),
          },
          onError: (err) => {
            console.error('TUS upload error:', err)
            if (progressInterval) clearInterval(progressInterval)
            reject(new Error(`Upload failed: ${err.message}. Your upload can be resumed if you try again.`))
          },
          onProgress: (bytesUploaded, bytesTotal) => {
            const pct = Math.round((bytesUploaded / bytesTotal) * 100)
            // Map 0-100% upload to 5-70% progress (leaving room for Irys processing)
            const adjusted = 5 + (pct * 0.65)
            setProgress(Math.round(adjusted))
            setUploadStage(
              `Uploading... ${pct}% (${formatBytes(bytesUploaded)} / ${formatBytes(bytesTotal)})`
            )
          },
          onSuccess: async () => {
            if (progressInterval) clearInterval(progressInterval)

            // Extract upload ID from the TUS URL
            const uploadUrl = upload.url
            const uploadId = uploadUrl?.split('/').pop()

            setProgress(72)
            setUploadStage('Processing on blockchain...')

            // Simulated progress for Irys phase (72% to 95%)
            progressInterval = setInterval(() => {
              setProgress(prev => {
                if (prev < 95) return prev + Math.random() * 1.5 + 0.3
                return prev
              })
            }, 1500)

            try {
              // Logged-in users go through the Next-side proxy so the
              // backend gets a verified user_id + the chosen folder_id.
              // Anonymous uploads hit the backend directly (no change).
              const endpoint = user
                ? '/api/upload/finalize'
                : `${UPLOAD_SERVER}/tus-upload/complete`
              const completePayload: Record<string, unknown> = {
                uploadId,
                originalFilename: file.name,
              }
              if (user && selectedFolderId) completePayload.folder_id = selectedFolderId

              const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(completePayload),
              })

              if (progressInterval) clearInterval(progressInterval)

              if (!response.ok) {
                const errorData = await response.json()
                reject(new Error(errorData.error || 'Failed to process upload'))
                return
              }

              const data = await response.json()

              // Increment rate limit cookie on the Vercel side
              if (!user) {
                try {
                  await fetch('/api/upload/increment-limit', { method: 'POST' })
                } catch {
                  // Non-critical
                }
              }

              resolve({
                url: data.url,
                claimToken: null,
                filename: data.filename,
                size: data.size,
              })
            } catch (err) {
              if (progressInterval) clearInterval(progressInterval)
              reject(err)
            }
          },
        })

        // Resume support
        upload.findPreviousUploads().then((previousUploads) => {
          const valid = previousUploads.filter(
            (prev) => prev.uploadUrl && !prev.uploadUrl.includes('undefined')
          )
          if (valid.length > 0) {
            setUploadStage('Resuming previous upload...')
            upload.resumeFromPreviousUpload(valid[0])
          }
          upload.start()
        })
      })

      // Success
      setProgress(100)
      setUploadStage('Complete')
      setUploadResult(result)

      if (!user && result.claimToken && isConfigured) {
        setShowAuthModal(true)
      }

      fetchLimit()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    }

    setUploading(false)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleUpload(file)
  }, [uploadLimit])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleUpload(file)
  }

  const copyToClipboard = async () => {
    if (uploadResult?.url) {
      await navigator.clipboard.writeText(uploadResult.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const reset = () => {
    setUploadResult(null)
    setProgress(0)
    setError(null)
    setUploadStage('')
  }

  // Limit reached state
  if (!user && uploadLimit?.limitReached) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="card-surface p-12 border-accent-rose/30 text-center">
          <div className="w-14 h-14 border border-accent-rose/40 flex items-center justify-center mx-auto mb-6">
            <Upload className="w-6 h-6 text-accent-rose" />
          </div>
          <h3 className="text-lg font-bold text-foreground mb-2 uppercase tracking-wide">Limit reached</h3>
          <p className="text-foreground/40 text-sm mb-6">
            You&apos;ve used all {uploadLimit.limit} free uploads. Create an account to continue.
          </p>
          <button
            onClick={() => setShowAuthModal(true)}
            className="bg-accent-rose/20 hover:bg-accent-rose/30 text-accent-rose border border-accent-rose/40 font-bold py-3 px-8 transition-colors uppercase tracking-wider text-sm"
          >
            Create account
          </button>
        </div>

        <AuthModal
          open={showAuthModal}
          onClose={() => setShowAuthModal(false)}
        />
      </div>
    )
  }

  // Upload complete state
  if (uploadResult) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="card-surface p-8 shadow-golden">
          <div className="text-center mb-6">
            <CheckCircle className="w-12 h-12 text-accent-gold mx-auto mb-4" />
            <h3 className="text-xl font-bold text-foreground mb-2 uppercase tracking-wide">Upload complete</h3>
            <p className="text-foreground/40 text-sm">{uploadResult.filename} ({formatBytes(uploadResult.size)})</p>
          </div>

          {/* One-time link warning */}
          {!user && (
            <div className="bg-surface-dark border border-accent-goldDim/30 p-3 mb-4">
              <p className="text-accent-goldDim text-xs text-center">
                This link is shown once. Leave this page and it&apos;s gone without an account.
              </p>
            </div>
          )}

          {/* URL Display */}
          <div className="bg-surface-dark border border-surface-border p-4 mb-6">
            <div className="text-accent-gold text-xs mb-2 uppercase tracking-wider">Permanent URL</div>
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={uploadResult.url}
                readOnly
                className="flex-1 bg-transparent text-foreground text-sm truncate outline-none"
              />
              <button
                onClick={copyToClipboard}
                className="flex items-center gap-2 border border-surface-border hover:border-accent-gold text-foreground/40 hover:text-accent-gold px-3 py-2 text-sm transition-colors"
              >
                <Copy className="w-4 h-4" />
                {copied ? 'Copied' : 'Copy'}
              </button>
              <a
                href={uploadResult.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 bg-accent-gold hover:bg-gold-500 text-surface-dark px-3 py-2 text-sm transition-colors font-bold"
              >
                <ExternalLink className="w-4 h-4" />
                Open
              </a>
            </div>
          </div>

          {/* Auth prompt */}
          {!user && uploadResult.claimToken && isConfigured && (
            <div className="border border-accent-goldDim/30 bg-surface-dark p-4 mb-6">
              <p className="text-foreground/50 text-sm text-center mb-3">
                Sign in to save this file to your dashboard
              </p>
              <button
                onClick={() => setShowAuthModal(true)}
                className="w-full bg-accent-goldDim/20 hover:bg-accent-goldDim/30 border border-accent-goldDim/40 text-accent-goldDim font-bold py-2 px-4 transition-colors uppercase tracking-wider text-sm"
              >
                Claim file
              </button>
            </div>
          )}

          <button
            onClick={reset}
            className="w-full border border-surface-border hover:border-accent-gold gold-border text-foreground/40 hover:text-accent-gold font-bold py-3 px-6 transition-colors uppercase tracking-wider text-sm"
          >
            Upload another
          </button>
        </div>

        <AuthModal
          open={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          claimToken={uploadResult.claimToken || undefined}
          filename={uploadResult.filename}
        />
      </div>
    )
  }

  // Upload in progress
  if (uploading) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="card-surface p-12 shadow-golden-sm text-center">
          <Loader2 className="w-10 h-10 text-accent-gold animate-spin mx-auto mb-4" />
          <h3 className="text-lg font-bold text-foreground mb-4 uppercase tracking-wide">Uploading...</h3>
          <div className="w-full bg-surface-dark h-1.5 mb-3 border border-surface-border">
            <div
              className="bg-accent-gold h-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-foreground/40 text-sm">{uploadStage || `${Math.round(progress)}%`}</p>
        </div>
      </div>
    )
  }

  // Dropzone state
  return (
    <div className="max-w-2xl mx-auto">
      {user && folders.length > 0 && (
        <div className="mb-3 flex items-center gap-2 text-xs text-foreground/30">
          <Folder className="w-3.5 h-3.5" />
          <span className="uppercase tracking-wider">Upload to</span>
          <select
            value={selectedFolderId ?? ''}
            onChange={(e) => setSelectedFolderId(e.target.value ? Number(e.target.value) : null)}
            className="flex-1 bg-surface-dark border border-surface-border hover:border-surface-hover text-foreground px-2 py-1.5 text-xs focus:outline-none focus:border-accent-gold"
          >
            <option value="">Inbox (default — unfiled)</option>
            {folders.filter(f => !f.is_inbox).map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>
      )}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`relative border-2 border-dashed transition-all cursor-pointer gold-border upload-zone ${
          isDragging
            ? 'border-accent-gold/60 bg-accent-gold/5 shadow-golden-lg dragover'
            : 'border-surface-border bg-surface-dark/50 hover:border-surface-hover'
        }`}
      >
        <label className="block p-16 cursor-pointer">
          <input
            type="file"
            onChange={handleFileSelect}
            className="hidden"
          />
          <div className="text-center">
            <div className={`w-14 h-14 border flex items-center justify-center mx-auto mb-6 transition-colors ${
              isDragging ? 'border-accent-gold text-accent-gold' : 'border-surface-border text-foreground/20'
            }`}>
              <Upload className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-foreground mb-2 uppercase tracking-wide">
              {isDragging ? 'Drop file' : 'Drop file or click to upload'}
            </h3>
            <p className="text-foreground/30 text-sm mb-6">
              Up to {((uploadLimit?.maxFileSizeMB ?? 6144) / 1024).toFixed(0)}GB // any format
            </p>
            <div className="flex items-center justify-center gap-6 text-xs text-foreground/20 uppercase tracking-wider">
              <span>No account needed</span>
              {!user && uploadLimit && uploadLimit.remaining < uploadLimit.limit && (
                <span className="text-accent-gold/60">{uploadLimit.remaining}/{uploadLimit.limit} uploads left</span>
              )}
            </div>
          </div>
        </label>
      </div>

      {error && (
        <div className="mt-4 border border-accent-rose/40 card-surface p-4">
          <p className="text-accent-rose text-sm text-center">{error}</p>
        </div>
      )}
    </div>
  )
}
