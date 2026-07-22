/**
 * Stash Upload Server
 *
 * Standalone Express server with TUS resumable uploads.
 * Accepts files in 5MB chunks via the TUS protocol, stores them
 * temporarily on disk, then uploads to Irys (Arweave) on completion.
 *
 * Runs separately from the Next.js frontend (Vercel) to bypass
 * Vercel's 4.5MB request body limit.
 */
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const os = require('os');
const fs = require('fs');

const { uploadFileToIrysFromPath } = require('./utils/irysUploader');
const { insertUpload, getUploadById } = require('./db');
const apiRoutes = require('./routes/api');
const { getClientInfo } = require('./utils/clientInfo');
const { scheduleGeoLookup } = require('./utils/geo');
const { startReuploadCron } = require('./cron/reuploadStale');
const { startAlertCron } = require('./cron/alerts');
const { addUploadToFolder, getFolderById, getInboxFolder } = require('./db');
const { isSafeTusId, sanitizeFilename } = require('./utils/sanitize');
const { checkUploadQuota } = require('./utils/quota');
const { preserveOriginal } = require('./utils/originals');

const TRUSTED_HEADER = 'x-admin-secret';
const ADMIN_BACKEND_SECRET = process.env.ADMIN_BACKEND_SECRET;

function trustedUserContext(req) {
  // Only honor user_id/folder_id from requests bearing the admin secret
  // (which means: from the Next.js authenticated proxy, not the browser).
  if (!ADMIN_BACKEND_SECRET || req.headers[TRUSTED_HEADER] !== ADMIN_BACKEND_SECRET) {
    return { user_id: null, folder_id: null };
  }
  const user_id = req.body?.user_id || null;
  const folder_id = req.body?.folder_id ? Number(req.body.folder_id) : null;
  return { user_id, folder_id };
}

function associateAfterInsert(uuid, user_id, folder_id) {
  if (!user_id) return;
  // Use the explicit folder if owned by user; otherwise drop into the user's Inbox.
  let target = null;
  if (folder_id) {
    const f = getFolderById(folder_id);
    if (f && f.user_id === user_id) target = f.id;
  }
  if (!target) {
    const inbox = getInboxFolder(user_id);
    if (inbox) target = inbox.id;
  }
  if (target) addUploadToFolder(uuid, target, 0);
}

const app = express();
const PORT = process.env.PORT || 5050;

// Trust reverse proxy (Railway, Render, etc.) — required for express-rate-limit
app.set('trust proxy', 1);

// =====================================================
// TUS UPLOAD DIRECTORY
// =====================================================
const tusUploadDir = path.join(os.tmpdir(), 'stash-tus-uploads');
if (!fs.existsSync(tusUploadDir)) {
  fs.mkdirSync(tusUploadDir, { recursive: true });
}
console.log(`📁 Tus upload directory: ${tusUploadDir}`);

// Track completed uploads
const completedTusUploads = new Map();

// =====================================================
// TUS SERVER (lazy init — ESM imports)
// =====================================================
let tusServer = null;
let EVENTS = null;

async function initTusServer() {
  if (tusServer) return;

  try {
    const tusServerModule = await import('@tus/server');
    const fileStoreModule = await import('@tus/file-store');

    EVENTS = tusServerModule.EVENTS;

    tusServer = new tusServerModule.Server({
      path: '/tus-upload',
      datastore: new fileStoreModule.FileStore({ directory: tusUploadDir }),
      maxSize: 6 * 1024 * 1024 * 1024, // 6GB
      respectForwardedHeaders: true,
    });

    tusServer.on(EVENTS.POST_FINISH, (req, res, upload) => {
      console.log(`✅ Tus upload complete: ${upload.id}, size: ${upload.size} bytes`);
      completedTusUploads.set(upload.id, {
        filePath: path.join(tusUploadDir, upload.id),
        size: upload.size,
        metadata: upload.metadata,
        completedAt: new Date(),
      });
    });

    tusServer.on(EVENTS.POST_CREATE, (req, res, upload) => {
      console.log(`📤 Tus upload started: ${upload.id}`);
    });

    console.log('✅ Tus server initialized');
  } catch (error) {
    console.error('❌ Failed to initialize Tus server:', error);
    throw error;
  }
}

