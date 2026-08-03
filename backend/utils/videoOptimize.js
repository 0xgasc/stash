const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { getOriginalPath, ORIGINALS_DIR } = require('./originals');
const { uploadFileToIrysFromPath } = require('./irysUploader');
const { db } = require('../db');

const VIDEO_TYPES = new Set([
  'video/mp4', 'video/quicktime', 'video/x-msvideo',
  'video/webm', 'video/x-matroska', 'video/mpeg',
]);

function isVideo(contentType) {
  return VIDEO_TYPES.has(contentType);
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', args, { timeout: 600_000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`ffmpeg failed: ${err.message}\n${stderr}`));
      resolve({ stdout, stderr });
    });
  });
}

async function optimizeVideo(uuid, contentType, filename) {
  const inputPath = getOriginalPath(uuid);
  if (!inputPath) throw new Error('No original on volume');

  const optimizedDir = path.join(ORIGINALS_DIR, '..', 'optimized');
  if (!fs.existsSync(optimizedDir)) fs.mkdirSync(optimizedDir, { recursive: true });
  const outPath = path.join(optimizedDir, `${uuid}.mp4`);

  const stat = fs.statSync(inputPath);
  console.log(`🎬 Optimizing video ${uuid} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);

  // Remux to MP4 with faststart (moves moov atom to front).
  // -c copy = no re-encoding, very fast even for large files.
  // -movflags +faststart = enables progressive playback.
  await runFfmpeg([
    '-i', inputPath,
    '-c', 'copy',
    '-movflags', '+faststart',
    '-y',
    outPath,
  ]);

  const outStat = fs.statSync(outPath);
  console.log(`✅ Optimized ${uuid}: ${(outStat.size / 1024 / 1024).toFixed(1)} MB`);

  return outPath;
}

async function optimizeAndUpload(uuid, contentType, filename) {
  if (!isVideo(contentType)) return null;

  try {
    const outPath = await optimizeVideo(uuid, contentType, filename);
    const result = await uploadFileToIrysFromPath(outPath, filename.replace(/\.[^.]+$/, '.mp4'));

    db.prepare('UPDATE uploads SET stream_url = ? WHERE uuid = ?').run(result.url, uuid);
    console.log(`🎬 Stream URL saved for ${uuid}: ${result.url}`);

    // Clean up optimized temp file
    try { fs.unlinkSync(outPath); } catch {}

    return result.url;
  } catch (err) {
    console.error(`⚠️ Video optimization failed for ${uuid}: ${err.message}`);
    return null;
  }
}

module.exports = { isVideo, optimizeAndUpload };
