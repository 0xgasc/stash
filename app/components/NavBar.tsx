'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuth } from './AuthProvider'
import AuthModal from './AuthModal'

export default function NavBar() {
  const { user, isConfigured } = useAuth()
  const [showAuthModal, setShowAuthModal] = useState(false)

  return (
    <header className="container mx-auto px-4 py-6 relative z-20">
      <nav className="flex justify-between items-center">
        {/* Logo — Hermes caduceus-inspired */}
        <Link href="/" className="group flex items-center gap-3">
          <span className="text-2xl select-none animate-gold-pulse" aria-hidden="true">
            ⚚
          </span>
          <span className="text-xl font-serif italic font-medium text-accent-gold text-gold tracking-wide">
            Stash
          </span>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-8 text-sm tracking-wider uppercase">
          <Link
            href="/pricing"
            className="text-foreground/40 hover:text-accent-gold transition-colors duration-300"
          >
            Pricing
          </Link>

          {user ? (
            <Link
              href="/dashboard"
              className="text-foreground/40 hover:text-accent-gold transition-colors duration-300"
            >
              Dashboard
            </Link>
          ) : isConfigured ? (
            <button
              onClick={() => setShowAuthModal(true)}
              className="text-foreground/40 hover:text-accent-gold transition-colors duration-300"
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