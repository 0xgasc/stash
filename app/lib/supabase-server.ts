/**
 * Server-side Supabase client for API routes and server components.
 *
 * Returns null if Supabase env vars are not configured, allowing the
 * app to run in "demo mode" without a database. Handles cookie
 * get/set for Supabase session management.
 */
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const isConfigured =
  supabaseUrl &&
  supabaseKey &&
  supabaseUrl.startsWith('http') &&
  !supabaseUrl.includes('your_supabase')

export async function createServerSupabaseClient() {
  if (!isConfigured) return null

  const cookieStore = await cookies()

  return createServerClient(
    supabaseUrl!,
    supabaseKey!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component - ignore
          }
        },
      },
    }
  )
}
