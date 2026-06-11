'use client'

import { useState, useCallback } from 'react'
import { CreditCard, Bitcoin, Globe, Loader2, ArrowLeft } from 'lucide-react'
import StablePayWidget from './StablePayWidget'

export default function CheckoutButtons({
  planSlug,
  planName,
  priceDollars,
  providers,
}: {
  planSlug: string
  planName: string
  priceDollars: string
  providers: { stripe: boolean; recurrente: boolean; stablepay: boolean }
}) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showCrypto, setShowCrypto] = useState(false)

  const checkout = async (provider: string) => {
    setLoading(provider)
    setError(null)
    try {
      const res = await fetch(`/api/checkout/${planSlug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) {
        setError(data.error || 'Checkout failed. Try again.')
        setLoading(null)
        return
      }
      window.location.href = data.url
    } catch {
      setError('Something went wrong. Try again.')
      setLoading(null)
    }
  }

  const handleCryptoSuccess = useCallback(async (detail: Record<string, unknown>) => {
    setLoading('confirming')
    try {
      const res = await fetch(`/api/checkout/${planSlug}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'stablepay', payment: detail }),
      })
      if (res.ok) {
        window.location.href = '/checkout/success'
      } else {
        setError('Payment received but activation failed. Contact support.')
        setLoading(null)
      }
    } catch {
      window.location.href = '/checkout/success'
    }
  }, [planSlug])

  if (showCrypto) {
    return (
      <div>
        <button
          onClick={() => setShowCrypto(false)}
          className="flex items-center gap-1 text-gray-500 hover:text-white text-xs mb-4 transition-colors"
        >
          <ArrowLeft className="w-3 h-3" />
          Other payment methods
        </button>
        {loading === 'confirming' ? (
          <div className="text-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-accent-cyan mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Activating your plan...</p>
          </div>
        ) : (
          <StablePayWidget
            amount={priceDollars}
            product={`${planName} — Stash`}
            onSuccess={handleCryptoSuccess}
          />
        )}
        {error && <p className="text-red-400 text-xs text-center mt-3">{error}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-gray-500 text-xs uppercase tracking-wider text-center mb-4">
        Choose payment method
      </p>

      {providers.stripe && (
        <button
          onClick={() => checkout('stripe')}
          disabled={!!loading}
          className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-black font-bold py-3 px-6 text-sm uppercase tracking-wider transition-colors disabled:opacity-50"
        >
          {loading === 'stripe' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CreditCard className="w-4 h-4" />
          )}
          Pay with card
        </button>
      )}

      {providers.recurrente && (
        <button
          onClick={() => checkout('recurrente')}
          disabled={!!loading}
          className="w-full flex items-center justify-center gap-3 bg-gray-900 hover:bg-gray-800 text-white font-bold py-3 px-6 text-sm uppercase tracking-wider border border-gray-700 transition-colors disabled:opacity-50"
        >
          {loading === 'recurrente' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Globe className="w-4 h-4" />
          )}
          Pay with Recurrente
        </button>
      )}

      {providers.stablepay && (
        <button
          onClick={() => setShowCrypto(true)}
          disabled={!!loading}
          className="w-full flex items-center justify-center gap-3 bg-gray-900 hover:bg-gray-800 text-white font-bold py-3 px-6 text-sm uppercase tracking-wider border border-gray-700 transition-colors disabled:opacity-50"
        >
          <Bitcoin className="w-4 h-4" />
          Pay with crypto
        </button>
      )}

      {error && (
        <p className="text-red-400 text-xs text-center mt-2">{error}</p>
      )}
    </div>
  )
}
