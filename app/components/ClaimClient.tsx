'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Mail, Loader2, AlertTriangle, CheckCircle } from 'lucide-react'
import { createClient } from '@/app/lib/supabase'

export default function ClaimClient({
  token, hasSession, emailMismatch, email,
}: {
  token: string
  hasSession: boolean
  emailMismatch: boolean
  email: string
}) {
  const router = useRouter()
  const supabase = createClient()
  const [claiming, setClaiming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [sendingMagic, setSendingMagic] = useState(false)
  const [magicSent, setMagicSent] = useState(false)

  // Signed in + matching email: do the claim immediately
  const handleClaim = async () => {
    setClaiming(true)
    setError(null)
    try {
      const res = await fetch('/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json()
      if (!res.ok || data.ok === false) {
        setError(data.error || data.reason || 'Could not claim account')
        return
      }
      setSuccess(true)
      setTimeout(() => router.push(data.user?.handle ? '/me' : '/me/setup'), 600)
    } finally {
      setClaiming(false)
    }
  }

  // Not signed in: send magic link with the claim token preserved
  const sendMagicLink = async () => {
    if (!supabase) { setError('Auth not configured'); return }
    setSendingMagic(true); setError(null)
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?account_claim_token=${encodeURIComponent(token)}`,
        },
      })
      if (error) setError(error.message)
      else setMagicSent(true)
    } finally {
      setSendingMagic(false)
    }
  }

  const signInWithGoogle = async () => {
    if (!supabase) { setError('Auth not configured'); return }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?account_claim_token=${encodeURIComponent(token)}`,
      },
    })
    if (error) setError(error.message)
  }

  if (success) {
    return (
      <div className="bg-green-950/30 border border-green-900/50 p-4 text-green-300 text-sm flex items-center gap-2">
        <CheckCircle className="w-4 h-4" /> Account claimed. Taking you to /me…
      </div>
    )
  }

  if (magicSent) {
    return (
      <div className="bg-gray-950 border border-gray-800 p-5 text-center">
        <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-3" />
        <p className="text-white mb-1">Magic link sent</p>
        <p className="text-gray-500 text-sm">Check <span className="text-gray-300">{email}</span> — click the link to finish claiming.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="bg-red-950/30 border border-red-900/50 text-red-300 text-xs p-2.5 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {hasSession && !emailMismatch ? (
        <button
          onClick={handleClaim}
          disabled={claiming}
          className="w-full bg-white hover:bg-gray-200 disabled:bg-gray-700 disabled:text-gray-500 text-black py-2.5 text-sm font-medium flex items-center justify-center gap-2"
        >
          {claiming && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {claiming ? 'Claiming…' : 'Claim this account'}
        </button>
      ) : emailMismatch ? (
        <Link href="/auth" className="block w-full text-center bg-gray-800 hover:bg-gray-700 text-white py-2.5 text-sm font-medium">
          Sign in with {email}
        </Link>
      ) : (
        <>
          <button
            onClick={sendMagicLink}
            disabled={sendingMagic}
            className="w-full bg-white hover:bg-gray-200 disabled:bg-gray-700 disabled:text-gray-500 text-black py-2.5 text-sm font-medium flex items-center justify-center gap-2"
          >
            {sendingMagic ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
            {sendingMagic ? 'Sending link…' : `Send magic link to ${email}`}
          </button>
          <button
            onClick={signInWithGoogle}
            className="w-full bg-gray-950 border border-gray-800 hover:border-gray-700 text-white py-2.5 text-sm font-medium"
          >
            Continue with Google
          </button>
          <p className="text-xs text-gray-600 text-center">After signing in, your account will be linked automatically.</p>
        </>
      )}
    </div>
  )
}
