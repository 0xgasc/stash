/**
 * Backfill originals cron.
 *
 * Downloads files that don't have a local original on the Railway volume.
 * Tries devnet.irys.xyz first (where most files actually live), then
 * falls back to arweave.net. Saves to the volume so /f/:uuid can serve
 * directly from disk regardless of gateway availability.
 */
const fs = require('fs');
const path = require('path');
const { getUploadsWithoutOriginals, markBackfillSkipped, startCronRun, finishCronRun } = require('../db');
const { getOriginalPath, preserveOriginalFromBuffer, ORIGINALS_DIR } = require('../utils/originals');

const RUN_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 2 * 60 * 1000;
const MAX_PER_RUN = parseInt(process.env.REUPLOAD_MAX_PER_RUN || '50', 10);

const GATEWAYS = [
  'https://devnet.irys.xyz',
  'https://arweave.net',
];

let running = false;

async function tryDownload(txId, filename) {
  for (const gw of GATEWAYS) {
    try {
      const url = `${gw}/${txId}`;
      const resp = await fetch(url, { redirect: 'follow' });
      if (!resp.ok) continue;

      const contentType = resp.headers.get('content-type') || '';
      if (contentType.includes('text/html') && !filename?.endsWith('.html')) continue;

      const buffer = Buffer.from(await resp.arrayBuffer());
      if (buffer.length < 100) continue;

      return { buffer, gateway: gw };
    } catch {
      continue;
    }
  }
  return null;
}

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
        markBackfillSkipped(uuid);
        failed++;
        errors.push(`${filename || uuid}: no tx ID`);
        continue;
      }

      const result = await tryDownload(txId, filename);
      if (result) {
        preserveOriginalFromBuffer(result.buffer, uuid);
        success++;
        console.log(`✅ Backfilled ${filename} (${uuid}) — ${(result.buffer.length / 1024).toFixed(0)} KB via ${result.gateway}`);
      } else {
        markBackfillSkipped(uuid);
        failed++;
        errors.push(`${filename || uuid}: all gateways failed`);
        console.error(`❌ Backfill ${filename} (${uuid}): no gateway returned valid content — marked skipped`);
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
