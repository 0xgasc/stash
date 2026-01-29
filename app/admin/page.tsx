'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Loader2, RefreshCw, Lock, Wallet, Database, LogOut } from 'lucide-react'

interface BalanceData {
  address: string
  irys: { balanceWei: string; balanceEth: string }
  sepolia: { balanceWei: string; balanceEth: string }
}

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)

  const [balances, setBalances] = useState<BalanceData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError('')
    setLoggingIn(true)

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      if (!res.ok) {
        const data = await res.json()
        setLoginError(data.error || 'Login failed')
        return
      }

      setAuthenticated(true)
      setPassword('')
      fetchBalances()
    } catch {
      setLoginError('Connection error')
    } finally {
      setLoggingIn(false)
    }
  }

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' })
    setAuthenticated(false)
    setBalances(null)
  }

  const fetchBalances = async () => {
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/admin/irys-balance')

      if (res.status === 401) {
        setAuthenticated(false)
        return
      }

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to fetch balances')
        return
      }

      const data = await res.json()
      setBalances(data)
    } catch {
      setError('Connection error')
    } finally {
      setLoading(false)
    }
  }

  // Login screen
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <Lock className="w-8 h-8 text-gray-600 mx-auto mb-4" />
            <h1 className="text-xl font-medium text-white">Admin</h1>
            <p className="text-gray-500 text-sm mt-1">Stash administration</p>
          </div>

          <form onSubmit={handleLogin} className="bg-gray-950 border border-gray-800 p-6">
            <label className="block text-gray-500 text-xs mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-black border border-gray-800 text-white px-3 py-2 text-sm focus:outline-none focus:border-gray-600 mb-4"
              autoFocus
            />
            {loginError && (
              <p className="text-red-400 text-xs mb-4">{loginError}</p>
            )}
            <button
              type="submit"
              disabled={loggingIn || !password}
              className="w-full bg-white hover:bg-gray-200 disabled:bg-gray-700 disabled:text-gray-500 text-black py-2 text-sm font-medium"
            >
              {loggingIn ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="text-center mt-6">
            <Link href="/" className="text-gray-600 hover:text-gray-400 text-sm">
              Back to Stash
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Admin dashboard
  return (
    <div className="min-h-screen bg-black">
      <header className="container mx-auto px-4 py-6">
        <nav className="flex justify-between items-center">
          <Link href="/" className="text-xl font-medium text-white">
            Stash
          </Link>
          <div className="flex items-center gap-6 text-sm">
            <span className="text-gray-500">Admin</span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 text-gray-500 hover:text-white"
            >
              <LogOut className="w-3 h-3" />
              Sign out
            </button>
          </div>
        </nav>
      </header>

      <main className="container mx-auto px-4 py-12 max-w-2xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-medium text-white mb-1">Balances</h1>
            <p className="text-gray-500 text-sm">Irys devnet & Sepolia wallet</p>
          </div>
          <button
            onClick={fetchBalances}
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

        {loading && !balances ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
          </div>
        ) : balances ? (
          <div className="space-y-4">
            {/* Wallet address */}
            <div className="bg-gray-950 border border-gray-800 p-5">
              <div className="text-gray-500 text-xs mb-1">Wallet Address</div>
              <div className="text-white text-sm font-mono break-all">{balances.address}</div>
            </div>

            {/* Balance cards */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-gray-950 border border-gray-800 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Database className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-500 text-xs">Irys Devnet Balance</span>
                </div>
                <div className="text-2xl font-medium text-white">
                  {balances.irys.balanceEth} <span className="text-gray-500 text-sm">ETH</span>
                </div>
                <div className="text-gray-600 text-xs mt-1 font-mono">
                  {balances.irys.balanceWei} wei
                </div>
              </div>

              <div className="bg-gray-950 border border-gray-800 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Wallet className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-500 text-xs">Sepolia Wallet Balance</span>
                </div>
                <div className="text-2xl font-medium text-white">
                  {balances.sepolia.balanceEth} <span className="text-gray-500 text-sm">ETH</span>
                </div>
                <div className="text-gray-600 text-xs mt-1 font-mono">
                  {balances.sepolia.balanceWei} wei
                </div>
              </div>
            </div>

            {/* Info */}
            <div className="bg-gray-950 border border-gray-800 p-5">
              <p className="text-gray-500 text-sm">
                The Irys balance is what&apos;s available for uploads on devnet.
                The Sepolia balance is what&apos;s in the wallet on-chain and can be used to fund Irys further.
              </p>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  )
}
