/**
 * Auth helpers for server components and route handlers.
 *
 * - `getSessionUser()`  — Supabase auth user from cookies, or null.
 * - `requireUser()`     — same, but redirects to /auth if missing.
 *                         Also returns the SQLite users row (handle, profile prefs).
 *                         Redirects to /me/setup if no handle yet.
 * - `requireAdmin()`    — fast admin check using the existing HMAC cookie
 *                         OR the SQLite users.is_admin flag for logged-in users.
 */
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { backendJson } from '@/app/lib/backend'
import { isAdminAuthenticated } from '@/app/lib/admin-auth'

export interface StashUser {
  id: string
  handle: string | null
  email: string | null
  display_name: string | null
  bio: string | null
  avatar_uuid: string | null
  is_admin: number
  default_theme: string
  default_accent: string
  default_font: string
  default_fx: number
  handle_changed_at: string | null
  created_at: string
  updated_at: string
}

export async function getSessionUser() {
  const supabase = await createServerSupabaseClient()
  if (!supabase) return null
  const { data } = await supabase.auth.getUser()
  return data.user || null
}

/** Look up the SQLite users row for a Supabase user id. Returns null if missing. */
export async function getStashUserById(id: string): Promise<StashUser | null> {
  const res = await backendJson<{ user: StashUser }>(`/api/v1/users/me?user_id=${encodeURIComponent(id)}`)
  if (!res.ok || !res.data) return null
  return res.data.user
}

/**
 * Requires a logged-in user. Returns both the Supabase identity and the SQLite profile.
 * @param opts.requireHandle If true (default), redirects to /me/setup when handle is null.
 */
export async function requireUser(opts: { requireHandle?: boolean } = {}) {
  const requireHandle = opts.requireHandle ?? true
  const sessionUser = await getSessionUser()
  if (!sessionUser) redirect('/auth')

  let stashUser = await getStashUserById(sessionUser.id)

  // If Supabase user exists but SQLite row doesn't (bootstrap missed), create it lazily.
  if (!stashUser) {
    const boot = await backendJson<{ user: StashUser }>('/api/v1/users/bootstrap', {
      method: 'POST',
      body: JSON.stringify({
        id: sessionUser.id,
        email: sessionUser.email,
        display_name: sessionUser.user_metadata?.full_name || sessionUser.user_metadata?.name || null,
      }),
    })
    stashUser = boot.data?.user || null
  }

  if (!stashUser) {
    // Backend unreachable — hard-fail rather than silently leak access.
    throw new Error('Unable to load user profile from backend')
  }

  if (requireHandle && !stashUser.handle) redirect('/me/setup')

  return { sessionUser, stashUser }
}

/** True if the current request is admin (HMAC cookie OR is_admin flag). */
export async function isAdmin(): Promise<boolean> {
  if (await isAdminAuthenticated()) return true
  const sessionUser = await getSessionUser()
  if (!sessionUser) return false
  const stashUser = await getStashUserById(sessionUser.id)
  return !!(stashUser && stashUser.is_admin)
}
