import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/app/lib/auth'
import { backendJson } from '@/app/lib/backend'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ planSlug: string }> }
) {
  const { stashUser } = await requireUser()
  const { planSlug } = await params
  const body = await req.json().catch(() => ({}))
  const provider = body.provider as string

  if (!['stripe', 'recurrente', 'stablepay'].includes(provider)) {
    return NextResponse.json({ error: 'invalid provider' }, { status: 400 })
  }

  const res = await backendJson<{ url: string }>(
    `/api/v1/checkout/${provider}`,
    {
      method: 'POST',
      body: JSON.stringify({ user_id: stashUser.id, plan_slug: planSlug }),
    }
  )

  if (!res.ok || !res.data?.url) {
    return NextResponse.json({ error: res.error || 'checkout failed' }, { status: 500 })
  }

  return NextResponse.json({ url: res.data.url })
}
