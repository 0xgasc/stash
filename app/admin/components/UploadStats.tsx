'use client'

import { useState, useEffect } from 'react'
import { Loader2, BarChart3, HardDrive, RefreshCw, Coins, ChevronDown, ChevronUp, Globe } from 'lucide-react'
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, BarChart, Bar } from 'recharts'

interface StatsData {
  total_uploads: number
  total_size_bytes: number
  total_cost_wei: string
  revisions_with_cost: number
  uploads_by_source: { source: string; count: number; total_size: number }[]
  uploads_by_type: { bucket: string; count: number; total_size: number }[]
  uploads_by_country: { country: string; count: number }[]
  daily_uploads: { day: string; count: number; bytes: number }[]
  daily_cost_wei: { day: string; wei: number }[]
  largest_uploads: { uuid: string; filename: string; size: number; content_type: string; source: string; created_at: string }[]
  recent_uploads: { uuid: string; source: string; filename: string; size: number; irys_url: string; created_at: string }[]
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function weiToEth(weiStr: string): string {
  if (!weiStr || weiStr === '0') return '0.000000'
  try {
    const wei = BigInt(weiStr)
    const whole = wei / BigInt(1e18)
    const frac = (wei % BigInt(1e18)).toString().padStart(18, '0').slice(0, 6)
    return `${whole}.${frac}`
  } catch { return '0.000000' }
}

export default function UploadStats({ authenticated }: { authenticated: boolean }) {
  const [stats, setStats] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [chartsVisible, setChartsVisible] = useState(true)

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

  const totalEth = stats ? weiToEth(stats.total_cost_wei) : '0'

  return (
    <div className="mt-16">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-medium text-white mb-1">Stats</h2>
          <p className="text-gray-500 text-sm">Consumption & analytics</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setChartsVisible(v => !v)}
            className="flex items-center gap-2 bg-gray-950 hover:bg-gray-900 border border-gray-800 text-gray-400 hover:text-white px-4 py-2 text-sm"
          >
            {chartsVisible ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {chartsVisible ? 'Hide charts' : 'Show charts'}
          </button>
          <button
            onClick={fetchStats}
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

      {loading && !stats ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
        </div>
      ) : stats ? (
        <div className="space-y-4">
          {/* Top-line metrics */}
          <div className="grid md:grid-cols-4 gap-4">
            <Metric icon={<BarChart3 className="w-4 h-4 text-gray-500" />} label="Total uploads" value={String(stats.total_uploads)} />
            <Metric icon={<HardDrive className="w-4 h-4 text-gray-500" />} label="Total size" value={formatBytes(stats.total_size_bytes)} />
            <Metric icon={<Coins className="w-4 h-4 text-gray-500" />} label="Total cost" value={`${totalEth} ETH`} hint={`${stats.revisions_with_cost} revisions tracked`} />
            <Metric icon={<Globe className="w-4 h-4 text-gray-500" />} label="Countries" value={String(stats.uploads_by_country.length)} />
          </div>

          {/* Charts (toggleable) */}
          {chartsVisible && (stats.daily_uploads.length > 0 || stats.daily_cost_wei.length > 0) && (
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-gray-950 border border-gray-800 p-5">
                <div className="text-gray-500 text-xs mb-3">Uploads per day (last 30d)</div>
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={stats.daily_uploads}>
                    <XAxis dataKey="day" tick={{ fill: '#666', fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                    <YAxis tick={{ fill: '#666', fontSize: 10 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: '#000', border: '1px solid #333', fontSize: 12 }} />
                    <Bar dataKey="count" fill="#fff" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-gray-950 border border-gray-800 p-5">
                <div className="text-gray-500 text-xs mb-3">ETH burn rate (last 30d)</div>
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={stats.daily_cost_wei.map((d) => ({ day: d.day, eth: Number(d.wei) / 1e18 }))}>
                    <XAxis dataKey="day" tick={{ fill: '#666', fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                    <YAxis tick={{ fill: '#666', fontSize: 10 }} tickFormatter={(v) => v.toExponential(0)} />
                    <Tooltip contentStyle={{ background: '#000', border: '1px solid #333', fontSize: 12 }} formatter={(v: number) => v.toFixed(8) + ' ETH'} />
                    <Line type="monotone" dataKey="eth" stroke="#fff" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Breakdowns */}
          <div className="grid md:grid-cols-3 gap-4">
            <Breakdown title="By source" rows={stats.uploads_by_source.map(r => ({ label: r.source, count: r.count, sub: formatBytes(r.total_size) }))} />
            <Breakdown title="By type" rows={stats.uploads_by_type.map(r => ({ label: r.bucket, count: r.count, sub: formatBytes(r.total_size) }))} />
            <Breakdown title="By country" rows={stats.uploads_by_country.map(r => ({ label: r.country, count: r.count }))} emptyText="No geo data yet" />
          </div>

          {/* Top 10 largest */}
          {stats.largest_uploads.length > 0 && (
            <div className="bg-gray-950 border border-gray-800 p-5">
              <div className="text-gray-500 text-xs mb-4">Top 10 largest files</div>
              <div className="space-y-2">
                {stats.largest_uploads.map((f) => (
                  <a key={f.uuid} href={`/admin/uploads/${f.uuid}`} className="flex items-center gap-3 text-sm hover:bg-gray-900/50 px-2 py-1 -mx-2 rounded">
                    <span className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded font-mono">{f.source}</span>
                    <span className="text-white truncate flex-1">{f.filename}</span>
                    <span className="text-gray-500 text-xs">{formatBytes(f.size)}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}

function Metric({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="bg-gray-950 border border-gray-800 p-5">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <span className="text-gray-500 text-xs">{label}</span>
      </div>
      <div className="text-2xl font-medium text-white">{value}</div>
      {hint && <div className="text-gray-600 text-xs mt-1">{hint}</div>}
    </div>
  )
}

function Breakdown({ title, rows, emptyText }: { title: string; rows: { label: string; count: number; sub?: string }[]; emptyText?: string }) {
  return (
    <div className="bg-gray-950 border border-gray-800 p-5">
      <div className="text-gray-500 text-xs mb-3">{title}</div>
      {rows.length === 0 ? (
        <div className="text-gray-600 text-sm">{emptyText || 'No data'}</div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between text-sm">
              <span className="text-white">{r.label}</span>
              <span className="text-gray-500">
                {r.count}{r.sub ? ` · ${r.sub}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