// =====================================================
// MIDDLEWARE
// =====================================================
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map(s => s.trim());

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: [
    'Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin',
    'Cache-Control', 'Pragma',
    // Auth headers
    'X-API-Key', 'X-Admin-Secret',
    // TUS protocol headers
    'Upload-Length', 'Upload-Offset', 'Tus-Resumable', 'Upload-Metadata',
    'Upload-Defer-Length', 'Upload-Concat', 'X-HTTP-Method-Override',
  ],
  exposedHeaders: [
    'Content-Length', 'Content-Type',
    // TUS protocol response headers
    'Upload-Offset', 'Location', 'Upload-Length', 'Tus-Version',
    'Tus-Resumable', 'Tus-Max-Size', 'Tus-Extension', 'Upload-Metadata',
  ],
}));

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(compression());

// Body parser for the /complete endpoint only (TUS handles its own bodies)
app.use('/tus-upload/complete', express.json());

// Mount API v1 routes
app.use('/api/v1', apiRoutes);
app.use('/api/v1/users', require('./routes/users'));
app.use('/api/v1/me', require('./routes/me'));
app.use('/api/v1/u', require('./routes/public'));
app.use('/api/v1/admin', require('./routes/admin'));
app.use('/api/v1/checkout', require('./routes/checkout'));
app.use('/api/v1/webhook', require('./routes/webhooks'));

// Rate limiting
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: { error: 'Upload limit exceeded, try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  // Without this, the 429 response is sent before our handler runs, which
  // means it ships WITHOUT CORS headers — browsers then surface it as a
  // generic XHR failure (response code n/a) and tus-js-client reports
  // "[object XMLHttpRequestProgressEvent]" instead of a real rate-limit
  // error. Set the same CORS headers we set on success.
  handler: (req, res /*, next, options */) => {
    setTusCorsHeaders(req, res);
    res
      .status(429)
      .json({ error: 'Upload limit exceeded (20/hour). Try again later.' });
  },
});

// =====================================================
// TUS ROUTES
// Must be before generic body parsers
// =====================================================
const TUS_CORS_HEADERS = {
  'Tus-Resumable': '1.0.0',
  'Tus-Version': '1.0.0',
  'Tus-Extension': 'creation,creation-with-upload,termination,concatenation',
  'Tus-Max-Size': String(6 * 1024 * 1024 * 1024),
};

function setTusCorsHeaders(req, res) {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'POST, GET, HEAD, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers',
    'Authorization, Content-Type, Upload-Length, Upload-Offset, Tus-Resumable, Upload-Metadata, Upload-Defer-Length, Upload-Concat, X-HTTP-Method-Override, X-Requested-With');
  res.header('Access-Control-Expose-Headers',
    'Upload-Offset, Location, Upload-Length, Tus-Version, Tus-Resumable, Tus-Max-Size, Tus-Extension, Upload-Metadata, Upload-Defer-Length, Upload-Concat');
  Object.entries(TUS_CORS_HEADERS).forEach(([k, v]) => res.header(k, v));
}

// Base TUS endpoint (POST to create upload)
app.all('/tus-upload', uploadLimiter, async (req, res) => {
  setTusCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);

  try {
    await initTusServer();
    return tusServer.handle(req, res);
  } catch (error) {
    console.error('❌ Tus handler error:', error);
    return res.status(500).json({ error: 'Upload server error' });
  }
});

// Individual upload chunks (PATCH/HEAD/DELETE for /tus-upload/:id)
app.all('/tus-upload/:id', async (req, res, next) => {
  // Skip to completion handler
  if (req.params.id === 'complete') return next();

  setTusCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);

  try {
    await initTusServer();
    return tusServer.handle(req, res);
  } catch (error) {
    console.error('❌ Tus handler error:', error);
    return res.status(500).json({ error: 'Upload server error' });
  }
});

// =====================================================
// TUS COMPLETION — triggers Irys upload
// =====================================================
app.options('/tus-upload/complete', (req, res) => {
  res.sendStatus(204);
});

