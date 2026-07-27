/**
 * Devnet refresh cron.
 *
 * Irys devnet keeps data ~60 days with no guarantee. Every file whose
 * latest link is older than REFRESH_AFTER_DAYS (default 20) gets
 * re-uploaded to devnet — from the volume original when present, gateway
 * fetch as legacy fallback — so no transaction ever ages into the
 * eviction window. Each refresh writes a new upload_links row and
 * rewrites uploads.irys_url in place, which is what keeps /f/:uuid
 * stable across cycles.
 *
 * When storage classes ship (see 2026-07-22 spec), scope this to
 * storage_class = 'internal'.
 */
const { findStaleUploads, getUploadById, updateUploadAfterReupload, startCronRun, finishCronRun } = require('../db');
const { reuploadFromExisting } = require('../utils/reupload');

const RUN_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 5 * 60 * 1000;
const REFRESH_AFTER_DAYS = parseInt(process.env.REFRESH_AFTER_DAYS || '20', 10);
const MAX_PER_RUN = parseInt(process.env.REFRESH_MAX_PER_RUN || '50', 10);

let running = false;

async function runOnce() {
  if (running) {
    console.log('⏭️  Refresh cron skipped — previous run still in flight');
    return;
  }
  running = true;
  const runId = startCronRun('refresh-devnet');
  let processed = 0, success = 0, failed = 0;
  const errors = [];
  const startedAt = Date.now();

  try {
    const stale = findStaleUploads({ olderThanDays: REFRESH_AFTER_DAYS, limit: MAX_PER_RUN });
    if (stale.length === 0) {
      console.log(`🔄 Refresh cron: nothing older than ${REFRESH_AFTER_DAYS}d`);
    } else {
      console.log(`🔄 Refresh cron: ${stale.length} upload(s) past ${REFRESH_AFTER_DAYS}d`);
    }

    for (const { uuid, filename } of stale) {
      processed++;
      try {
        const record = getUploadById(uuid);
        if (!record) { failed++; errors.push(`${uuid}: record vanished`); continue; }
        const result = await reuploadFromExisting(record);
        updateUploadAfterReupload(uuid, result.url, result.id, 'refresh-cron', result.priceWei);
        success++;
        console.log(`🔄 Refreshed ${filename} (${uuid}) → ${result.id}`);
      } catch (err) {
        failed++;
        errors.push(`${filename || uuid}: ${err.message}`);
        console.error(`❌ Refresh failed for ${filename || uuid}: ${err.message}`);
        // Insufficient devnet credit fails every remaining file the same
        // way — stop early and let the auto-fund alert cron top up before
        // the next run instead of burning 40+ identical errors.
        if (/insufficient/i.test(err.message)) {
          errors.push('stopping run early: balance exhausted, auto-fund will top up');
          break;
        }
      }
    }

    finishCronRun(runId, {
      status: failed === 0 ? 'success' : (success > 0 ? 'partial' : 'failed'),
      processed, success, failed,
      error: errors.length ? errors.slice(0, 5).join(' | ') : null,
    });
  } catch (err) {
    finishCronRun(runId, { status: 'crashed', processed, success, failed, error: err.message });
    throw err;
  } finally {
    running = false;
    console.log(`🔄 Refresh cron finished in ${Math.round((Date.now() - startedAt) / 1000)}s — ok=${success} fail=${failed}`);
  }
}

function startRefreshCron() {
  if (process.env.REFRESH_CRON_DISABLED === '1') {
    console.log('⏸  Refresh cron disabled via REFRESH_CRON_DISABLED=1');
    return;
  }
  console.log(`🔄 Refresh cron scheduled — every 6h, refresh files older than ${REFRESH_AFTER_DAYS}d, max ${MAX_PER_RUN} per run`);
  setTimeout(() => {
    runOnce().catch((err) => console.error('Refresh cron run error:', err));
    setInterval(() => {
      runOnce().catch((err) => console.error('Refresh cron run error:', err));
    }, RUN_INTERVAL_MS);
  }, FIRST_RUN_DELAY_MS);
}

module.exports = { startRefreshCron, runOnce, RUN_INTERVAL_MS };
