'use client'

import { useState, useCallback } from 'react'
import { Upload, Loader2, CheckCircle, Copy, ExternalLink } from 'lucide-react'
import AuthModal from './AuthModal'
import { useAuth } from './AuthProvider'

interface UploadResult {
  url: string
  claimToken: string | null
  filename: string
  size: number
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
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const handleUpload = async (file: File) => {
    setError(null)
    setUploading(true)
    setProgress(10)

    const maxSize = 6 * 1024 * 1024 * 1024
    if (file.size > maxSize) {
      setError('File exceeds 6GB limit')
      setUploading(false)
      return
    }

    const formData = new FormData()
    formData.append('file', file)

    setProgress(20)

    try {
      const response = await fetch('/api/upload/irys', {
        method: 'POST',
        body: formData
      })

      setProgress(80)

      const result = await response.json()

      if (result.success) {
        setProgress(100)
        setUploadResult({
          url: result.url,
          claimToken: result.claimToken,
          filename: result.filename,
          size: result.size
        })

        if (!user && result.claimToken && isConfigured) {
          setShowAuthModal(true)
        }
      } else {
        setError(result.error || 'Upload failed')
      }
    } catch (err) {
      setError('Connection error. Please retry.')
    }

    setUploading(false)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleUpload(file)
  }, [])

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
  }

  // Upload complete state
  if (uploadResult) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-gray-950 p-8 border border-gray-800">
          <div className="text-center mb-6">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-white mb-2">Upload complete</h3>
            <p className="text-gray-500 text-sm">{uploadResult.filename} ({formatBytes(uploadResult.size)})</p>
          </div>

          {/* URL Display */}
          <div className="bg-black border border-gray-800 p-4 mb-6">
            <div className="text-gray-500 text-xs mb-2">Permanent URL</div>
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={uploadResult.url}
                readOnly
                className="flex-1 bg-transparent text-white text-sm truncate outline-none"
              />
              <button
                onClick={copyToClipboard}
                className="flex items-center gap-2 border border-gray-700 hover:border-gray-600 text-gray-400 hover:text-white px-3 py-2 text-sm transition-colors"
              >
                <Copy className="w-4 h-4" />
                {copied ? 'Copied' : 'Copy'}
              </button>
              <a
                href={uploadResult.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 bg-white hover:bg-gray-200 text-black px-3 py-2 text-sm transition-colors font-medium"
              >
                <ExternalLink className="w-4 h-4" />
                Open
              </a>
            </div>
          </div>

          {/* Auth prompt */}
          {!user && uploadResult.claimToken && isConfigured && (
            <div className="border border-gray-700 bg-gray-900 p-4 mb-6">
              <p className="text-gray-400 text-sm text-center mb-3">
                Sign in to save this file to your dashboard
              </p>
              <button
                onClick={() => setShowAuthModal(true)}
                className="w-full bg-white hover:bg-gray-200 text-black font-medium py-2 px-4 transition-colors"
              >
                Claim file
              </button>
            </div>
          )}

          {/* Upload another */}
          <button
            onClick={reset}
            className="w-full border border-gray-700 hover:border-gray-600 text-gray-400 hover:text-white font-medium py-3 px-6 transition-colors"
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
        <div className="bg-gray-950 p-12 border border-gray-800 text-center">
          <Loader2 className="w-10 h-10 text-gray-400 animate-spin mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-4">Uploading...</h3>
          <div className="w-full bg-gray-800 h-1 mb-3">
            <div
              className="bg-white h-1 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-gray-500 text-sm">{progress}% complete</p>
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
        className={`relative border border-dashed transition-all cursor-pointer ${
          isDragging
            ? 'border-white bg-gray-900'
            : 'border-gray-700 bg-gray-950 hover:border-gray-600'
        }`}
      >
        <label className="block p-16 cursor-pointer">
          <input
            type="file"
            onChange={handleFileSelect}
            className="hidden"
          />
          <div className="text-center">
            <div className={`w-14 h-14 border flex items-center justify-center mx-auto mb-6 ${
              isDragging ? 'border-white text-white' : 'border-gray-700 text-gray-500'
            }`}>
              <Upload className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-medium text-white mb-2">
              {isDragging ? 'Drop file' : 'Drop file or click to upload'}
            </h3>
            <p className="text-gray-500 text-sm mb-6">
              Up to 6GB, any format
            </p>
            <div className="flex items-center justify-center gap-6 text-xs text-gray-600">
              <span>50GB free</span>
              <span>No account needed</span>
            </div>
          </div>
        </label>
      </div>

      {error && (
        <div className="mt-4 border border-gray-700 bg-gray-900 p-4">
          <p className="text-gray-400 text-sm text-center">{error}</p>
        </div>
      )}
    </div>
  )
}
