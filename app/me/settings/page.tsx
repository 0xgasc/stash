/**
 * /me/settings — profile + display defaults editor.
 *
 * Display name, bio, plus the per-folder defaults (theme/accent/font/fx)
 * the user wants new folders to inherit unless overridden.
 */
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireUser } from '@/app/lib/auth'
import SettingsForm from '@/app/components/SettingsForm'

export default async function SettingsPage() {
  const { stashUser } = await requireUser()

  return (
    <div className="min-h-screen bg-black">
      <header className="container mx-auto px-4 py-6">
        <Link href="/me" className="flex items-center gap-2 text-gray-500 hover:text-white text-sm w-fit">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to dashboard
        </Link>
      </header>
      <main className="container mx-auto px-4 py-4 max-w-2xl">
        <h1 className="text-2xl font-medium text-white mb-1">Settings</h1>
        <p className="text-gray-500 text-sm mb-8">Profile + folder defaults for <span className="font-mono text-gray-400">@{stashUser.handle}</span></p>

        <SettingsForm
          initial={{
            display_name: stashUser.display_name || '',
            bio: stashUser.bio || '',
            default_theme: stashUser.default_theme || 'dark',
            default_accent: stashUser.default_accent || 'cyan',
            default_font: stashUser.default_font || 'mono',
            default_fx: !!stashUser.default_fx,
          }}
          handle={stashUser.handle!}
        />
      </main>
    </div>
  )
}
