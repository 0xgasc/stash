/**
 * POST /api/auth/request
 *
 * Sends a magic-link sign-in email via Resend. Body:
 *   { email, claim_token?, redirect_to? }
 *
 * Always returns 200 on a valid-looking email (whether or not we
 * actually have a user with that address) to prevent enumeration.
 */
import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createMagicLinkToken } from '@/app/lib/user-auth'
import { getServerT } from '@/app/lib/i18n/server'
import { backendJson } from '@/app/lib/backend'

const RESEND_API_KEY = process.env.RESEND_API_KEY
const ALERT_FROM = process.env.ALERT_FROM || 'alerts@offsetworks.xyz'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://aeter-eight.vercel.app'
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const email = String(body.email || '').trim().toLowerCase()
  const claimToken = body.claim_token ? String(body.claim_token) : null
  const redirectTo = body.redirect_to ? String(body.redirect_to) : '/me'

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
  }

  if (!resend) {
    return NextResponse.json({ error: 'Email service not configured (RESEND_API_KEY missing)' }, { status: 500 })
  }

  const token = createMagicLinkToken(email, claimToken)
  const safeRedirect = redirectTo.startsWith('/') && !redirectTo.startsWith('//') ? redirectTo : '/me'
  const verifyUrl = `${APP_URL}/api/auth/verify?token=${encodeURIComponent(token)}&redirect_to=${encodeURIComponent(safeRedirect)}`

  // Resolve recipient locale: pinned cookie > recipient's stored preference > Accept-Language
  let recipientLocale: string | null = null
  try {
    const lookup = await backendJson<{ users: Array<{ email: string; preferred_locale?: string }> }>(`/api/v1/admin/users?limit=500`)
    if (lookup.ok && lookup.data?.users) {
      const match = lookup.data.users.find(u => u.email?.toLowerCase() === email)
      if (match?.preferred_locale) recipientLocale = match.preferred_locale
    }
  } catch { /* ignore */ }
  const { t } = await getServerT(recipientLocale)

  try {
    const sendRes = await resend.emails.send({
      from: ALERT_FROM,
      to: email,
      subject: t('emails.signin_subject'),
      html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:24px auto;color:#222">
  <h2 style="margin:0 0 12px">${t('emails.signin_heading')}</h2>
  <p style="margin:0 0 20px;color:#555">${t('emails.signin_body')}</p>
  <p style="margin:0 0 24px"><a href="${verifyUrl}" style="display:inline-block;background:#000;color:#fff;padding:10px 18px;text-decoration:none;border-radius:4px;font-weight:500">${t('emails.signin_cta')}</a></p>
  <p style="margin:0;font-size:12px;color:#888">${t('emails.signin_footer')}</p>
  <p style="margin:8px 0 0;font-size:11px;color:#aaa;word-break:break-all">${verifyUrl}</p>
</div>`,
    })
    if (sendRes.error) {
      console.error('Auth-link Resend rejected:', sendRes.error)
      return NextResponse.json({ error: 'Could not send email' }, { status: 500 })
    }
  } catch (err) {
    console.error('Auth-link Resend threw:', err)
    return NextResponse.json({ error: 'Could not send email' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