app.post('/tus-upload/complete', async (req, res) => {
  try {
    const { uploadId } = req.body;

    // uploadId is joined into a filesystem path below — reject anything
    // outside a strict charset (path-traversal hardening).
    if (!isSafeTusId(uploadId)) {
      return res.status(400).json({ error: 'Invalid upload id' });
    }
    const originalFilename = sanitizeFilename(req.body.originalFilename);

    // Authoritative quota check: plan limits for users, IP/day cap for anon.
    const ctxEarly = trustedUserContext(req);
    const clientIp = getClientInfo(req).ip_address;
    const quota = checkUploadQuota(ctxEarly.user_id, clientIp);
    if (!quota.ok) {
      return res.status(429).json({ error: quota.error });
    }

    console.log(`📤 Processing completed tus upload: ${uploadId}`);
    console.log(`   - Original filename: ${originalFilename}`);

    const uploadInfo = completedTusUploads.get(uploadId);
    if (!uploadInfo) {
      // Try to find the file directly on disk (fallback)
      const possiblePath = path.join(tusUploadDir, uploadId);
      if (fs.existsSync(possiblePath)) {
        console.log(`   ⚠️ Upload not in map but found on disk: ${possiblePath}`);
        const stat = fs.statSync(possiblePath);
        // Proceed with file found on disk
        console.log('🚀 Uploading to Irys (from disk fallback)...');
        const result = await uploadFileToIrysFromPath(possiblePath, originalFilename);
        console.log(`✅ Irys upload complete: ${result.url}`);

        // Record in database (with optional user_id from trusted Next.js proxy)
        const ctx = trustedUserContext(req);
        const dbRecord = insertUpload({
          source: req.body.source || 'web',
          filename: result.filename,
          content_type: result.contentType,
          size: result.size || stat.size,
          irys_url: result.url,
          arweave_id: result.id,
          ar_url: result.arUrl,
          price_wei: result.priceWei,
          user_id: ctx.user_id,
          ...getClientInfo(req),
        });
        scheduleGeoLookup(dbRecord.uuid, dbRecord.ip_address);
        associateAfterInsert(dbRecord.uuid, ctx.user_id, ctx.folder_id);

        // Keep the original on the volume so future re-uploads never
        // depend on a possibly-evicted gateway URL.
        preserveOriginal(possiblePath, dbRecord.uuid);
        try {
          const metadataPath = possiblePath + '.json';
          if (fs.existsSync(metadataPath)) fs.unlinkSync(metadataPath);
        } catch { /* non-critical */ }

        const stableUrl = `${req.protocol}://${req.get('host')}/f/${dbRecord.uuid}`;
        return res.json({
          success: true,
          url: result.url,
          stableUrl,
          id: result.id,
          arUrl: result.arUrl,
          size: result.size || stat.size,
          contentType: result.contentType,
          filename: result.filename,
          uuid: dbRecord.uuid,
          reuploadToken: dbRecord.reupload_token,
        });
      }

      // List files in tus directory for debugging
      try {
        const files = fs.readdirSync(tusUploadDir);
        console.log(`   - Files in tus dir: [${files.join(', ')}]`);
      } catch (e) {
        console.log(`   - Could not list tus dir: ${e.message}`);
      }

      console.error(`❌ Upload not found: ${uploadId}`);
      return res.status(404).json({
        error: 'Upload not found. It may have expired or been processed already.',
      });
    }

    console.log(`   - File path: ${uploadInfo.filePath}`);
    console.log(`   - File size: ${uploadInfo.size} bytes`);

    if (!fs.existsSync(uploadInfo.filePath)) {
      console.error(`❌ File not found on disk: ${uploadInfo.filePath}`);
      completedTusUploads.delete(uploadId);
      return res.status(404).json({ error: 'Upload file not found on server' });
    }

    // Upload to Irys
    console.log('🚀 Uploading to Irys...');
    const result = await uploadFileToIrysFromPath(uploadInfo.filePath, originalFilename);
    console.log(`✅ Irys upload complete: ${result.url}`);

    completedTusUploads.delete(uploadId);

    // Record in database (with optional user_id from trusted Next.js proxy)
    const ctx = trustedUserContext(req);
    const dbRecord = insertUpload({
      source: req.body.source || 'web',
      filename: result.filename,
      content_type: result.contentType,
      size: result.size,
      irys_url: result.url,
      arweave_id: result.id,
      ar_url: result.arUrl,
      price_wei: result.priceWei,
      user_id: ctx.user_id,
      ...getClientInfo(req),
    });
    scheduleGeoLookup(dbRecord.uuid, dbRecord.ip_address);
    associateAfterInsert(dbRecord.uuid, ctx.user_id, ctx.folder_id);

    // Keep the original on the volume so future re-uploads never depend
    // on a possibly-evicted gateway URL.
    preserveOriginal(uploadInfo.filePath, dbRecord.uuid);
    try {
      const metadataPath = uploadInfo.filePath + '.json';
      if (fs.existsSync(metadataPath)) fs.unlinkSync(metadataPath);
    } catch { /* non-critical */ }

    const stableUrl = `${req.protocol}://${req.get('host')}/f/${dbRecord.uuid}`;
    res.json({
      success: true,
      url: result.url,
      stableUrl,
      id: result.id,
      arUrl: result.arUrl,
      size: result.size,
      contentType: result.contentType,
      filename: result.filename,
      uuid: dbRecord.uuid,
      reuploadToken: dbRecord.reupload_token,
    });
  } catch (error) {
    console.error('❌ Tus completion error:', error);
    console.error('   Stack:', error.stack);
    res.status(500).json({
      error: 'Failed to process upload',
      ...(process.env.NODE_ENV !== 'production' ? { details: error.message } : {}),
    });
  }
});

