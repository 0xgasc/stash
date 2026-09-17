/**
 * Devnet verify sweep.
 *
 * The refresh cron re-uploads on a fixed 20-day clock, which assumes
 * devnet keeps data for ~60 days. Measured retention is a hard cliff at
 * 61–66 days, but Irys guarantees nothing, and the 2026-09 data loss
 * started with copies that went bad well inside that window. Rather than
 * shortening the refresh clock (a full cycle costs ~0.14 ETH — a 7-day
 * cadence would burn 0.6 ETH/month for protection nobody on a stable URL
 * needs), this sweep asks devnet for one byte of every live file once a
 * day and repairs only what actually came back wrong. Costs nothing when
 * nothing is evicted; catches an early eviction within a day.
 *
 * "Wrong" means the reported total length differs from uploads.size —
 * the same check that would have caught the HTML-shell corruption.
 */
const { getLiveUploadsForVerify, updateUploadAfterReupload, recordEviction, startCronRun, finishCronRun } = require('../db');
const { reuploadFromExisting } = require('../utils/reupload');
const { sendAlert } = require('../utils/alerts');

const RUN_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 10 * 60 * 1000;
const CONCURRENCY = 8;
const REPAIR_MAX_PER_RUN = parseInt(process.env.VERIFY_REPAIR_MAX_PER_RUN || '50', 10);

let running = false;

async function probe(record) {
  try {
    const r = await fetch(record.irys_url, { headers: { Range: 'bytes=0-0' }, signal: AbortSignal.timeout(20_000) });
    if (!r.ok && r.status !== 206) return { ok: false, why: `http ${r.status}` };
    const cr = r.headers.get('content-range');
    const total = cr ? Number(cr.split('/')[1]) : Number(r.headers.get('content-length'));
    if (!Number.isFinite(total)) return { ok: false, why: 'no length header' };
    if (total !== record.size) return { ok: false, why: `${total}B on devnet, ${record.size}B expected` };
    return { ok: true };
  } catch (err) {
    return { ok: false, why: err.message };
  }
}

async function runOnce() {
  if (running) {
    console.log('⏭️  Verify sweep skipped — previous run still in flight');
    return;
  }
  running = true;
  const runId = startCronRun('verify-devnet');
  const startedAt = Date.now();
  const bad = [];
  let checked = 0, repaired = 0, repairFailed = 0;
  const errors = [];

  try {
    const live = getLiveUploadsForVerify();
    const queue = [...live];
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        const rec = queue.shift();
        checked++;
        const res = await probe(rec);
        if (!res.ok) bad.push({ rec, why: res.why });
      }
    }));

    if (bad.length === 0) {
          console.log(`🔎 Verify sweep: ${checked} devnet copies checked, all intact`);
        } else {
          console.log(`🔎 Verify sweep: ${bad.length} of ${checked} devnet copies wrong — repairing from archive`);
        }

        // Record every eviction found — this is the retention measurement. The age
        // at detection is the real "how long did devnet actually keep it" number.
        const ageOf = (rec) => {
          const last = rec.last_reuploaded_at || rec.created_at;
          if (!last) return null;
          const t = new Date(String(last).replace(' ', 'T') + 'Z').getTime();
          return Number.isFinite(t) ? Math.max(0, Math.floor((Date.now() - t) / 86400000)) : null;
        };
        for (const { rec } of bad) {
          recordEviction({
            upload_uuid: rec.uuid, source: rec.source, expected_size: rec.size,
            found_size: null, age_days: ageOf(rec), repaired: 0,
          });
        }

        for (const { rec, why } of bad.slice(0, REPAIR_MAX_PER_RUN)) {
          try {
            const result = await reuploadFromExisting(rec);
            updateUploadAfterReupload(rec.uuid, result.url, result.id, 'verify-repair', result.priceWei);
            markEvictionRepaired(rec.uuid);
            repaired++;
        console.log(`🔧 Repaired ${rec.filename} (${rec.uuid}): ${why} → ${result.id}`);
      } catch (err) {
        repairFailed++;
        errors.push(`${rec.filename || rec.uuid}: ${err.message}`);
        console.error(`❌ Repair failed for ${rec.filename || rec.uuid}: ${err.message}`);
        if (/insufficient/i.test(err.message)) {
          errors.push('stopping repairs early: balance exhausted');
          break;
        }
      }
    }

    if (bad.length > 0) {
      await sendAlert({
        key: `verify-repair-${new Date().toISOString().slice(0, 10)}`,
        subject: `[stash] 🔎 ${bad.length} devnet cop${bad.length === 1 ? 'y' : 'ies'} wrong — ${repaired} repaired, ${repairFailed} failed`,
        html: `<p>Daily verify sweep checked ${checked} live files. ${bad.length} came back wrong from devnet.</p>
<ul>${bad.slice(0, 20).map(({ rec, why }) => `<li><code>${rec.uuid}</code> ${rec.filename || ''} — ${why}</li>`).join('')}</ul>
${bad.length > 20 ? `<p>…and ${bad.length - 20} more.</p>` : ''}
<p>Repaired from the archive copy: <strong>${repaired}</strong>. Failed: <strong>${repairFailed}</strong>${repairFailed ? ` — <code>${errors.slice(0, 3).join(' | ')}</code>` : ''}.</p>
<p>If this fires with files younger than 60 days, devnet retention has changed and the refresh cadence should be revisited.</p>`,
      });
    }

    const summary = `checked=${checked} wrong=${bad.length} repaired=${repaired}`;
    finishCronRun(runId, {
      status: repairFailed === 0 ? 'success' : (repaired > 0 ? 'partial' : 'failed'),
      processed: checked, success: checked - bad.length + repaired, failed: repairFailed,
      error: errors.length ? `${summary} | ${errors.slice(0, 4).join(' | ')}` : (bad.length ? summary : null),
    });
  } catch (err) {
    finishCronRun(runId, { status: 'crashed', processed: checked, success: repaired, failed: repairFailed, error: err.message });
    throw err;
  } finally {
    running = false;
    console.log(`🔎 Verify sweep finished in ${Math.round((Date.now() - startedAt) / 1000)}s — checked=${checked} wrong=${bad.length} repaired=${repaired} failed=${repairFailed}`);
  }
}

function startVerifyCron() {
  if (process.env.VERIFY_CRON_DISABLED === '1') {
    console.log('⏸  Verify cron disabled via VERIFY_CRON_DISABLED=1');
    return;
  }
  console.log(`🔎 Verify cron scheduled — daily, one-byte probe of every live devnet copy, repair up to ${REPAIR_MAX_PER_RUN} per run`);
  setTimeout(() => {
    runOnce().catch((err) => console.error('Verify cron run error:', err));
    setInterval(() => {
      runOnce().catch((err) => console.error('Verify cron run error:', err));
    }, RUN_INTERVAL_MS);
  }, FIRST_RUN_DELAY_MS);
}

module.exports = { startVerifyCron, runOnce, RUN_INTERVAL_MS };
