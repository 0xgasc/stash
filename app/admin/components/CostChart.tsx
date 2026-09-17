'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, RefreshCw, TrendingDown, Layers, FileStack } from 'lucide-react'
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, BarChart, Bar, Cell,
} from 'recharts'

interface CostPoint {
  date: string
  wei: string
  eth: number
  cumulativeEth: number
  count: number
}
interface CostSource {
  source: string
  wei: string
  eth: number
  count: number
}
interface CostSeries {
  totalWei: string
  totalEth: number
  revisions: number
  daily: CostPoint[]
  bySource: CostSource[]
}

const fmtEth = (n: number) => (n >= 0.001 ? n.toFixed(4) : n.toFixed(6))

const SOURCE_COLORS = ['#22d3ee', '#a78bfa', '#f59e0b', '#34d399', '#f472b6', '#60a5fa', '#f87171', '#94a3b8']

export default function CostChart({ authenticated }: { authenticated: boolean }) {
  const [data, setData] = useState<CostSeries | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fetchCost = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/cost-series')
      if (res.status === 401) return
      if (!res.ok) {
        const d = await res.json()
        setError(d.error || 'Failed to fetch cost data')
        return
      }
      setData(await res.json())
    } catch {
      setError('Connection error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (authenticated) fetchCost()
  }, [authenticated, fetchCost])

  const daily = data?.daily ?? []
  const bySource = data?.bySource ?? []

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-white mb-1">ETH consumption</h2>
          <p className="text-gray-500 text-sm">How the Sepolia wallet&apos;s funds are spent on Irys uploads</p>
        </div>
        <button
          onClick={fetchCost}
          disabled={loading}
          className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white px-3 py-1.5 text-xs rounded-lg transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-950/30 border border-red-900/50 text-red-400 text-sm p-4 mb-6 rounded-lg">{error}</div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
              <div className="flex items-center gap-2 text-gray-500 text-xs mb-2">
                <TrendingDown className="w-3.5 h-3.5 text-cyan-400" />
                Total spent
              </div>
              <div className="text-2xl font-semibold text-white">
                {fmtEth(data.totalEth)} <span className="text-gray-500 text-sm font-normal">ETH</span>
              </div>
              <div className="text-gray-600 text-xs mt-1 font-mono">{data.totalWei} wei</div>
            </div>
            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
              <div className="flex items-center gap-2 text-gray-500 text-xs mb-2">
                <Layers className="w-3.5 h-3.5 text-violet-400" />
                Irys revisions
              </div>
              <div className="text-2xl font-semibold text-white">{data.revisions.toLocaleString()}</div>
              <div className="text-gray-600 text-xs mt-1">uploads + re-uploads</div>
            </div>
            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
              <div className="flex items-center gap-2 text-gray-500 text-xs mb-2">
                <FileStack className="w-3.5 h-3.5 text-amber-400" />
                Days tracked
              </div>
              <div className="text-2xl font-semibold text-white">{daily.length}</div>
              <div className="text-gray-600 text-xs mt-1">daily spend series</div>
            </div>
          </div>

          {/* Daily spend + cumulative */}
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
            <div className="text-gray-400 text-sm font-medium mb-4">Daily spend & cumulative</div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={daily} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis
                    yAxisId="spend"
                    tick={{ fill: '#6b7280', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => fmtEth(v)}
                    width={64}
                  />
                  <YAxis yAxisId="cum" orientation="right" hide domain={['dataMin', 'dataMax']} />
                  <Tooltip
                    contentStyle={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: '#9ca3af' }}
                    formatter={(value, name) => [fmtEth(Number(value)) + ' ETH', name === 'eth' ? 'spent' : 'cumulative']}
                  />
                  <Area yAxisId="spend" type="monotone" dataKey="eth" stroke="#22d3ee" strokeWidth={2} fill="url(#spendFill)" name="eth" />
                  <Line yAxisId="cum" type="monotone" dataKey="cumulativeEth" stroke="#a78bfa" strokeWidth={2} dot={false} name="cumulativeEth" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* By source */}
          {bySource.length > 0 && (
            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
              <div className="text-gray-400 text-sm font-medium mb-4">Spend by source</div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bySource} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                    <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => fmtEth(v)} />
                    <YAxis type="category" dataKey="source" tick={{ fill: '#9ca3af', fontSize: 11 }} tickLine={false} axisLine={false} width={120} />
                    <Tooltip
                      contentStyle={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: '#9ca3af' }}
                      formatter={(value) => [fmtEth(Number(value)) + ' ETH', 'spent']}
                    />
                    <Bar dataKey="eth" radius={[0, 6, 6, 0]} barSize={18}>
                      {bySource.map((_, i) => (
                        <Cell key={i} fill={SOURCE_COLORS[i % SOURCE_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
