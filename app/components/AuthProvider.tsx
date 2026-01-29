'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { createClient, isSupabaseConfigured } from '@/app/lib/supabase'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  isConfigured: boolean
  signInWithGoogle: (claimToken?: string) => Promise<void>
  signInWithGithub: (claimToken?: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    // If Supabase is not configured, skip auth setup
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false)
      return
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const signInWithGoogle = async (claimToken?: string) => {
    if (!supabase) {
      console.warn('Supabase not configured - auth disabled')
      return
    }
    const redirectTo = claimToken
      ? `${window.location.origin}/auth/callback?claim_token=${claimToken}`
      : `${window.location.origin}/auth/callback`

    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo }
    })
  }

  const signInWithGithub = async (claimToken?: string) => {
    if (!supabase) {
      console.warn('Supabase not configured - auth disabled')
      return
    }
    const redirectTo = claimToken
      ? `${window.location.origin}/auth/callback?claim_token=${claimToken}`
      : `${window.location.origin}/auth/callback`

    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo }
    })
  }

  const signOut = async () => {
    if (!supabase) return
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{
      user, session, loading,
      isConfigured: isSupabaseConfigured,
      signInWithGoogle, signInWithGithub, signOut
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
