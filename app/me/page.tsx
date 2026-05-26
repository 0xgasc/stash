/**
 * /me — owner dashboard.
 *
 * Shows the user's folders (with Inbox first), a "new folder" button,
 * and a sign-out link. Server-rendered with initial data; folder
 * mutations happen client-side and re-fetch.
 */
import Link from 'next/link'
import { AlertTriangle, Zap } from 'lucide-react'
import { requireUser } from '@/app/lib/auth'
import { backendJson } from '@/app/lib/backend'
import FolderListClient from '@/app/components/FolderListClient'
import SignOutButton from '@/app/components/SignOutButton'

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
    payment_status?: string | null
  } | null
  usage: { uploads_this_month: number; total_uploads: number }
}

export default async function MeDashboard() {
  const { stashUser, sessionUser } = await requireUser()
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
  const pct = monthlyLimit && monthlyLimit > 0 ? Math.min(100, Math.round((used / monthlyLimit) * 100)) : 0
  const overSoftWarning = monthlyLimit != null && pct >= 90

  return (
    <div className="min-h-screen bg-black">
      <header className="container mx-auto px-4 py-6">
        <nav className="flex justify-between items-center">
          <Link href="/" className="text-xl font-medium text-white">Stash</Link>
          <div className="flex items-center gap-6 text-sm">
            <Link href={`/u/${stashUser.handle}`} className="text-gray-500 hover:text-white">
              View public profile →
            </Link>
            <SignOutButton />
          </div>
        </nav>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-2xl font-medium text-white mb-1">
            Hi <span className="text-accent-cyan">@{stashUser.handle}</span>
          </h1>
          <p className="text-gray-500 text-sm">
            Your archive lives at{' '}
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
                    {plan.billing_period === 'one_time' ? 'lifetime' : plan.billing_period}
                    {plan.payment_status && ` · ${plan.payment_status}`}
                  </span>
                </span>
              </div>
              {monthlyLimit != null ? (
                <span className="text-xs text-gray-400">
                  {used} / {monthlyLimit} uploads this month
                </span>
              ) : (
                <span className="text-xs text-gray-400">{used} uploads this month · unlimited</span>
              )}
            </div>
            {monthlyLimit != null && (
              <div className="w-full bg-gray-900 h-1.5 overflow-hidden">
                <div
                  className={`h-full transition-all ${overSoftWarning ? 'bg-yellow-400' : 'bg-accent-cyan'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
            {overSoftWarning && (
              <div className="mt-3 flex items-center gap-2 text-yellow-300 text-xs">
                <AlertTriangle className="w-3.5 h-3.5" />
                You&apos;ve used {pct}% of your monthly uploads. Upgrade for more headroom.
              </div>
            )}
          </div>
        )}

        <FolderListClient initialFolders={folders} />
      </main>
    </div>
  )
}
