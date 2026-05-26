'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Loader2, RefreshCw, UserPlus, Copy, Mail, AlertTriangle, CheckCircle, Send, MailPlus, RotateCw } from 'lucide-react'

interface AdminUserRow {
  id: string
  handle: string | null
  email: string | null
  display_name: string | null
  supabase_user_id: string | null
  claimed_at: string | null
  has_pending_claim: number
  claim_token_expires_at: string | null
  created_by_admin: number
  active_plan_name: string | null
  upload_count: number
  created_at: string
}

interface Plan { id: number; slug: string; name: string; billing_period: string; price_cents: number; monthly_upload_limit: number | null }

export default function AdminUsersPanel({ authenticated }: { authenticated: boolean }) {
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [created, setCreated] = useState<{ user: { email: string }; claim_url: string; email_status: string; active_plan?: { plan_name?: string } | null } | null>(null)
  const [copiedUrl, setCopiedUrl] = useState(false)

  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [planId, setPlanId] = useState<number | ''>('')
  const [sendEmail, setSendEmail] = useState(true)
  const [creating, setCreating] = useState(false)

  const [assigningUser, setAssigningUser] = useState<string | null>(null)
  const [assignPlanId, setAssignPlanId] = useState<number | ''>('')
  const [assignProvider, setAssignProvider] = useState('manual')
  const [assignPaid, setAssignPaid] = useState(true)

  // Assign-email state (for placeholder accounts)
  const [assigningEmailUser, setAssigningEmailUser] = useState<string | null>(null)
  const [assignEmail, setAssignEmail] = useState('')
  const [assignSendEmail, setAssignSendEmail] = useState(true)
  const [assignEmailBusy, setAssignEmailBusy] = useState(false)
  const [emailAssignResult, setEmailAssignResult] = useState<{ user_id: string; claim_url: string; email_status: string } | null>(null)
  const [emailCopied, setEmailCopied] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [u, p] = await Promise.all([
        fetch('/api/admin/users').then(r => r.ok ? r.json() : { users: [] }),
        fetch('/api/admin/plans').then(r => r.ok ? r.json() : { plans: [] }),
      ])
      setUsers(u.users || [])
      setPlans(p.plans || [])
    } catch {
      setError('Connection error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (authenticated) fetchAll() }, [authenticated, fetchAll])

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setCreating(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim() || null,
          display_name: displayName.trim() || null,
          plan_id: planId || null,
          send_email: sendEmail,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.reason) {
        setError(data.reason === 'email_already_active'
          ? 'A user with that email already exists'
          : data.error || data.reason || 'Failed')
        return
      }
      setCreated({ user: data.user, claim_url: data.claim_url, email_status: data.email_status, active_plan: data.active_plan })
      setEmail(''); setDisplayName(''); setPlanId(''); setSendEmail(true)
      fetchAll()
    } finally {
      setCreating(false)
    }
  }

  const submitAssignEmail = async (userId: string, e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setAssignEmailBusy(true)
    try {
      const res = await fetch(`/api/admin/users/${userId}/assign-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: assignEmail.trim(), send_email: assignSendEmail }),
      })
      const data = await res.json()
      if (!res.ok || data.reason) {
        setError(data.reason === 'email_already_active'
          ? 'A user with that email already exists'
          : data.error || data.reason || 'Failed')
        return
      }
      setEmailAssignResult({ user_id: userId, claim_url: data.claim_url, email_status: data.email_status })
      setAssigningEmailUser(null)
      setAssignEmail('')
      fetchAll()
    } finally {
      setAssignEmailBusy(false)
    }
  }

  const copyClaimUrlForRow = async (url: string, userId: string) => {
    await navigator.clipboard.writeText(url)
    setEmailCopied(true)
    setTimeout(() => setEmailCopied(false), 2000)
    setEmailAssignResult((prev) => prev && prev.user_id === userId ? prev : null)
  }

  const assignPlan = async (userId: string) => {
    if (!assignPlanId) return
    await fetch(`/api/admin/users/${userId}/assign-plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan_id: assignPlanId,
        payment_provider: assignProvider,
        payment_status: assignPaid ? 'paid' : 'unpaid',
      }),
    })
    setAssigningUser(null)
    setAssignPlanId('')
    fetchAll()
  }

  const copyClaimUrl = async () => {
    if (!created) return
    await navigator.clipboard.writeText(created.claim_url)
    setCopiedUrl(true)
    setTimeout(() => setCopiedUrl(false), 2000)
  }

  return (
    <div className="mt-16">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-medium text-white mb-1">Users</h2>
          <p className="text-gray-500 text-sm">Create accounts and assign plans</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreate(v => !v)}
            className="flex items-center gap-1.5 bg-white hover:bg-gray-200 text-black px-3 py-1.5 text-sm font-medium"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Create user
          </button>
          <button
            onClick={fetchAll}
            disabled={loading}
            className="flex items-center gap-2 bg-gray-950 hover:bg-gray-900 border border-gray-800 text-gray-400 hover:text-white px-3 py-1.5 text-sm"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-950/30 border border-red-900/50 text-red-300 text-xs p-2.5 mb-4 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {created && (
        <div className="bg-green-950/30 border border-green-900/50 p-4 mb-4">
          <div className="flex items-center gap-2 mb-2 text-green-300">
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm font-medium">User created: {created.user.email}</span>
            {created.active_plan?.plan_name && (
              <span className="text-xs text-gray-400">· {created.active_plan.plan_name}</span>
            )}
          </div>
          <p className="text-xs text-gray-400 mb-2">
            Email: <span className={created.email_status === 'sent' ? 'text-green-400' : 'text-yellow-400'}>{created.email_status}</span>
          </p>
          <div className="flex items-center gap-2 bg-black border border-gray-800 p-2">
            <input
              type="text"
              value={created.claim_url}
              readOnly
              className="flex-1 bg-transparent text-gray-300 text-xs outline-none font-mono"
            />
            <button
              onClick={copyClaimUrl}
              className="flex items-center gap-1 text-gray-400 hover:text-white text-xs px-2 py-1"
            >
              <Copy className="w-3 h-3" />
              {copiedUrl ? 'Copied' : 'Copy'}
            </button>
          </div>
          <button
            onClick={() => setCreated(null)}
            className="text-gray-500 hover:text-white text-xs mt-2"
          >Dismiss</button>
        </div>
      )}

      {showCreate && (
        <form onSubmit={createUser} className="bg-gray-950 border border-gray-800 p-5 mb-4">
          <h3 className="text-white text-sm mb-1">New user</h3>
          <p className="text-gray-600 text-xs mb-3">Leave email blank to create a placeholder account — you can assign it to someone later.</p>
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com (optional)"
              className="bg-black border border-gray-800 text-white px-3 py-2 text-sm focus:outline-none focus:border-gray-600"
            />
            <input
              type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Display name (optional)"
              className="bg-black border border-gray-800 text-white px-3 py-2 text-sm focus:outline-none focus:border-gray-600"
            />
            <select
              value={planId} onChange={(e) => setPlanId(e.target.value ? Number(e.target.value) : '')}
              className="bg-black border border-gray-800 text-white px-3 py-2 text-sm focus:outline-none focus:border-gray-600"
            >
              <option value="">No plan (defaults to Free)</option>
              {plans.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} — ${(p.price_cents / 100).toFixed(2)}/{p.billing_period === 'one_time' ? 'once' : p.billing_period}
                  {p.monthly_upload_limit ? ` · ${p.monthly_upload_limit}/mo` : ' · unlim'}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
              <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} className="accent-white" />
              <Send className="w-3.5 h-3.5" />
              Email claim link via Resend
            </label>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => setShowCreate(false)} className="text-gray-500 hover:text-white text-sm px-3 py-1.5">Cancel</button>
            <button
              type="submit" disabled={creating}
              className="flex items-center gap-1.5 bg-white hover:bg-gray-200 disabled:bg-gray-700 disabled:text-gray-500 text-black px-4 py-1.5 text-sm font-medium"
            >
              {creating && <Loader2 className="w-3 h-3 animate-spin" />}
              {email ? 'Create + email claim link' : 'Create placeholder account'}
            </button>
          </div>
        </form>
      )}

      {/* User list */}
      <div className="bg-gray-950 border border-gray-800 divide-y divide-gray-800/50">
        {users.length === 0 && !loading && (
          <div className="p-8 text-center text-gray-500 text-sm">No users yet</div>
        )}
        {users.map((u) => (
          <div key={u.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap text-sm">
                  {u.handle ? (
                    <Link href={`/u/${u.handle}`} target="_blank" className="text-white font-mono hover:underline">@{u.handle}</Link>
                  ) : (
                    <span className="text-gray-600">(no handle yet)</span>
                  )}
                  <span className="text-gray-500">·</span>
                  {u.email ? (
                    <span className="text-gray-400 text-xs">{u.email}</span>
                  ) : (
                    <span className="text-gray-600 text-xs italic">(unassigned)</span>
                  )}
                  {u.display_name && <span className="text-gray-600 text-xs">— {u.display_name}</span>}
                  {!u.claimed_at && !u.email ? (
                    <span className="text-purple-400 text-[10px] bg-purple-900/30 border border-purple-900/50 px-1.5 py-0.5">PLACEHOLDER</span>
                  ) : !u.claimed_at && u.has_pending_claim ? (
                    <span className="text-yellow-400 text-[10px] bg-yellow-900/30 border border-yellow-900/50 px-1.5 py-0.5">CLAIM PENDING</span>
                  ) : u.claimed_at ? (
                    <span className="text-green-400 text-[10px] bg-green-900/20 border border-green-900/50 px-1.5 py-0.5">CLAIMED</span>
                  ) : null}
                  {u.created_by_admin ? (
                    <span className="text-[10px] text-blue-400 bg-blue-900/20 border border-blue-900/50 px-1.5 py-0.5">ADMIN-CREATED</span>
                  ) : null}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-600">
                  <span>{u.active_plan_name || 'No plan'}</span>
                  <span>· {u.upload_count} uploads</span>
                  <span>· joined {new Date(u.created_at + 'Z').toLocaleDateString()}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {!u.claimed_at && (
                  <button
                    onClick={() => {
                      setAssigningEmailUser(assigningEmailUser === u.id ? null : u.id)
                      setAssignEmail(u.email || '')
                      setAssignSendEmail(true)
                    }}
                    className="flex items-center gap-1 text-gray-500 hover:text-white text-xs px-2 py-1"
                  >
                    {assigningEmailUser === u.id
                      ? 'Cancel'
                      : <><MailPlus className="w-3 h-3" />{u.email ? 'Resend link' : 'Assign user'}</>}
                  </button>
                )}
                <button
                  onClick={() => { setAssigningUser(assigningUser === u.id ? null : u.id); setAssignPlanId('') }}
                  className="text-gray-500 hover:text-white text-xs px-2 py-1"
                >
                  {assigningUser === u.id ? 'Cancel' : 'Assign plan'}
                </button>
              </div>
            </div>

            {assigningEmailUser === u.id && (
              <form onSubmit={(e) => submitAssignEmail(u.id, e)} className="mt-3 pt-3 border-t border-gray-800/50 space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <input
                    type="email" required value={assignEmail}
                    onChange={(e) => setAssignEmail(e.target.value)}
                    placeholder={u.email ? 'replace email or keep same' : 'recipient@example.com'}
                    autoFocus
                    className="flex-1 bg-black border border-gray-800 text-white px-2 py-1.5 focus:outline-none focus:border-gray-600"
                  />
                  <label className="flex items-center gap-1 text-gray-400 cursor-pointer">
                    <input type="checkbox" checked={assignSendEmail} onChange={(e) => setAssignSendEmail(e.target.checked)} className="accent-white" />
                    <Send className="w-3 h-3" />
                    Email
                  </label>
                  <button
                    type="submit"
                    disabled={assignEmailBusy || !assignEmail}
                    className="flex items-center gap-1 bg-white hover:bg-gray-200 disabled:bg-gray-700 disabled:text-gray-500 text-black px-3 py-1.5 font-medium"
                  >
                    {assignEmailBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <MailPlus className="w-3 h-3" />}
                    {u.email ? 'Regenerate' : 'Assign'}
                  </button>
                </div>
                <p className="text-gray-600">
                  Generates a fresh 7-day claim link. If &quot;Email&quot; is checked, sends it to that address via Resend.
                </p>
              </form>
            )}

            {emailAssignResult && emailAssignResult.user_id === u.id && (
              <div className="mt-3 pt-3 border-t border-gray-800/50 bg-green-950/20 p-2 text-xs">
                <div className="flex items-center gap-2 text-green-300 mb-1">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Claim link ready · email: <span className={emailAssignResult.email_status === 'sent' ? 'text-green-400' : 'text-yellow-400'}>{emailAssignResult.email_status}</span>
                </div>
                <div className="flex items-center gap-2 bg-black border border-gray-800 p-1.5">
                  <code className="text-gray-400 text-[11px] flex-1 truncate font-mono">{emailAssignResult.claim_url}</code>
                  <button
                    onClick={() => copyClaimUrlForRow(emailAssignResult.claim_url, u.id)}
                    className="text-gray-400 hover:text-white text-[10px] px-2"
                  >
                    <Copy className="w-3 h-3 inline" /> {emailCopied ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    onClick={() => setEmailAssignResult(null)}
                    className="text-gray-600 hover:text-white text-[10px] px-1"
                  >×</button>
                </div>
              </div>
            )}
            {assigningUser === u.id && (
              <div className="mt-3 pt-3 border-t border-gray-800/50 flex flex-wrap items-center gap-2 text-xs">
                <select
                  value={assignPlanId} onChange={(e) => setAssignPlanId(e.target.value ? Number(e.target.value) : '')}
                  className="bg-black border border-gray-800 text-white px-2 py-1.5 focus:outline-none focus:border-gray-600"
                >
                  <option value="">Pick a plan</option>
                  {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select
                  value={assignProvider} onChange={(e) => setAssignProvider(e.target.value)}
                  className="bg-black border border-gray-800 text-white px-2 py-1.5 focus:outline-none focus:border-gray-600"
                >
                  <option value="manual">manual</option>
                  <option value="stripe">stripe</option>
                  <option value="recurrente">recurrente</option>
                  <option value="stablepay">stablepay</option>
                  <option value="admin_grant">admin grant</option>
                </select>
                <label className="flex items-center gap-1 text-gray-400 cursor-pointer">
                  <input type="checkbox" checked={assignPaid} onChange={(e) => setAssignPaid(e.target.checked)} className="accent-white" />
                  Mark paid
                </label>
                <button
                  onClick={() => assignPlan(u.id)}
                  disabled={!assignPlanId}
                  className="bg-white hover:bg-gray-200 disabled:bg-gray-700 disabled:text-gray-500 text-black px-3 py-1.5 font-medium"
                >Assign</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
