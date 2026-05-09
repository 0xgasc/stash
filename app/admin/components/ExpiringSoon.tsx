'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Loader2, RefreshCw, Clock, AlertTriangle, RotateCcw } from 'lucide-react'

interface ExpiringRow {
  uuid: string
  filename: string
  size: number
  content_type: string
  source: string
  country: string | null
  city: string | null
  reupload_count: number
  latest_link_at: string | null
  irys_url: string
  created_at: string
}

const REFRESH_THRESHOLD_DAYS = 15

function daysSince(iso: string | null): number {
  if (!iso) return 999
  const ms = Date.now() - new Date(iso + 'Z').getTime()
  return ms / (1000 * 60 * 60 * 24)
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export default function ExpiringSoon({ authenticated }: { authenticated: boolean }) {
  const [rows, setRows] = useState<ExpiringRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkRunning, setBulkRunning] = useState(false)

  const fetchRows = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/expiring?limit=20')
      if (res.status === 401) return
      if (!res.ok) {
        const d = await res.json()
        setError(d.error || 'Failed to fetch')
        return
      }
      const d = await res.json()
      setRows(d.uploads || [])
    } catch {
      setError('Connection error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (authenticated) fetchRows()
  }, [authenticated, fetchRows])

  const toggle = (uuid: string) => {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(uuid)) next.delete(uuid); else next.add(uuid)
      return next
    })
  }

  const bulkRefresh = async () => {
    if (selected.size === 0) return
    setBulkRunning(true)
    try {
      const res = await fetch('/api/admin/uploads/bulk-reupload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uuids: Array.from(selected) }),
      })
      if (res.ok) {
        setSelected(new Set())
        fetchRows()
      } else {
        const d = await res.json()
        setError(d.error || 'Bulk re-upload failed')
      }
    } catch {
      setError('Bulk re-upload failed')
    } finally {
      setBulkRunning(false)
    }
  }

  const colorForDays = (days: number) => {
    const remaining = REFRESH_THRESHOLD_DAYS - days
    if (remaining < 3) return 'text-red-400'
    if (remaining < 7) return 'text-yellow-400'
    return 'text-green-400'
  }

  return (
    <div className="mt-16">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-medium text-white mb-1">Closest to expiry</h2>
          <p className="text-gray-500 text-sm">Files queued for re-upload (15-day threshold)</p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button
              onClick={bulkRefresh}
              disabled={bulkRunning}
              className="flex items-center gap-2 bg-white hover:bg-gray-200 disabled:bg-gray-700 disabled:text-gray-500 text-black px-4 py-2 text-sm font-medium"
            >
              {bulkRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
              Re-upload {selected.size} selected
            </button>
          )}
          <button
            onClick={fetchRows}
            disabled={loading}
            className="flex items-center gap-2 bg-gray-950 hover:bg-gray-900 border border-gray-800 text-gray-400 hover:text-white px-4 py-2 text-sm"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-950/30 border border-red-900/50 text-red-400 text-sm p-4 mb-6">{error}</div>
      )}

      {loading && rows.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-gray-950 border border-gray-800 p-12 text-center">
          <Clock className="w-8 h-8 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No uploads tracked yet</p>
        </div>
      ) : (
        <div className="bg-gray-950 border border-gray-800 divide-y divide-gray-800/50">
          {rows.map((u) => {
            const days = daysSince(u.latest_link_at)
            const remaining = REFRESH_THRESHOLD_DAYS - days
            const overdue = remaining < 0
            return (
              <div key={u.uuid} className="p-4 flex items-center gap-3 hover:bg-gray-900/30">
                <input
                  type="checkbox"
                  checked={selected.has(u.uuid)}
                  onChange={() => toggle(u.uuid)}
                  className="w-4 h-4 accent-white cursor-pointer"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Link href={`/admin/uploads/${u.uuid}`} className="text-white text-sm truncate hover:underline">
                      {u.filename}
                    </Link>
                    <span className="text-gray-600 text-xs">{formatBytes(u.size)}</span>
                    <span className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded font-mono">{u.source}</span>
                    {u.country && (
                      <span className="text-xs text-gray-500">{u.city ? `${u.city}, ` : ''}{u.country}</span>
                    )}
                    {u.reupload_count > 0 && (
                      <span className="text-xs text-yellow-600">refreshed {u.reupload_count}×</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    Last refresh: {u.latest_link_at ? new Date(u.latest_link_at + 'Z').toLocaleString() : '—'}
                  </div>
                </div>
                <div className={`text-right text-sm font-medium ${colorForDays(days)} flex items-center gap-1.5`}>
                  {overdue && <AlertTriangle className="w-3.5 h-3.5" />}
                  {overdue ? `${Math.floor(-remaining)}d overdue` : `${Math.ceil(remaining)}d left`}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
