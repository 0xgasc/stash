import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const claimToken = requestUrl.searchParams.get('claim_token')
  const redirectTo = requestUrl.searchParams.get('redirect_to') || '/dashboard'

  if (code) {
    const supabase = await createServerSupabaseClient()
    if (!supabase) {
      return NextResponse.redirect(new URL(redirectTo, requestUrl.origin))
    }
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      // If there's a claim token, associate the file with this user
      if (claimToken) {
        const { error: claimError } = await supabase
          .from('files')
          .update({
            user_id: data.user.id,
            claimed_at: new Date().toISOString()
          })
          .eq('claim_token', claimToken)
          .is('user_id', null)

        if (!claimError) {
          // Update user's storage quota
          const { data: fileData } = await supabase
            .from('files')
            .select('size_bytes')
            .eq('claim_token', claimToken)
            .single()

          if (fileData) {
            await supabase.rpc('increment_storage', {
              p_user_id: data.user.id,
              p_bytes: fileData.size_bytes
            })
          }

          return NextResponse.redirect(
            new URL('/dashboard?claimed=true', requestUrl.origin)
          )
        }
      }
    }
  }

  return NextResponse.redirect(new URL(redirectTo, requestUrl.origin))
}
