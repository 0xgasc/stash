'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, RefreshCw, CheckCircle, AlertTriangle, XCircle, Clock } from 'lucide-react'

interface CronRun {
  id: number
  job: string
  started_at: string
  ended_at: string | null
  status: string
  processed_count: number
  success_count: number
  failed_count: number
  error_summary: string | null
}

const CRON_INTERVAL_HOURS = 6

export default function CronStatus({ authenticated }: { authenticated: boolean }) {
  const [runs, setRuns] = useState<CronRun[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fetchRuns = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/cron/runs?limit=20')
      if (res.status === 401) return
      if (!res.ok) {
        const d = await res.json()
        setError(d.error || 'Failed to fetch')
        return
      }
      const d = await res.json()
      setRuns(d.runs || [])
    } catch {
      setError('Connection error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (authenticated) fetchRuns()
  }, [authenticated, fetchRuns])

  const formatRel = (iso: string) => {
    const d = new Date(iso + 'Z')
    const diff = Date.now() - d.getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1) return 'just now'
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
  }

  const last = runs[0]
  const nextEta = last ? new Date(new Date(last.started_at + 'Z').getTime() + CRON_INTERVAL_HOURS * 3600 * 1000) : null

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === 'success') return <CheckCircle className="w-3.5 h-3.5 text-green-400" />
    if (status === 'partial') return <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
    if (status === 'running') return <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin" />
    return <XCircle className="w-3.5 h-3.5 text-red-400" />
  }

  return (
    <div className="mt-16">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-medium text-white mb-1">Cron status</h2>
          <p className="text-gray-500 text-sm">Re-upload-stale runs every {CRON_INTERVAL_HOURS}h</p>
        </div>
        <button
          onClick={fetchRuns}
          disabled={loading}
          className="flex items-center gap-2 bg-gray-950 hover:bg-gray-900 border border-gray-800 text-gray-400 hover:text-white px-4 py-2 text-sm"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-950/30 border border-red-900/50 text-red-400 text-sm p-4 mb-6">{error}</div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="bg-gray-950 border border-gray-800 p-5">
          <div className="text-gray-500 text-xs mb-2">Last run</div>
          {last ? (
            <div className="flex items-center gap-2">
              <StatusIcon status={last.status} />
              <span className="text-white text-sm capitalize">{last.status}</span>
              <span className="text-gray-600 text-xs">{formatRel(last.started_at)}</span>
            </div>
          ) : (
            <div className="text-gray-600 text-sm">No runs yet</div>
          )}
        </div>
        <div className="bg-gray-950 border border-gray-800 p-5">
          <div className="text-gray-500 text-xs mb-2">Next run</div>
          {nextEta ? (
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-white text-sm">{nextEta.toLocaleString()}</span>
            </div>
          ) : (
            <div className="text-gray-600 text-sm">Within {CRON_INTERVAL_HOURS}h</div>
          )}
        </div>
        <div className="bg-gray-950 border border-gray-800 p-5">
          <div className="text-gray-500 text-xs mb-2">Last refreshed</div>
          <div className="text-white text-sm">{last ? `${last.success_count}/${last.processed_count} files` : '—'}</div>
        </div>
      </div>

      {/* Run history */}
      {runs.length > 0 ? (
        <div className="bg-gray-950 border border-gray-800 divide-y divide-gray-800/50">
          {runs.map((r) => (
            <div key={r.id} className="p-3 grid grid-cols-[20px_1fr_auto_auto] items-center gap-3 text-xs">
              <StatusIcon status={r.status} />
              <div>
                <div className="text-gray-300">{new Date(r.started_at + 'Z').toLocaleString()}</div>
                {r.error_summary && (
                  <div className="text-red-400 truncate mt-0.5" title={r.error_summary}>{r.error_summary}</div>
                )}
              </div>
              <div className="text-gray-500">{r.success_count}/{r.processed_count}</div>
              <div className="text-gray-600 capitalize">{r.status}</div>
            </div>
          ))}
        </div>
      ) : !loading && (
        <div className="bg-gray-950 border border-gray-800 p-8 text-center text-gray-500 text-sm">
          No cron runs recorded yet
        </div>
      )}
    </div>
  )
}
