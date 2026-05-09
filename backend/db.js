/**
 * SQLite database layer for Stash upload tracking.
 *
 * Auto-creates tables on first run. Uses better-sqlite3 for
 * synchronous, fast access with no external dependencies.
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'stash.db');

// Ensure directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Performance pragmas
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

// =====================================================
// MIGRATIONS
// =====================================================
const currentVersion = db.pragma('user_version', { simple: true });

if (currentVersion < 1) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT UNIQUE NOT NULL,
      source TEXT NOT NULL,
      filename TEXT NOT NULL,
      content_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      description TEXT,
      irys_url TEXT NOT NULL,
      arweave_id TEXT NOT NULL,
      ar_url TEXT NOT NULL,
      reupload_token TEXT UNIQUE NOT NULL,
      api_key_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      reupload_count INTEGER DEFAULT 0,
      last_reuploaded_at TEXT
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      key_hash TEXT UNIQUE NOT NULL,
      key_prefix TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_used_at TEXT,
      is_active INTEGER DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_uploads_source ON uploads(source);
    CREATE INDEX IF NOT EXISTS idx_uploads_created_at ON uploads(created_at);
    CREATE INDEX IF NOT EXISTS idx_uploads_reupload_token ON uploads(reupload_token);
    CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
  `);
  db.pragma('user_version = 1');
  console.log('✅ Database initialized (v1)');
}

if (currentVersion < 2) {
  db.exec(`
    ALTER TABLE uploads ADD COLUMN ip_address TEXT;
    ALTER TABLE uploads ADD COLUMN user_agent TEXT;
    ALTER TABLE uploads ADD COLUMN referer TEXT;
    CREATE INDEX IF NOT EXISTS idx_uploads_ip_address ON uploads(ip_address);
  `);
  db.pragma('user_version = 2');
  console.log('✅ Database migrated to v2 (ip/ua/referer)');
}

if (currentVersion < 3) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS upload_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      upload_uuid TEXT NOT NULL,
      irys_url TEXT NOT NULL,
      arweave_id TEXT NOT NULL,
      ar_url TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT 'initial',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (upload_uuid) REFERENCES uploads(uuid)
    );
    CREATE INDEX IF NOT EXISTS idx_upload_links_upload_uuid ON upload_links(upload_uuid);
    CREATE INDEX IF NOT EXISTS idx_upload_links_created_at ON upload_links(created_at);

    -- Backfill: create an 'initial' link record for every existing upload
    INSERT INTO upload_links (upload_uuid, irys_url, arweave_id, ar_url, reason, created_at)
    SELECT uuid, irys_url, arweave_id, ar_url, 'initial', created_at FROM uploads;
  `);
  db.pragma('user_version = 3');
  console.log('✅ Database migrated to v3 (upload_links history)');
}

if (currentVersion < 4) {
  db.exec(`
    -- Per-revision cost in wei
    ALTER TABLE upload_links ADD COLUMN price_wei TEXT;

    -- Geo enrichment on uploads
    ALTER TABLE uploads ADD COLUMN country TEXT;
    ALTER TABLE uploads ADD COLUMN region TEXT;
    ALTER TABLE uploads ADD COLUMN city TEXT;
    ALTER TABLE uploads ADD COLUMN geo_looked_up_at TEXT;

    CREATE TABLE IF NOT EXISTS cron_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job TEXT NOT NULL,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      processed_count INTEGER DEFAULT 0,
      success_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      error_summary TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_cron_runs_started_at ON cron_runs(started_at);
    CREATE INDEX IF NOT EXISTS idx_cron_runs_job ON cron_runs(job);
  `);
  db.pragma('user_version = 4');
  console.log('✅ Database migrated to v4 (cost, geo, cron_runs)');
}

// =====================================================
// PREPARED STATEMENTS — uploads
// =====================================================
const _insertUpload = db.prepare(`
  INSERT INTO uploads (uuid, source, filename, content_type, size, description, irys_url, arweave_id, ar_url, reupload_token, api_key_id, ip_address, user_agent, referer)
  VALUES (@uuid, @source, @filename, @content_type, @size, @description, @irys_url, @arweave_id, @ar_url, @reupload_token, @api_key_id, @ip_address, @user_agent, @referer)
`);

const _insertUploadLink = db.prepare(`
  INSERT INTO upload_links (upload_uuid, irys_url, arweave_id, ar_url, reason, price_wei)
  VALUES (@upload_uuid, @irys_url, @arweave_id, @ar_url, @reason, @price_wei)
`);

function insertUpload(data) {
  const uuid = crypto.randomUUID();
  const reupload_token = crypto.randomUUID();
  const row = {
    uuid,
    source: data.source || 'web',
    filename: data.filename,
    content_type: data.content_type,
    size: data.size,
    description: data.description || null,
    irys_url: data.irys_url,
    arweave_id: data.arweave_id,
    ar_url: data.ar_url,
    reupload_token,
    api_key_id: data.api_key_id || null,
    ip_address: data.ip_address || null,
    user_agent: data.user_agent || null,
    referer: data.referer || null,
  };
  const tx = db.transaction(() => {
    _insertUpload.run(row);
    _insertUploadLink.run({
      upload_uuid: uuid,
      irys_url: data.irys_url,
      arweave_id: data.arweave_id,
      ar_url: data.ar_url,
      reason: 'initial',
      price_wei: data.price_wei || null,
    });
  });
  tx();
  return { ...row, created_at: new Date().toISOString(), reupload_count: 0 };
}

const _getUploadById = db.prepare('SELECT * FROM uploads WHERE uuid = ?');
function getUploadById(uuid) {
  return _getUploadById.get(uuid) || null;
}

const _getUploadByReuploadToken = db.prepare('SELECT * FROM uploads WHERE reupload_token = ?');
function getUploadByReuploadToken(token) {
  return _getUploadByReuploadToken.get(token) || null;
}

function getUploads({ page = 1, limit = 50, source, search } = {}) {
  limit = Math.min(Math.max(limit, 1), 200);
  const offset = (Math.max(page, 1) - 1) * limit;

  let where = '1=1';
  const params = {};

  if (source) {
    where += ' AND source = @source';
    params.source = source;
  }
  if (search) {
    where += ' AND (filename LIKE @search OR description LIKE @search)';
    params.search = `%${search}%`;
  }

  const total = db.prepare(`SELECT COUNT(*) as count FROM uploads WHERE ${where}`).get(params).count;
  const uploads = db.prepare(
    `SELECT uploads.*, api_keys.name AS api_key_name
     FROM uploads
     LEFT JOIN api_keys ON api_keys.id = uploads.api_key_id
     WHERE ${where} ORDER BY created_at DESC LIMIT @limit OFFSET @offset`
  ).all({ ...params, limit, offset });

  return { uploads, total, page, limit, pages: Math.ceil(total / limit) };
}

const _updateUploadAfterReupload = db.prepare(`
  UPDATE uploads
  SET irys_url = @irys_url, arweave_id = @arweave_id, ar_url = @ar_url,
      reupload_count = reupload_count + 1, last_reuploaded_at = datetime('now'),
      updated_at = datetime('now')
  WHERE uuid = @uuid
`);

function updateUploadAfterReupload(uuid, newIrysUrl, newArweaveId, reason = 'reupload', priceWei = null) {
  const ar_url = `ar://${newArweaveId}`;
  const tx = db.transaction(() => {
    _updateUploadAfterReupload.run({ uuid, irys_url: newIrysUrl, arweave_id: newArweaveId, ar_url });
    _insertUploadLink.run({
      upload_uuid: uuid,
      irys_url: newIrysUrl,
      arweave_id: newArweaveId,
      ar_url,
      reason,
      price_wei: priceWei,
    });
  });
  tx();
  return getUploadById(uuid);
}

const _getUploadLinks = db.prepare(`
  SELECT id, irys_url, arweave_id, ar_url, reason, price_wei, created_at
  FROM upload_links
  WHERE upload_uuid = ?
  ORDER BY created_at DESC, id DESC
`);
function getUploadLinks(uuid) {
  return _getUploadLinks.all(uuid);
}

const _getExpiringUploads = db.prepare(`
  SELECT u.uuid, u.filename, u.size, u.content_type, u.source, u.country, u.city,
         u.created_at, u.reupload_count,
         (SELECT MAX(created_at) FROM upload_links WHERE upload_uuid = u.uuid) AS latest_link_at,
         (SELECT irys_url FROM upload_links WHERE upload_uuid = u.uuid ORDER BY created_at DESC, id DESC LIMIT 1) AS irys_url
  FROM uploads u
  ORDER BY latest_link_at ASC NULLS FIRST
  LIMIT @limit
`);
function getExpiringUploads({ limit = 20 } = {}) {
  return _getExpiringUploads.all({ limit });
}

const _updateGeo = db.prepare(`
  UPDATE uploads SET country = @country, region = @region, city = @city, geo_looked_up_at = datetime('now')
  WHERE uuid = @uuid
`);
function updateGeo(uuid, geo) {
  _updateGeo.run({ uuid, country: geo.country || null, region: geo.region || null, city: geo.city || null });
}

const _findUuidsForIp = db.prepare(`
  SELECT uuid FROM uploads WHERE ip_address = ? AND geo_looked_up_at IS NULL
`);
function findUuidsNeedingGeo(ip) {
  return _findUuidsForIp.all(ip).map(r => r.uuid);
}

const _findCachedGeoForIp = db.prepare(`
  SELECT country, region, city FROM uploads
  WHERE ip_address = ? AND geo_looked_up_at IS NOT NULL
  ORDER BY geo_looked_up_at DESC LIMIT 1
`);
function findCachedGeoForIp(ip) {
  return _findCachedGeoForIp.get(ip) || null;
}

// =====================================================
// CRON RUNS
// =====================================================
const _startCronRun = db.prepare(`
  INSERT INTO cron_runs (job) VALUES (?)
`);
function startCronRun(job) {
  const result = _startCronRun.run(job);
  return result.lastInsertRowid;
}

const _finishCronRun = db.prepare(`
  UPDATE cron_runs
  SET ended_at = datetime('now'), status = @status,
      processed_count = @processed, success_count = @success,
      failed_count = @failed, error_summary = @error
  WHERE id = @id
`);
function finishCronRun(id, { status, processed = 0, success = 0, failed = 0, error = null }) {
  _finishCronRun.run({ id, status, processed, success, failed, error });
}

const _getCronRuns = db.prepare(`
  SELECT * FROM cron_runs ORDER BY started_at DESC LIMIT @limit
`);
function getCronRuns({ limit = 20 } = {}) {
  return _getCronRuns.all({ limit });
}

const _findStaleUploads = db.prepare(`
  SELECT u.uuid, u.filename
  FROM uploads u
  WHERE (
    SELECT MAX(created_at) FROM upload_links WHERE upload_uuid = u.uuid
  ) < datetime('now', @cutoff)
  ORDER BY u.created_at ASC
  LIMIT @limit
`);
function findStaleUploads({ olderThanDays = 50, limit = 25 } = {}) {
  return _findStaleUploads.all({ cutoff: `-${olderThanDays} days`, limit });
}

// =====================================================
// PREPARED STATEMENTS — api_keys
// =====================================================
const _insertApiKey = db.prepare(`
  INSERT INTO api_keys (name, key_hash, key_prefix) VALUES (@name, @key_hash, @key_prefix)
`);

function insertApiKey(name) {
  const raw = 'stash_' + crypto.randomBytes(32).toString('hex');
  const key_hash = crypto.createHash('sha256').update(raw).digest('hex');
  const key_prefix = raw.substring(0, 12);
  _insertApiKey.run({ name, key_hash, key_prefix });
  return { key: raw, name, key_prefix, key_hash };
}

const _findApiKeyByHash = db.prepare('SELECT * FROM api_keys WHERE key_hash = ? AND is_active = 1');
function findApiKeyByHash(hash) {
  return _findApiKeyByHash.get(hash) || null;
}

const _getApiKeys = db.prepare('SELECT id, name, key_prefix, created_at, last_used_at, is_active FROM api_keys ORDER BY created_at DESC');
function getApiKeys() {
  return _getApiKeys.all();
}

const _deactivateApiKey = db.prepare('UPDATE api_keys SET is_active = 0 WHERE id = ?');
function deactivateApiKey(id) {
  return _deactivateApiKey.run(id);
}

const _updateApiKeyLastUsed = db.prepare("UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?");
function updateApiKeyLastUsed(id) {
  _updateApiKeyLastUsed.run(id);
}

// =====================================================
// STATS
// =====================================================
function getStats() {
  const totals = db.prepare('SELECT COUNT(*) as total_uploads, COALESCE(SUM(size), 0) as total_size_bytes FROM uploads').get();
  const bySource = db.prepare('SELECT source, COUNT(*) as count, COALESCE(SUM(size), 0) as total_size FROM uploads GROUP BY source ORDER BY count DESC').all();
  const byContentType = db.prepare(`
    SELECT
      CASE
        WHEN content_type LIKE 'image/%' THEN 'image'
        WHEN content_type LIKE 'video/%' THEN 'video'
        WHEN content_type LIKE 'audio/%' THEN 'audio'
        WHEN content_type LIKE 'text/%' THEN 'text'
        WHEN content_type LIKE 'application/pdf' THEN 'pdf'
        ELSE 'other'
      END AS bucket,
      COUNT(*) as count,
      COALESCE(SUM(size), 0) as total_size
    FROM uploads GROUP BY bucket ORDER BY count DESC
  `).all();
  const recent = db.prepare('SELECT uuid, source, filename, size, irys_url, created_at FROM uploads ORDER BY created_at DESC LIMIT 5').all();
  const byCountry = db.prepare(`
    SELECT country, COUNT(*) as count
    FROM uploads WHERE country IS NOT NULL
    GROUP BY country ORDER BY count DESC LIMIT 10
  `).all();
  const totalCostWei = db.prepare(`
    SELECT COALESCE(SUM(CAST(price_wei AS INTEGER)), 0) AS total_wei,
           COUNT(*) AS revisions_with_cost
    FROM upload_links WHERE price_wei IS NOT NULL
  `).get();
  const dailySeries = db.prepare(`
    SELECT DATE(created_at) AS day, COUNT(*) AS count, COALESCE(SUM(size), 0) AS bytes
    FROM uploads
    WHERE created_at >= datetime('now', '-30 days')
    GROUP BY day ORDER BY day ASC
  `).all();
  const dailyCost = db.prepare(`
    SELECT DATE(created_at) AS day,
           COALESCE(SUM(CAST(price_wei AS INTEGER)), 0) AS wei
    FROM upload_links
    WHERE price_wei IS NOT NULL AND created_at >= datetime('now', '-30 days')
    GROUP BY day ORDER BY day ASC
  `).all();
  const top10 = db.prepare(`
    SELECT uuid, filename, size, content_type, source, created_at
    FROM uploads ORDER BY size DESC LIMIT 10
  `).all();

  return {
    total_uploads: totals.total_uploads,
    total_size_bytes: totals.total_size_bytes,
    total_cost_wei: totalCostWei.total_wei.toString(),
    revisions_with_cost: totalCostWei.revisions_with_cost,
    uploads_by_source: bySource,
    uploads_by_type: byContentType,
    uploads_by_country: byCountry,
    daily_uploads: dailySeries,
    daily_cost_wei: dailyCost,
    largest_uploads: top10,
    recent_uploads: recent,
  };
}

module.exports = {
  db,
  insertUpload,
  getUploads,
  getUploadById,
  getUploadByReuploadToken,
  updateUploadAfterReupload,
  getUploadLinks,
  findStaleUploads,
  getExpiringUploads,
  updateGeo,
  findUuidsNeedingGeo,
  findCachedGeoForIp,
  startCronRun,
  finishCronRun,
  getCronRuns,
  insertApiKey,
  getApiKeys,
  deactivateApiKey,
  findApiKeyByHash,
  updateApiKeyLastUsed,
  getStats,
};
