/**
 * /me — owner dashboard.
 *
 * Layout:
 *   1. Greeting + public-profile link + settings/signout in header
 *   2. Plan card with monthly usage bar
 *   3. Upload card (folder picker + dropzone)
 *   4. Inbox explainer
 *   5. Folders list with "new folder" button
 */
import Link from 'next/link'
import { AlertTriangle, Zap, Settings, ExternalLink, Info } from 'lucide-react'
import { requireUser } from '@/app/lib/auth'
import { backendJson } from '@/app/lib/backend'
import { getServerT } from '@/app/lib/i18n/server'
import FolderListClient from '@/app/components/FolderListClient'
import SignOutButton from '@/app/components/SignOutButton'
import MeUploadCard from '@/app/components/MeUploadCard'
import LangSwitcher from '@/app/components/LangSwitcher'

interface Folder {
  id: number
  slug: string
  name: string
  description: string | null
  visibility: 'public' | 'unlisted' | 'private'
  is_inbox: number
  banner_uuid: string | null
  file_count: number
  created_at: string
  updated_at: string
}

interface UserMeResponse {
  user: { id: string; handle: string | null }
  active_plan: {
    plan_name?: string
    plan_slug?: string
    billing_period?: 'free' | 'monthly' | 'yearly' | 'one_time'
    monthly_upload_limit?: number | null
    daily_upload_limit?: number | null
    payment_status?: string | null
  } | null
  usage: { uploads_this_month: number; total_uploads: number }
  uploads_today?: number
  daily_upload_limit?: number | null
}

