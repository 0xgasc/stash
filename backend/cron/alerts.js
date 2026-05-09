/**
 * Health-check cron — every hour:
 *  - Sepolia wallet balance below SEPOLIA_LOW_THRESHOLD (default 0.1 ETH)
 *  - Irys devnet balance below IRYS_LOW_THRESHOLD (default 0.005 ETH)
 *  - Last reupload-stale cron crashed/failed
 *  - Any uploads past their refresh deadline (older than threshold + 3d)
 *
 * Each condition has its own dedupe key so the alert mailer's 6h
 * cooldown only suppresses repeats of the same condition.
 */
const { Wallet } = require('@ethersproject/wallet');
const { sendAlert } = require('../utils/alerts');
const { getCronRuns, db } = require('../db');

const RUN_INTERVAL_MS = 60 * 60 * 1000; // 1h
const FIRST_RUN_DELAY_MS = 90 * 1000;   // 90s after boot

const SEPOLIA_LOW_THRESHOLD_ETH = parseFloat(process.env.SEPOLIA_LOW_THRESHOLD || '0.1');
const IRYS_LOW_THRESHOLD_ETH = parseFloat(process.env.IRYS_LOW_THRESHOLD || '0.005');
const REUPLOAD_AFTER_DAYS = parseInt(process.env.REUPLOAD_AFTER_DAYS || '15', 10);
const MISSED_GRACE_DAYS = 3;

async function fetchSepoliaBalance() {
  const rpc = process.env.SEPOLIA_RPC;
  if (!rpc || !process.env.PRIVATE_KEY) return null;
  const key = process.env.PRIVATE_KEY.trim();
  const wallet = new Wallet(key.startsWith('0x') ? key : `0x${key}`);
  const res = await fetch(rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getBalance', params: [wallet.address, 'latest'], id: 1 }),
  });
  const data = await res.json();
  return { wei: BigInt(data.result || '0'), address: wallet.address };
}

async function fetchIrysBalance() {
  if (!process.env.PRIVATE_KEY) return null;
  const key = process.env.PRIVATE_KEY.trim();
  const wallet = new Wallet(key.startsWith('0x') ? key : `0x${key}`);
  const res = await fetch(`https://devnet.irys.xyz/account/balance/ethereum?address=${wallet.address}`);
  const data = await res.json();
  return BigInt(data.balance || '0');
}

function weiToEth(wei) {
  const whole = wei / BigInt(1e18);
  const frac = (wei % BigInt(1e18)).toString().padStart(18, '0').slice(0, 6);
  return `${whole}.${frac}`;
}

async function runOnce() {
  // 1. Wallet balances
  try {
    const sepolia = await fetchSepoliaBalance();
    if (sepolia) {
      const eth = parseFloat(weiToEth(sepolia.wei));
      if (eth < SEPOLIA_LOW_THRESHOLD_ETH) {
        await sendAlert({
          key: 'sepolia-low',
          subject: `[stash] Sepolia balance low: ${eth.toFixed(4)} ETH`,
          html: `<p>Wallet <code>${sepolia.address}</code> has <strong>${eth.toFixed(4)} ETH</strong> on Sepolia, below the ${SEPOLIA_LOW_THRESHOLD_ETH} ETH alert threshold.</p>
<p>Top up from a Sepolia faucet to keep funding Irys uploads.</p>`,
        });
      }
    }
  } catch (e) {
    console.error('Alert check (sepolia) failed:', e.message);
  }

  try {
    const irysWei = await fetchIrysBalance();
    if (irysWei !== null) {
      const eth = parseFloat(weiToEth(irysWei));
      if (eth < IRYS_LOW_THRESHOLD_ETH) {
        await sendAlert({
          key: 'irys-low',
          subject: `[stash] Irys devnet balance low: ${eth.toFixed(6)} ETH`,
          html: `<p>Irys devnet balance is <strong>${eth.toFixed(6)} ETH</strong>, below the ${IRYS_LOW_THRESHOLD_ETH} ETH alert threshold.</p>
<p>Run <code>node backend/scripts/fund-irys.js &lt;amount&gt;</code> from a funded wallet to top up.</p>`,
        });
      }
    }
  } catch (e) {
    console.error('Alert check (irys) failed:', e.message);
  }

  // 2. Cron health
  try {
    const runs = getCronRuns({ limit: 1 });
    if (runs.length > 0) {
      const last = runs[0];
      if (last.status === 'crashed' || last.status === 'failed') {
        await sendAlert({
          key: `cron-${last.status}-${last.id}`,
          subject: `[stash] Re-upload cron ${last.status}`,
          html: `<p>Last re-upload cron run (id=${last.id}, started ${last.started_at}) ended with status <strong>${last.status}</strong>.</p>
<p>Processed ${last.processed_count}, succeeded ${last.success_count}, failed ${last.failed_count}.</p>
<p>Errors: <code>${(last.error_summary || '(none)').replace(/</g, '&lt;')}</code></p>`,
        });
      }
    }
  } catch (e) {
    console.error('Alert check (cron health) failed:', e.message);
  }

  // 3. Missed refresh — uploads past deadline
  try {
    const overdueDays = REUPLOAD_AFTER_DAYS + MISSED_GRACE_DAYS;
    const overdue = db.prepare(`
      SELECT u.uuid, u.filename,
        (SELECT MAX(created_at) FROM upload_links WHERE upload_uuid = u.uuid) AS latest_link_at
      FROM uploads u
      WHERE (
        SELECT MAX(created_at) FROM upload_links WHERE upload_uuid = u.uuid
      ) < datetime('now', '-' || @days || ' days')
      LIMIT 5
    `).all({ days: overdueDays });

    if (overdue.length > 0) {
      const list = overdue.map((r) => `<li><code>${r.filename}</code> — last refreshed ${r.latest_link_at}</li>`).join('');
      await sendAlert({
        key: 'overdue-refresh',
        subject: `[stash] ${overdue.length} upload(s) past refresh deadline (${overdueDays}d)`,
        html: `<p>The following uploads have not been refreshed in over ${overdueDays} days, despite the cron threshold being ${REUPLOAD_AFTER_DAYS} days. The cron may not be keeping up.</p><ul>${list}</ul>`,
      });
    }
  } catch (e) {
    console.error('Alert check (overdue) failed:', e.message);
  }
}

function startAlertCron() {
  if (process.env.ALERT_CRON_DISABLED === '1') {
    console.log('⏸  Alert cron disabled via ALERT_CRON_DISABLED=1');
    return;
  }
  console.log(`🚨 Alert cron scheduled — every 1h (sepolia<${SEPOLIA_LOW_THRESHOLD_ETH}, irys<${IRYS_LOW_THRESHOLD_ETH}, overdue>${REUPLOAD_AFTER_DAYS + MISSED_GRACE_DAYS}d)`);
  setTimeout(() => {
    runOnce().catch((err) => console.error('Alert cron error:', err));
    setInterval(() => {
      runOnce().catch((err) => console.error('Alert cron error:', err));
    }, RUN_INTERVAL_MS);
  }, FIRST_RUN_DELAY_MS);
}

module.exports = { startAlertCron, runOnce };
