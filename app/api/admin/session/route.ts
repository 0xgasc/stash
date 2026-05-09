import { NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/app/lib/admin-auth'

export async function GET() {
  const authed = await isAdminAuthenticated()
  return NextResponse.json({ authenticated: authed }, { status: authed ? 200 : 401 })
}
