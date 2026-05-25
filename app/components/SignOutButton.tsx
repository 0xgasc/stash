'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { createClient } from '@/app/lib/supabase'

export default function SignOutButton() {
  const router = useRouter()
  const supabase = createClient()

  const handleSignOut = async () => {
    if (supabase) await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <button
      onClick={handleSignOut}
      className="flex items-center gap-1 text-gray-500 hover:text-white text-sm"
    >
      <LogOut className="w-3 h-3" />
      Sign out
    </button>
  )
}
