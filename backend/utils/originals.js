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

module.exports = { preserveOriginal, getOriginalPath, ORIGINALS_DIR };
