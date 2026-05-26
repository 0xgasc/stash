import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { isAdminAuthenticated } from '@/app/lib/admin-auth'
import { backendJson } from '@/app/lib/backend'

const RESEND_API_KEY = process.env.RESEND_API_KEY
const ALERT_FROM = process.env.ALERT_FROM || 'alerts@offsetworks.xyz'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://aeter-eight.vercel.app'
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null

interface CreateUserResp {
  user: { id: string; email: string; display_name: string | null }
  claim_token: string
  active_plan?: { plan_name?: string } | null
}

export async function GET(req: NextRequest) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const limit = req.nextUrl.searchParams.get('limit') || '100'
  const offset = req.nextUrl.searchParams.get('offset') || '0'
  const res = await backendJson(`/api/v1/admin/users?limit=${limit}&offset=${offset}`)
  return NextResponse.json(res.data || { error: res.error }, { status: res.status })
}

export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const sendEmail = body.send_email !== false   // default: yes

  const res = await backendJson<CreateUserResp>('/api/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (!res.ok || !res.data) {
    return NextResponse.json(res.data || { error: res.error }, { status: res.status })
  }

  const { user, claim_token, active_plan } = res.data
  const claim_url = `${APP_URL}/claim?token=${encodeURIComponent(claim_token)}`

  let emailStatus: 'sent' | 'skipped' | 'failed' | 'no_resend_key' = 'skipped'
  let emailError: string | null = null
  if (sendEmail && resend) {
    try {
      const planLine = active_plan?.plan_name
        ? `<p style="margin:0 0 16px;color:#555">Your account is set up on the <strong>${active_plan.plan_name}</strong> plan.</p>`
        : ''
      const sendRes = await resend.emails.send({
        from: ALERT_FROM,
        to: user.email,
        subject: 'Claim your Stash archive',
        html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:24px auto;color:#222">
  <h2 style="margin:0 0 12px">Your Stash account is ready</h2>
  <p style="margin:0 0 16px;color:#555">An admin created an archive account for you on Stash. Click the button below to claim it — this link expires in 7 days.</p>
  ${planLine}
  <p style="margin:0 0 24px"><a href="${claim_url}" style="display:inline-block;background:#000;color:#fff;padding:10px 18px;text-decoration:none;border-radius:4px;font-weight:500">Claim your account</a></p>
  <p style="margin:0;font-size:12px;color:#888">After claiming you'll pick a public handle and start uploading.</p>
  <p style="margin:8px 0 0;font-size:11px;color:#aaa;word-break:break-all">${claim_url}</p>
</div>`,
      })
      if (sendRes.error) {
        emailStatus = 'failed'
        emailError = sendRes.error.message || String(sendRes.error)
      } else {
        emailStatus = 'sent'
      }
    } catch (err) {
      emailStatus = 'failed'
      emailError = err instanceof Error ? err.message : String(err)
    }
  } else if (sendEmail && !resend) {
    emailStatus = 'no_resend_key'
  }

  return NextResponse.json({
    user,
    claim_token,
    claim_url,
    active_plan,
    email_status: emailStatus,
    email_error: emailError,
  })
}
