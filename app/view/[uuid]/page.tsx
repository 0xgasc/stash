import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Download, ExternalLink } from 'lucide-react'
import { backendJson } from '@/app/lib/backend'
import NavBar from '@/app/components/NavBar'
import CopyLinkButton from './CopyLinkButton'

interface FileMeta {
  uuid: string
  filename: string
  content_type: string
  size: number
  title: string | null
  caption: string | null
  created_at: string
}

export const revalidate = 60

export async function generateMetadata({ params }: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await params
  const res = await backendJson<FileMeta>(`/f/${uuid}/meta`)
  if (!res.ok || !res.data) return { title: 'Stash' }
  const f = res.data
  const name = f.title || f.filename
  return {
    title: `${name} — Stash`,
    description: `${name} (${formatBytes(f.size)}) — permanent file on Stash`,
    openGraph: {
      title: name,
      description: `${formatBytes(f.size)} ${f.content_type}`,
      ...(f.content_type.startsWith('image/') && {
        images: [{ url: `/f/${f.uuid}` }],
      }),
    },
  }
}

function isImage(t: string) { return t.startsWith('image/') }
function isVideo(t: string) { return t.startsWith('video/') }
function isAudio(t: string) { return t.startsWith('audio/') }
function isPdf(t: string) { return t === 'application/pdf' }

function formatBytes(b: number) {
  if (b === 0) return '0 B'
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(b) / Math.log(k))
  return (b / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i]
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

function fileExtension(ct: string) {
  const sub = ct.split('/')[1]
  if (!sub) return 'file'
  const clean = sub.replace(/^x-/, '').split(';')[0]
  return clean.length > 8 ? clean.slice(0, 8) : clean
}

export default async function ViewPage({
  params,
}: {
  params: Promise<{ uuid: string }>
}) {
  const { uuid } = await params
  if (!/^[A-Za-z0-9-]{8,64}$/.test(uuid)) notFound()

  const res = await backendJson<FileMeta>(`/f/${uuid}/meta`)
  if (!res.ok || !res.data) notFound()
  const f = res.data
  const name = f.title || f.filename
  const srcUrl = `/f/${f.uuid}`

  return (
    <div className="min-h-screen bg-black">
      <NavBar />

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Player area */}
        <div className="border border-gray-800 bg-gray-950 mb-6 overflow-hidden">
          {isImage(f.content_type) ? (
            <div className="flex items-center justify-center p-4 min-h-[200px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={srcUrl}
                alt={name}
                className="max-w-full max-h-[70vh] object-contain"
              />
            </div>
          ) : isVideo(f.content_type) ? (
            <video
              src={srcUrl}
              controls
              autoPlay={false}
              preload="metadata"
              className="w-full max-h-[70vh]"
            />
          ) : isAudio(f.content_type) ? (
            <div className="flex flex-col items-center justify-center p-12 gap-6">
              <div className="w-24 h-24 border border-gray-700 flex items-center justify-center">
                <span className="text-2xl text-accent-cyan font-bold uppercase tracking-widest">
                  {fileExtension(f.content_type)}
                </span>
              </div>
              <audio
                src={srcUrl}
                controls
                preload="metadata"
                className="w-full max-w-md"
              />
            </div>
          ) : isPdf(f.content_type) ? (
            <iframe
              src={srcUrl}
              title={name}
              className="w-full h-[70vh] border-0"
            />
          ) : (
            <div className="flex flex-col items-center justify-center p-16 gap-4">
              <div className="w-24 h-24 border border-gray-700 flex items-center justify-center">
                <span className="text-lg text-gray-500 font-bold uppercase tracking-widest">
                  {fileExtension(f.content_type)}
                </span>
              </div>
              <p className="text-gray-500 text-sm">Preview not available</p>
            </div>
          )}
        </div>

        {/* File info + actions */}
        <div className="border border-gray-800 bg-gray-950 p-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-lg text-white font-bold truncate mb-1">{name}</h1>
              {f.caption && (
                <p className="text-gray-400 text-sm mb-2">{f.caption}</p>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                <span>{formatBytes(f.size)}</span>
                <span>{f.content_type}</span>
                <span>{formatDate(f.created_at)}</span>
              </div>
            </div>

            <div className="flex gap-2 shrink-0">
              <CopyLinkButton uuid={f.uuid} />
              <a
                href={`/f/${f.uuid}/download`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-accent-cyan text-black text-sm font-bold hover:brightness-110 transition-all"
              >
                <Download className="w-4 h-4" />
                Download
              </a>
            </div>
          </div>
        </div>

        <footer className="mt-16 text-center text-xs text-gray-700">
          <Link href="/" className="hover:text-gray-500 inline-flex items-center gap-1">
            powered by Stash <ExternalLink className="w-3 h-3" />
          </Link>
        </footer>
      </main>
    </div>
  )
}
