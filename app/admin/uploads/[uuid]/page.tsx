'use client'

import { useState, useEffect, useCallback, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, ArrowLeft, Copy, ExternalLink, RotateCcw, Eye, EyeOff, Clock, Download } from 'lucide-react'

interface Upload {
  uuid: string
  source: string
  filename: string
  content_type: string
  size: number
  description: string | null
  irys_url: string
  arweave_id: string
  ar_url: string
  reupload_count: number
  created_at: string
  ip_address: string | null
  user_agent: string | null
  referer: string | null
  country: string | null
  region: string | null
  city: string | null
  api_key_id: number | null
}

interface LinkRevision {
  id: number
  irys_url: string
  arweave_id: string
  ar_url: string
  reason: string
  price_wei: string | null
  created_at: string
}

const REFRESH_THRESHOLD_DAYS = 15

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function weiToEth(weiStr: string | null): string {
  if (!weiStr || weiStr === '0') return '0'
  try {
    const wei = BigInt(weiStr)
    const whole = wei / BigInt(1e18)
    const frac = (wei % BigInt(1e18)).toString().padStart(18, '0').slice(0, 8)
    return `${whole}.${frac}`
  } catch { return '0' }
}

function isImage(t: string) { return t.startsWith('image/') }
function isVideo(t: string) { return t.startsWith('video/') }
function isAudio(t: string) { return t.startsWith('audio/') }
function isPdf(t: string) { return t === 'application/pdf' }

