/**
 * NavBar — Auth-aware navigation header.
 *
 * Shows "Log in" (opens AuthModal) when not authenticated and
 * Supabase is configured, "Dashboard" link when logged in,
 * or nothing if auth is not configured. Always shows the Stash
 * logo and Pricing link.
 */
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuth } from './AuthProvider'
import AuthModal from './AuthModal'

export default function NavBar() {
  const { user, isConfigured } = useAuth()
  const [showAuthModal, setShowAuthModal] = useState(false)

  return (
    <header className="container mx-auto px-4 py-6 relative z-10">
      <nav className="flex justify-between items-center">
        <Link href="/" className="text-xl font-bold text-accent-cyan text-glow tracking-widest uppercase">
          Stash
        </Link>
        <div className="flex items-center gap-6 text-sm">
          <Link href="/pricing" className="text-gray-500 hover:text-accent-cyan transition-colors">
            Pricing
          </Link>
          {user ? (
            <Link href="/dashboard" className="text-gray-500 hover:text-accent-cyan transition-colors">
              Dashboard
            </Link>
          ) : isConfigured ? (
            <button
              onClick={() => setShowAuthModal(true)}
              className="text-gray-500 hover:text-accent-cyan transition-colors"
            >
              Log in
            </button>
          ) : null}
        </div>
      </nav>

      <AuthModal
        open={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />
    </header>
  )
}
