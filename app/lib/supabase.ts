import { createBrowserClient } from '@supabase/ssr'

// Check if Supabase is configured
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const isSupabaseConfigured =
  supabaseUrl &&
  supabaseKey &&
  supabaseUrl.startsWith('http') &&
  !supabaseUrl.includes('your_supabase')

export function createClient() {
  if (!isSupabaseConfigured) {
    // Return a mock client for demo mode
    return null
  }
  return createBrowserClient(supabaseUrl!, supabaseKey!)
}