export default function UploadDetailPage({ params }: { params: Promise<{ uuid: string }> }) {
  const { uuid } = use(params)
  const router = useRouter()

  const [upload, setUpload] = useState<Upload | null>(null)
  const [links, setLinks] = useState<LinkRevision[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showPreview, setShowPreview] = useState(true)
  const [copied, setCopied] = useState<string | null>(null)
  const [reuploading, setReuploading] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [uRes, lRes] = await Promise.all([
        fetch(`/api/admin/uploads/${uuid}`),
        fetch(`/api/admin/uploads/${uuid}/links`),
      ])
      if (uRes.status === 401) { router.push('/admin'); return }
      if (!uRes.ok) {
        const d = await uRes.json()
        setError(d.error || 'Not found')
        return
      }
      const uData = await uRes.json()
      const lData = lRes.ok ? await lRes.json() : { links: [] }
      setUpload(uData.upload)
      setLinks(lData.links || [])
    } catch {
      setError('Connection error')
    } finally {
      setLoading(false)
    }
  }, [uuid, router])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const copy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const triggerReupload = async () => {
    setReuploading(true)
    try {
      const res = await fetch(`/api/admin/uploads/${uuid}`, { method: 'POST' })
      if (res.ok) await fetchAll()
      else {
        const d = await res.json()
        setError(d.error || 'Re-upload failed')
      }
    } finally {
      setReuploading(false)
    }
  }

  if (loading && !upload) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    )
  }

  if (error || !upload) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error || 'Not found'}</p>
          <Link href="/admin" className="text-gray-500 hover:text-white text-sm">Back to admin</Link>
        </div>
      </div>
    )
  }

  const latestLinkAt = links[0]?.created_at || upload.created_at
  const daysSinceLatest = (Date.now() - new Date(latestLinkAt + 'Z').getTime()) / (1000 * 60 * 60 * 24)
  const daysRemaining = REFRESH_THRESHOLD_DAYS - daysSinceLatest
  const expiryColor = daysRemaining < 0 ? 'text-red-400' : daysRemaining < 3 ? 'text-red-400' : daysRemaining < 7 ? 'text-yellow-400' : 'text-green-400'

  const totalCostWei = links.reduce((acc, l) => acc + (l.price_wei ? BigInt(l.price_wei) : BigInt(0)), BigInt(0))
  const previewable = isImage(upload.content_type) || isVideo(upload.content_type) || isAudio(upload.content_type) || isPdf(upload.content_type)

  return (
    <div className="min-h-screen bg-black">
      <header className="container mx-auto px-4 py-6">
        <Link href="/admin" className="flex items-center gap-2 text-gray-500 hover:text-white text-sm w-fit">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to admin
        </Link>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
        {/* Header card */}
        <div className="bg-gray-950 border border-gray-800 p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-medium text-white mb-1 break-all">{upload.filename}</h1>
              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                <span className="font-mono">{upload.uuid}</span>
                <span>{formatBytes(upload.size)}</span>
                <span>{upload.content_type}</span>
                <span className="bg-gray-800 text-gray-300 px-2 py-0.5 rounded font-mono">{upload.source}</span>
                {upload.country && <span>{upload.city ? `${upload.city}, ` : ''}{upload.country}</span>}
              </div>
              {upload.description && <p className="text-gray-400 text-sm mt-3">{upload.description}</p>}
            </div>
            <div className={`text-right text-sm ${expiryColor} flex items-center gap-1.5 whitespace-nowrap`}>
              <Clock className="w-3.5 h-3.5" />
              {daysRemaining < 0 ? `${Math.floor(-daysRemaining)}d overdue` : `${Math.ceil(daysRemaining)}d to refresh`}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <a href={upload.irys_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 bg-white hover:bg-gray-200 text-black px-3 py-1.5 text-xs font-medium">
              <ExternalLink className="w-3 h-3" /> Open current link
            </a>
            <button onClick={() => copy(upload.irys_url, 'main')} className="flex items-center gap-1.5 border border-gray-700 hover:border-gray-600 text-gray-300 hover:text-white px-3 py-1.5 text-xs">
              <Copy className="w-3 h-3" /> {copied === 'main' ? 'Copied' : 'Copy URL'}
            </button>
            <button onClick={triggerReupload} disabled={reuploading} className="flex items-center gap-1.5 border border-gray-700 hover:border-gray-600 text-gray-300 hover:text-white disabled:opacity-50 px-3 py-1.5 text-xs">
              {reuploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
              Force re-upload now
            </button>
            {previewable && (
              <button onClick={() => setShowPreview(v => !v)} className="flex items-center gap-1.5 border border-gray-700 hover:border-gray-600 text-gray-300 hover:text-white px-3 py-1.5 text-xs">
                {showPreview ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                {showPreview ? 'Hide preview' : 'Show preview'}
              </button>
            )}
          </div>
        </div>

        {/* Preview */}
        {previewable && showPreview && (
          <div className="bg-gray-950 border border-gray-800 p-4">
            {isImage(upload.content_type) && (
              <img src={upload.irys_url} alt={upload.filename} className="max-w-full max-h-[600px] mx-auto" />
            )}
            {isVideo(upload.content_type) && (
              <video controls src={upload.irys_url} className="max-w-full max-h-[600px] mx-auto" />
            )}
            {isAudio(upload.content_type) && (
              <audio controls src={upload.irys_url} className="w-full" />
            )}
            {isPdf(upload.content_type) && (
              <iframe src={upload.irys_url} className="w-full h-[700px]" title={upload.filename} />
            )}
          </div>
        )}
        {!previewable && (
          <div className="bg-gray-950 border border-gray-800 p-6 text-center">
            <Download className="w-8 h-8 text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500 text-sm mb-3">No inline preview for {upload.content_type}</p>
            <a href={upload.irys_url} download className="inline-flex items-center gap-1.5 bg-white hover:bg-gray-200 text-black px-4 py-2 text-xs font-medium">
              Download <Download className="w-3 h-3" />
            </a>
          </div>
        )}

        {/* Client info */}
        <div className="bg-gray-950 border border-gray-800 p-5">
          <div className="text-gray-500 text-xs mb-4">Client info</div>
          <div className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-xs">
            <span className="text-gray-600">Uploaded</span><span className="text-gray-300">{new Date(upload.created_at + 'Z').toLocaleString()}</span>
            {upload.ip_address && (<><span className="text-gray-600">IP</span><span className="text-gray-300 font-mono">{upload.ip_address}</span></>)}
            {(upload.country || upload.city || upload.region) && (<><span className="text-gray-600">Geo</span><span className="text-gray-300">{[upload.city, upload.region, upload.country].filter(Boolean).join(', ')}</span></>)}
            {upload.user_agent && (<><span className="text-gray-600">User-Agent</span><span className="text-gray-300 break-all">{upload.user_agent}</span></>)}
            {upload.referer && (<><span className="text-gray-600">Referer</span><span className="text-gray-300 break-all">{upload.referer}</span></>)}
            <span className="text-gray-600">Arweave ID</span><span className="text-gray-300 font-mono break-all">{upload.arweave_id}</span>
            <span className="text-gray-600">Total cost</span><span className="text-gray-300">{weiToEth(totalCostWei.toString())} ETH across {links.length} revision{links.length === 1 ? '' : 's'}</span>
          </div>
        </div>

        {/* Link revisions */}
        <div className="bg-gray-950 border border-gray-800 p-5">
          <div className="text-gray-500 text-xs mb-4">Link revisions ({links.length})</div>
          {links.length === 0 ? (
            <div className="text-gray-600 text-sm">No revisions recorded</div>
          ) : (
            <div className="space-y-2">
              {links.map((rev, idx) => (
                <div key={rev.id} className="flex items-center gap-3 py-2 border-b border-gray-800/50 last:border-0">
                  <span className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded font-mono uppercase whitespace-nowrap">
                    {rev.reason}
                  </span>
                  {idx === 0 && <span className="text-[10px] bg-green-900/40 text-green-400 px-1.5 py-0.5 rounded uppercase">current</span>}
                  <span className="text-gray-500 text-xs whitespace-nowrap">{new Date(rev.created_at + 'Z').toLocaleString()}</span>
                  <a href={rev.irys_url} target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-white truncate flex-1 font-mono text-xs" title={rev.irys_url}>
                    {rev.arweave_id}
                  </a>
                  {rev.price_wei && (
                    <span className="text-gray-600 text-[10px] whitespace-nowrap">{weiToEth(rev.price_wei)} ETH</span>
                  )}
                  <button onClick={() => copy(rev.irys_url, `rev-${rev.id}`)} className="text-gray-600 hover:text-white">
                    <Copy className={`w-3 h-3 ${copied === `rev-${rev.id}` ? 'text-green-400' : ''}`} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
