/**
 * One-off script to fund the Irys devnet balance from the configured
 * Sepolia wallet. Usage: `node backend/scripts/fund-irys.js <amountEth>`.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env.local') });

async function main() {
  const amountEthArg = process.argv[2];
  if (!amountEthArg) {
    console.error('Usage: node fund-irys.js <amountEth>');
    process.exit(1);
  }

  const amountEth = Number(amountEthArg);
  if (!Number.isFinite(amountEth) || amountEth <= 0) {
    console.error(`Invalid amount: ${amountEthArg}`);
    process.exit(1);
  }

  const { Uploader } = await import('@irys/upload');
  const { Ethereum } = await import('@irys/upload-ethereum');

  const privateKey = process.env.PRIVATE_KEY;
  const sepoliaRpc = process.env.SEPOLIA_RPC;
  if (!privateKey) throw new Error('PRIVATE_KEY not configured');
  if (!sepoliaRpc) throw new Error('SEPOLIA_RPC not configured');

  const key = privateKey.trim().replace(/^0x/i, '');
  if (key.length !== 64 || !/^[0-9a-fA-F]+$/.test(key)) {
    throw new Error(`Invalid private key format: length=${key.length}`);
  }

  const uploader = await Uploader(Ethereum)
    .withWallet(key)
    .withRpc(sepoliaRpc)
    .devnet();

  const address = uploader.address;
  console.log(`Wallet: ${address}`);

  const before = await uploader.getBalance();
  console.log(`Irys balance before: ${before.toString()} wei`);

  // Convert ETH → wei as BigInt without floating-point loss.
  const [whole, frac = ''] = amountEth.toString().split('.');
  const fracPadded = (frac + '0'.repeat(18)).slice(0, 18);
  const amountWei = BigInt(whole) * BigInt(1e18) + BigInt(fracPadded);

  console.log(`Funding ${amountEth} ETH (${amountWei.toString()} wei)...`);
  const receipt = await uploader.fund(amountWei);
  console.log(`Fund tx id: ${receipt.id}`);
  console.log(`Quantity:   ${receipt.quantity}`);
  console.log(`Reward:     ${receipt.reward}`);

  const after = await uploader.getBalance();
  console.log(`Irys balance after: ${after.toString()} wei`);
}

main().catch((err) => {
  console.error('Fund failed:', err);
  process.exit(1);
});
