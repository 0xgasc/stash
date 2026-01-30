/**
 * AdminPage — Password-protected dashboard for monitoring wallet balances.
 *
 * Two states:
 *  1. **Login** — Simple password form that POSTs to /api/admin/login.
 *     On success, receives an HMAC-signed httpOnly cookie (24h TTL).
 *  2. **Dashboard** — Displays the Irys devnet balance (available for uploads)
 *     and the Sepolia on-chain wallet balance (available to fund Irys).
 *     Both shown in ETH and wei. Includes a refresh button and logout.
 */
'use client'

import { useState } from 'react'
import Link from 'next/link'
import * as tus from 'tus-js-client'
import { Loader2, RefreshCw, Lock, Wallet, Database, LogOut, Settings, Save, AlertTriangle, Upload, CheckCircle, Copy, ExternalLink, RotateCcw } from 'lucide-react'

const UPLOAD_SERVER = process.env.NEXT_PUBLIC_UPLOAD_SERVER || 'http://localhost:5050'

interface BalanceData {
  address: string
  irys: { balanceWei: string; balanceEth: string }
  sepolia: { balanceWei: string; balanceEth: string }
}

interface AppSettings {
  MAX_ANONYMOUS_UPLOADS: number
  MAX_FILE_SIZE_MB: number
  LINK_EXPIRY_DAYS: number
}

