'use client'

import { useEffect, useRef } from 'react'

const MERCHANT_ID = 'cmn979jnf0000110ntpw8x6fi'

export default function StablePayWidget({
  amount,
  product,
  onSuccess,
}: {
  amount: string
  product: string
  onSuccess: (detail: Record<string, unknown>) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const existing = document.querySelector('script[src*="checkout-widget.js"]')
    if (!existing) {
      const script = document.createElement('script')
      script.src = 'https://wetakestables.shop/checkout-widget.js'
      script.async = true
      document.head.appendChild(script)
    }

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      onSuccess(detail ?? {})
    }
    document.addEventListener('stablepay:payment.success', handler)
    return () => document.removeEventListener('stablepay:payment.success', handler)
  }, [onSuccess])

  return (
    <div
      ref={containerRef}
      className="stablepay-checkout"
      data-merchant={MERCHANT_ID}
      data-amount={amount}
      data-product={product}
      data-theme="dark"
      data-accent="#7dd3c0"
    />
  )
}