export default async function MeDashboard() {
  const { stashUser, sessionUser } = await requireUser()
  const { t } = await getServerT(stashUser.preferred_locale)
  const [foldersRes, meRes] = await Promise.all([
    backendJson<{ folders: Folder[] }>(
      `/api/v1/me/folders?user_id=${encodeURIComponent(stashUser.id)}`,
      { cache: 'no-store' }
    ),
    backendJson<UserMeResponse>(
      `/api/v1/users/me?user_id=${encodeURIComponent(sessionUser.id)}`,
      { cache: 'no-store' }
    ),
  ])
  const folders = foldersRes.data?.folders || []
  const meData = meRes.data
  const plan = meData?.active_plan
  const usage = meData?.usage
  const monthlyLimit = plan?.monthly_upload_limit ?? null
  const used = usage?.uploads_this_month ?? 0
  const total = usage?.total_uploads ?? 0
  const pct = monthlyLimit && monthlyLimit > 0 ? Math.min(100, Math.round((used / monthlyLimit) * 100)) : 0
  const overSoftWarning = monthlyLimit != null && pct >= 90
  const remaining = monthlyLimit != null ? Math.max(0, monthlyLimit - used) : null

  const uploadsToday = meData?.uploads_today ?? 0
  const dailyLimit = meData?.daily_upload_limit ?? null
  const dailyRemaining = dailyLimit != null ? Math.max(0, dailyLimit - uploadsToday) : null
  const dailyPct = dailyLimit && dailyLimit > 0 ? Math.min(100, Math.round((uploadsToday / dailyLimit) * 100)) : 0
  const dailyLimitHit = dailyLimit != null && uploadsToday >= dailyLimit
  const isFree = plan?.billing_period === 'free'

  const inboxFolder = folders.find(f => f.is_inbox)
  const userFolders = folders.filter(f => !f.is_inbox)
  const folderOptions = folders.map(f => ({ id: f.id, name: f.name, is_inbox: f.is_inbox, slug: f.slug }))

  return (
    <div className="min-h-screen bg-black">
      <header className="container mx-auto px-4 py-6">
        <nav className="flex justify-between items-center">
          <Link href="/" className="text-xl font-medium text-white">Stash</Link>
          <div className="flex items-center gap-5 text-sm">
            <Link href={`/u/${stashUser.handle}`} className="text-gray-500 hover:text-white flex items-center gap-1">
              {t('me.view_profile')} <ExternalLink className="w-3 h-3" />
            </Link>
            <Link href="/me/settings" className="text-gray-500 hover:text-white flex items-center gap-1">
              <Settings className="w-3.5 h-3.5" /> {t('common.settings')}
            </Link>
            <LangSwitcher />
            <SignOutButton />
          </div>
        </nav>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Greeting */}
        <div className="mb-6">
          <h1 className="text-2xl font-medium text-white mb-1">
            {t('me.greeting_prefix')}<span className="text-accent-cyan">@{stashUser.handle}</span>
          </h1>
          <p className="text-gray-500 text-sm">
            {t('me.profile_at_prefix')}
            <Link href={`/u/${stashUser.handle}`} className="text-gray-300 hover:text-white font-mono">
              /u/{stashUser.handle}
            </Link>
          </p>
        </div>

        {/* Plan + usage */}
        {plan && (
          <div className="bg-gray-950 border border-gray-800 p-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-accent-cyan" />
                <span className="text-white text-sm">
                  <span className="font-medium">{plan.plan_name}</span>
                  <span className="text-gray-500 ml-2 text-xs">
                    {plan.billing_period === 'one_time' ? t('me.plan_lifetime') : plan.billing_period}
                    {plan.payment_status && ` · ${plan.payment_status}`}
                  </span>
                </span>
              </div>
              {isFree && (
                <Link href="/pricing" className="text-accent-cyan text-xs hover:text-white transition-colors">
                  {t('me.upgrade')} →
                </Link>
              )}
            </div>

            {/* Daily limit bar */}
            {dailyLimit != null && (
              <div className="mb-3">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-gray-500">{t('me.daily_uploads')}</span>
                  <span className={dailyLimitHit ? 'text-yellow-300' : 'text-gray-400'}>
                    {t('me.daily_remaining', { remaining: dailyRemaining ?? 0, limit: dailyLimit })}
                  </span>
                </div>
                <div className="w-full bg-gray-900 h-1.5 overflow-hidden">
                  <div
                    className={`h-full transition-all ${dailyLimitHit ? 'bg-yellow-400' : 'bg-accent-cyan'}`}
                    style={{ width: `${dailyPct}%` }}
                  />
                </div>
              </div>
            )}

            {/* Monthly limit bar */}
            {monthlyLimit != null && (
              <div className="mb-2">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-gray-500">{t('me.monthly_uploads')}</span>
                  <span className="text-gray-400">
                    {t('me.plan_uploads_left', { remaining: remaining ?? 0, limit: monthlyLimit })}
                  </span>
                </div>
                <div className="w-full bg-gray-900 h-1.5 overflow-hidden">
                  <div
                    className={`h-full transition-all ${overSoftWarning ? 'bg-yellow-400' : 'bg-accent-cyan'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )}
            {monthlyLimit == null && (
              <div className="text-xs text-gray-400 mb-2">
                {t('me.plan_uploads_unlimited', { used })}
              </div>
            )}

            <div className="text-gray-600 text-xs">
              {t('me.plan_total', { total })}
            </div>

            {dailyLimitHit && (
              <div className="mt-3 bg-gray-900 border border-yellow-400/20 p-3">
                <div className="flex items-center gap-2 text-yellow-300 text-xs mb-2">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {t('me.daily_limit_hit')}
                </div>
                <Link href="/pricing" className="text-accent-cyan text-xs hover:text-white transition-colors">
                  {t('me.upgrade_for_more')} →
                </Link>
              </div>
            )}
            {overSoftWarning && !dailyLimitHit && (
              <div className="mt-3 flex items-center gap-2 text-yellow-300 text-xs">
                <AlertTriangle className="w-3.5 h-3.5" />
                {t('me.plan_soft_warning', { pct })}
              </div>
            )}
          </div>
        )}

        {/* Upload */}
        <MeUploadCard
          folders={folderOptions}
          defaultFolderId={inboxFolder?.id ?? null}
          handle={stashUser.handle!}
        />

        {/* Folders section header with Inbox explainer */}
        <div className="mt-10 mb-4">
          <h2 className="text-lg text-white mb-2">{t('me.folders_title')}</h2>
          <div className="flex items-start gap-2 text-xs text-gray-500 bg-gray-950 border border-gray-800 p-3">
            <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-600" />
            <div>
              {t('me.inbox_explainer')}
              {userFolders.length === 0 && <> {t('me.inbox_when_empty')}</>}
            </div>
          </div>
        </div>

        <FolderListClient initialFolders={folders} />
      </main>
    </div>
  )
}
