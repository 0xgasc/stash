'use client'

import { useState, useCallback, useEffect } from 'react'
import { Upload, Loader2, CheckCircle, Copy, ExternalLink } from 'lucide-react'
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

  const fetchLimit = useCallback(() => {
    if (!user) {
      fetch('/api/upload/check-limit')
        .then(r => r.json())
        .then(setUploadLimit)
        .catch(() => {})
    }
  }, [user])

  useEffect(() => {
    fetchLimit()
  }, [fetchLimit])

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
              // Tell server to process the completed upload → Irys
              const response = await fetch(`${UPLOAD_SERVER}/tus-upload/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  uploadId,
                  originalFilename: file.name,
                }),
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
        <div className="bg-black p-12 border-2 border-accent-red shadow-brutal-red text-center">
          <div className="w-14 h-14 border-2 border-accent-red flex items-center justify-center mx-auto mb-6">
            <Upload className="w-6 h-6 text-accent-red" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2 uppercase tracking-wide">Limit reached</h3>
          <p className="text-gray-500 text-sm mb-6">
            You&apos;ve used all {uploadLimit.limit} free uploads. Create an account to continue.
          </p>
          <button
            onClick={() => setShowAuthModal(true)}
            className="bg-accent-red hover:bg-red-400 text-black font-bold py-3 px-8 transition-colors uppercase tracking-wider text-sm"
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
        <div className="bg-black p-8 border-2 border-accent-cyan shadow-brutal">
          <div className="text-center mb-6">
            <CheckCircle className="w-12 h-12 text-accent-cyan mx-auto mb-4" />
            <h3 className="text-xl font-bold text-white mb-2 uppercase tracking-wide">Upload complete</h3>
            <p className="text-gray-500 text-sm">{uploadResult.filename} ({formatBytes(uploadResult.size)})</p>
          </div>

          {/* One-time link warning */}
          {!user && (
            <div className="bg-gray-950 border border-accent-orange/30 p-3 mb-4">
              <p className="text-accent-orange text-xs text-center">
                This link is shown once. Leave this page and it&apos;s gone without an account.
              </p>
            </div>
          )}

          {/* URL Display */}
          <div className="bg-gray-950 border border-gray-800 p-4 mb-6">
            <div className="text-accent-cyan text-xs mb-2 uppercase tracking-wider">Permanent URL</div>
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={uploadResult.url}
                readOnly
                className="flex-1 bg-transparent text-white text-sm truncate outline-none"
              />
              <button
                onClick={copyToClipboard}
                className="flex items-center gap-2 border-2 border-gray-700 hover:border-accent-cyan text-gray-400 hover:text-accent-cyan px-3 py-2 text-sm transition-colors font-bold"
              >
                <Copy className="w-4 h-4" />
                {copied ? 'Copied' : 'Copy'}
              </button>
              <a
                href={uploadResult.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 bg-accent-cyan hover:bg-cyan-300 text-black px-3 py-2 text-sm transition-colors font-bold"
              >
                <ExternalLink className="w-4 h-4" />
                Open
              </a>
            </div>
          </div>

          {/* Auth prompt */}
          {!user && uploadResult.claimToken && isConfigured && (
            <div className="border border-accent-orange/30 bg-gray-950 p-4 mb-6">
              <p className="text-gray-400 text-sm text-center mb-3">
                Sign in to save this file to your dashboard
              </p>
              <button
                onClick={() => setShowAuthModal(true)}
                className="w-full bg-accent-orange hover:bg-orange-400 text-black font-bold py-2 px-4 transition-colors uppercase tracking-wider text-sm"
              >
                Claim file
              </button>
            </div>
          )}

          {/* Upload another */}
          <button
            onClick={reset}
            className="w-full border-2 border-gray-700 hover:border-accent-cyan text-gray-500 hover:text-accent-cyan font-bold py-3 px-6 transition-colors uppercase tracking-wider text-sm"
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
        <div className="bg-black p-12 border-2 border-accent-cyan animate-pulse-glow text-center">
          <Loader2 className="w-10 h-10 text-accent-cyan animate-spin mx-auto mb-4" />
          <h3 className="text-lg font-bold text-white mb-4 uppercase tracking-wide">Uploading...</h3>
          <div className="w-full bg-gray-900 h-1.5 mb-3 border border-gray-800">
            <div
              className="bg-accent-cyan h-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-gray-500 text-sm">{uploadStage || `${Math.round(progress)}%`}</p>
        </div>
      </div>
    )
  }

  // Dropzone state
  return (
    <div className="max-w-2xl mx-auto">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`relative border-2 border-dashed transition-all cursor-pointer border-glow ${
          isDragging
            ? 'border-accent-cyan bg-accent-cyan/5 shadow-glow'
            : 'border-gray-700 bg-black hover:border-gray-500'
        }`}
      >
        <label className="block p-16 cursor-pointer">
          <input
            type="file"
            onChange={handleFileSelect}
            className="hidden"
          />
          <div className="text-center">
            <div className={`w-14 h-14 border-2 flex items-center justify-center mx-auto mb-6 transition-colors ${
              isDragging ? 'border-accent-cyan text-accent-cyan' : 'border-gray-700 text-gray-500'
            }`}>
              <Upload className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2 uppercase tracking-wide">
              {isDragging ? 'Drop file' : 'Drop file or click to upload'}
            </h3>
            <p className="text-gray-400 text-sm mb-6">
              Up to {((uploadLimit?.maxFileSizeMB ?? 6144) / 1024).toFixed(0)}GB // any format
            </p>
            <div className="flex items-center justify-center gap-6 text-xs text-gray-500 uppercase tracking-wider">
              <span>No account needed</span>
              {!user && uploadLimit && uploadLimit.remaining < uploadLimit.limit && (
                <span className="text-accent-cyan/60">{uploadLimit.remaining}/{uploadLimit.limit} uploads left</span>
              )}
            </div>
          </div>
        </label>
      </div>

      {error && (
        <div className="mt-4 border-2 border-accent-red/40 bg-black p-4">
          <p className="text-accent-red text-sm text-center">{error}</p>
        </div>
      )}
    </div>
  )
}
