/**
 * Health-check cron — every hour:
 *  - Sepolia wallet balance below threshold
 *  - Irys devnet credited balance below threshold (auto-funds from Sepolia)
 *  - Last backfill cron crashed
 */
const { Wallet } = require('@ethersproject/wallet');
const { sendAlert } = require('../utils/alerts');
const { getCronRuns } = require('../db');

const RUN_INTERVAL_MS = 60 * 60 * 1000; // 1h
const FIRST_RUN_DELAY_MS = 90 * 1000;   // 90s after boot

const SEPOLIA_LOW_THRESHOLD_ETH = parseFloat(process.env.SEPOLIA_LOW_THRESHOLD || '0.1');
const IRYS_LOW_THRESHOLD_ETH = parseFloat(process.env.IRYS_LOW_THRESHOLD || '0.005');

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

  // 2. Irys devnet credited balance — auto-fund from Sepolia when low.
  // Without credit, every new upload fails with "Insufficient Irys balance"
  // (this silently hit zero in July 2026 when this check was removed).
  try {
    const irysWei = await fetchIrysBalance();
    if (irysWei !== null) {
      const eth = parseFloat(weiToEth(irysWei));
      if (eth < IRYS_LOW_THRESHOLD_ETH) {
        const FUND_AMOUNT_ETH = parseFloat(process.env.IRYS_AUTO_FUND_AMOUNT || '0.1');
        console.log(`⚠️  Irys low: ${weiToEth(irysWei)} ETH < ${IRYS_LOW_THRESHOLD_ETH} — auto-funding ${FUND_AMOUNT_ETH} ETH...`);
        try {
          const { Uploader } = await import('@irys/upload');
          const { Ethereum } = await import('@irys/upload-ethereum');
          const key = process.env.PRIVATE_KEY.trim().replace(/^0x/i, '');
          const uploader = await Uploader(Ethereum).withWallet(key).withRpc(process.env.SEPOLIA_RPC).devnet();
          const [whole, frac = ''] = FUND_AMOUNT_ETH.toString().split('.');
          const amountWei = (BigInt(whole) * BigInt(1e18) + BigInt((frac + '0'.repeat(18)).slice(0, 18))).toString();
          const receipt = await uploader.fund(amountWei);
          console.log(`✅ Auto-funded Irys. Tx: ${receipt.id}`);
          await sendAlert({
            key: `irys-autofund-${receipt.id.slice(0, 8)}`,
            subject: `[stash] ✅ Irys devnet auto-funded: ${FUND_AMOUNT_ETH} ETH`,
            html: `<p>Irys devnet balance was ${weiToEth(irysWei)} ETH; auto-funded <strong>${FUND_AMOUNT_ETH} ETH</strong> from Sepolia. Tx: <code>${receipt.id}</code></p>`,
          });
        } catch (fundErr) {
          console.error('❌ Auto-fund failed:', fundErr.message);
          await sendAlert({
            key: 'irys-autofund-fail',
            subject: `[stash] ❌ Irys devnet low AND auto-fund failed`,
            html: `<p>Irys devnet balance is ${weiToEth(irysWei)} ETH (below ${IRYS_LOW_THRESHOLD_ETH}) and auto-fund failed: <code>${fundErr.message}</code></p>
<p>New uploads will fail until funded. Run: <code>node backend/scripts/fund-irys.js 0.1</code></p>`,
          });
        }
      }
    }
  } catch (e) {
    console.error('Alert check (irys) failed:', e.message);
  }

  // 3. Cron health — only alert on crashes, not expected failures
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
  console.log(`🚨 Alert cron scheduled — every 1h (sepolia<${SEPOLIA_LOW_THRESHOLD_ETH}, irys<${IRYS_LOW_THRESHOLD_ETH} w/ auto-fund, cron health)`);
  setTimeout(() => {
    runOnce().catch((err) => console.error('Alert cron error:', err));
    setInterval(() => {
      runOnce().catch((err) => console.error('Alert cron error:', err));
    }, RUN_INTERVAL_MS);
  }, FIRST_RUN_DELAY_MS);
}

module.exports = { startAlertCron, runOnce };
