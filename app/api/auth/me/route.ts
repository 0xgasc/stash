import { NextResponse } from 'next/server'
import { getSessionUserId } from '@/app/lib/user-auth'
import { getStashUserById } from '@/app/lib/auth'

export async function GET() {
  const userId = await getSessionUserId()
  if (!userId) return NextResponse.json({ user: null }, { status: 401 })
  const stash = await getStashUserById(userId)
  if (!stash) return NextResponse.json({ user: null }, { status: 401 })
  return NextResponse.json({
    user: { id: stash.id, email: stash.email, handle: stash.handle, display_name: stash.display_name },
  })
}
