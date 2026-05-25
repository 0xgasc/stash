/**
 * /u/[handle]/f/[slug] — public folder page.
 *
 * v1: grid layout, dark theme, accent color from the folder's setting
 * (or owner default). Theme/FX/font customizations land in v2.
 */
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { backendJson } from '@/app/lib/backend'

interface PublicUser {
  handle: string
  display_name: string | null
  default_accent: string
}

interface PublicFolder {
  id: number
  slug: string
  name: string
  description: string | null
  accent_color: string | null
  default_layout: 'grid' | 'list' | 'timeline'
  banner_uuid: string | null
}

interface PublicUpload {
  uuid: string
  filename: string
  content_type: string
  size: number
  irys_url: string
  title: string | null
  caption: string | null
  created_at: string
}

const ACCENT_HEX: Record<string, string> = {
  cyan: '#7dd3c0',
  green: '#86c08e',
  red: '#d47070',
  blue: '#7a9ec2',
  orange: '#c4956a',
}

export const revalidate = 60

export async function generateMetadata({ params }: { params: Promise<{ handle: string; slug: string }> }) {
  const { handle, slug } = await params
  const res = await backendJson<{ user: PublicUser; folder: PublicFolder }>(`/api/v1/u/${handle}/f/${slug}`)
  if (!res.ok || !res.data) return { title: 'Stash' }
  const { user, folder } = res.data
  return {
    title: `${folder.name} — @${user.handle}`,
    description: folder.description || `${user.handle}'s ${folder.name} on Stash`,
  }
}

function isImage(t: string) { return t.startsWith('image/') }
function isVideo(t: string) { return t.startsWith('video/') }
function isAudio(t: string) { return t.startsWith('audio/') }

function formatBytes(b: number) {
  if (b === 0) return '0 B'
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(b) / Math.log(k))
  return (b / Math.pow(k, i)).toFixed(1) + sizes[i]
}

export default async function PublicFolderPage({ params }: { params: Promise<{ handle: string; slug: string }> }) {
  const { handle, slug } = await params
  const res = await backendJson<{ user: PublicUser; folder: PublicFolder; uploads: PublicUpload[] }>(
    `/api/v1/u/${handle}/f/${slug}`,
    { next: { revalidate: 60 } }
  )
  if (!res.ok || !res.data) notFound()
  const { user, folder, uploads } = res.data

  const accentKey = folder.accent_color || user.default_accent || 'cyan'
  const accentHex = ACCENT_HEX[accentKey] || ACCENT_HEX.cyan

  return (
    <div className="min-h-screen bg-black" style={{ ['--accent' as string]: accentHex } as React.CSSProperties}>
      <header className="container mx-auto px-4 py-6">
        <Link href={`/u/${handle}`} className="flex items-center gap-2 text-gray-500 hover:text-white text-sm w-fit">
          <ArrowLeft className="w-3.5 h-3.5" />
          @{user.handle}
        </Link>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="mb-10 border-b border-gray-900 pb-8">
          <h1 className="text-3xl font-medium text-white mb-2" style={{ color: accentHex }}>
            {folder.name}
          </h1>
          {folder.description && (
            <p className="text-gray-400 max-w-2xl mb-3">{folder.description}</p>
          )}
          <p className="text-gray-600 text-sm">
            {uploads.length} {uploads.length === 1 ? 'item' : 'items'}
          </p>
        </div>

        {uploads.length === 0 ? (
          <div className="bg-gray-950 border border-gray-800 p-12 text-center">
            <p className="text-gray-500 text-sm">This folder is empty</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {uploads.map((u) => (
              <a
                key={u.uuid}
                href={u.irys_url}
                target="_blank"
                rel="noopener noreferrer"
                className="group bg-gray-950 border border-gray-800 hover:border-gray-600 aspect-square overflow-hidden relative block transition-all"
              >
                {isImage(u.content_type) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={u.irys_url}
                    alt={u.title || u.filename}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : isVideo(u.content_type) ? (
                  <video src={u.irys_url} className="w-full h-full object-cover" muted preload="metadata" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center">
                    <span className="text-xs text-gray-600 mb-2 font-mono uppercase">
                      {isAudio(u.content_type) ? 'audio' : u.content_type.split('/')[1]?.slice(0, 6) || 'file'}
                    </span>
                    <span className="text-xs text-gray-400 break-all line-clamp-3">{u.title || u.filename}</span>
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="text-xs text-white truncate">{u.title || u.filename}</div>
                  <div className="text-[10px] text-gray-400">{formatBytes(u.size)}</div>
                </div>
              </a>
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
