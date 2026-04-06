'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, RefreshCw, Copy, ExternalLink, RotateCcw, Search, ChevronLeft, ChevronRight, FileText } from 'lucide-react'

interface Upload {
  id: number
  uuid: string
  source: string
  filename: string
  content_type: string
  size: number
  description: string | null
  irys_url: string
  arweave_id: string
  ar_url: string
  reupload_token: string
  reupload_count: number
  last_reuploaded_at: string | null
  created_at: string
}

interface UploadsResponse {
  uploads: Upload[]
  total: number
  page: number
  limit: number
  pages: number
}

export default function UploadHistory({ authenticated }: { authenticated: boolean }) {
  const [data, setData] = useState<UploadsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [reuploadingId, setReuploadingId] = useState<string | null>(null)

  const fetchUploads = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: '20' })
      if (search) params.set('search', search)
      if (sourceFilter) params.set('source', sourceFilter)

      const res = await fetch(`/api/admin/uploads?${params}`)
      if (res.status === 401) return
      if (!res.ok) {
        const d = await res.json()
        setError(d.error || 'Failed to fetch uploads')
        return
      }
      setData(await res.json())
    } catch {
      setError('Connection error')
    } finally {
      setLoading(false)
    }
  }, [page, search, sourceFilter])

  useEffect(() => {
    if (authenticated) fetchUploads()
  }, [authenticated, fetchUploads])

  const handleSearch = (value: string) => {
    setSearch(value)
    setPage(1)
  }

  const handleSourceFilter = (value: string) => {
    setSourceFilter(value)
    setPage(1)
  }

  const copyUrl = async (url: string, uuid: string) => {
    await navigator.clipboard.writeText(url)
    setCopiedId(uuid)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const reupload = async (uuid: string) => {
    setReuploadingId(uuid)
    try {
      const res = await fetch(`/api/admin/uploads/${uuid}`, { method: 'POST' })
      if (res.ok) fetchUploads()
      else {
        const d = await res.json()
        setError(d.error || 'Re-upload failed')
      }
    } catch {
      setError('Re-upload failed')
    } finally {
      setReuploadingId(null)
    }
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDate = (d: string) => {
    const date = new Date(d + 'Z')
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days}d ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  // Collect unique sources for filter
  const sources = data ? [...new Set(data.uploads.map(u => u.source))] : []

  return (
    <div className="mt-16">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-medium text-white mb-1">Upload History</h2>
          <p className="text-gray-500 text-sm">
            {data ? `${data.total} uploads` : 'All uploads tracked'}
          </p>
        </div>
        <button
          onClick={fetchUploads}
          disabled={loading}
          className="flex items-center gap-2 bg-gray-950 hover:bg-gray-900 border border-gray-800 text-gray-400 hover:text-white px-4 py-2 text-sm"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-950/30 border border-red-900/50 text-red-400 text-sm p-4 mb-6">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
          <input
            type="text"
            placeholder="Search filename or description..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full bg-gray-950 border border-gray-800 text-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-gray-600"
          />
        </div>
        <select
          value={sourceFilter}
          onChange={(e) => handleSourceFilter(e.target.value)}
          className="bg-gray-950 border border-gray-800 text-gray-400 px-3 py-2 text-sm focus:outline-none focus:border-gray-600"
        >
          <option value="">All sources</option>
          {sources.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Table */}
      {loading && !data ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
        </div>
      ) : data && data.uploads.length > 0 ? (
        <>
          <div className="bg-gray-950 border border-gray-800 divide-y divide-gray-800/50">
            {data.uploads.map((u) => (
              <div key={u.uuid} className="p-4 hover:bg-gray-900/30 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded font-mono">
                        {u.source}
                      </span>
                      <span className="text-white text-sm truncate">{u.filename}</span>
                      <span className="text-gray-600 text-xs flex-shrink-0">{formatBytes(u.size)}</span>
                    </div>
                    {u.description && (
                      <p className="text-gray-500 text-xs mt-1 truncate">{u.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-600">
                      <span>{formatDate(u.created_at)}</span>
                      <span className="font-mono truncate max-w-[200px]">{u.arweave_id}</span>
                      {u.reupload_count > 0 && (
                        <span className="text-yellow-600">re-uploaded {u.reupload_count}x</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => copyUrl(u.irys_url, u.uuid)}
                      className="p-2 text-gray-600 hover:text-white"
                      title="Copy URL"
                    >
                      <Copy className={`w-3.5 h-3.5 ${copiedId === u.uuid ? 'text-green-400' : ''}`} />
                    </button>
                    <a
                      href={u.irys_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 text-gray-600 hover:text-white"
                      title="Open"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button
                      onClick={() => reupload(u.uuid)}
                      disabled={reuploadingId === u.uuid}
                      className="p-2 text-gray-600 hover:text-white disabled:opacity-50"
                      title="Re-upload to refresh devnet link"
                    >
                      {reuploadingId === u.uuid ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {data.pages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 text-gray-500 hover:text-white disabled:opacity-30 text-sm"
              >
                <ChevronLeft className="w-4 h-4" /> Previous
              </button>
              <span className="text-gray-600 text-sm">
                Page {data.page} of {data.pages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(data.pages, p + 1))}
                disabled={page === data.pages}
                className="flex items-center gap-1 text-gray-500 hover:text-white disabled:opacity-30 text-sm"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      ) : data ? (
        <div className="bg-gray-950 border border-gray-800 p-12 text-center">
          <FileText className="w-8 h-8 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No uploads yet</p>
        </div>
      ) : null}
    </div>
  )
}
