import Link from 'next/link'
import { Check, Zap, Shield, Rocket, Crown } from 'lucide-react'
import { getServerT } from '@/app/lib/i18n/server'

const UPLOAD_SERVER = process.env.NEXT_PUBLIC_UPLOAD_SERVER || 'http://localhost:5050'

interface Plan {
  id: number
  slug: string
  name: string
  tagline: string
  description: string
  billing_period: 'free' | 'monthly' | 'yearly' | 'one_time'
  price_cents: number
  currency: string
  monthly_upload_limit: number | null
  daily_upload_limit: number | null
  features_json: string
  sort_order: number
}

const PLAN_ICONS: Record<string, typeof Zap> = {
  drift: Zap,
  signal: Shield,
  beacon: Rocket,
  archive: Crown,
}

const PLAN_ACCENTS: Record<string, string> = {
  drift: 'accent-cyan',
  signal: 'accent-green',
  beacon: 'accent-blue',
  archive: 'accent-orange',
}

async function getPlans(): Promise<Plan[]> {
  try {
    const res = await fetch(`${UPLOAD_SERVER}/api/v1/users/plans`, {
      next: { revalidate: 300 },
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.plans || []
  } catch {
    return []
  }
}

function formatPrice(cents: number, period: string): { amount: string; suffix: string } {
  if (cents === 0) return { amount: '$0', suffix: '' }
  const dollars = (cents / 100).toFixed(0)
  const suffix = period === 'monthly' ? '/mo' : period === 'yearly' ? '/yr' : ''
  return { amount: `$${dollars}`, suffix }
}

function parseFeatures(json: string): Record<string, boolean> {
  try { return JSON.parse(json) } catch { return {} }
}

export default async function PricingPage() {
  const plans = await getPlans()
  const { t } = await getServerT(null)

  const featureLabels: Record<string, string> = {
    custom_accent: t('pricing.feat_accent'),
    custom_domain: t('pricing.feat_domain'),
    private_folders: t('pricing.feat_private'),
    og_image: t('pricing.feat_og'),
    priority_refresh: t('pricing.feat_refresh'),
    bulk: t('pricing.feat_bulk'),
    analytics: t('pricing.feat_analytics'),
    lifetime: t('pricing.feat_lifetime'),
  }

  return (
    <div className="min-h-screen bg-black">
      <header className="container mx-auto px-4 py-6">
        <nav className="flex justify-between items-center">
          <Link href="/" className="text-xl font-bold text-accent-cyan text-glow tracking-widest uppercase">
            Stash
          </Link>
          <div className="flex items-center gap-6 text-sm">
            <Link href="/about" className="text-gray-500 hover:text-accent-cyan transition-colors">
              {t('pricing.nav_about')}
            </Link>
            <Link href="/auth" className="text-gray-500 hover:text-accent-cyan transition-colors">
              {t('pricing.nav_signin')}
            </Link>
          </div>
        </nav>
      </header>

      <main className="container mx-auto px-4 py-16 max-w-5xl">
        <div className="text-center mb-16">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-3 tracking-tight">
            {t('pricing.title')}
          </h1>
          <p className="text-gray-400 max-w-lg mx-auto text-sm">
            {t('pricing.subtitle')}
          </p>
        </div>

        {/* Plan cards */}
        <div className={`grid gap-6 mb-20 ${plans.length <= 2 ? 'md:grid-cols-2 max-w-3xl mx-auto' : plans.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2 lg:grid-cols-4'}`}>
          {plans.map((plan) => {
            const Icon = PLAN_ICONS[plan.slug] || Zap
            const accent = PLAN_ACCENTS[plan.slug] || 'accent-cyan'
            const { amount, suffix } = formatPrice(plan.price_cents, plan.billing_period)
            const features = parseFeatures(plan.features_json)
            const isPopular = plan.slug === 'signal'
            const isLifetime = plan.billing_period === 'one_time'

            return (
              <div
                key={plan.id}
                className={`bg-gray-950 p-6 border relative ${isPopular ? 'border-white' : 'border-gray-800'}`}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white text-black text-xs font-bold px-3 py-0.5 uppercase tracking-wider">
                    {t('pricing.popular')}
                  </div>
                )}

                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={`w-4 h-4 text-${accent}`} />
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">{plan.name}</h3>
                  </div>
                  <p className="text-gray-500 text-xs mb-4">{plan.tagline}</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-white">{amount}</span>
                    {suffix && <span className="text-gray-500 text-sm">{suffix}</span>}
                    {isLifetime && <span className="text-gray-500 text-sm">{t('pricing.one_time')}</span>}
                  </div>
                </div>

                {/* Limits */}
                <div className="mb-4 space-y-1">
                  {plan.daily_upload_limit != null ? (
                    <div className="text-sm text-gray-300">
                      <span className="text-white font-medium">{plan.daily_upload_limit}</span> {t('pricing.uploads_day')}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-300">
                      <span className="text-white font-medium">{t('pricing.unlimited')}</span> {t('pricing.daily_uploads')}
                    </div>
                  )}
                  {plan.monthly_upload_limit != null ? (
                    <div className="text-sm text-gray-300">
                      <span className="text-white font-medium">{plan.monthly_upload_limit}</span> {t('pricing.uploads_month')}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-300">
                      <span className="text-white font-medium">{t('pricing.unlimited')}</span> {t('pricing.monthly_uploads')}
                    </div>
                  )}
                </div>

                {/* Features */}
                <ul className="space-y-2 mb-6">
                  {Object.entries(features).map(([key, enabled]) => {
                    if (!enabled || key === 'lifetime') return null
                    const label = featureLabels[key] || key
                    return (
                      <li key={key} className="flex items-start gap-2 text-gray-400 text-xs">
                        <Check className="w-3.5 h-3.5 text-gray-600 flex-shrink-0 mt-0.5" />
                        <span>{label}</span>
                      </li>
                    )
                  })}
                </ul>

                <Link
                  href={plan.price_cents === 0 ? '/auth' : '/auth'}
                  className={`block text-center font-bold py-2.5 px-4 text-sm uppercase tracking-wider transition-colors ${
                    isPopular
                      ? 'bg-white hover:bg-gray-200 text-black'
                      : plan.price_cents === 0
                        ? 'bg-gray-900 hover:bg-gray-800 text-white border border-gray-700'
                        : 'bg-gray-900 hover:bg-gray-800 text-white border border-gray-700'
                  }`}
                >
                  {plan.price_cents === 0 ? t('pricing.cta_free') : t('pricing.cta_paid')}
                </Link>
              </div>
            )
          })}
        </div>

        {/* Comparison table */}
        <div className="max-w-4xl mx-auto mb-20">
          <h2 className="text-lg font-bold text-white text-center mb-8 uppercase tracking-wider">
            {t('pricing.compare_title')}
          </h2>

          <div className="bg-gray-950 border border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-black border-b border-gray-800">
                <tr>
                  <th className="px-6 py-3 text-left text-gray-500 font-medium"></th>
                  <th className="px-6 py-3 text-center text-gray-500 font-medium">Google Drive</th>
                  <th className="px-6 py-3 text-center text-gray-500 font-medium">Dropbox</th>
                  <th className="px-6 py-3 text-center text-white font-medium">Stash</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                <tr>
                  <td className="px-6 py-3 text-gray-400">{t('pricing.compare_free')}</td>
                  <td className="px-6 py-3 text-center text-gray-500">15GB</td>
                  <td className="px-6 py-3 text-center text-gray-500">2GB</td>
                  <td className="px-6 py-3 text-center text-white">{t('pricing.compare_stash_free')}</td>
                </tr>
                <tr>
                  <td className="px-6 py-3 text-gray-400">{t('pricing.compare_duration')}</td>
                  <td className="px-6 py-3 text-center text-gray-500">{t('pricing.compare_subscription')}</td>
                  <td className="px-6 py-3 text-center text-gray-500">{t('pricing.compare_subscription')}</td>
                  <td className="px-6 py-3 text-center text-white">{t('pricing.compare_permanent')}</td>
                </tr>
                <tr>
                  <td className="px-6 py-3 text-gray-400">{t('pricing.compare_deletable')}</td>
                  <td className="px-6 py-3 text-center text-gray-500">{t('pricing.compare_yes')}</td>
                  <td className="px-6 py-3 text-center text-gray-500">{t('pricing.compare_yes')}</td>
                  <td className="px-6 py-3 text-center text-white">{t('pricing.compare_never')}</td>
                </tr>
                <tr>
                  <td className="px-6 py-3 text-gray-400">{t('pricing.compare_decentralized')}</td>
                  <td className="px-6 py-3 text-center text-gray-600">{t('pricing.compare_no')}</td>
                  <td className="px-6 py-3 text-center text-gray-600">{t('pricing.compare_no')}</td>
                  <td className="px-6 py-3 text-center text-white">{t('pricing.compare_yes_check')}</td>
                </tr>
                <tr>
                  <td className="px-6 py-3 text-gray-400">{t('pricing.compare_public_pages')}</td>
                  <td className="px-6 py-3 text-center text-gray-600">{t('pricing.compare_no')}</td>
                  <td className="px-6 py-3 text-center text-gray-600">{t('pricing.compare_no')}</td>
                  <td className="px-6 py-3 text-center text-white">{t('pricing.compare_yes_check')}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto">
          <h2 className="text-lg font-bold text-white text-center mb-8 uppercase tracking-wider">
            {t('pricing.faq_title')}
          </h2>
          <div className="space-y-4">
            <FaqItem q={t('pricing.faq_free_q')} a={t('pricing.faq_free_a')} />
            <FaqItem q={t('pricing.faq_permanent_q')} a={t('pricing.faq_permanent_a')} />
            <FaqItem q={t('pricing.faq_delete_q')} a={t('pricing.faq_delete_a')} />
            <FaqItem q={t('pricing.faq_limit_q')} a={t('pricing.faq_limit_a')} />
          </div>
        </div>
      </main>

      <footer className="container mx-auto px-4 py-12 mt-12 border-t border-gray-900">
        <div className="flex justify-between items-center text-sm text-gray-600">
          <div>Arweave + Irys</div>
          <div className="flex gap-6">
            <Link href="/" className="hover:text-gray-400">Upload</Link>
            <Link href="/about" className="hover:text-gray-400">{t('pricing.nav_about')}</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <div className="bg-gray-950 p-5 border border-gray-800">
      <h3 className="text-sm font-medium text-white mb-2">{q}</h3>
      <p className="text-gray-500 text-sm">{a}</p>
    </div>
  )
}
