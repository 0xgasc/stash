/**
 * /me/folders/[id] — folder editor.
 *
 * Loads folder + its contents + the user's inbox (to allow adding
 * files). Client component handles edits + add/remove.
 */
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { requireUser } from '@/app/lib/auth'
import { backendJson } from '@/app/lib/backend'
import FolderEditor from '@/app/components/FolderEditor'

interface Folder {
  id: number
  user_id: string
  slug: string
  name: string
  description: string | null
  visibility: 'public' | 'unlisted' | 'private'
  default_layout: 'grid' | 'list' | 'timeline'
  accent_color: string | null
  is_inbox: number
}

interface Upload {
  uuid: string
  filename: string
  content_type: string
  size: number
  irys_url: string
  visibility: string
  created_at: string
}

export default async function FolderEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { stashUser } = await requireUser()
  const { id } = await params

  const folderRes = await backendJson<{ folder: Folder }>(
    `/api/v1/me/folders/${id}?user_id=${encodeURIComponent(stashUser.id)}`,
    { cache: 'no-store' }
  )
  if (!folderRes.ok || !folderRes.data) redirect('/me')
  const folder = folderRes.data.folder

  const [inFolderRes, inboxRes] = await Promise.all([
    backendJson<{ uploads: Upload[] }>(
      `/api/v1/me/uploads?user_id=${encodeURIComponent(stashUser.id)}&folder_id=${folder.id}&limit=200`,
      { cache: 'no-store' }
    ),
    backendJson<{ uploads: Upload[] }>(
      `/api/v1/me/uploads?user_id=${encodeURIComponent(stashUser.id)}&limit=200`,
      { cache: 'no-store' }
    ),
  ])

  return (
    <div className="min-h-screen bg-black">
      <header className="container mx-auto px-4 py-6">
        <Link href="/me" className="flex items-center gap-2 text-gray-500 hover:text-white text-sm w-fit">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to my folders
        </Link>
      </header>

      <main className="container mx-auto px-4 py-4 max-w-4xl">
        <FolderEditor
          handle={stashUser.handle!}
          folder={folder}
          filesInFolder={inFolderRes.data?.uploads || []}
          inboxFiles={inboxRes.data?.uploads || []}
        />
      </main>
    </div>
  )
}
