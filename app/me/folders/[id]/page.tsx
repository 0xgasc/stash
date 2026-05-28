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
  access_mode: 'open' | 'password' | 'email' | 'password_email'
  has_password?: boolean
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

interface MeResp {
  active_plan: { features_json?: string } | null
}

export default async function FolderEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { stashUser, sessionUser } = await requireUser()
  const { id } = await params

  const [folderRes, inFolderRes, inboxRes, meRes] = await Promise.all([
    backendJson<{ folder: Folder }>(
      `/api/v1/me/folders/${id}?user_id=${encodeURIComponent(stashUser.id)}`,
      { cache: 'no-store' }
    ),
    backendJson<{ uploads: Upload[] }>(
      `/api/v1/me/uploads?user_id=${encodeURIComponent(stashUser.id)}&folder_id=${id}&limit=200`,
      { cache: 'no-store' }
    ),
    backendJson<{ uploads: Upload[] }>(
      `/api/v1/me/uploads?user_id=${encodeURIComponent(stashUser.id)}&limit=200`,
      { cache: 'no-store' }
    ),
    backendJson<MeResp>(
      `/api/v1/users/me?user_id=${encodeURIComponent(sessionUser.id)}`,
      { cache: 'no-store' }
    ),
  ])
  if (!folderRes.ok || !folderRes.data) redirect('/me')
  const folder = folderRes.data.folder

  let features: Record<string, boolean> = {}
  try { features = JSON.parse(meRes.data?.active_plan?.features_json || '{}') } catch { /* ignore */ }

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
          canPasswordLock={!!features.password_lock}
          canEmailShare={!!features.email_sharing}
        />
      </main>
    </div>
  )
}
