import Link from 'next/link'
import { CheckCircle } from 'lucide-react'
import { requireUser } from '@/app/lib/auth'
import { backendJson } from '@/app/lib/backend'

interface ActivePlan {
  plan_name: string
  plan_slug: string
  payment_provider: string
  status: string
}

export default async function CheckoutSuccessPage() {
  const { stashUser } = await requireUser()

  const planRes = await backendJson<{ active_plan: ActivePlan | null }>(
    `/api/v1/users/me?user_id=${encodeURIComponent(stashUser.id)}`,
    { cache: 'no-store' }
  )
  const activePlan = planRes.data?.active_plan

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="max-w-md w-full mx-4">
        <div className="bg-gray-950 border border-gray-800 p-10 text-center">
          <CheckCircle className="w-14 h-14 text-accent-cyan mx-auto mb-6" />

          <h1 className="text-2xl font-bold text-white mb-2 uppercase tracking-wider">
            You&apos;re in
          </h1>

          {activePlan && activePlan.plan_slug !== 'drift' ? (
            <p className="text-gray-400 text-sm mb-8">
              Your <span className="text-white font-medium">{activePlan.plan_name}</span> plan is now active.
            </p>
          ) : (
            <p className="text-gray-400 text-sm mb-8">
              Payment received. Your plan will activate shortly.
            </p>
          )}

          <div className="space-y-3">
            <Link
              href="/me"
              className="block bg-accent-cyan hover:bg-cyan-300 text-black font-bold py-3 px-6 text-sm uppercase tracking-wider transition-colors"
            >
              Go to dashboard
            </Link>
            <Link
              href="/"
              className="block text-gray-500 hover:text-white text-sm transition-colors py-2"
            >
              Upload a file
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
