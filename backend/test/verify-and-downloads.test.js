/**
 * Verify sweep: a network failure is not an eviction. On 2026-10-12 two healthy
 * files were recorded as evicted and re-uploaded because one probe hit "fetch failed".
 *
 * Download log: per-file egress accounting used to trace volume spikes.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { createRequire } from 'module'
import os from 'os'
import path from 'path'

process.env.DB_PATH = path.join(os.tmpdir(), `stash-test-verify-${process.pid}-${Date.now()}.db`)

const require = createRequire(import.meta.url)
const db = require('../db.js')
const { probe } = require('../cron/verifyDevnet.js')

const record = { uuid: 'u1', irys_url: 'https://devnet.irys.xyz/tx', size: 100 }
const ranged = (total) => new Response('x', { status: 206, headers: { 'content-range': `bytes 0-0/${total}` } })

afterEach(() => vi.unstubAllGlobals())

describe('verify probe', () => {
  it('retries a network failure and passes when the retry answers', async () => {
    const fetch = vi.fn()
      .mockRejectedValueOnce(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }))
      .mockResolvedValueOnce(ranged(100))
    vi.stubGlobal('fetch', fetch)
    expect(await probe(record, [0, 0])).toEqual({ ok: true })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('reports transient (not an eviction) when every attempt fails to connect', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    vi.stubGlobal('fetch', fetch)
    const res = await probe(record, [0, 0])
    expect(res.ok).toBe(false)
    expect(res.transient).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('treats 5xx as transient', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })))
    expect((await probe(record, [0])).transient).toBe(true)
  })

  it('flags a 404 as wrong without retrying', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("TX doesn't exist", { status: 404 }))
    vi.stubGlobal('fetch', fetch)
    const res = await probe(record, [0, 0])
    expect(res).toMatchObject({ ok: false, why: 'http 404' })
    expect(res.transient).toBeUndefined()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('flags a size mismatch as wrong without retrying', async () => {
    const fetch = vi.fn().mockResolvedValue(ranged(4904))
    vi.stubGlobal('fetch', fetch)
    const res = await probe(record, [0, 0])
    expect(res.ok).toBe(false)
    expect(res.transient).toBeUndefined()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

describe('download log', () => {
  it('aggregates bytes by file, requester and referer', () => {
    const up = db.insertUpload({
      filename: 'big.mp4', content_type: 'video/mp4', size: 5000, source: 'umo',
      irys_url: 'https://devnet.irys.xyz/a', arweave_id: 'a', ar_url: 'ar://a',
    })
    db.recordDownload({ upload_uuid: up.uuid, route: '/f/:uuid', bytes: 3000, ip_address: '1.1.1.1', referer: 'https://umo-live.xyz/' })
    db.recordDownload({ upload_uuid: up.uuid, route: '/f/:uuid/raw', bytes: 2000, ranged: 1, ip_address: '1.1.1.1' })
    db.recordDownload({ upload_uuid: 'other', route: '/f/:uuid', bytes: 10, ip_address: '2.2.2.2' })

    const s = db.getDownloadStats({ hours: 1 })
    expect(s.requests).toBe(3)
    expect(s.bytes).toBe(5010)
    expect(s.topFiles[0]).toMatchObject({ uuid: up.uuid, filename: 'big.mp4', source: 'umo', requests: 2, bytes: 5000 })
    expect(s.topIps[0]).toMatchObject({ value: '1.1.1.1', bytes: 5000 })
    expect(s.topReferers.find(r => r.value === 'https://umo-live.xyz/').bytes).toBe(3000)
  })

  it('prunes rows older than the retention window', () => {
    expect(db.pruneDownloads({ days: 30 })).toBe(0)
    expect(db.getDownloadStats({ hours: 1 }).requests).toBe(3)
  })
})
