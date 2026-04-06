'use client'

import { useState, useEffect } from 'react'
import { Loader2, BarChart3, HardDrive, RefreshCw } from 'lucide-react'

interface StatsData {
  total_uploads: number
  total_size_bytes: number
  uploads_by_source: { source: string; count: number; total_size: number }[]
  recent_uploads: { uuid: string; source: string; filename: string; size: number; irys_url: string; created_at: string }[]
}

export default function UploadStats({ authenticated }: { authenticated: boolean }) {
  const [stats, setStats] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fetchStats = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/stats')
      if (res.status === 401) return
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to fetch stats')
        return
      }
      setStats(await res.json())
    } catch {
      setError('Connection error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (authenticated) fetchStats()
  }, [authenticated])

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div className="mt-16">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-medium text-white mb-1">Stats</h2>
          <p className="text-gray-500 text-sm">Upload analytics</p>
        </div>
        <button
          onClick={fetchStats}
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

      {loading && !stats ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
        </div>
      ) : stats ? (
        <div className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-gray-950 border border-gray-800 p-5">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-4 h-4 text-gray-500" />
                <span className="text-gray-500 text-xs">Total Uploads</span>
              </div>
              <div className="text-2xl font-medium text-white">{stats.total_uploads}</div>
            </div>

            <div className="bg-gray-950 border border-gray-800 p-5">
              <div className="flex items-center gap-2 mb-3">
                <HardDrive className="w-4 h-4 text-gray-500" />
                <span className="text-gray-500 text-xs">Total Size</span>
              </div>
              <div className="text-2xl font-medium text-white">{formatBytes(stats.total_size_bytes)}</div>
            </div>

            <div className="bg-gray-950 border border-gray-800 p-5">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-4 h-4 text-gray-500" />
                <span className="text-gray-500 text-xs">Sources</span>
              </div>
              <div className="text-2xl font-medium text-white">{stats.uploads_by_source.length}</div>
            </div>
          </div>

          {stats.uploads_by_source.length > 0 && (
            <div className="bg-gray-950 border border-gray-800 p-5">
              <div className="text-gray-500 text-xs mb-4">Uploads by Source</div>
              <div className="space-y-3">
                {stats.uploads_by_source.map((s) => (
                  <div key={s.source} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded font-mono">
                        {s.source}
                      </span>
                      <span className="text-white text-sm">{s.count} uploads</span>
                    </div>
                    <span className="text-gray-500 text-sm">{formatBytes(s.total_size)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
