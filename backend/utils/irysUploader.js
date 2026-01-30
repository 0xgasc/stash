/**
 * Irys uploader utility for the Stash upload server.
 *
 * Uploads files to Irys devnet (Arweave) with metadata tags.
 * Supports both buffer-based and file-path-based uploads.
 * Uses Ethereum wallet (Sepolia testnet) for signing.
 */
const fs = require('fs');
const crypto = require('crypto');

const IRYS_DEVNET_URL = 'https://devnet.irys.xyz';

const getContentType = (filename) => {
  const ext = (filename || '').toLowerCase().split('.').pop();
  const types = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'mp4': 'video/mp4',
    'mov': 'video/quicktime',
    'avi': 'video/x-msvideo',
    'webm': 'video/webm',
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'flac': 'audio/flac',
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'txt': 'text/plain',
    'zip': 'application/zip',
  };
  return types[ext] || 'application/octet-stream';
};

/**
 * Initialize an Irys uploader instance.
 * Uses dynamic import since @irys/upload is ESM-only.
 */
async function getIrysUploader() {
  const { Uploader } = await import('@irys/upload');
  const { Ethereum } = await import('@irys/upload-ethereum');

  const privateKey = process.env.PRIVATE_KEY;
  const sepoliaRpc = process.env.SEPOLIA_RPC;

  if (!privateKey) throw new Error('PRIVATE_KEY not configured');
  if (!sepoliaRpc) throw new Error('SEPOLIA_RPC not configured');

  const uploader = await Uploader(Ethereum)
    .withWallet(privateKey)
    .withRpc(sepoliaRpc)
    .devnet();

  return uploader;
}

/**
 * Upload a file from disk to Irys devnet.
 *
 * @param {string} filePath - Absolute path to the file on disk
 * @param {string} filename - Original filename (for metadata tags)
 * @returns {Promise<{url: string, id: string, arUrl: string, size: number, contentType: string, filename: string}>}
 */
async function uploadFileToIrysFromPath(filePath, filename) {
  console.log(`📤 Irys upload starting: ${filename}`);
  const startTime = Date.now();

  const buffer = fs.readFileSync(filePath);
  const contentType = getContentType(filename);
  const hash = crypto.createHash('md5').update(buffer).digest('hex');

  console.log(`   - Size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   - Content-Type: ${contentType}`);
  console.log(`   - MD5: ${hash}`);

  const uploader = await getIrysUploader();

  // Check balance
  const price = await uploader.getPrice(buffer.length);
  const balance = await uploader.getBalance();

  if (BigInt(balance.toString()) < BigInt(price.toString())) {
    throw new Error(
      `Insufficient Irys balance. Need: ${price.toString()} wei, Have: ${balance.toString()} wei`
    );
  }

  console.log(`   - Price: ${price.toString()} wei`);
  console.log(`   - Balance: ${balance.toString()} wei`);

  // Upload with metadata tags
  const receipt = await uploader.upload(buffer, {
    tags: [
      { name: 'Content-Type', value: contentType },
      { name: 'Filename', value: filename },
      { name: 'Original-Size', value: buffer.length.toString() },
      { name: 'Original-MD5', value: hash },
      { name: 'Upload-Timestamp', value: new Date().toISOString() },
      { name: 'Application', value: 'Stash' },
    ],
  });

  const url = `${IRYS_DEVNET_URL}/${receipt.id}`;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`✅ Irys upload complete in ${elapsed}s: ${url}`);

  return {
    url,
    id: receipt.id,
    arUrl: `ar://${receipt.id}`,
    size: buffer.length,
    contentType,
    filename,
  };
}

module.exports = { uploadFileToIrysFromPath, getContentType };
