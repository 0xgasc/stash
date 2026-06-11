/**
 * Re-uploads a previously stored file to Irys by fetching its current
 * gateway URL (or arweave.net fallback) and pushing it back to a fresh
 * Irys transaction. Used by the manual re-upload flows and the
 * scheduled stale-content cron.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { uploadFileToIrysFromPath } = require('./irysUploader');
const { getOriginalPath } = require('./originals');

async function reuploadFromExisting(record) {
  // Prefer the locally preserved original — it can't be evicted and
  // costs no bandwidth. Gateway fetch is the legacy fallback for files
  // uploaded before originals were preserved.
  const localPath = getOriginalPath(record.uuid);
  if (localPath) {
    return uploadFileToIrysFromPath(localPath, record.filename);
  }

  const urls = [record.irys_url, `https://arweave.net/${record.arweave_id}`];

  let buffer = null;
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        buffer = Buffer.from(await response.arrayBuffer());
        break;
      }
    } catch (err) {
      console.log(`⚠️ Reupload fetch failed for ${url}: ${err.message}`);
    }
  }

  if (!buffer) {
    throw new Error('Could not fetch original file from any gateway. Provide the file in the request body.');
  }

  const tmpPath = path.join(os.tmpdir(), `stash-reupload-${crypto.randomUUID()}`);
  fs.writeFileSync(tmpPath, buffer);

  try {
    return await uploadFileToIrysFromPath(tmpPath, record.filename);
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
  }
}

module.exports = { reuploadFromExisting };
