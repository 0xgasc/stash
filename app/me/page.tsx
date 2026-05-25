/**
 * /me — owner dashboard.
 *
 * Shows the user's folders (with Inbox first), a "new folder" button,
 * and a sign-out link. Server-rendered with initial data; folder
 * mutations happen client-side and re-fetch.
 */
import Link from 'next/link'
import { requireUser } from '@/app/lib/auth'
import { backendJson } from '@/app/lib/backend'
import FolderListClient from '@/app/components/FolderListClient'
import SignOutButton from '@/app/components/SignOutButton'

interface Folder {
  id: number
  slug: string
  name: string
  description: string | null
  visibility: 'public' | 'unlisted' | 'private'
  is_inbox: number
  banner_uuid: string | null
  file_count: number
  created_at: string
  updated_at: string
}

export default async function MeDashboard() {
  const { stashUser } = await requireUser()
  const res = await backendJson<{ folders: Folder[] }>(
    `/api/v1/me/folders?user_id=${encodeURIComponent(stashUser.id)}`,
    { cache: 'no-store' }
  )
  const folders = res.data?.folders || []

  return (
    <div className="min-h-screen bg-black">
      <header className="container mx-auto px-4 py-6">
        <nav className="flex justify-between items-center">
          <Link href="/" className="text-xl font-medium text-white">Stash</Link>
          <div className="flex items-center gap-6 text-sm">
            <Link href={`/u/${stashUser.handle}`} className="text-gray-500 hover:text-white">
              View public profile →
            </Link>
            <SignOutButton />
          </div>
        </nav>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-10">
          <h1 className="text-2xl font-medium text-white mb-1">
            Hi <span className="text-accent-cyan">@{stashUser.handle}</span>
          </h1>
          <p className="text-gray-500 text-sm">
            Your archive lives at{' '}
            <Link href={`/u/${stashUser.handle}`} className="text-gray-300 hover:text-white font-mono">
              /u/{stashUser.handle}
            </Link>
          </p>
        </div>

        <FolderListClient initialFolders={folders} />
      </main>
    </div>
  )
}
