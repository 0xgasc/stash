/**
 * Archive-integrity tests: the 2026-09 corruption wave left ~143 uploads
 * whose volume "original" is the gateway's ~4904-byte HTML error page.
 * Every caller that only asked "does a file exist?" treated those as
 * healthy, so the archive reported 920/921 intact while 143 files were
 * gone. These tests pin the byte-count check that closes that hole.
 *
 * Own temp SQLite DB: DB_PATH is set before db.js is required, and both
 * db.js and utils/originals.js derive <data>/originals from it.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const TMP_DB = path.join(os.tmpdir(), `stash-test-integrity-${process.pid}-${Date.now()}.db`)
process.env.DB_PATH = TMP_DB

const require = createRequire(import.meta.url)
const db = require('../db.js')
const originals = require('../utils/originals.js')

const HTML_SHELL = Buffer.from(
  '<!DOCTYPE html><html data-capo=""><head><meta charset="utf-8">' +
  '<link rel="stylesheet" href="/_nuxt/entry.css"></head><body>error</body></html>'
)

function addUpload(size, uuid = null) {
  const tx = uuid || 'tx'
  const row = db.insertUpload({
    filename: `${size}.bin`,
    content_type: 'application/octet-stream',
    size,
    irys_url: `https://devnet.irys.xyz/${tx}`,
    arweave_id: tx,
    ar_url: `ar://${tx}`,
  })
  return row.uuid
}

describe('getValidOriginalPath', () => {
  it('returns null when there is no local copy at all', () => {
    expect(originals.getValidOriginalPath('no-such-uuid', 100)).toBeNull()
  })

  it('returns the path when the byte count matches the recorded size', () => {
    const uuid = addUpload(1024)
    originals.preserveOriginalFromBuffer(Buffer.alloc(1024, 7), uuid)
    expect(originals.getValidOriginalPath(uuid, 1024)).toBeTruthy()
  })

  it('rejects a local copy whose byte count disagrees — the HTML-shell case', () => {
    const uuid = addUpload(12532)
    originals.preserveOriginalFromBuffer(HTML_SHELL, uuid)

    // The old existence-only check — what backfill and the stats used —
    // says this file is fine. It is not: that is an error page.
    expect(originals.getOriginalPath(uuid)).toBeTruthy()
    expect(originals.getValidOriginalPath(uuid, 12532)).toBeNull()
  })

  it('falls back to an existence check when no size is supplied', () => {
    const uuid = addUpload(64)
    originals.preserveOriginalFromBuffer(Buffer.alloc(64), uuid)
    expect(originals.getValidOriginalPath(uuid)).toBeTruthy()
  })
})

describe('backfill accounting tells the truth', () => {
  const uuids = {}
  let base

  beforeAll(() => {
    // Earlier tests in this file already put rows in the same temp DB, so
    // every assertion is a delta against the baseline rather than an
    // absolute count of the whole archive.
    base = db.getBackfillStats()
    uuids.ok = addUpload(2048)                 // real, byte-correct original
    uuids.corrupt = addUpload(99999)           // volume holds the HTML shell
    uuids.none = addUpload(512)                // no local copy at all
    originals.preserveOriginalFromBuffer(Buffer.alloc(2048, 1), uuids.ok)
    originals.preserveOriginalFromBuffer(HTML_SHELL, uuids.corrupt)
  })

  it('counts a corrupt copy as corrupt, not as a healthy original', () => {
    const stats = db.getBackfillStats()
    expect(stats.withOriginal).toBe(base.withOriginal + 1)
    expect(stats.corrupt).toBe(base.corrupt + 1)
    expect(stats.missing).toBe(base.missing + 1)
    expect(stats.skipped).toBe(base.skipped)
    // The number an operator reads must add up to the archive.
    expect(stats.withOriginal + stats.corrupt + stats.missing + stats.skipped).toBe(stats.total)
  })

  it('hands corrupt rows to the backfill cron so they are re-attempted', () => {
    const pending = db.getUploadsWithoutOriginals({ limit: 100 }).map((r) => r.uuid)
    expect(pending).toContain(uuids.corrupt)
    expect(pending).toContain(uuids.none)
    expect(pending).not.toContain(uuids.ok)
  })

  it('reports corrupt rows as skipped once the cron gives up on them', () => {
    const before = db.getBackfillStats()
    db.markBackfillSkipped(uuids.corrupt)
    const after = db.getBackfillStats()
    expect(after.skipped).toBe(before.skipped + 1)
    expect(after.corrupt).toBe(before.corrupt - 1)
    expect(db.getUploadsWithoutOriginals({ limit: 100 }).map((r) => r.uuid)).not.toContain(uuids.corrupt)
  })

  it('keeps the raw copy on disk — the flag is bookkeeping, not deletion', () => {
    expect(fs.existsSync(originals.getOriginalPath(uuids.corrupt))).toBe(true)
  })
})
