import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { requireUser } from '@/app/lib/auth'
import { backendJson } from '@/app/lib/backend'
import CheckoutButtons from '@/app/components/CheckoutButtons'

interface Plan {
  id: number
  slug: string
  name: string
  tagline: string
  billing_period: string
  price_cents: number
  currency: string
  monthly_upload_limit: number | null
  daily_upload_limit: number | null
  features_json: string
  stripe_price_id: string | null
  recurrente_url: string | null
  stablepay_url: string | null
}

const UPLOAD_SERVER = process.env.NEXT_PUBLIC_UPLOAD_SERVER || 'http://localhost:5050'

function formatPrice(cents: number, period: string) {
  const dollars = (cents / 100).toFixed(0)
  const suffix = period === 'monthly' ? '/mo' : period === 'yearly' ? '/yr' : ''
  return `$${dollars}${suffix}`
}

function parseFeatures(json: string): Record<string, boolean> {
  try { return JSON.parse(json) } catch { return {} }
}

const FEATURE_LABELS: Record<string, string> = {
  custom_accent: 'Custom accent colors',
  custom_domain: 'Custom domain',
  private_folders: 'Private folders',
  og_image: 'OG image generation',
  priority_refresh: 'Priority refresh',
  bulk: 'Bulk operations',
  analytics: 'Analytics',
  password_lock: 'Password-locked folders',
  email_sharing: 'Email-restricted sharing',
  lifetime: 'Lifetime access',
}

export default async function CheckoutPage({ params }: { params: Promise<{ planSlug: string }> }) {
  const { stashUser } = await requireUser()
  const { planSlug } = await params

  let plan: Plan | null = null
  try {
    const res = await fetch(`${UPLOAD_SERVER}/api/v1/users/plans`, { cache: 'no-store' })
    if (res.ok) {
      const data = await res.json()
      plan = (data.plans as Plan[])?.find(p => p.slug === planSlug) || null
    }
  } catch { /* */ }

  if (!plan || plan.price_cents === 0) notFound()

  const features = parseFeatures(plan.features_json)
  const providers = {
    stripe: !!plan.stripe_price_id,
    recurrente: !!plan.recurrente_url,
    stablepay: true,
  }

  const hasAnyProvider = providers.stripe || providers.recurrente || providers.stablepay

  return (
    <div className="min-h-screen bg-black">
      <header className="container mx-auto px-4 py-6">
        <Link href="/pricing" className="flex items-center gap-2 text-gray-500 hover:text-white text-sm w-fit">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to plans
        </Link>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-lg">
        <div className="bg-gray-950 border border-gray-800 p-8 mb-6">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-white mb-1 uppercase tracking-wider">
              {plan.name}
            </h1>
            <p className="text-gray-500 text-sm mb-4">{plan.tagline}</p>
            <div className="text-4xl font-bold text-white">
              {formatPrice(plan.price_cents, plan.billing_period)}
            </div>
            {plan.billing_period === 'one_time' && (
              <p className="text-gray-500 text-xs mt-1">One-time payment, lifetime access</p>
            )}
          </div>

          <div className="border-t border-gray-800 pt-6 mb-8">
            <div className="space-y-2 text-sm">
              {plan.daily_upload_limit != null ? (
                <div className="text-gray-300">
                  <span className="text-white font-medium">{plan.daily_upload_limit}</span> uploads/day
                </div>
              ) : (
                <div className="text-gray-300">
                  <span className="text-white font-medium">Unlimited</span> daily uploads
                </div>
              )}
              {plan.monthly_upload_limit != null ? (
                <div className="text-gray-300">
                  <span className="text-white font-medium">{plan.monthly_upload_limit}</span> uploads/month
                </div>
              ) : (
                <div className="text-gray-300">
                  <span className="text-white font-medium">Unlimited</span> monthly uploads
                </div>
              )}
              {Object.entries(features).map(([key, enabled]) => {
                if (!enabled || key === 'lifetime') return null
                return (
                  <div key={key} className="text-gray-400 text-xs">
                    + {FEATURE_LABELS[key] || key}
                  </div>
                )
              })}
            </div>
          </div>

          {hasAnyProvider ? (
            <CheckoutButtons
              planSlug={plan.slug}
              planName={plan.name}
              priceDollars={(plan.price_cents / 100).toFixed(2)}
              userId={stashUser.id}
              providers={providers}
            />
          ) : (
            <div className="text-center text-gray-500 text-sm p-4 border border-gray-800">
              Payment methods are being configured. Check back soon.
            </div>
          )}
        </div>

        <p className="text-center text-gray-700 text-xs">
          Secure payment. Cancel anytime.
        </p>
      </main>
    </div>
  )
}
