/**
 * /me/setup — first-login handle picker.
 *
 * Server component verifies the session and redirects out if the user
 * already has a handle. The form is a tiny client island.
 */
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/app/lib/auth'
import HandlePicker from '@/app/components/HandlePicker'

export default async function SetupPage() {
  const { stashUser } = await requireUser({ requireHandle: false })
  if (stashUser.handle) redirect('/me')

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-medium text-white">Pick a handle</h1>
          <p className="text-gray-500 text-sm mt-2">
            Your public archive lives at <span className="font-mono text-gray-300">stash.app/u/your-handle</span>.
            You can change it once every 30 days.
          </p>
        </div>
        <HandlePicker />
        <div className="text-center mt-6">
          <Link href="/" className="text-gray-600 hover:text-gray-400 text-xs">
            ← Skip and go home (you can set this later)
          </Link>
        </div>
      </div>
    </div>
  )
}
