/**
 * Health-check cron — every hour:
 *  - Sepolia wallet balance below threshold
 *  - Last backfill cron crashed
 *  - Backfill progress report (originals coverage)
 */
const { Wallet } = require('@ethersproject/wallet');
const { sendAlert } = require('../utils/alerts');
const { getCronRuns } = require('../db');

const RUN_INTERVAL_MS = 60 * 60 * 1000; // 1h
const FIRST_RUN_DELAY_MS = 90 * 1000;   // 90s after boot

const SEPOLIA_LOW_THRESHOLD_ETH = parseFloat(process.env.SEPOLIA_LOW_THRESHOLD || '0.1');

const SEPOLIA_RPC_FALLBACKS = [
  'https://ethereum-sepolia-rpc.publicnode.com',
  'https://rpc.sepolia.org',
  'https://sepolia.drpc.org',
];

async function fetchSepoliaBalance() {
  if (!process.env.PRIVATE_KEY) return null;
  const key = process.env.PRIVATE_KEY.trim();
  const wallet = new Wallet(key.startsWith('0x') ? key : `0x${key}`);
  const rpcs = [process.env.SEPOLIA_RPC, ...SEPOLIA_RPC_FALLBACKS].filter(Boolean);

  for (const rpc of rpcs) {
    try {
      const res = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getBalance', params: [wallet.address, 'latest'], id: 1 }),
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { throw new Error(`non-JSON response: ${text.slice(0, 80)}`); }
      if (data.error) throw new Error(JSON.stringify(data.error));
      if (data.result) return { wei: BigInt(data.result), address: wallet.address };
    } catch (err) {
      console.error(`Sepolia balance via ${rpc.slice(0, 40)}... failed: ${err.message}`);
    }
  }
  return null;
}

function weiToEth(wei) {
  const whole = wei / BigInt(1e18);
  const frac = (wei % BigInt(1e18)).toString().padStart(18, '0').slice(0, 6);
  return `${whole}.${frac}`;
}

async function runOnce() {
  // 1. Sepolia wallet balance
  try {
    const sepolia = await fetchSepoliaBalance();
    if (sepolia) {
      const eth = parseFloat(weiToEth(sepolia.wei));
      if (eth < SEPOLIA_LOW_THRESHOLD_ETH) {
        await sendAlert({
          key: 'sepolia-low',
          subject: `[stash] Sepolia balance low: ${eth.toFixed(4)} ETH`,
          html: `<p>Wallet <code>${sepolia.address}</code> has <strong>${eth.toFixed(4)} ETH</strong> on Sepolia, below the ${SEPOLIA_LOW_THRESHOLD_ETH} ETH alert threshold.</p>
<p>Top up from a Sepolia faucet to keep funding uploads.</p>`,
        });
      }
    }
  } catch (e) {
    console.error('Alert check (sepolia) failed:', e.message);
  }

  // 2. Cron health — only alert on crashes, not expected failures
  try {
    const runs = getCronRuns({ limit: 1 });
    if (runs.length > 0) {
      const last = runs[0];
      if (last.status === 'crashed') {
        await sendAlert({
          key: `cron-crashed-${last.id}`,
          subject: `[stash] Backfill cron crashed`,
          html: `<p>Last backfill cron run (id=${last.id}, started ${last.started_at}) <strong>crashed</strong>.</p>
<p>Error: <code>${(last.error_summary || '(none)').replace(/</g, '&lt;')}</code></p>`,
        });
      }
    }
  } catch (e) {
    console.error('Alert check (cron health) failed:', e.message);
  }

}

function startAlertCron() {
  if (process.env.ALERT_CRON_DISABLED === '1') {
    console.log('⏸  Alert cron disabled via ALERT_CRON_DISABLED=1');
    return;
  }
  console.log(`🚨 Alert cron scheduled — every 1h (sepolia<${SEPOLIA_LOW_THRESHOLD_ETH}, cron health)`);
  setTimeout(() => {
    runOnce().catch((err) => console.error('Alert cron error:', err));
    setInterval(() => {
      runOnce().catch((err) => console.error('Alert cron error:', err));
    }, RUN_INTERVAL_MS);
  }, FIRST_RUN_DELAY_MS);
}

module.exports = { startAlertCron, runOnce };
