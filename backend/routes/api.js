/**
 * Stash API v1 routes.
 *
 * Programmatic upload, upload history, re-upload, stats, and API key management.
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const os = require('os');
const fs = require('fs');
const rateLimit = require('express-rate-limit');

const {
  insertUpload, getUploads, getUploadById, getUploadByReuploadToken,
  updateUploadAfterReupload, getUploadLinks, getExpiringUploads,
  getCronRuns,
  insertApiKey, getApiKeys, deactivateApiKey, getStats,
} = require('../db');
const { uploadFileToIrysFromPath } = require('../utils/irysUploader');
const { reuploadFromExisting } = require('../utils/reupload');
const { requireApiKey, requireAdminSecret, requireAuth } = require('../middleware/apiAuth');
const { getClientInfo } = require('../utils/clientInfo');
const { scheduleGeoLookup } = require('../utils/geo');

const router = express.Router();

// JSON body parser for non-multipart routes
router.use(express.json());

// Multer for file uploads — store in temp dir
const upload = multer({
  dest: path.join(os.tmpdir(), 'stash-api-uploads'),
  limits: { fileSize: 6 * 1024 * 1024 * 1024 }, // 6GB
});

// Rate limiter for programmatic uploads
const apiUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.apiKey?.name || 'anon',
  message: { error: 'Upload rate limit exceeded, try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { ip: false },
});

// Rate limiter for public re-upload
const reuploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.params.token || 'anon',
  message: { error: 'Re-upload rate limit exceeded, try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { ip: false },
});

// =====================================================
// POST /upload — Programmatic file upload
// =====================================================
router.post('/upload', requireApiKey, apiUploadLimiter, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided. Send as multipart form-data with field name "file"' });
  }

  const filePath = req.file.path;
  const originalFilename = req.file.originalname;
  const source = req.body.source || req.apiKey.name;
  const description = req.body.description || null;

  try {
    console.log(`📤 API upload: ${originalFilename} from ${source}`);

    const result = await uploadFileToIrysFromPath(filePath, originalFilename);

    const record = insertUpload({
      source,
      filename: result.filename,
      content_type: result.contentType,
      size: result.size,
      description,
      irys_url: result.url,
      arweave_id: result.id,
      ar_url: result.arUrl,
      price_wei: result.priceWei,
      api_key_id: req.apiKey.id,
      ...getClientInfo(req),
    });
    scheduleGeoLookup(record.uuid, record.ip_address);

    // Cleanup temp file
    try { fs.unlinkSync(filePath); } catch {}

    console.log(`✅ API upload complete: ${result.url}`);

    res.json({
      success: true,
      upload: {
        uuid: record.uuid,
        filename: record.filename,
        size: record.size,
        content_type: record.content_type,
        source: record.source,
        description: record.description,
        irys_url: record.irys_url,
        arweave_id: record.arweave_id,
        ar_url: record.ar_url,
        reupload_token: record.reupload_token,
        reupload_url: `/api/v1/reupload/${record.reupload_token}`,
        created_at: record.created_at,
      },
    });
  } catch (error) {
    // Cleanup on failure
    try { fs.unlinkSync(filePath); } catch {}
    console.error('❌ API upload error:', error.message);
    res.status(500).json({ error: 'Upload failed', details: error.message });
  }
});

// =====================================================
// GET /uploads — List uploads (paginated)
// =====================================================
router.get('/uploads', requireAuth, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const source = req.query.source || undefined;
  const search = req.query.search || undefined;

  const result = getUploads({ page, limit, source, search });
  res.json(result);
});

// =====================================================
// GET /uploads/:uuid — Single upload detail
// =====================================================
router.get('/uploads/:uuid', requireAuth, (req, res) => {
  const upload = getUploadById(req.params.uuid);
  if (!upload) {
    return res.status(404).json({ error: 'Upload not found' });
  }
  res.json({ upload });
});

// =====================================================
// GET /uploads/:uuid/links — Full link history (admin)
// =====================================================
router.get('/uploads/:uuid/links', requireAuth, (req, res) => {
  const upload = getUploadById(req.params.uuid);
  if (!upload) {
    return res.status(404).json({ error: 'Upload not found' });
  }
  res.json({ links: getUploadLinks(req.params.uuid) });
});

// =====================================================
// POST /uploads/:uuid/reupload — Re-upload (authenticated)
// =====================================================
router.post('/uploads/:uuid/reupload', requireAuth, async (req, res) => {
  const record = getUploadById(req.params.uuid);
  if (!record) {
    return res.status(404).json({ error: 'Upload not found' });
  }

  try {
    const result = await reuploadFromExisting(record);
    const updated = updateUploadAfterReupload(record.uuid, result.url, result.id, 'reupload-admin', result.priceWei);
    res.json({ success: true, upload: updated });
  } catch (error) {
    console.error('❌ Re-upload error:', error.message);
    res.status(500).json({ error: 'Re-upload failed', details: error.message });
  }
});

// =====================================================
// POST /reupload/:token — Re-upload via token (public)
// =====================================================
router.post('/reupload/:token', reuploadLimiter, upload.single('file'), async (req, res) => {
  const record = getUploadByReuploadToken(req.params.token);
  if (!record) {
    return res.status(404).json({ error: 'Invalid re-upload token' });
  }

  try {
    let result;

    // If a file was provided, use it directly
    if (req.file) {
      result = await uploadFileToIrysFromPath(req.file.path, record.filename);
      try { fs.unlinkSync(req.file.path); } catch {}
    } else {
      // Try fetching from existing URL
      result = await reuploadFromExisting(record);
    }

    const updated = updateUploadAfterReupload(record.uuid, result.url, result.id, req.file ? 'reupload-token-file' : 'reupload-token', result.priceWei);
    res.json({ success: true, upload: updated });
  } catch (error) {
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch {}
    }
    console.error('❌ Token re-upload error:', error.message);
    res.status(500).json({ error: 'Re-upload failed', details: error.message });
  }
});

// =====================================================
// GET /stats — Upload statistics
// =====================================================
router.get('/stats', requireAuth, (req, res) => {
  const stats = getStats();
  res.json(stats);
});

// =====================================================
// GET /uploads/expiring — Closest to refresh deadline (admin)
// =====================================================
router.get('/uploads/expiring', requireAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  res.json({ uploads: getExpiringUploads({ limit }) });
});

// =====================================================
// GET /cron/runs — Cron run history (admin)
// =====================================================
router.get('/cron/runs', requireAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  res.json({ runs: getCronRuns({ limit }) });
});

// =====================================================
// POST /uploads/bulk-reupload — Re-upload multiple uploads (admin)
// =====================================================
router.post('/uploads/bulk-reupload', requireAuth, async (req, res) => {
  const uuids = Array.isArray(req.body?.uuids) ? req.body.uuids : [];
  if (uuids.length === 0) return res.status(400).json({ error: 'uuids array required' });
  if (uuids.length > 50) return res.status(400).json({ error: 'max 50 uuids per request' });

  const results = [];
  for (const uuid of uuids) {
    const record = getUploadById(uuid);
    if (!record) { results.push({ uuid, ok: false, error: 'not found' }); continue; }
    try {
      const result = await reuploadFromExisting(record);
      updateUploadAfterReupload(uuid, result.url, result.id, 'reupload-admin', result.priceWei);
      results.push({ uuid, ok: true, irys_url: result.url });
    } catch (err) {
      results.push({ uuid, ok: false, error: err.message });
    }
  }
  res.json({ results });
});

// =====================================================
// API KEY MANAGEMENT (admin only)
// =====================================================
router.post('/api-keys', requireAdminSecret, (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'Name is required' });
  }

  const result = insertApiKey(name.trim());
  res.json({
    success: true,
    api_key: {
      key: result.key, // Full key — shown only once
      name: result.name,
      prefix: result.key_prefix,
    },
  });
});

router.get('/api-keys', requireAdminSecret, (req, res) => {
  const keys = getApiKeys();
  res.json({ api_keys: keys });
});

router.delete('/api-keys/:id', requireAdminSecret, (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid key ID' });
  }
  deactivateApiKey(id);
  res.json({ success: true });
});

module.exports = router;
