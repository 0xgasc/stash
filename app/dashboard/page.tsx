'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileIcon, Download, Copy, Trash2, Upload as UploadIcon, Loader2, Clock, Shield } from 'lucide-react'
import { useAuth } from '../components/AuthProvider'
import { createClient } from '../lib/supabase'

interface StoredFile {
  id: string
  filename: string
  url: string
  size_bytes: number
  content_type: string
  uploaded_at: string
  storage_tier: 'free' | 'permanent'
  expires_at: string | null
}

interface UserStorage {
  free_storage_used: number
  free_storage_limit: number
  permanent_storage_used: number
}

export default function DashboardPage() {
  const { user, loading: authLoading, signOut } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [files, setFiles] = useState<StoredFile[]>([])
  const [storage, setStorage] = useState<UserStorage | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/')
      return
    }

    if (user) {
      fetchDashboardData()
    }
  }, [user, authLoading])

  const fetchDashboardData = async () => {
    try {
      const [filesRes, storageRes] = await Promise.all([
        supabase
          .from('files')
          .select('*')
          .eq('user_id', user!.id)
          .order('uploaded_at', { ascending: false }),
        supabase
          .from('user_storage')
          .select('*')
          .eq('user_id', user!.id)
          .single()
      ])

      if (filesRes.data) setFiles(filesRes.data)
      if (storageRes.data) setStorage(storageRes.data)
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    }
    setLoading(false)
  }

  const copyToClipboard = async (url: string, id: string) => {
    await navigator.clipboard.writeText(url)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const deleteFile = async (id: string) => {
    if (confirm('Remove from dashboard? The file will remain on Arweave.')) {
      await supabase.from('files').delete().eq('id', id)
      setFiles(files.filter(f => f.id !== id))
    }
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  const getDaysUntilExpiration = (expiresAt: string | null) => {
    if (!expiresAt) return null
    const now = new Date()
    const expires = new Date(expiresAt)
    const days = Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return days
  }

  const totalStorage = files.reduce((sum, file) => sum + file.size_bytes, 0)
  const totalFiles = files.length
  const storagePercentage = storage ? (storage.free_storage_used / storage.free_storage_limit) * 100 : 0

  // Loading states
  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    )
  }

  if (!user) {
    return null // Redirecting
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="container mx-auto px-4 py-6">
        <nav className="flex justify-between items-center">
          <Link href="/" className="text-xl font-medium text-white">
            Stash
          </Link>
          <div className="flex items-center gap-6 text-sm">
            <Link href="/pricing" className="text-gray-400 hover:text-white">
              Pricing
            </Link>
            <Link href="/" className="bg-white hover:bg-gray-200 text-black px-4 py-2 font-medium">
              Upload
            </Link>
            <div className="flex items-center gap-3">
              <span className="text-gray-500">{user.email}</span>
              <button
                onClick={() => signOut()}
                className="text-gray-500 hover:text-white"
              >
                Sign out
              </button>
            </div>
          </div>
        </nav>
      </header>

      {/* Dashboard */}
      <main className="container mx-auto px-4 py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-medium text-white mb-1">My Files</h1>
          <p className="text-gray-500 text-sm">Manage your stored files</p>
        </div>

        {/* Stats */}
        <div className="grid md:grid-cols-4 gap-4 mb-12">
          <div className="bg-gray-950 p-5 border border-gray-800">
            <div className="text-gray-500 text-xs mb-1">Total Files</div>
            <div className="text-2xl font-medium text-white">{totalFiles}</div>
          </div>
          <div className="bg-gray-950 p-5 border border-gray-800">
            <div className="text-gray-500 text-xs mb-1">Storage Used</div>
            <div className="text-2xl font-medium text-white">{formatBytes(totalStorage)}</div>
          </div>
          <div className="bg-gray-950 p-5 border border-gray-800 col-span-2">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-500 text-xs">Free Storage</span>
              <span className="text-gray-500 text-xs">
                {storage ? `${formatBytes(storage.free_storage_used)} / ${formatBytes(storage.free_storage_limit)}` : '0 / 50 GB'}
              </span>
            </div>
            <div className="w-full bg-gray-800 h-1">
              <div
                className="h-1 bg-white transition-all"
                style={{ width: `${Math.min(storagePercentage, 100)}%` }}
              />
            </div>
            {storagePercentage > 80 && (
              <p className="text-gray-400 text-xs mt-2">Running low on free storage</p>
            )}
          </div>
        </div>

        {/* Files List */}
        {files.length === 0 ? (
          <div className="bg-gray-950 p-12 border border-gray-800 text-center">
            <UploadIcon className="w-10 h-10 text-gray-600 mx-auto mb-4" />
            <h2 className="text-lg font-medium text-white mb-2">No files yet</h2>
            <p className="text-gray-500 text-sm mb-6">Upload your first file to get started</p>
            <Link
              href="/"
              className="inline-block bg-white hover:bg-gray-200 text-black px-6 py-2 font-medium"
            >
              Upload
            </Link>
          </div>
        ) : (
          <div className="bg-gray-950 border border-gray-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-black border-b border-gray-800">
                  <tr>
                    <th className="px-6 py-3 text-left text-gray-500 text-xs font-medium">File</th>
                    <th className="px-6 py-3 text-left text-gray-500 text-xs font-medium">Size</th>
                    <th className="px-6 py-3 text-left text-gray-500 text-xs font-medium">Status</th>
                    <th className="px-6 py-3 text-left text-gray-500 text-xs font-medium">Uploaded</th>
                    <th className="px-6 py-3 text-left text-gray-500 text-xs font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {files.map((file) => {
                    const daysLeft = getDaysUntilExpiration(file.expires_at)
                    return (
                      <tr key={file.id} className="hover:bg-gray-900/50">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <FileIcon className="w-4 h-4 text-gray-500" />
                            <div>
                              <div className="text-white text-sm">{file.filename}</div>
                              <div className="text-gray-600 text-xs truncate max-w-xs">{file.url}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-gray-400 text-sm">{formatBytes(file.size_bytes)}</td>
                        <td className="px-6 py-4">
                          {file.storage_tier === 'permanent' ? (
                            <span className="flex items-center gap-1 text-white text-sm">
                              <Shield className="w-3 h-3" />
                              Permanent
                            </span>
                          ) : (
                            <div>
                              <span className="flex items-center gap-1 text-gray-400 text-sm">
                                <Clock className="w-3 h-3" />
                                {daysLeft !== null && daysLeft > 0 ? `${daysLeft}d left` : 'Expiring'}
                              </span>
                              <button className="text-gray-500 hover:text-white text-xs mt-1">
                                Make permanent
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-gray-400 text-sm">{formatDate(file.uploaded_at)}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => window.open(file.url, '_blank')}
                              className="p-2 hover:bg-gray-800 text-gray-400 hover:text-white"
                              title="Open"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => copyToClipboard(file.url, file.id)}
                              className="p-2 hover:bg-gray-800 text-gray-400 hover:text-white"
                              title="Copy URL"
                            >
                              {copied === file.id ? (
                                <span className="text-xs">Copied</span>
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>
                            <button
                              onClick={() => deleteFile(file.id)}
                              className="p-2 hover:bg-gray-800 text-gray-500 hover:text-gray-300"
                              title="Remove"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Info Banner */}
        <div className="mt-8 bg-gray-950 border border-gray-800 p-5">
          <p className="text-gray-500 text-sm">
            Free tier files auto-renew. Permanent files are stored on Arweave for 200+ years.
            Removing a file from your dashboard doesn't delete it from the blockchain.
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-12 mt-24 border-t border-gray-900">
        <div className="text-center text-gray-600 text-sm">
          Arweave + Irys
        </div>
      </footer>
    </div>
  )
}
