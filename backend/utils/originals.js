/**
 * Durable original storage on the persistent volume.
 *
 * Devnet Irys evicts after ~60 days; the re-upload cron previously had to
 * re-fetch from the (possibly already-dead) gateway URL. Keeping a copy of
 * every original under <data>/originals/<uuid> makes re-uploads
 * self-sufficient: if the gateway is gone, the local copy is the source.
 */
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'stash.db');
const ORIGINALS_DIR = path.join(path.dirname(DB_PATH), 'originals');

function ensureDir() {
  if (!fs.existsSync(ORIGINALS_DIR)) fs.mkdirSync(ORIGINALS_DIR, { recursive: true });
}

/** Move (or copy) an uploaded temp file into durable storage. Best-effort. */
function preserveOriginal(tempPath, uuid) {
  try {
    ensureDir();
    const dest = path.join(ORIGINALS_DIR, uuid);
    try {
      fs.renameSync(tempPath, dest); // same-device fast path
    } catch {
      fs.copyFileSync(tempPath, dest); // cross-device (tmpdir → volume)
      fs.unlinkSync(tempPath);
    }
    return true;
  } catch (err) {
    console.error(`⚠️ Could not preserve original for ${uuid}: ${err.message}`);
    // Fall back to plain cleanup so temp dirs don't grow.
    try { fs.unlinkSync(tempPath); } catch {}
    return false;
  }
}

/** Absolute path of a stored original, or null if we don't have one. */
function getOriginalPath(uuid) {
  const p = path.join(ORIGINALS_DIR, uuid);
  return fs.existsSync(p) ? p : null;
}

/**
 * Absolute path of a stored original that is *the right file*, or null.
 *
 * Existence is not proof. The 2026-09 corruption wave left ~143 uuids whose
 * volume "original" is the gateway's 4904-byte HTML app shell, and every
 * caller that only asked "is there a file?" treated them as healthy — the
 * archive reported 920/921 intact while 143 files were gone. Byte count is
 * the only signal that distinguishes a real file from a gateway error page,
 * so anything that counts, serves, or trusts an original goes through here.
 *
 * `expectedSize` comes from `uploads.size`. Omitting it falls back to a
 * plain existence check, which is only appropriate for callers that are
 * about to validate the bytes themselves.
 */
function getValidOriginalPath(uuid, expectedSize) {
  const p = getOriginalPath(uuid);
  if (!p) return null;
  if (!expectedSize) return p;
  try {
    return fs.statSync(p).size === expectedSize ? p : null;
  } catch {
    return null;
  }
}

/** Save a buffer as the original for a uuid. Used by backfill cron. */
function preserveOriginalFromBuffer(buffer, uuid) {
  ensureDir();
  const dest = path.join(ORIGINALS_DIR, uuid);
  fs.writeFileSync(dest, buffer);
}

const OPTIMIZED_DIR = path.join(path.dirname(DB_PATH), 'optimized');

function getOptimizedPath(uuid) {
  const p = path.join(OPTIMIZED_DIR, `${uuid}.mp4`);
  return fs.existsSync(p) ? p : null;
}

module.exports = { preserveOriginal, preserveOriginalFromBuffer, getOriginalPath, getValidOriginalPath, getOptimizedPath, ORIGINALS_DIR };