// =====================================================
// STABLE PUBLIC REDIRECT
// /f/:uuid → 302 to the gateway URL (chain-first).
// Gateway serves from Arweave/Irys — free, permanent, decentralized.
// Falls back to volume only if no gateway URL exists.
// 302 + no-store so the redirect target can change without stale caches.
// =====================================================
app.get('/f/:uuid', (req, res) => {
  const { uuid } = req.params;
  if (!/^[A-Za-z0-9-]{8,64}$/.test(uuid)) return res.status(400).send('Invalid id');
  const upload = getUploadById(uuid);
  if (!upload) return res.status(404).send('Not found');
  res.set('Access-Control-Allow-Origin', '*');
  if (upload.irys_url) {
    res.set('Cache-Control', 'no-store');
    return res.redirect(302, upload.irys_url);
  }
  const { getOriginalPath } = require('./utils/originals');
  const filePath = getOriginalPath(uuid);
  if (filePath) {
    res.set('Content-Type', upload.content_type || 'application/octet-stream');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    return fs.createReadStream(filePath).pipe(res);
  }
  return res.status(404).send('Not found');
});

// GET /f/:uuid/raw — serve the original file directly from the volume.
// Bypasses the gateway redirect so files load even when devnet is down.
app.get('/f/:uuid/raw', (req, res) => {
  const { uuid } = req.params;
  if (!/^[A-Za-z0-9-]{8,64}$/.test(uuid)) return res.status(400).send('Invalid id');
  const upload = getUploadById(uuid);
  if (!upload) return res.status(404).send('Not found');
  const { getOriginalPath } = require('./utils/originals');
  const filePath = getOriginalPath(uuid);
  if (!filePath) return res.status(404).send('Original not preserved');
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Content-Type', upload.content_type || 'application/octet-stream');
  res.set('Content-Disposition', `inline; filename="${upload.filename || uuid}"`);
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  fs.createReadStream(filePath).pipe(res);
});

// =====================================================
// HEALTH CHECK
// =====================================================
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    tusDir: tusUploadDir,
    pendingUploads: completedTusUploads.size,
  });
});

// =====================================================
// TEMP SWEEP — abandoned TUS uploads
// Entries/files older than 24h whose /complete never arrived are
// dropped so the in-memory map and tmpdir don't grow unboundedly.
// =====================================================
const SWEEP_AGE_MS = 24 * 60 * 60 * 1000;
setInterval(() => {
  const cutoff = Date.now() - SWEEP_AGE_MS;
  let swept = 0;
  for (const [id, info] of completedTusUploads) {
    if (info.completedAt && info.completedAt.getTime() < cutoff) {
      completedTusUploads.delete(id);
      try { fs.unlinkSync(info.filePath); } catch {}
      try { fs.unlinkSync(info.filePath + '.json'); } catch {}
      swept++;
    }
  }
  try {
    for (const f of fs.readdirSync(tusUploadDir)) {
      const p = path.join(tusUploadDir, f);
      try {
        if (fs.statSync(p).mtimeMs < cutoff) { fs.unlinkSync(p); swept++; }
      } catch {}
    }
  } catch {}
  if (swept > 0) console.log(`🧹 Swept ${swept} abandoned TUS artifact(s)`);
}, 60 * 60 * 1000).unref();

// =====================================================
// CRASH SAFETY — log instead of dying on stray async errors
// =====================================================
process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught exception:', err);
  // Exit on truly unknown state; Railway restarts the process.
  process.exit(1);
});

// =====================================================
// START
// =====================================================
app.listen(PORT, () => {
  console.log(`🚀 Stash upload server running on port ${PORT}`);
  console.log(`   Allowed origins: ${allowedOrigins.join(', ')}`);
  startReuploadCron();
  startAlertCron();
});
