/**
 * AuthProvider — exposes the current Stash session to client components.
 *
 * Backed by our own magic-link auth (Resend + HMAC cookie). Fetches
 * /api/auth/me on mount, exposes signOut and a magic-link sender.
 *
 * Keeps the same shape as the previous Supabase-based version so
 * existing callers (NavBar, HomeUploadHero, dashboard, etc.) continue
 * to work. `isConfigured` is always true now.
 */
'use client'

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'

interface SessionUser {
  id: string
  email: string | null
  handle: string | null
  display_name: string | null
}

interface AuthContextType {
  user: SessionUser | null
  loading: boolean
  isConfigured: boolean
  signOut: () => Promise<void>
  sendMagicLink: (email: string, claimToken?: string) => Promise<{ ok: boolean; error?: string }>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' })
      if (res.ok) {
        const d = await res.json()
        setUser(d.user)
      } else {
        setUser(null)
      }
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const signOut = async () => {
    await fetch('/api/auth/signout', { method: 'POST' })
    setUser(null)
  }

  const sendMagicLink = async (email: string, claimToken?: string) => {
    try {
      const res = await fetch('/api/auth/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, claim_token: claimToken || null }),
      })
      if (res.ok) return { ok: true }
      const d = await res.json().catch(() => ({}))
      return { ok: false, error: d.error || `HTTP ${res.status}` }
    } catch {
      return { ok: false, error: 'Connection error' }
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, isConfigured: true, signOut, sendMagicLink, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
