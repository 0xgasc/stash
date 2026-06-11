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

  const res = await backendJson(
    '/api/v1/checkout/stablepay-confirm',
    {
      method: 'POST',
      body: JSON.stringify({
        user_id: stashUser.id,
        plan_slug: planSlug,
        payment: body.payment || {},
      }),
    }
  )

  if (!res.ok) {
    return NextResponse.json({ error: res.error || 'activation failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
