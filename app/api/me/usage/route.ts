import { NextResponse } from 'next/server'
import { getSessionUser } from '@/app/lib/auth'
import { backendJson } from '@/app/lib/backend'

interface MeResp {
  uploads_today: number
  daily_upload_limit: number | null
  active_plan: {
    plan_name: string
    plan_slug: string
    daily_upload_limit: number | null
    monthly_upload_limit: number | null
  } | null
  usage: { uploads_this_month: number; total_uploads: number }
}

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const res = await backendJson<MeResp>(
    `/api/v1/users/me?user_id=${encodeURIComponent(user.id)}`,
    { cache: 'no-store' }
  )
  if (!res.ok || !res.data) {
    return NextResponse.json({ error: 'upstream' }, { status: 500 })
  }

  const { uploads_today, daily_upload_limit, active_plan, usage } = res.data
  const dailyRemaining = daily_upload_limit != null ? Math.max(0, daily_upload_limit - uploads_today) : null

  return NextResponse.json({
    uploads_today,
    daily_upload_limit,
    daily_remaining: dailyRemaining,
    daily_limit_reached: daily_upload_limit != null && uploads_today >= daily_upload_limit,
    plan_slug: active_plan?.plan_slug ?? null,
    plan_name: active_plan?.plan_name ?? null,
    uploads_this_month: usage?.uploads_this_month ?? 0,
    monthly_upload_limit: active_plan?.monthly_upload_limit ?? null,
  })
}
