/**
 * /auth — primary sign-in page.
 *
 * Email field sends a magic link via Supabase OTP; "Continue with
 * Google" routes through Supabase OAuth. Both land on /auth/callback
 * which bootstraps the SQLite user row and redirects to /me or
 * /me/setup based on handle status.
 */
'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, Mail, CheckCircle, AlertTriangle } from 'lucide-react'
import { createClient } from '@/app/lib/supabase'

function AuthInner() {
  const params = useSearchParams()
  const queryError = params.get('error')
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [oauthLoading, setOauthLoading] = useState(false)
  const [error, setError] = useState<string | null>(queryError ? `Sign-in failed: ${queryError}` : null)

  useEffect(() => {
    if (queryError) {
      // Clean URL
      window.history.replaceState({}, '', '/auth')
    }
  }, [queryError])

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase) { setError('Auth is not configured'); return }
    setError(null)
    setSending(true)
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) setError(error.message)
      else setSent(true)
    } finally {
      setSending(false)
    }
  }

  const handleGoogle = async () => {
    if (!supabase) { setError('Auth is not configured'); return }
    setError(null)
    setOauthLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) {
      setError(error.message)
      setOauthLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-4" />
          <h1 className="text-xl font-medium text-white mb-2">Check your email</h1>
          <p className="text-gray-500 text-sm">
            We sent a sign-in link to <span className="text-gray-300">{email}</span>.
            The link expires in 15 minutes.
          </p>
          <button
            onClick={() => { setSent(false); setEmail('') }}
            className="text-gray-600 hover:text-white text-xs mt-6"
          >
            Use a different email
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-medium text-white">Stash</h1>
          <p className="text-gray-500 text-sm mt-1">Sign in or create an account</p>
        </div>

        <form onSubmit={handleMagicLink} className="bg-gray-950 border border-gray-800 p-6 mb-3">
          <label className="block text-gray-500 text-xs mb-2">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full bg-black border border-gray-800 text-white px-3 py-2 text-sm focus:outline-none focus:border-gray-600 mb-4"
            autoFocus
          />
          {error && (
            <div className="bg-red-950/30 border border-red-900/50 text-red-300 text-xs p-2.5 mb-4 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={sending || !email}
            className="w-full bg-white hover:bg-gray-200 disabled:bg-gray-700 disabled:text-gray-500 text-black py-2 text-sm font-medium flex items-center justify-center gap-2"
          >
            {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
            {sending ? 'Sending link...' : 'Send magic link'}
          </button>
        </form>

        <div className="text-center text-gray-700 text-xs my-3">or</div>

        <button
          onClick={handleGoogle}
          disabled={oauthLoading}
          className="w-full bg-gray-950 border border-gray-800 hover:border-gray-700 text-white py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {oauthLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (
            <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.61z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
            </svg>
          )}
          Continue with Google
        </button>

        <div className="text-center mt-6">
          <Link href="/" className="text-gray-600 hover:text-gray-400 text-xs">
            ← Back to Stash
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black" />}>
      <AuthInner />
    </Suspense>
  )
}
