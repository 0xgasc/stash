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
import { backendJson } from '@/app/lib/backend'
import { isAdminAuthenticated } from '@/app/lib/admin-auth'
import { getSessionUserId } from '@/app/lib/user-auth'

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
  preferred_locale: string
  handle_changed_at: string | null
  created_at: string
  updated_at: string
}

/**
 * Returns the Supabase-style "session user" — but with our own session
 * cookie now, not Supabase. The shape `{ id, email }` is preserved so
 * call sites don't break.
 */
export async function getSessionUser(): Promise<{ id: string; email: string | null } | null> {
  const userId = await getSessionUserId()
  if (!userId) return null
  const stash = await getStashUserById(userId)
  if (!stash) return null
  return { id: stash.id, email: stash.email }
}

/** Look up the SQLite users row by internal id. Returns null if missing. */
export async function getStashUserById(id: string): Promise<StashUser | null> {
  const res = await backendJson<{ user: StashUser }>(`/api/v1/users/me?user_id=${encodeURIComponent(id)}`)
  if (!res.ok || !res.data) return null
  return res.data.user
}

/**
 * Requires a logged-in user. Returns both the session identity and the SQLite profile.
 * @param opts.requireHandle If true (default), redirects to /me/setup when handle is null.
 */
export async function requireUser(opts: { requireHandle?: boolean } = {}) {
  const requireHandle = opts.requireHandle ?? true
  const userId = await getSessionUserId()
  if (!userId) redirect('/auth')

  const stashUser = await getStashUserById(userId)
  if (!stashUser) {
    // Cookie points at a user_id the backend doesn't recognise — likely a
    // stale cookie from a wiped DB. Force re-auth.
    redirect('/auth?magic_error=session_invalid')
  }

  if (requireHandle && !stashUser.handle) redirect('/me/setup')

  const sessionUser = { id: stashUser.id, email: stashUser.email }
  return { sessionUser, stashUser }
}

/** True if the current request is admin (HMAC cookie OR is_admin flag). */
export async function isAdmin(): Promise<boolean> {
  if (await isAdminAuthenticated()) return true
  const userId = await getSessionUserId()
  if (!userId) return false
  const stashUser = await getStashUserById(userId)
  return !!(stashUser && stashUser.is_admin)
}
