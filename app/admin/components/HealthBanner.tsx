'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle, XCircle, Mail, CheckCircle, Loader2 } from 'lucide-react'

const SEPOLIA_LOW = 0.1
const IRYS_LOW = 0.005

interface BalanceData {
  irys: { balanceEth: string }
  sepolia: { balanceEth: string }
}

interface CronRun { status: string; started_at: string; error_summary: string | null }

export default function HealthBanner({ authenticated }: { authenticated: boolean }) {
  const [issues, setIssues] = useState<{ level: 'warn' | 'error'; msg: string }[]>([])
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const sendTestAlert = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/admin/alerts/test', { method: 'POST' })
      const d = await res.json()
      if (res.ok && d.ok) {
        setTestResult({ ok: true, msg: `Test sent (id: ${d.id || '—'}). Check your inbox + spam folder.` })
      } else {
        setTestResult({ ok: false, msg: d.error || d.skipped || 'Failed' })
      }
    } catch {
      setTestResult({ ok: false, msg: 'Connection error' })
    } finally {
      setTesting(false)
      setTimeout(() => setTestResult(null), 12000)
    }
  }

  useEffect(() => {
    if (!authenticated) return
    const check = async () => {
      const found: { level: 'warn' | 'error'; msg: string }[] = []
      try {
        const balRes = await fetch('/api/admin/irys-balance')
        if (balRes.ok) {
          const b: BalanceData = await balRes.json()
          const sep = parseFloat(b.sepolia.balanceEth)
          const irys = parseFloat(b.irys.balanceEth)
          if (sep < SEPOLIA_LOW) found.push({ level: sep < SEPOLIA_LOW / 2 ? 'error' : 'warn', msg: `Sepolia wallet low: ${sep.toFixed(4)} ETH (top up from a faucet)` })
          if (irys < IRYS_LOW) found.push({ level: 'error', msg: `Irys devnet balance low: ${irys.toFixed(6)} ETH (run fund-irys.js)` })
        }
      } catch { /* ignore */ }
      try {
        const cronRes = await fetch('/api/admin/cron/runs?limit=1')
        if (cronRes.ok) {
          const d = await cronRes.json()
          const last: CronRun | undefined = d.runs?.[0]
          if (last && (last.status === 'crashed' || last.status === 'failed')) {
            found.push({ level: 'error', msg: `Re-upload cron last run ${last.status}${last.error_summary ? `: ${last.error_summary}` : ''}` })
          }
        }
      } catch { /* ignore */ }
      setIssues(found)
    }
    check()
    const t = setInterval(check, 60_000)
    return () => clearInterval(t)
  }, [authenticated])

  return (
    <div className="space-y-2 mb-6">
      {issues.map((i, idx) => (
        <div
          key={idx}
          className={`border p-3 text-sm flex items-start gap-2 ${
            i.level === 'error'
              ? 'bg-red-950/30 border-red-900/50 text-red-300'
              : 'bg-yellow-950/30 border-yellow-900/50 text-yellow-300'
          }`}
        >
          {i.level === 'error' ? <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
          <span>{i.msg}</span>
        </div>
      ))}
      <div className="flex items-center justify-between gap-3 p-3 bg-gray-950 border border-gray-800 text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <Mail className="w-3.5 h-3.5" />
          <span>Email alerts wired (Sepolia &lt; 0.1 ETH · Irys &lt; 0.005 ETH · cron failures)</span>
        </div>
        <div className="flex items-center gap-2">
          {testResult && (
            <span className={`text-xs ${testResult.ok ? 'text-green-400' : 'text-red-400'} flex items-center gap-1`}>
              {testResult.ok ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
              {testResult.msg}
            </span>
          )}
          <button
            onClick={sendTestAlert}
            disabled={testing}
            className="border border-gray-700 hover:border-gray-600 text-gray-300 hover:text-white px-3 py-1 text-xs flex items-center gap-1.5 disabled:opacity-50"
          >
            {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
            Send test alert
          </button>
        </div>
      </div>
    </div>
  )
}