interface SettingsResponse {
  settings: AppSettings
  defaults: AppSettings
  kvConfigured: boolean
}

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)

  const [balances, setBalances] = useState<BalanceData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Settings state
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [settingsDefaults, setSettingsDefaults] = useState<AppSettings | null>(null)
  const [kvConfigured, setKvConfigured] = useState(false)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsError, setSettingsError] = useState('')
  const [settingsSuccess, setSettingsSuccess] = useState('')

  // Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadUploading, setUploadUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadResult, setUploadResult] = useState<{ url: string; filename: string; size: number } | null>(null)
  const [uploadError, setUploadError] = useState('')
  const [uploadCopied, setUploadCopied] = useState(false)

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
      fetchSettings()
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

  const fetchSettings = async () => {
    setSettingsLoading(true)
    setSettingsError('')

    try {
      const res = await fetch('/api/admin/settings')

      if (res.status === 401) {
        setAuthenticated(false)
        return
      }

      if (!res.ok) {
        const data = await res.json()
        setSettingsError(data.error || 'Failed to fetch settings')
        return
      }

      const data: SettingsResponse = await res.json()
      setSettings(data.settings)
      setSettingsDefaults(data.defaults)
      setKvConfigured(data.kvConfigured)
    } catch {
      setSettingsError('Connection error')
    } finally {
      setSettingsLoading(false)
    }
  }

  const saveSettings = async () => {
    if (!settings) return
    setSettingsSaving(true)
    setSettingsError('')
    setSettingsSuccess('')

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })

      if (res.status === 401) {
        setAuthenticated(false)
        return
      }

      const data = await res.json()

      if (!res.ok) {
        setSettingsError(data.error || 'Failed to save settings')
        return
      }

      setSettings(data.settings)
      setSettingsSuccess('Settings saved')
      setTimeout(() => setSettingsSuccess(''), 3000)
    } catch {
      setSettingsError('Connection error')
    } finally {
      setSettingsSaving(false)
    }
  }

  const updateSetting = (key: keyof AppSettings, value: string) => {
    if (!settings) return
    const num = parseInt(value, 10)
    if (!isNaN(num) && num >= 0) {
      setSettings({ ...settings, [key]: num })
    }
  }

  const handleAdminUpload = async (file: File) => {
    setUploadFile(file)
    setUploadError('')
    setUploadUploading(true)
    setUploadProgress(0)
    setUploadResult(null)

    try {
      const data = await new Promise<{ url: string; filename: string; size: number }>((resolve, reject) => {
        let progressInterval: ReturnType<typeof setInterval> | null = null

        const upload = new tus.Upload(file, {
          endpoint: `${UPLOAD_SERVER}/tus-upload`,
          retryDelays: [0, 1000, 3000, 5000, 10000, 30000],
          chunkSize: 5 * 1024 * 1024,
          metadata: {
            filename: file.name,
            filetype: file.type,
            filesize: file.size.toString(),
          },
          onError: (err) => {
            if (progressInterval) clearInterval(progressInterval)
            reject(new Error(err.message))
          },
          onProgress: (bytesUploaded, bytesTotal) => {
            const pct = Math.round((bytesUploaded / bytesTotal) * 100)
            setUploadProgress(5 + Math.round(pct * 0.65))
          },
          onSuccess: async () => {
            if (progressInterval) clearInterval(progressInterval)
            const uploadId = upload.url?.split('/').pop()

            setUploadProgress(72)

            progressInterval = setInterval(() => {
              setUploadProgress(prev => prev < 95 ? prev + Math.random() * 1.5 + 0.3 : prev)
            }, 1500)

            try {
              const res = await fetch(`${UPLOAD_SERVER}/tus-upload/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uploadId, originalFilename: file.name }),
              })

              if (progressInterval) clearInterval(progressInterval)

              if (!res.ok) {
                const errData = await res.json()
                reject(new Error(errData.error || 'Failed to process upload'))
                return
              }

              const result = await res.json()
              resolve({ url: result.url, filename: result.filename, size: result.size })
            } catch (err) {
              if (progressInterval) clearInterval(progressInterval)
              reject(err)
            }
          },
        })

        upload.findPreviousUploads().then((prev) => {
          const valid = prev.filter(p => p.uploadUrl && !p.uploadUrl.includes('undefined'))
          if (valid.length > 0) upload.resumeFromPreviousUpload(valid[0])
          upload.start()
        })
      })

      setUploadProgress(100)
      setUploadResult(data)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploadUploading(false)
    }
  }

  const handleAdminFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleAdminUpload(file)
  }

  const resetAdminUpload = () => {
    setUploadFile(null)
    setUploadResult(null)
    setUploadError('')
    setUploadProgress(0)
  }

  const copyUploadUrl = async () => {
    if (uploadResult?.url) {
      await navigator.clipboard.writeText(uploadResult.url)
      setUploadCopied(true)
      setTimeout(() => setUploadCopied(false), 2000)
    }
  }

  const resetUploadLimit = async () => {
    try {
      const res = await fetch('/api/admin/reset-limit', { method: 'POST' })
      if (res.ok) {
        setSettingsSuccess('Upload limit cookie cleared')
        setTimeout(() => setSettingsSuccess(''), 3000)
      }
    } catch {
      setSettingsError('Failed to reset limit')
    }
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
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

        {/* Settings Section */}
        <div className="mt-16">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-medium text-white mb-1">Settings</h2>
              <p className="text-gray-500 text-sm">Upload limits & file configuration</p>
            </div>
            <button
              onClick={fetchSettings}
              disabled={settingsLoading}
              className="flex items-center gap-2 bg-gray-950 hover:bg-gray-900 border border-gray-800 text-gray-400 hover:text-white px-4 py-2 text-sm"
            >
              <RefreshCw className={`w-3 h-3 ${settingsLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {!kvConfigured && settings && (
            <div className="flex items-start gap-3 bg-gray-950 border border-gray-700 p-4 mb-6">
              <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-white text-sm font-medium">Vercel KV not configured</p>
                <p className="text-gray-500 text-xs mt-1">
                  Settings are read-only (using env vars / defaults). Link a KV store in Vercel to enable editing.
                </p>
              </div>
            </div>
          )}

          {settingsError && (
            <div className="bg-red-950/30 border border-red-900/50 text-red-400 text-sm p-4 mb-6">
              {settingsError}
            </div>
          )}

          {settingsSuccess && (
            <div className="bg-green-950/30 border border-green-900/50 text-green-400 text-sm p-4 mb-6">
              {settingsSuccess}
            </div>
          )}

          {settingsLoading && !settings ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
            </div>
          ) : settings ? (
            <div className="space-y-4">
              <div className="bg-gray-950 border border-gray-800 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Settings className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-500 text-xs">Upload Limits</span>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-white text-sm">Max anonymous uploads</div>
                      <div className="text-gray-600 text-xs mt-0.5">
                        Per session before account required{settingsDefaults ? ` (default: ${settingsDefaults.MAX_ANONYMOUS_UPLOADS})` : ''}
                      </div>
                    </div>
                    <input
                      type="number"
                      min="0"
                      value={settings.MAX_ANONYMOUS_UPLOADS}
                      onChange={(e) => updateSetting('MAX_ANONYMOUS_UPLOADS', e.target.value)}
                      disabled={!kvConfigured}
                      className="w-24 bg-black border border-gray-800 text-white px-3 py-2 text-sm text-right focus:outline-none focus:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>

                  <div className="border-t border-gray-800" />

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-white text-sm">Max file size (MB)</div>
                      <div className="text-gray-600 text-xs mt-0.5">
                        {settings.MAX_FILE_SIZE_MB >= 1024
                          ? `${(settings.MAX_FILE_SIZE_MB / 1024).toFixed(0)} GB`
                          : `${settings.MAX_FILE_SIZE_MB} MB`}
                        {settingsDefaults ? ` (default: ${(settingsDefaults.MAX_FILE_SIZE_MB / 1024).toFixed(0)} GB)` : ''}
                      </div>
                    </div>
                    <input
                      type="number"
                      min="1"
                      value={settings.MAX_FILE_SIZE_MB}
                      onChange={(e) => updateSetting('MAX_FILE_SIZE_MB', e.target.value)}
                      disabled={!kvConfigured}
                      className="w-24 bg-black border border-gray-800 text-white px-3 py-2 text-sm text-right focus:outline-none focus:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>

                  <div className="border-t border-gray-800" />

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-white text-sm">Link expiry (days)</div>
                      <div className="text-gray-600 text-xs mt-0.5">
                        Free-tier file retention{settingsDefaults ? ` (default: ${settingsDefaults.LINK_EXPIRY_DAYS})` : ''}
                      </div>
                    </div>
                    <input
                      type="number"
                      min="1"
                      value={settings.LINK_EXPIRY_DAYS}
                      onChange={(e) => updateSetting('LINK_EXPIRY_DAYS', e.target.value)}
                      disabled={!kvConfigured}
                      className="w-24 bg-black border border-gray-800 text-white px-3 py-2 text-sm text-right focus:outline-none focus:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>
              </div>

              {kvConfigured && (
                <button
                  onClick={saveSettings}
                  disabled={settingsSaving}
                  className="w-full flex items-center justify-center gap-2 bg-white hover:bg-gray-200 disabled:bg-gray-700 disabled:text-gray-500 text-black py-2 text-sm font-medium"
                >
                  {settingsSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save settings
                    </>
                  )}
                </button>
              )}
            </div>
          ) : null}
        </div>

        {/* Upload Section */}
        <div className="mt-16">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-medium text-white mb-1">Upload</h2>
              <p className="text-gray-500 text-sm">No rate limits for admin</p>
            </div>
            <button
              onClick={resetUploadLimit}
              className="flex items-center gap-2 bg-gray-950 hover:bg-gray-900 border border-gray-800 text-gray-400 hover:text-white px-4 py-2 text-sm"
              title="Clear the anonymous upload limit cookie"
            >
              <RotateCcw className="w-3 h-3" />
              Reset limit cookie
            </button>
          </div>

          {uploadError && (
            <div className="bg-red-950/30 border border-red-900/50 text-red-400 text-sm p-4 mb-6">
              {uploadError}
            </div>
          )}

          {uploadResult ? (
            <div className="space-y-4">
              <div className="bg-gray-950 border border-gray-800 p-5">
                <div className="text-center mb-4">
                  <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-2" />
                  <p className="text-white font-medium">Upload complete</p>
                  <p className="text-gray-500 text-sm">{uploadResult.filename} ({formatBytes(uploadResult.size)})</p>
                </div>

                <div className="bg-black border border-gray-800 p-3 mb-4">
                  <div className="text-gray-500 text-xs mb-1">Permanent URL</div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={uploadResult.url}
                      readOnly
                      className="flex-1 bg-transparent text-white text-sm truncate outline-none"
                    />
                    <button
                      onClick={copyUploadUrl}
                      className="flex items-center gap-1 border border-gray-700 hover:border-gray-600 text-gray-400 hover:text-white px-3 py-1.5 text-xs"
                    >
                      <Copy className="w-3 h-3" />
                      {uploadCopied ? 'Copied' : 'Copy'}
                    </button>
                    <a
                      href={uploadResult.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 bg-white hover:bg-gray-200 text-black px-3 py-1.5 text-xs font-medium"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Open
                    </a>
                  </div>
                </div>

                <button
                  onClick={resetAdminUpload}
                  className="w-full border border-gray-700 hover:border-gray-600 text-gray-400 hover:text-white py-2 text-sm"
                >
                  Upload another
                </button>
              </div>
            </div>
          ) : uploadUploading ? (
            <div className="bg-gray-950 border border-gray-800 p-8 text-center">
              <Loader2 className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-3" />
              <p className="text-white text-sm mb-3">Uploading...</p>
              <div className="w-full bg-gray-800 h-1 mb-2">
                <div
                  className="bg-white h-1 transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-gray-500 text-xs">{uploadProgress}%</p>
            </div>
          ) : (
            <div className="bg-gray-950 border border-dashed border-gray-700 hover:border-gray-600 transition-colors">
              <label className="block p-10 cursor-pointer text-center">
                <input
                  type="file"
                  onChange={handleAdminFileSelect}
                  className="hidden"
                />
                <Upload className="w-8 h-8 text-gray-500 mx-auto mb-3" />
                <p className="text-white text-sm mb-1">Click to select file</p>
                <p className="text-gray-600 text-xs">No size or rate limits</p>
              </label>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
