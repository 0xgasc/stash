/**
 * Checks the status of a pending Irys fund tx on Sepolia and polls
 * the Irys balance to see if the bundler has credited it yet.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env.local') });

async function rpc(method, params) {
  const res = await fetch(process.env.SEPOLIA_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
  });
  const data = await res.json();
  if (data.error) throw new Error(JSON.stringify(data.error));
  return data.result;
}

async function main() {
  const txId = process.argv[2];
  if (!txId) { console.error('Usage: node check-fund-tx.js <txId>'); process.exit(1); }

  const { Uploader } = await import('@irys/upload');
  const { Ethereum } = await import('@irys/upload-ethereum');

  const key = process.env.PRIVATE_KEY.trim().replace(/^0x/i, '');
  const uploader = await Uploader(Ethereum).withWallet(key).withRpc(process.env.SEPOLIA_RPC).devnet();

  const [tx, receipt, irysBalance, walletWei] = await Promise.all([
    rpc('eth_getTransactionByHash', [txId]),
    rpc('eth_getTransactionReceipt', [txId]),
    uploader.getBalance(),
    rpc('eth_getBalance', [uploader.address, 'latest']),
  ]);

  console.log(`Wallet: ${uploader.address}`);
  console.log(`Tx exists on-chain: ${tx ? 'yes' : 'no'}`);
  if (tx) {
    console.log(`  blockNumber: ${tx.blockNumber || '(pending)'}`);
    console.log(`  to:          ${tx.to}`);
    console.log(`  value:       ${BigInt(tx.value).toString()} wei`);
  }
  console.log(`Tx receipt status: ${receipt ? receipt.status : '(none yet)'}`);
  console.log(`Irys balance:   ${irysBalance.toString()} wei`);
  console.log(`Sepolia wallet: ${BigInt(walletWei).toString()} wei`);
}

main().catch(e => { console.error(e); process.exit(1); });
