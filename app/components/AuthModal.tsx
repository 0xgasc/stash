/**
 * AuthModal — magic-link sign-in modal (post-upload claim or NavBar login).
 *
 * Sends an email via Resend through /api/auth/request. If a claimToken
 * is provided, the verify endpoint will associate the anonymous upload
 * with the new account on the first sign-in.
 */
'use client'

import { useState } from 'react'
import { Loader2, Mail, CheckCircle, AlertTriangle } from 'lucide-react'
import { useAuth } from './AuthProvider'

interface AuthModalProps {
  open: boolean
  onClose: () => void
  claimToken?: string
  filename?: string
}

export default function AuthModal({ open, onClose, claimToken, filename }: AuthModalProps) {
  const { sendMagicLink } = useAuth()
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSending(true)
    const res = await sendMagicLink(email.trim(), claimToken)
    setSending(false)
    if (res.ok) setSent(true)
    else setError(res.error || 'Could not send link')
  }

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
      <div className="bg-gray-950 p-8 max-w-md w-full mx-4 border border-gray-800 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-white"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="text-center mb-6">
          <h2 className="text-xl font-medium text-white mb-1">
            {claimToken ? 'Save this upload to your archive' : 'Sign in to Stash'}
          </h2>
          {filename && <p className="text-gray-500 text-sm">{filename}</p>}
          {!claimToken && <p className="text-gray-500 text-sm">We&apos;ll email you a sign-in link.</p>}
        </div>

        {sent ? (
          <div className="text-center">
            <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-3" />
            <p className="text-white mb-1">Sign-in link sent</p>
            <p className="text-gray-500 text-sm">Check <span className="text-gray-300">{email}</span> — link expires in 15 minutes.</p>
            <button onClick={onClose} className="text-gray-500 hover:text-white text-xs mt-6">Close</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <input
              type="email" required value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoFocus
              className="w-full bg-black border border-gray-800 text-white px-3 py-2.5 text-sm focus:outline-none focus:border-gray-600"
            />
            {error && (
              <div className="bg-red-950/30 border border-red-900/50 text-red-300 text-xs p-2.5 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={sending || !email}
              className="w-full bg-white hover:bg-gray-200 disabled:bg-gray-700 disabled:text-gray-500 text-black font-medium py-2.5 flex items-center justify-center gap-2"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              {sending ? 'Sending...' : 'Send sign-in link'}
            </button>
          </form>
        )}

        <p className="text-gray-600 text-xs text-center mt-6">
          By continuing, you agree to our Terms of Service
        </p>
      </div>
    </div>
  )
}
