'use client'

import { useState, useEffect } from 'react'
import { Loader2, Key, Plus, Trash2, Copy, AlertTriangle, RefreshCw } from 'lucide-react'

interface ApiKey {
  id: number
  name: string
  key_prefix: string
  created_at: string
  last_used_at: string | null
  is_active: number
}

export default function ApiKeyManager({ authenticated }: { authenticated: boolean }) {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // New key form
  const [newKeyName, setNewKeyName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Revoke confirmation
  const [revoking, setRevoking] = useState<number | null>(null)

  const fetchKeys = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/api-keys')
      if (res.status === 401) return
      if (!res.ok) {
        setError('Failed to fetch API keys')
        return
      }
      const data = await res.json()
      setKeys(data.api_keys || [])
    } catch {
      setError('Connection error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (authenticated) fetchKeys()
  }, [authenticated])

  const createKey = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newKeyName.trim()) return
    setCreating(true)
    setError('')
    setCreatedKey(null)

    try {
      const res = await fetch('/api/admin/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName.trim() }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to create key')
        return
      }
      const data = await res.json()
      setCreatedKey(data.api_key.key)
      setNewKeyName('')
      fetchKeys()
    } catch {
      setError('Connection error')
    } finally {
      setCreating(false)
    }
  }

  const revokeKey = async (id: number) => {
    setRevoking(id)
    try {
      const res = await fetch(`/api/admin/api-keys/${id}`, { method: 'DELETE' })
      if (res.ok) fetchKeys()
      else setError('Failed to revoke key')
    } catch {
      setError('Connection error')
    } finally {
      setRevoking(null)
    }
  }

  const copyKey = async () => {
    if (createdKey) {
      await navigator.clipboard.writeText(createdKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const formatDate = (d: string | null) => {
    if (!d) return 'Never'
    return new Date(d + 'Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div className="mt-16">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-medium text-white mb-1">API Keys</h2>
          <p className="text-gray-500 text-sm">Manage programmatic access</p>
        </div>
        <button
          onClick={fetchKeys}
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

      {/* Created key banner */}
      {createdKey && (
        <div className="bg-green-950/30 border border-green-900/50 p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-white text-sm font-medium mb-2">API key created — copy it now, it won&apos;t be shown again</p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={createdKey}
                  readOnly
                  className="flex-1 bg-black border border-gray-700 text-green-400 font-mono text-xs px-3 py-2 outline-none"
                />
                <button
                  onClick={copyKey}
                  className="flex items-center gap-1 border border-gray-700 hover:border-gray-600 text-gray-400 hover:text-white px-3 py-2 text-xs"
                >
                  <Copy className="w-3 h-3" />
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {/* Generate form */}
        <form onSubmit={createKey} className="bg-gray-950 border border-gray-800 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Plus className="w-4 h-4 text-gray-500" />
            <span className="text-gray-500 text-xs">Generate New Key</span>
          </div>
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Key name (e.g. my-bot, slack-tool)"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              className="flex-1 bg-black border border-gray-800 text-white px-3 py-2 text-sm focus:outline-none focus:border-gray-600"
            />
            <button
              type="submit"
              disabled={creating || !newKeyName.trim()}
              className="flex items-center gap-2 bg-white hover:bg-gray-200 disabled:bg-gray-700 disabled:text-gray-500 text-black px-4 py-2 text-sm font-medium"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
              Generate
            </button>
          </div>
        </form>

        {/* Key list */}
        {loading && keys.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
          </div>
        ) : keys.length === 0 ? (
          <div className="bg-gray-950 border border-gray-800 p-8 text-center">
            <Key className="w-8 h-8 text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No API keys yet</p>
          </div>
        ) : (
          <div className="bg-gray-950 border border-gray-800 divide-y divide-gray-800">
            {keys.map((k) => (
              <div key={k.id} className={`p-4 flex items-center justify-between ${!k.is_active ? 'opacity-40' : ''}`}>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-white text-sm font-medium">{k.name}</span>
                    <span className="text-gray-600 font-mono text-xs">{k.key_prefix}...</span>
                    {!k.is_active && (
                      <span className="text-red-400 text-xs border border-red-900 px-1.5 py-0.5 rounded">revoked</span>
                    )}
                  </div>
                  <div className="text-gray-600 text-xs">
                    Created {formatDate(k.created_at)} · Last used {formatDate(k.last_used_at)}
                  </div>
                </div>
                {k.is_active && (
                  <button
                    onClick={() => revokeKey(k.id)}
                    disabled={revoking === k.id}
                    className="flex items-center gap-1 text-gray-600 hover:text-red-400 text-xs p-2"
                  >
                    {revoking === k.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
