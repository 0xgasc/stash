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

const app = express();
const PORT = process.env.PORT || 5050;

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

// Rate limiting
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: { error: 'Upload limit exceeded, try again later' },
  standardHeaders: true,
  legacyHeaders: false,
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
    const { uploadId, originalFilename } = req.body;

    console.log(`📤 Processing completed tus upload: ${uploadId}`);
    console.log(`   - Original filename: ${originalFilename}`);

    // List all known completed uploads for debugging
    console.log(`   - Known completed uploads: [${[...completedTusUploads.keys()].join(', ')}]`);

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

        // Cleanup
        try {
          fs.unlinkSync(possiblePath);
          const metadataPath = possiblePath + '.json';
          if (fs.existsSync(metadataPath)) fs.unlinkSync(metadataPath);
        } catch (cleanupError) {
          console.error('⚠️ Cleanup failed:', cleanupError.message);
        }

        return res.json({
          success: true,
          url: result.url,
          id: result.id,
          arUrl: result.arUrl,
          size: result.size || stat.size,
          contentType: result.contentType,
          filename: result.filename,
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

    // Cleanup temp files
    try {
      fs.unlinkSync(uploadInfo.filePath);
      const metadataPath = uploadInfo.filePath + '.json';
      if (fs.existsSync(metadataPath)) {
        fs.unlinkSync(metadataPath);
      }
      console.log(`🧹 Cleaned up temp file: ${uploadInfo.filePath}`);
    } catch (cleanupError) {
      console.error('⚠️ Failed to cleanup temp file:', cleanupError);
    }

    completedTusUploads.delete(uploadId);

    res.json({
      success: true,
      url: result.url,
      id: result.id,
      arUrl: result.arUrl,
      size: result.size,
      contentType: result.contentType,
      filename: result.filename,
    });
  } catch (error) {
    console.error('❌ Tus completion error:', error);
    console.error('   Stack:', error.stack);
    res.status(500).json({
      error: 'Failed to process upload',
      details: error.message,
    });
  }
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
// START
// =====================================================
app.listen(PORT, () => {
  console.log(`🚀 Stash upload server running on port ${PORT}`);
  console.log(`   Allowed origins: ${allowedOrigins.join(', ')}`);
});
