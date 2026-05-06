/**
 * Re-uploads files whose latest Irys link is older than the configured
 * threshold so devnet eviction (~60 days) doesn't break links.
 *
 * Runs once at boot (after a small delay) and then every 6 hours. The
 * SQLite query picks files whose newest upload_links row is past the
 * cutoff, so manually-refreshed files get pushed out of the queue
 * automatically.
 */
const { findStaleUploads, getUploadById, updateUploadAfterReupload } = require('../db');
const { reuploadFromExisting } = require('../utils/reupload');

const RUN_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6h
const FIRST_RUN_DELAY_MS = 60 * 1000;        // 1 min after boot
const STALE_AFTER_DAYS = parseInt(process.env.REUPLOAD_AFTER_DAYS || '50', 10);
const MAX_PER_RUN = parseInt(process.env.REUPLOAD_MAX_PER_RUN || '10', 10);

let running = false;

async function runOnce() {
  if (running) {
    console.log('⏭️  Re-upload cron skipped — previous run still in flight');
    return;
  }
  running = true;
  const startedAt = Date.now();
  try {
    const stale = findStaleUploads({ olderThanDays: STALE_AFTER_DAYS, limit: MAX_PER_RUN });
    if (stale.length === 0) {
      console.log(`🕓 Re-upload cron: 0 stale uploads (>${STALE_AFTER_DAYS}d)`);
      return;
    }
    console.log(`🕓 Re-upload cron: ${stale.length} stale upload(s) to refresh`);
    for (const { uuid, filename } of stale) {
      const record = getUploadById(uuid);
      if (!record) continue;
      try {
        const result = await reuploadFromExisting(record);
        updateUploadAfterReupload(uuid, result.url, result.id, 'reupload-cron');
        console.log(`✅ Cron re-uploaded ${filename} (${uuid}) → ${result.url}`);
      } catch (err) {
        console.error(`❌ Cron re-upload failed for ${filename} (${uuid}):`, err.message);
      }
    }
  } finally {
    running = false;
    console.log(`🕓 Re-upload cron finished in ${Math.round((Date.now() - startedAt) / 1000)}s`);
  }
}

function startReuploadCron() {
  if (process.env.REUPLOAD_CRON_DISABLED === '1') {
    console.log('⏸  Re-upload cron disabled via REUPLOAD_CRON_DISABLED=1');
    return;
  }
  console.log(`🕓 Re-upload cron scheduled — every 6h, threshold ${STALE_AFTER_DAYS}d, max ${MAX_PER_RUN} per run`);
  setTimeout(() => {
    runOnce().catch((err) => console.error('Re-upload cron run error:', err));
    setInterval(() => {
      runOnce().catch((err) => console.error('Re-upload cron run error:', err));
    }, RUN_INTERVAL_MS);
  }, FIRST_RUN_DELAY_MS);
}

module.exports = { startReuploadCron, runOnce };
