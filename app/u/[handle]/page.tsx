/**
 * /u/[handle] — public profile + grid of public folders.
 */
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Folder as FolderIcon, ExternalLink } from 'lucide-react'
import { backendJson } from '@/app/lib/backend'

interface PublicUser {
  id: string
  handle: string
  display_name: string | null
  bio: string | null
  avatar_uuid: string | null
  default_theme: string
  default_accent: string
  default_font: string
  default_fx: number
}

interface PublicFolder {
  id: number
  slug: string
  name: string
  description: string | null
  visibility: 'public' | 'unlisted' | 'private'
  banner_uuid: string | null
  accent_color: string | null
  file_count: number
  last_added_at: string | null
}

export const revalidate = 60

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const res = await backendJson<{ user: PublicUser }>(`/api/v1/u/${handle}`)
  if (!res.ok || !res.data) return { title: 'Stash' }
  const u = res.data.user
  return {
    title: `@${u.handle} on Stash`,
    description: u.bio || `${u.display_name || u.handle}'s public archive on Stash`,
  }
}

export default async function PublicProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const res = await backendJson<{ user: PublicUser; folders: PublicFolder[] }>(`/api/v1/u/${handle}`, { next: { revalidate: 60 } })
  if (!res.ok || !res.data) notFound()
  const { user, folders } = res.data

  return (
    <div className="min-h-screen bg-black">
      <header className="container mx-auto px-4 py-6">
        <Link href="/" className="text-xl font-medium text-white">Stash</Link>
      </header>

      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="mb-12">
          <h1 className="text-3xl font-medium text-white mb-2">
            <span className="text-accent-cyan">@{user.handle}</span>
          </h1>
          {user.display_name && (
            <p className="text-gray-300 text-lg mb-2">{user.display_name}</p>
          )}
          {user.bio && (
            <p className="text-gray-400 max-w-2xl">{user.bio}</p>
          )}
        </div>

        <h2 className="text-lg text-gray-400 mb-4">Public folders ({folders.length})</h2>
        {folders.length === 0 ? (
          <div className="bg-gray-950 border border-gray-800 p-12 text-center">
            <FolderIcon className="w-8 h-8 text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No public folders yet</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {folders.map((f) => (
              <Link
                key={f.id}
                href={`/u/${user.handle}/f/${f.slug}`}
                className="bg-gray-950 border border-gray-800 hover:border-gray-700 p-5 block transition-colors"
              >
                <FolderIcon className="w-5 h-5 text-gray-500 mb-3" />
                <h3 className="text-white font-medium mb-1">{f.name}</h3>
                {f.description && <p className="text-gray-500 text-sm mb-3 line-clamp-2">{f.description}</p>}
                <div className="flex items-center gap-3 text-xs text-gray-600">
                  <span>{f.file_count} {f.file_count === 1 ? 'file' : 'files'}</span>
                  <span className="font-mono">/f/{f.slug}</span>
                </div>
              </Link>
            ))}
          </div>
        )}

        <footer className="mt-16 text-center text-xs text-gray-700">
          <Link href="/" className="hover:text-gray-500 inline-flex items-center gap-1">
            powered by Stash <ExternalLink className="w-3 h-3" />
          </Link>
        </footer>
      </main>
    </div>
  )
}
