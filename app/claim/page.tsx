/**
 * /claim?token=... — recipient lands here after clicking the admin-emailed link.
 *
 * Server-renders a preview of what they're about to claim (email, plan,
 * any pre-set handle). If they're not signed in, sends them to /auth
 * with the token preserved as `account_claim_token`, so the auth
 * callback can link the Supabase id automatically.
 */
import Link from 'next/link'
import { Suspense } from 'react'
import { AlertTriangle, Gift } from 'lucide-react'
import { backendJson } from '@/app/lib/backend'
import { getServerT } from '@/app/lib/i18n/server'
import ClaimClient from '@/app/components/ClaimClient'
import LangSwitcher from '@/app/components/LangSwitcher'

interface Preview {
  email: string
  display_name: string | null
  handle: string | null
  active_plan: {
    plan_name?: string
    plan_slug?: string
    billing_period?: string
    monthly_upload_limit?: number | null
  } | null
}

export default async function ClaimPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  const { t } = await getServerT()

  if (!token) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-4 relative">
        <div className="absolute top-4 right-4"><LangSwitcher /></div>
        <div className="text-center">
          <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-3" />
          <p className="text-red-300">No claim token provided.</p>
          <Link href="/" className="text-gray-500 hover:text-white text-sm mt-4 inline-block">{t('common.back_to_stash')}</Link>
        </div>
      </div>
    )
  }

  const previewRes = await backendJson<Preview>(`/api/v1/users/claim-preview/${encodeURIComponent(token)}`, { cache: 'no-store' })
  if (!previewRes.ok || !previewRes.data) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-4 relative">
        <div className="absolute top-4 right-4"><LangSwitcher /></div>
        <div className="max-w-md text-center">
          <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-medium text-white mb-2">{t('claim.expired_title')}</h1>
          <p className="text-gray-500 text-sm mb-6">{t('claim.expired_body')}</p>
          <Link href="/auth" className="text-gray-400 hover:text-white text-sm">{t('claim.sign_in_existing')}</Link>
        </div>
      </div>
    )
  }

  const preview = previewRes.data

  if (!preview.email) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-4 relative">
        <div className="absolute top-4 right-4"><LangSwitcher /></div>
        <div className="max-w-md text-center">
          <AlertTriangle className="w-8 h-8 text-yellow-400 mx-auto mb-4" />
          <h1 className="text-xl font-medium text-white mb-2">{t('claim.incomplete_title')}</h1>
          <p className="text-gray-500 text-sm mb-6">{t('claim.incomplete_body')}</p>
          <Link href="/auth" className="text-gray-400 hover:text-white text-sm">{t('claim.sign_in_existing')}</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4 relative">
      <div className="absolute top-4 right-4"><LangSwitcher /></div>
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Gift className="w-10 h-10 text-accent-cyan mx-auto mb-4" />
          <h1 className="text-2xl font-medium text-white">{t('claim.title')}</h1>
          <p className="text-gray-500 text-sm mt-1">{t('claim.subtitle')}</p>
        </div>

        <div className="bg-gray-950 border border-gray-800 p-6 mb-4">
          <div className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-2 text-sm">
            <span className="text-gray-500 text-xs">{t('claim.section_email')}</span><span className="text-white">{preview.email}</span>
            {preview.display_name && (<>
              <span className="text-gray-500 text-xs">{t('claim.section_name')}</span><span className="text-white">{preview.display_name}</span>
            </>)}
            {preview.handle && (<>
              <span className="text-gray-500 text-xs">{t('claim.section_handle')}</span><span className="text-white font-mono">@{preview.handle}</span>
            </>)}
            {preview.active_plan?.plan_name && (<>
              <span className="text-gray-500 text-xs">{t('claim.section_plan')}</span>
              <span className="text-white">
                {preview.active_plan.plan_name}
                {preview.active_plan.billing_period === 'one_time' && <span className="text-gray-500 ml-2">{t('claim.plan_lifetime')}</span>}
                {preview.active_plan.monthly_upload_limit != null && (
                  <span className="text-gray-500 ml-2">· {preview.active_plan.monthly_upload_limit}/{t('claim.plan_monthly_suffix')}</span>
                )}
              </span>
            </>)}
          </div>
        </div>

        <Suspense fallback={<div className="text-gray-500 text-sm text-center">{t('common.loading')}</div>}>
          <ClaimClient token={token} email={preview.email} />
        </Suspense>
      </div>
    </div>
  )
}
