/**
 * Backfill originals cron.
 *
 * Downloads files from arweave.net that don't have a local original on
 * the Railway volume. This ensures /f/:uuid can serve directly from disk
 * even if the Arweave gateway becomes unavailable.
 *
 * Previously this cron re-uploaded to Irys devnet to refresh expiring
 * gateway URLs. Now that we use arweave.net (permanent) and serve from
 * the volume, the job is to backfill local copies for legacy uploads.
 */
const fs = require('fs');
const path = require('path');
const { getUploadsWithoutOriginals, startCronRun, finishCronRun } = require('../db');
const { getOriginalPath, preserveOriginalFromBuffer, ORIGINALS_DIR } = require('../utils/originals');

const RUN_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 2 * 60 * 1000;
const MAX_PER_RUN = parseInt(process.env.REUPLOAD_MAX_PER_RUN || '25', 10);

let running = false;

async function runOnce() {
  if (running) {
    console.log('⏭️  Backfill cron skipped — previous run still in flight');
    return;
  }
  running = true;
  const runId = startCronRun('backfill-originals');
  let processed = 0, success = 0, failed = 0;
  const errors = [];
  const startedAt = Date.now();

  try {
    const missing = getUploadsWithoutOriginals({ limit: MAX_PER_RUN });
    if (missing.length === 0) {
      console.log('🕓 Backfill cron: all uploads have originals');
    } else {
      console.log(`🕓 Backfill cron: ${missing.length} upload(s) missing originals`);
    }

    for (const { uuid, filename, arweave_id, irys_url } of missing) {
      processed++;
      const txId = arweave_id || (irys_url ? irys_url.split('/').pop() : null);
      if (!txId) {
        failed++;
        errors.push(`${filename || uuid}: no arweave_id or irys_url`);
        continue;
      }

      try {
        const url = `https://arweave.net/${txId}`;
        const resp = await fetch(url, { redirect: 'follow' });
        if (!resp.ok) {
          failed++;
          errors.push(`${filename || uuid}: arweave ${resp.status}`);
          console.error(`❌ Backfill ${filename} (${uuid}): HTTP ${resp.status} from arweave.net`);
          continue;
        }

        const contentType = resp.headers.get('content-type') || '';
        if (contentType.includes('text/html') && !filename?.endsWith('.html')) {
          failed++;
          errors.push(`${filename || uuid}: arweave returned HTML (likely not our file)`);
          console.error(`❌ Backfill ${filename} (${uuid}): arweave returned HTML, skipping`);
          continue;
        }

        const buffer = Buffer.from(await resp.arrayBuffer());
        preserveOriginalFromBuffer(buffer, uuid);
        success++;
        console.log(`✅ Backfilled ${filename} (${uuid}) — ${(buffer.length / 1024).toFixed(0)} KB`);
      } catch (err) {
        failed++;
        errors.push(`${filename || uuid}: ${err.message}`);
        console.error(`❌ Backfill failed for ${filename || uuid}: ${err.message}`);
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
    console.log(`🕓 Backfill cron finished in ${Math.round((Date.now() - startedAt) / 1000)}s — ok=${success} fail=${failed}`);
  }
}

function startReuploadCron() {
  if (process.env.REUPLOAD_CRON_DISABLED === '1') {
    console.log('⏸  Backfill cron disabled via REUPLOAD_CRON_DISABLED=1');
    return;
  }
  console.log(`🕓 Backfill cron scheduled — every 6h, max ${MAX_PER_RUN} per run`);
  setTimeout(() => {
    runOnce().catch((err) => console.error('Backfill cron run error:', err));
    setInterval(() => {
      runOnce().catch((err) => console.error('Backfill cron run error:', err));
    }, RUN_INTERVAL_MS);
  }, FIRST_RUN_DELAY_MS);
}

module.exports = { startReuploadCron, runOnce, RUN_INTERVAL_MS };
