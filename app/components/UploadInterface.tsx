'use client'

import { useState } from 'react'
import { Upload, X, Check, Loader2, FileIcon, AlertCircle } from 'lucide-react'

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

export default function UploadInterface({ onUploadComplete }: UploadInterfaceProps) {
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      const maxSize = 6 * 1024 * 1024 * 1024 // 6GB
      if (selectedFile.size > maxSize) {
        setError(`File too large. Maximum size is 6GB. Your file is ${(selectedFile.size / 1024 / 1024 / 1024).toFixed(2)}GB.`)
        e.target.value = ''
        return
      }

      setFile(selectedFile)
      setError(null)

      // Preview for images/videos
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

  const uploadToIrys = async () => {
    if (!file) return

    setUploading(true)
    setUploadProgress(0)
    setError(null)

    try {
      setUploadProgress(10)

      const formData = new FormData()
      formData.append('file', file)

      setUploadProgress(20)

      const response = await fetch('/api/upload/irys', {
        method: 'POST',
        body: formData
      })

      setUploadProgress(80)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.details || errorData.error || 'Upload failed')
      }

      const result = await response.json()
      setUploadProgress(100)

      setUploadedUrl(result.url)

      const fileInfo: FileInfo = {
        url: result.url,
        filename: result.filename,
        size: result.size,
        contentType: result.contentType,
        uploadedAt: new Date().toISOString()
      }

      if (onUploadComplete) {
        onUploadComplete(result.url, fileInfo)
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setError(errorMessage)
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  const resetUpload = () => {
    setFile(null)
    setPreview(null)
    setUploadedUrl(null)
    setError(null)
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
                Up to 6GB, any format
              </span>
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
                <span className="text-white">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </span>
              </div>
            </div>

            {/* Upload Progress */}
            {uploading && (
              <div className="bg-black border border-gray-800 p-4">
                <div className="flex items-center justify-between mb-2 text-sm">
                  <span className="text-gray-500">Uploading...</span>
                  <span className="text-white">{uploadProgress}%</span>
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
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              {!uploadedUrl ? (
                <>
                  <button
                    onClick={uploadToIrys}
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
