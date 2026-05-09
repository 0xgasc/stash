/**
 * Request a magic-link login email. Always returns 200 (whether or not
 * the email is allowlisted) to prevent leaking which addresses are admins.
 */
import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createMagicToken, isAllowedEmail } from '@/app/lib/magic-link'

const RESEND_API_KEY = process.env.RESEND_API_KEY
const ALERT_FROM = process.env.ALERT_FROM || 'alerts@traza.dev'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://aeter-eight.vercel.app'

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null

export async function POST(req: NextRequest) {
  let email: string
  try {
    const body = await req.json()
    email = String(body.email || '').trim().toLowerCase()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
  }

  if (!isAllowedEmail(email)) {
    // Lie: pretend we sent it. Don't leak admin allowlist.
    return NextResponse.json({ ok: true })
  }

  if (!resend) {
    return NextResponse.json(
      { error: 'Email service not configured (RESEND_API_KEY missing)' },
      { status: 500 }
    )
  }

  const token = createMagicToken(email)
  const url = `${APP_URL}/api/admin/magic-link/verify?token=${encodeURIComponent(token)}`

  try {
    await resend.emails.send({
      from: ALERT_FROM,
      to: email,
      subject: 'Stash admin login link',
      html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:24px auto;color:#222">
  <h2 style="margin:0 0 12px">Stash admin login</h2>
  <p style="margin:0 0 20px;color:#555">Click the button below to sign in. This link expires in 15 minutes.</p>
  <p style="margin:0 0 24px"><a href="${url}" style="display:inline-block;background:#000;color:#fff;padding:10px 18px;text-decoration:none;border-radius:4px;font-weight:500">Sign in to Stash</a></p>
  <p style="margin:0;font-size:12px;color:#888">If you didn't request this, ignore the email.</p>
  <p style="margin:8px 0 0;font-size:11px;color:#aaa;word-break:break-all">${url}</p>
</div>`,
    })
  } catch (err) {
    console.error('Magic link send failed:', err)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
