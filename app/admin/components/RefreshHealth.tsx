'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, RefreshCw, ShieldCheck, ShieldAlert, Search, CheckCircle, XCircle, Clock } from 'lucide-react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts'

interface RefreshState { threshold_days: number; stale_count: number }
interface CostPoint { date: string; count: number }
interface Eviction { total: number; minAgeDays: number | null; maxAgeDays: number | null; avgAgeDays: number | null; byDay: { day: string; n: number }[] }
interface LinkHealth { uuid: string; source?: string; filename?: string; size?: number; devnet_size?: number; status: string; error?: string }

const statusColor: Record<string, string> = {
  alive: '#34d399', evicted: '#f87171', mismatch: '#f59e0b',
  http_404: '#f87171', http_410: '#f87171', error: '#f87171',
}

export default function RefreshHealth({ authenticated }: { authenticated: boolean }) {
  const [refresh, setRefresh] = useState<RefreshState | null>(null)
  const [expiring, setExpiring] = useState<number | null>(null)
  const [cost, setCost] = useState<CostPoint[]>([])
  const [evictions, setEvictions] = useState<Eviction | null>(null)
  const [loading, setLoading] = useState(false)

  const [probeUuid, setProbeUuid] = useState('')
  const [probeResult, setProbeResult] = useState<LinkHealth | null>(null)
  const [probing, setProbing] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [r, e, c, ev] = await Promise.all([
        fetch('/api/admin/refresh').then((x) => x.json()),
        fetch('/api/admin/expiring?limit=1').then((x) => x.json()),
        fetch('/api/admin/cost-series').then((x) => x.json()),
        fetch('/api/admin/evictions?days=30').then((x) => x.json()),
      ])
      setRefresh(r)
      setExpiring(e.uploads?.length ?? null)
      setCost((c.daily ?? []).slice(-30).map((d: { date: string; count: number }) => ({ date: d.date, count: d.count })))
      setEvictions(ev)
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (authenticated) fetchAll()
  }, [authenticated, fetchAll])

  const probe = async () => {
    const uuid = probeUuid.trim()
    if (!uuid) return
    setProbing(true)
    setProbeResult(null)
    try {
      const res = await fetch(`/api/admin/link-health?uuid=${encodeURIComponent(uuid)}`)
      setProbeResult(await res.json())
    } catch {
      setProbeResult({ uuid, status: 'error', error: 'connection error' })
    } finally {
      setProbing(false)
    }
  }

  const overdue = refresh?.stale_count ?? null
  const evictionTotal = evictions?.total ?? 0
  const evictionAge = evictions?.avgAgeDays

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-white mb-1">Refresh & retention health</h2>
          <p className="text-gray-500 text-sm">Overdue files, re-upload volume, and real devnet evictions</p>
        </div>
        <button
          onClick={fetchAll}
          disabled={loading}
          className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white px-3 py-1.5 text-xs rounded-lg transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
          <div className="flex items-center gap-2 text-gray-500 text-xs mb-2">
            {overdue === 0 ? <ShieldCheck className="w-3.5 h-3.5 text-green-400" /> : <ShieldAlert className="w-3.5 h-3.5 text-red-400" />}
            Overdue (past {refresh?.threshold_days ?? 20}d)
          </div>
          <div className={`text-2xl font-semibold ${overdue === 0 ? 'text-white' : 'text-red-400'}`}>
            {overdue === null ? '—' : overdue}
          </div>
          <div className="text-gray-600 text-xs mt-1">{overdue === 0 ? 'nothing past the refresh line' : 'needs a refresh run'}</div>
        </div>
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
          <div className="flex items-center gap-2 text-gray-500 text-xs mb-2">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            Approaching threshold
          </div>
          <div className="text-2xl font-semibold text-white">{expiring === null ? '—' : expiring}</div>
          <div className="text-gray-600 text-xs mt-1">closest to the {refresh?.threshold_days ?? 20}-day line</div>
        </div>
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
          <div className="flex items-center gap-2 text-gray-500 text-xs mb-2">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            Evictions found (30d)
          </div>
          <div className="text-2xl font-semibold text-white">{evictionTotal}</div>
          <div className="text-gray-600 text-xs mt-1">
            {evictionAge !== null && evictionAge !== undefined ? `avg age at detection: ${evictionAge}d` : 'copies that came back wrong'}
          </div>
        </div>
      </div>

      {/* Daily revisions */}
      <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5 mb-6">
        <div className="text-gray-400 text-sm font-medium mb-4">Re-uploads per day (last 30)</div>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={cost} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={28} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} width={32} />
              <Tooltip
                contentStyle={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#9ca3af' }}
                formatter={(value) => [`${value} revisions`, 're-uploads']}
              />
              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {cost.map((_, i) => (
                  <Cell key={i} fill={cost[i].count > 50 ? '#f59e0b' : '#22d3ee'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Link health probe */}
      <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
        <div className="text-gray-400 text-sm font-medium mb-3">Check an old link</div>
        <p className="text-gray-600 text-xs mb-3">
          Paste a uuid (or the /f/ URL) to probe its devnet copy right now and see whether it&apos;s still alive or was evicted.
        </p>
        <div className="flex gap-2">
          <input
            value={probeUuid}
            onChange={(e) => setProbeUuid(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && probe()}
            placeholder="uuid or https://…/f/&lt;uuid&gt;"
            className="flex-1 bg-black/40 border border-white/10 text-white px-3 py-2 text-sm rounded-lg focus:outline-none focus:border-cyan-400/50"
          />
          <button
            onClick={probe}
            disabled={probing || !probeUuid.trim()}
            className="flex items-center gap-2 bg-cyan-400/90 hover:bg-cyan-300 disabled:bg-white/10 disabled:text-gray-500 text-black px-4 py-2 text-sm font-medium rounded-lg transition-colors"
          >
            {probing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            Check
          </button>
        </div>

        {probeResult && (
          <div className="mt-4 flex items-start gap-3 bg-black/30 border border-white/10 rounded-lg p-4">
            {probeResult.status === 'alive' ? (
              <CheckCircle className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            )}
            <div className="text-sm">
              <div className="flex items-center gap-2">
                <span className="text-white font-medium capitalize">{probeResult.status}</span>
                {probeResult.status === 'alive' && (
                  <span className="text-green-400 text-xs">link works — {probeResult.devnet_size} bytes on devnet</span>
                )}
                {probeResult.status === 'evicted' && (
                  <span className="text-red-400 text-xs">evicted — devnet returned {probeResult.devnet_size} bytes, expected {probeResult.size}</span>
                )}
                {probeResult.status === 'mismatch' && (
                  <span className="text-amber-400 text-xs">size mismatch — {probeResult.devnet_size} vs {probeResult.size}</span>
                )}
                {probeResult.error && <span className="text-red-400 text-xs">{probeResult.error}</span>}
              </div>
              <div className="text-gray-500 text-xs mt-1 font-mono break-all">{probeResult.uuid}</div>
              {probeResult.filename && <div className="text-gray-500 text-xs mt-0.5">{probeResult.filename} · {probeResult.source}</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
