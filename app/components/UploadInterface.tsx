/**
 * UploadInterface — Drag-and-drop upload widget with file preview.
 *
 * Used on the /upload page. Supports drag-and-drop and click-to-select,
 * shows image/video previews, upload progress via TUS resumable protocol,
 * permanent URL with copy/open buttons, rate limit messaging, and an
 * auth prompt for anonymous users to claim their upload.
 */
'use client'

import { useState, useEffect } from 'react'
import { Upload, X, Check, Loader2, FileIcon, AlertCircle } from 'lucide-react'
import * as tus from 'tus-js-client'
import AuthModal from './AuthModal'
import { useAuth } from './AuthProvider'

const UPLOAD_SERVER = process.env.NEXT_PUBLIC_UPLOAD_SERVER || 'http://localhost:5050'

interface UploadInterfaceProps {
  onUploadComplete?: (url: string, fileInfo: FileInfo) => void
}

interface FileInfo {
  url: string
  filename: string
  size: number
  contentType: string
  uploadedAt: string
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

export default function UploadInterface({ onUploadComplete }: UploadInterfaceProps) {
  const { user } = useAuth()
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadStage, setUploadStage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [uploadLimit, setUploadLimit] = useState<UploadLimit | null>(null)
  const [showAuthModal, setShowAuthModal] = useState(false)

  useEffect(() => {
    if (!user) {
      fetch('/api/upload/check-limit')
        .then(r => r.json())
        .then(setUploadLimit)
        .catch(() => {})
    }
  }, [user])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      const maxSizeBytes = (uploadLimit?.maxFileSizeMB ?? 6144) * 1024 * 1024
      if (selectedFile.size > maxSizeBytes) {
        setError(`File too large. Maximum size is ${((uploadLimit?.maxFileSizeMB ?? 6144) / 1024).toFixed(0)}GB.`)
        e.target.value = ''
        return
      }

      setFile(selectedFile)
      setError(null)

      if (selectedFile.type.startsWith('image/') || selectedFile.type.startsWith('video/')) {
        const reader = new FileReader()
        reader.onloadend = () => {
          setPreview(reader.result as string)
        }
        reader.readAsDataURL(selectedFile)
      } else {
        setPreview(null)
      }
    }
  }

  const uploadFile = async () => {
    if (!file) return

    setUploading(true)
    setUploadProgress(0)
    setUploadStage('Starting upload...')
    setError(null)

    // Check rate limit before starting
    if (!user) {
      try {
        const limitRes = await fetch('/api/upload/check-limit')
        const limitData = await limitRes.json()
        if (limitData.limitReached) {
          setUploadLimit({ remaining: 0, limit: limitData.limit, limitReached: true, maxFileSizeMB: limitData.maxFileSizeMB })
          setError('Upload limit reached. Create an account to continue.')
          setUploading(false)
          setUploadProgress(0)
          return
        }
      } catch {
        // Continue if check fails
      }
    }

    try {
      const result = await new Promise<{ url: string; filename: string; size: number; contentType: string }>((resolve, reject) => {
        let progressInterval: ReturnType<typeof setInterval> | null = null

        const upload = new tus.Upload(file, {
          endpoint: `${UPLOAD_SERVER}/tus-upload`,
          retryDelays: [0, 1000, 3000, 5000, 10000, 30000],
          chunkSize: 5 * 1024 * 1024,
          metadata: {
            filename: file.name,
            filetype: file.type,
            filesize: file.size.toString(),
          },
          onError: (err) => {
            if (progressInterval) clearInterval(progressInterval)
            reject(new Error(`Upload failed: ${err.message}. Your upload can be resumed if you try again.`))
          },
          onProgress: (bytesUploaded, bytesTotal) => {
            const pct = Math.round((bytesUploaded / bytesTotal) * 100)
            const adjusted = 5 + (pct * 0.65)
            setUploadProgress(Math.round(adjusted))
            setUploadStage(`Uploading... ${pct}% (${formatBytes(bytesUploaded)} / ${formatBytes(bytesTotal)})`)
          },
          onSuccess: async () => {
            if (progressInterval) clearInterval(progressInterval)

            const uploadUrl = upload.url
            const uploadId = uploadUrl?.split('/').pop()

            setUploadProgress(72)
            setUploadStage('Processing on blockchain...')

            progressInterval = setInterval(() => {
              setUploadProgress(prev => {
                if (prev < 95) return prev + Math.random() * 1.5 + 0.3
                return prev
              })
            }, 1500)

            try {
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

              // Increment rate limit cookie
              if (!user) {
                try {
                  await fetch('/api/upload/increment-limit', { method: 'POST' })
                } catch {
                  // Non-critical
                }
              }

              resolve({
                url: data.url,
                filename: data.filename,
                size: data.size,
                contentType: data.contentType || 'application/octet-stream',
              })
            } catch (err) {
              if (progressInterval) clearInterval(progressInterval)
              reject(err)
            }
          },
        })

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

      setUploadProgress(100)
      setUploadStage('Complete')
      setUploadedUrl(result.url)

      // Refresh limit
      if (!user) {
        fetch('/api/upload/check-limit')
          .then(r => r.json())
          .then(setUploadLimit)
          .catch(() => {})
      }

      if (onUploadComplete) {
        onUploadComplete(result.url, {
          url: result.url,
          filename: result.filename,
          size: result.size,
          contentType: result.contentType,
          uploadedAt: new Date().toISOString(),
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    }

    setUploading(false)
  }

  const resetUpload = () => {
    setFile(null)
    setPreview(null)
    setUploadedUrl(null)
    setError(null)
    setUploadStage('')
  }

  // Limit reached state (no file selected yet)
  if (!user && uploadLimit?.limitReached && !file) {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <div className="bg-gray-950 p-12 border border-gray-800 text-center">
          <div className="w-14 h-14 border border-gray-700 flex items-center justify-center mx-auto mb-6">
            <Upload className="w-6 h-6 text-gray-500" />
          </div>
          <h3 className="text-lg font-medium text-white mb-2">Upload limit reached</h3>
          <p className="text-gray-500 text-sm mb-6">
            You&apos;ve used all {uploadLimit.limit} free uploads. Create an account to continue.
          </p>
          <button
            onClick={() => setShowAuthModal(true)}
            className="bg-white hover:bg-gray-200 text-black font-medium py-3 px-8 transition-colors"
          >
            Create account
          </button>

          <AuthModal
            open={showAuthModal}
            onClose={() => setShowAuthModal(false)}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="bg-gray-950 p-8 border border-gray-800">
        {error && (
          <div className="mb-6 bg-gray-900 border border-gray-700 p-4 flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-white text-sm font-medium">Upload error</p>
              <p className="text-gray-500 text-sm mt-1">{error}</p>
            </div>
          </div>
        )}

        {!file ? (
          <div className="border border-dashed border-gray-700 p-12 hover:border-gray-600 transition-colors">
            <label className="cursor-pointer flex flex-col items-center">
              <div className="w-12 h-12 border border-gray-700 flex items-center justify-center mb-4">
                <Upload className="w-5 h-5 text-gray-500" />
              </div>
              <span className="text-white text-sm mb-1">Click to select file</span>
              <span className="text-xs text-gray-600">
                Up to {((uploadLimit?.maxFileSizeMB ?? 6144) / 1024).toFixed(0)}GB, any format
              </span>
              {!user && uploadLimit && uploadLimit.remaining < uploadLimit.limit && (
                <span className="text-xs text-gray-600 mt-1">
                  {uploadLimit.remaining} of {uploadLimit.limit} uploads remaining
                </span>
              )}
              <input
                type="file"
                onChange={handleFileSelect}
                className="hidden"
              />
            </label>
          </div>
        ) : (
          <div className="space-y-4">
            {/* File Preview */}
            <div className="relative bg-black border border-gray-800 overflow-hidden">
              {preview ? (
                file?.type.startsWith('image/') ? (
                  <img
                    src={preview}
                    alt="Preview"
                    className="w-full h-48 object-contain"
                  />
                ) : file?.type.startsWith('video/') ? (
                  <video
                    src={preview}
                    controls
                    className="w-full h-48"
                  />
                ) : null
              ) : (
                <div className="flex items-center justify-center h-48">
                  <div className="text-center">
                    <FileIcon className="w-10 h-10 text-gray-600 mx-auto mb-2" />
                    <p className="text-gray-500 text-sm">{file.name}</p>
                  </div>
                </div>
              )}

              {uploadedUrl && (
                <div className="absolute inset-0 bg-black/90 flex items-center justify-center">
                  <div className="text-center">
                    <Check className="w-10 h-10 text-white mx-auto mb-2" />
                    <p className="text-white text-sm">Upload complete</p>
                  </div>
                </div>
              )}
            </div>

            {/* File Info */}
            <div className="bg-black border border-gray-800 p-4">
              <div className="flex justify-between items-center mb-2 text-sm">
                <span className="text-gray-500">Filename</span>
                <span className="text-white">{file.name}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500">Size</span>
                <span className="text-white">{formatBytes(file.size)}</span>
              </div>
            </div>

            {/* Upload Progress */}
            {uploading && (
              <div className="bg-black border border-gray-800 p-4">
                <div className="flex items-center justify-between mb-2 text-sm">
                  <span className="text-gray-500">{uploadStage || 'Uploading...'}</span>
                  <span className="text-white">{Math.round(uploadProgress)}%</span>
                </div>
                <div className="w-full bg-gray-800 h-1">
                  <div
                    className="bg-white h-1 transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Uploaded URL */}
            {uploadedUrl && (
              <div className="bg-black border border-gray-700 p-4">
                <p className="text-white text-sm mb-3">Permanently stored</p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={uploadedUrl}
                    readOnly
                    className="flex-1 bg-gray-900 text-gray-400 px-3 py-2 text-sm border border-gray-700"
                  />
                  <button
                    onClick={() => navigator.clipboard.writeText(uploadedUrl)}
                    className="bg-white hover:bg-gray-200 text-black px-4 py-2 text-sm font-medium"
                  >
                    Copy
                  </button>
                </div>
                {!user && (
                  <p className="text-gray-500 text-xs mt-2">
                    Save this link now. It won&apos;t be shown again without an account.
                  </p>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              {!uploadedUrl ? (
                <>
                  <button
                    onClick={uploadFile}
                    disabled={uploading}
                    className="flex-1 bg-white hover:bg-gray-200 text-black font-medium py-2 px-4 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Uploading...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        <span>Upload</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={resetUpload}
                    className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 border border-gray-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <button
                  onClick={resetUpload}
                  className="w-full bg-gray-900 hover:bg-gray-800 text-white font-medium py-2 px-4 border border-gray-700 text-sm"
                >
                  Upload another
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
