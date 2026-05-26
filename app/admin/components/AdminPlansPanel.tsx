'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, RefreshCw, Plus, AlertTriangle, CheckCircle, Save, X } from 'lucide-react'

interface Plan {
  id: number
  slug: string
  name: string
  tagline: string | null
  description: string | null
  billing_period: 'free' | 'monthly' | 'yearly' | 'one_time'
  price_cents: number
  currency: string
  monthly_upload_limit: number | null
  total_upload_limit: number | null
  features_json: string
  stripe_price_id: string | null
  recurrente_url: string | null
  stablepay_url: string | null
  sort_order: number
  is_active: number
  is_default: number
}

const BLANK = {
  slug: '', name: '', tagline: '',
  billing_period: 'monthly' as const,
  price_cents: 0,
  currency: 'USD',
  monthly_upload_limit: '' as number | '',
  stripe_price_id: '',
  recurrente_url: '',
  stablepay_url: '',
}

export default function AdminPlansPanel({ authenticated }: { authenticated: boolean }) {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editPatch, setEditPatch] = useState<Partial<Plan>>({})

  const fetchPlans = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/plans')
      const d = await res.json()
      setPlans(d.plans || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (authenticated) fetchPlans() }, [authenticated, fetchPlans])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setCreating(true)
    try {
      const res = await fetch('/api/admin/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          price_cents: parseInt(String(form.price_cents)) || 0,
          monthly_upload_limit: form.monthly_upload_limit === '' ? null : parseInt(String(form.monthly_upload_limit)),
        }),
      })
      const data = await res.json()
      if (!res.ok || data.ok === false) {
        setError(data.error || data.reason || 'Failed')
        return
      }
      setShowCreate(false)
      setForm(BLANK)
      fetchPlans()
    } finally {
      setCreating(false)
    }
  }

  const save = async (id: number) => {
    await fetch(`/api/admin/plans/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editPatch),
    })
    setEditingId(null)
    setEditPatch({})
    fetchPlans()
  }

  return (
    <div className="mt-16">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-medium text-white mb-1">Plans</h2>
          <p className="text-gray-500 text-sm">Upload-quota tiers + payment provider links</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreate(v => !v)}
            className="flex items-center gap-1.5 bg-white hover:bg-gray-200 text-black px-3 py-1.5 text-sm font-medium"
          >
            <Plus className="w-3.5 h-3.5" />
            New plan
          </button>
          <button
            onClick={fetchPlans}
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

      {showCreate && (
        <form onSubmit={create} className="bg-gray-950 border border-gray-800 p-5 mb-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-500 text-xs mb-1">Slug</label>
              <input
                type="text" required value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })}
                placeholder="vault"
                className="w-full bg-black border border-gray-800 text-white px-2 py-1.5 text-sm focus:outline-none focus:border-gray-600 font-mono"
              />
            </div>
            <div>
              <label className="block text-gray-500 text-xs mb-1">Name</label>
              <input
                type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Vault" className="w-full bg-black border border-gray-800 text-white px-2 py-1.5 text-sm focus:outline-none focus:border-gray-600"
              />
            </div>
            <div>
              <label className="block text-gray-500 text-xs mb-1">Billing</label>
              <select value={form.billing_period} onChange={(e) => setForm({ ...form, billing_period: e.target.value as typeof form.billing_period })}
                className="w-full bg-black border border-gray-800 text-white px-2 py-1.5 text-sm focus:outline-none focus:border-gray-600"
              >
                <option value="free">Free</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
                <option value="one_time">One-time</option>
              </select>
            </div>
            <div>
              <label className="block text-gray-500 text-xs mb-1">Price (cents)</label>
              <input type="number" min="0" value={form.price_cents}
                onChange={(e) => setForm({ ...form, price_cents: parseInt(e.target.value) || 0 })}
                className="w-full bg-black border border-gray-800 text-white px-2 py-1.5 text-sm focus:outline-none focus:border-gray-600 font-mono"
              />
            </div>
            <div>
              <label className="block text-gray-500 text-xs mb-1">Monthly upload limit (blank = unlimited)</label>
              <input type="number" min="0" value={form.monthly_upload_limit}
                onChange={(e) => setForm({ ...form, monthly_upload_limit: e.target.value === '' ? '' : parseInt(e.target.value) })}
                className="w-full bg-black border border-gray-800 text-white px-2 py-1.5 text-sm focus:outline-none focus:border-gray-600 font-mono"
              />
            </div>
            <div>
              <label className="block text-gray-500 text-xs mb-1">Tagline</label>
              <input type="text" value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })}
                className="w-full bg-black border border-gray-800 text-white px-2 py-1.5 text-sm focus:outline-none focus:border-gray-600"
              />
            </div>
            <div className="sm:col-span-2 grid sm:grid-cols-3 gap-3">
              <input type="text" value={form.stripe_price_id} onChange={(e) => setForm({ ...form, stripe_price_id: e.target.value })}
                placeholder="Stripe price_xxx" className="bg-black border border-gray-800 text-white px-2 py-1.5 text-xs focus:outline-none focus:border-gray-600 font-mono" />
              <input type="url" value={form.recurrente_url} onChange={(e) => setForm({ ...form, recurrente_url: e.target.value })}
                placeholder="Recurrente checkout URL" className="bg-black border border-gray-800 text-white px-2 py-1.5 text-xs focus:outline-none focus:border-gray-600 font-mono" />
              <input type="url" value={form.stablepay_url} onChange={(e) => setForm({ ...form, stablepay_url: e.target.value })}
                placeholder="StablePay checkout URL" className="bg-black border border-gray-800 text-white px-2 py-1.5 text-xs focus:outline-none focus:border-gray-600 font-mono" />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 mt-4">
            <button type="button" onClick={() => setShowCreate(false)} className="text-gray-500 hover:text-white text-sm px-3 py-1.5">Cancel</button>
            <button type="submit" disabled={creating || !form.slug || !form.name}
              className="flex items-center gap-1.5 bg-white hover:bg-gray-200 disabled:bg-gray-700 disabled:text-gray-500 text-black px-4 py-1.5 text-sm font-medium"
            >
              {creating && <Loader2 className="w-3 h-3 animate-spin" />}
              Create plan
            </button>
          </div>
        </form>
      )}

      <div className="grid lg:grid-cols-2 gap-3">
        {plans.map((p) => {
          const editing = editingId === p.id
          const cur = { ...p, ...editPatch }
          return (
            <div key={p.id} className="bg-gray-950 border border-gray-800 p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-medium">{p.name}</span>
                    <span className="text-gray-600 text-xs font-mono">/{p.slug}</span>
                    {p.is_default ? <span className="text-[10px] text-cyan-400 bg-cyan-900/20 px-1.5 py-0.5">DEFAULT</span> : null}
                    {!p.is_active ? <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5">INACTIVE</span> : null}
                  </div>
                  {p.tagline && <p className="text-gray-500 text-xs mt-1">{p.tagline}</p>}
                </div>
                <button
                  onClick={() => { setEditingId(editing ? null : p.id); setEditPatch({}) }}
                  className="text-gray-500 hover:text-white text-xs px-2 py-1"
                >{editing ? <X className="w-3.5 h-3.5" /> : 'Edit'}</button>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="text-gray-600">Price</div>
                  {editing ? (
                    <input
                      type="number" min="0" value={cur.price_cents}
                      onChange={(e) => setEditPatch({ ...editPatch, price_cents: parseInt(e.target.value) || 0 })}
                      className="w-full bg-black border border-gray-800 text-white px-1.5 py-1 text-xs focus:outline-none font-mono"
                    />
                  ) : <div className="text-white">${(p.price_cents / 100).toFixed(2)} {p.currency} · {p.billing_period}</div>}
                </div>
                <div>
                  <div className="text-gray-600">Monthly limit</div>
                  {editing ? (
                    <input
                      type="number" min="0" value={cur.monthly_upload_limit ?? ''}
                      onChange={(e) => setEditPatch({ ...editPatch, monthly_upload_limit: e.target.value === '' ? null : parseInt(e.target.value) })}
                      className="w-full bg-black border border-gray-800 text-white px-1.5 py-1 text-xs focus:outline-none font-mono"
                      placeholder="unlimited"
                    />
                  ) : <div className="text-white">{p.monthly_upload_limit ?? 'unlimited'}</div>}
                </div>
                <div>
                  <div className="text-gray-600">Active</div>
                  {editing ? (
                    <label className="inline-flex items-center gap-1 mt-1">
                      <input type="checkbox" checked={cur.is_active ? true : false}
                        onChange={(e) => setEditPatch({ ...editPatch, is_active: e.target.checked ? 1 : 0 })}
                        className="accent-white" />
                      <span className="text-gray-400">enabled</span>
                    </label>
                  ) : <div className="text-white">{p.is_active ? 'yes' : 'no'}</div>}
                </div>
              </div>

              {editing && (
                <div className="space-y-1.5 mt-3">
                  <input
                    type="text" placeholder="Stripe price_xxx"
                    value={cur.stripe_price_id ?? ''}
                    onChange={(e) => setEditPatch({ ...editPatch, stripe_price_id: e.target.value })}
                    className="w-full bg-black border border-gray-800 text-white px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-gray-600"
                  />
                  <input
                    type="url" placeholder="Recurrente checkout URL"
                    value={cur.recurrente_url ?? ''}
                    onChange={(e) => setEditPatch({ ...editPatch, recurrente_url: e.target.value })}
                    className="w-full bg-black border border-gray-800 text-white px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-gray-600"
                  />
                  <input
                    type="url" placeholder="StablePay checkout URL"
                    value={cur.stablepay_url ?? ''}
                    onChange={(e) => setEditPatch({ ...editPatch, stablepay_url: e.target.value })}
                    className="w-full bg-black border border-gray-800 text-white px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-gray-600"
                  />
                  <button
                    onClick={() => save(p.id)}
                    className="w-full mt-2 flex items-center justify-center gap-1.5 bg-white hover:bg-gray-200 text-black px-3 py-1.5 text-xs font-medium"
                  >
                    <Save className="w-3 h-3" /> Save changes
                  </button>
                </div>
              )}

              {!editing && (p.stripe_price_id || p.recurrente_url || p.stablepay_url) && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-gray-600">
                  {p.stripe_price_id && <span>stripe ✓</span>}
                  {p.recurrente_url && <span>recurrente ✓</span>}
                  {p.stablepay_url && <span>stablepay ✓</span>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
