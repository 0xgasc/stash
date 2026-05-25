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

if (currentVersion < 5) {
  db.exec(`
    -- User accounts (id = Supabase auth UUID)
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      handle TEXT UNIQUE COLLATE NOCASE,
      email TEXT,
      display_name TEXT,
      bio TEXT,
      avatar_uuid TEXT,
      is_admin INTEGER DEFAULT 0,
      default_theme TEXT DEFAULT 'dark',
      default_accent TEXT DEFAULT 'cyan',
      default_font TEXT DEFAULT 'mono',
      default_fx INTEGER DEFAULT 1,
      handle_changed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      visibility TEXT CHECK (visibility IN ('public','unlisted','private')) NOT NULL DEFAULT 'private',
      default_layout TEXT CHECK (default_layout IN ('grid','list','timeline')) NOT NULL DEFAULT 'grid',
      theme TEXT,
      accent_color TEXT,
      fx_enabled INTEGER,
      font TEXT,
      banner_uuid TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_inbox INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, slug),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      color TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, slug),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE upload_folders (
      upload_uuid TEXT NOT NULL,
      folder_id INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (upload_uuid, folder_id),
      FOREIGN KEY (upload_uuid) REFERENCES uploads(uuid),
      FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
    );

    CREATE TABLE upload_tags (
      upload_uuid TEXT NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (upload_uuid, tag_id),
      FOREIGN KEY (upload_uuid) REFERENCES uploads(uuid),
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE TABLE reserved_handles (
      handle TEXT PRIMARY KEY COLLATE NOCASE
    );

    INSERT INTO reserved_handles (handle) VALUES
      ('admin'),('api'),('u'),('me'),('auth'),('upload'),('uploads'),('pricing'),
      ('dashboard'),('showcase'),('calculator'),('about'),('terms'),('privacy'),
      ('docs'),('blog'),('settings'),('login'),('signup'),('signout'),('logout'),
      ('signin'),('help'),('support'),('contact'),('billing'),('account'),
      ('legal'),('stash'),('aeter'),('home'),('explore'),('discover'),('trending'),
      ('new'),('top'),('feed'),('search'),('tag'),('tags'),('user'),('users'),
      ('static'),('public'),('assets'),('img'),('image'),('images'),('video'),
      ('audio'),('files'),('robots'),('sitemap'),('favicon'),('manifest'),
      ('reset'),('verify'),('confirm'),('oauth'),('callback'),('null'),('undefined'),
      ('true'),('false'),('app'),('apps'),('site'),('www');

    -- Augment uploads with user/visibility/title/caption/nsfw
    ALTER TABLE uploads ADD COLUMN user_id TEXT;
    ALTER TABLE uploads ADD COLUMN title TEXT;
    ALTER TABLE uploads ADD COLUMN caption TEXT;
    ALTER TABLE uploads ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private';
    ALTER TABLE uploads ADD COLUMN nsfw INTEGER NOT NULL DEFAULT 0;

    CREATE INDEX idx_uploads_user_id ON uploads(user_id);
    CREATE INDEX idx_uploads_visibility ON uploads(visibility);
    CREATE INDEX idx_folders_user_visibility ON folders(user_id, visibility);
    CREATE INDEX idx_folders_user_sort ON folders(user_id, sort_order);
    CREATE INDEX idx_upload_folders_folder ON upload_folders(folder_id, sort_order);
    CREATE INDEX idx_tags_user ON tags(user_id);
    CREATE INDEX idx_users_handle ON users(handle);
  `);
  db.pragma('user_version = 5');
  console.log('✅ Database migrated to v5 (users, folders, tags, junctions)');
}

// =====================================================
// PREPARED STATEMENTS — uploads
// =====================================================
const _insertUpload = db.prepare(`
  INSERT INTO uploads (uuid, source, filename, content_type, size, description, irys_url, arweave_id, ar_url, reupload_token, api_key_id, ip_address, user_agent, referer, user_id, title, caption, visibility)
  VALUES (@uuid, @source, @filename, @content_type, @size, @description, @irys_url, @arweave_id, @ar_url, @reupload_token, @api_key_id, @ip_address, @user_agent, @referer, @user_id, @title, @caption, @visibility)
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
    user_id: data.user_id || null,
    title: data.title || null,
    caption: data.caption || null,
    visibility: data.visibility || 'private',
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

// =====================================================
// USERS
// =====================================================
const _upsertUser = db.prepare(`
  INSERT INTO users (id, email, display_name, updated_at)
  VALUES (@id, @email, @display_name, datetime('now'))
  ON CONFLICT(id) DO UPDATE SET
    email = COALESCE(excluded.email, users.email),
    display_name = COALESCE(excluded.display_name, users.display_name),
    updated_at = datetime('now')
`);
function upsertUser({ id, email = null, display_name = null }) {
  if (!id) throw new Error('upsertUser: id required');
  _upsertUser.run({ id, email, display_name });
  return getUserById(id);
}

const _getUserById = db.prepare('SELECT * FROM users WHERE id = ?');
function getUserById(id) {
  return _getUserById.get(id) || null;
}

const _getUserByHandle = db.prepare('SELECT * FROM users WHERE handle = ? COLLATE NOCASE');
function getUserByHandle(handle) {
  if (!handle) return null;
  return _getUserByHandle.get(handle) || null;
}

const _isReservedHandle = db.prepare('SELECT 1 FROM reserved_handles WHERE handle = ? COLLATE NOCASE');
function isReservedHandle(handle) {
  if (!handle) return true;
  return !!_isReservedHandle.get(handle);
}

const HANDLE_CHANGE_COOLDOWN_DAYS = 30;
const HANDLE_RE = /^[a-z0-9][a-z0-9_-]{1,29}$/i;

const _claimHandle = db.prepare(`
  UPDATE users SET handle = @handle, handle_changed_at = datetime('now'), updated_at = datetime('now')
  WHERE id = @id
`);
function claimHandle(userId, handle) {
  const h = String(handle || '').trim();
  if (!HANDLE_RE.test(h)) return { ok: false, reason: 'invalid_format' };
  if (h.length < 3) return { ok: false, reason: 'too_short' };
  if (isReservedHandle(h)) return { ok: false, reason: 'reserved' };

  const user = getUserById(userId);
  if (!user) return { ok: false, reason: 'no_user' };
  if (user.handle && user.handle_changed_at) {
    const ageMs = Date.now() - new Date(user.handle_changed_at + 'Z').getTime();
    const cooldownMs = HANDLE_CHANGE_COOLDOWN_DAYS * 24 * 3600 * 1000;
    if (ageMs < cooldownMs) {
      const daysLeft = Math.ceil((cooldownMs - ageMs) / (24 * 3600 * 1000));
      return { ok: false, reason: 'cooldown', daysLeft };
    }
  }

  const existing = getUserByHandle(h);
  if (existing && existing.id !== userId) return { ok: false, reason: 'taken' };

  const tx = db.transaction(() => {
    _claimHandle.run({ id: userId, handle: h });
    // Create Inbox folder if user has no folders yet
    const folderCount = db.prepare('SELECT COUNT(*) AS c FROM folders WHERE user_id = ?').get(userId).c;
    if (folderCount === 0) {
      _insertFolder.run({
        user_id: userId,
        slug: 'inbox',
        name: 'Inbox',
        description: null,
        visibility: 'private',
        default_layout: 'grid',
        theme: null,
        accent_color: null,
        fx_enabled: null,
        font: null,
        banner_uuid: null,
        sort_order: 0,
        is_inbox: 1,
      });
    }
  });
  tx();
  return { ok: true, user: getUserById(userId) };
}

const _updateUserProfile = db.prepare(`
  UPDATE users SET
    display_name = COALESCE(@display_name, display_name),
    bio = COALESCE(@bio, bio),
    avatar_uuid = COALESCE(@avatar_uuid, avatar_uuid),
    default_theme = COALESCE(@default_theme, default_theme),
    default_accent = COALESCE(@default_accent, default_accent),
    default_font = COALESCE(@default_font, default_font),
    default_fx = COALESCE(@default_fx, default_fx),
    updated_at = datetime('now')
  WHERE id = @id
`);
function updateUserProfile(id, patch) {
  _updateUserProfile.run({
    id,
    display_name: patch.display_name ?? null,
    bio: patch.bio ?? null,
    avatar_uuid: patch.avatar_uuid ?? null,
    default_theme: patch.default_theme ?? null,
    default_accent: patch.default_accent ?? null,
    default_font: patch.default_font ?? null,
    default_fx: patch.default_fx == null ? null : (patch.default_fx ? 1 : 0),
  });
  return getUserById(id);
}

// =====================================================
// FOLDERS
// =====================================================
const _insertFolder = db.prepare(`
  INSERT INTO folders (user_id, slug, name, description, visibility, default_layout, theme, accent_color, fx_enabled, font, banner_uuid, sort_order, is_inbox)
  VALUES (@user_id, @slug, @name, @description, @visibility, @default_layout, @theme, @accent_color, @fx_enabled, @font, @banner_uuid, @sort_order, @is_inbox)
`);

const FOLDER_SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,49}$/i;
function createFolder(userId, input) {
  const slug = String(input.slug || '').trim();
  if (!FOLDER_SLUG_RE.test(slug)) return { ok: false, reason: 'invalid_slug' };
  if (isReservedHandle(slug)) return { ok: false, reason: 'reserved_slug' };

  const visibility = ['public','unlisted','private'].includes(input.visibility) ? input.visibility : 'private';
  const default_layout = ['grid','list','timeline'].includes(input.default_layout) ? input.default_layout : 'grid';

  try {
    const info = _insertFolder.run({
      user_id: userId,
      slug,
      name: String(input.name || slug).slice(0, 80),
      description: input.description?.slice(0, 500) || null,
      visibility,
      default_layout,
      theme: input.theme || null,
      accent_color: input.accent_color || null,
      fx_enabled: input.fx_enabled == null ? null : (input.fx_enabled ? 1 : 0),
      font: input.font || null,
      banner_uuid: input.banner_uuid || null,
      sort_order: input.sort_order || 0,
      is_inbox: 0,
    });
    return { ok: true, folder: getFolderById(info.lastInsertRowid) };
  } catch (err) {
    if (err.message.includes('UNIQUE')) return { ok: false, reason: 'slug_taken' };
    throw err;
  }
}

const _getFolderById = db.prepare('SELECT * FROM folders WHERE id = ?');
function getFolderById(id) { return _getFolderById.get(id) || null; }

const _getFolderBySlug = db.prepare('SELECT * FROM folders WHERE user_id = ? AND slug = ? COLLATE NOCASE');
function getFolderBySlug(userId, slug) {
  return _getFolderBySlug.get(userId, slug) || null;
}

const _getFoldersForUser = db.prepare(`
  SELECT f.*,
    (SELECT COUNT(*) FROM upload_folders WHERE folder_id = f.id) AS file_count
  FROM folders f
  WHERE user_id = ?
  ORDER BY is_inbox DESC, sort_order ASC, created_at ASC
`);
function getFoldersForUser(userId) { return _getFoldersForUser.all(userId); }

const _getPublicFoldersForUser = db.prepare(`
  SELECT f.*,
    (SELECT COUNT(*) FROM upload_folders uf JOIN uploads u ON u.uuid = uf.upload_uuid
     WHERE uf.folder_id = f.id AND u.visibility != 'private') AS file_count,
    (SELECT MAX(uf.added_at) FROM upload_folders uf WHERE uf.folder_id = f.id) AS last_added_at
  FROM folders f
  WHERE f.user_id = ? AND f.visibility = 'public' AND f.is_inbox = 0
  ORDER BY f.sort_order ASC, f.created_at DESC
`);
function getPublicFoldersForUser(userId) { return _getPublicFoldersForUser.all(userId); }

const _updateFolder = db.prepare(`
  UPDATE folders SET
    name = COALESCE(@name, name),
    description = COALESCE(@description, description),
    visibility = COALESCE(@visibility, visibility),
    default_layout = COALESCE(@default_layout, default_layout),
    theme = COALESCE(@theme, theme),
    accent_color = COALESCE(@accent_color, accent_color),
    fx_enabled = COALESCE(@fx_enabled, fx_enabled),
    font = COALESCE(@font, font),
    banner_uuid = COALESCE(@banner_uuid, banner_uuid),
    sort_order = COALESCE(@sort_order, sort_order),
    updated_at = datetime('now')
  WHERE id = @id AND user_id = @user_id
`);
function updateFolder(userId, folderId, patch) {
  _updateFolder.run({
    id: folderId,
    user_id: userId,
    name: patch.name ?? null,
    description: patch.description ?? null,
    visibility: patch.visibility ?? null,
    default_layout: patch.default_layout ?? null,
    theme: patch.theme ?? null,
    accent_color: patch.accent_color ?? null,
    fx_enabled: patch.fx_enabled == null ? null : (patch.fx_enabled ? 1 : 0),
    font: patch.font ?? null,
    banner_uuid: patch.banner_uuid ?? null,
    sort_order: patch.sort_order ?? null,
  });
  return getFolderById(folderId);
}

const _deleteFolder = db.prepare('DELETE FROM folders WHERE id = ? AND user_id = ? AND is_inbox = 0');
function deleteFolder(userId, folderId) {
  const info = _deleteFolder.run(folderId, userId);
  return info.changes > 0;
}

const _getInboxFolder = db.prepare('SELECT * FROM folders WHERE user_id = ? AND is_inbox = 1 LIMIT 1');
function getInboxFolder(userId) { return _getInboxFolder.get(userId) || null; }

// =====================================================
// UPLOAD ↔ FOLDER / TAG associations
// =====================================================
const _addUploadToFolder = db.prepare(`
  INSERT OR IGNORE INTO upload_folders (upload_uuid, folder_id, sort_order) VALUES (?, ?, ?)
`);
function addUploadToFolder(uploadUuid, folderId, sortOrder = 0) {
  return _addUploadToFolder.run(uploadUuid, folderId, sortOrder).changes > 0;
}

const _removeUploadFromFolder = db.prepare(
  'DELETE FROM upload_folders WHERE upload_uuid = ? AND folder_id = ?'
);
function removeUploadFromFolder(uploadUuid, folderId) {
  return _removeUploadFromFolder.run(uploadUuid, folderId).changes > 0;
}

const _getUploadsInFolder = db.prepare(`
  SELECT u.*, uf.sort_order AS folder_sort_order, uf.added_at
  FROM upload_folders uf
  JOIN uploads u ON u.uuid = uf.upload_uuid
  WHERE uf.folder_id = @folder_id
    AND (@include_private = 1 OR u.visibility != 'private')
  ORDER BY uf.sort_order ASC, u.created_at DESC
  LIMIT @limit OFFSET @offset
`);
function getUploadsInFolder(folderId, { limit = 100, offset = 0, includePrivate = false } = {}) {
  return _getUploadsInFolder.all({
    folder_id: folderId,
    include_private: includePrivate ? 1 : 0,
    limit, offset,
  });
}

const _getInboxUploadsForUser = db.prepare(`
  SELECT u.* FROM uploads u
  WHERE u.user_id = @user_id
    AND NOT EXISTS (
      SELECT 1 FROM upload_folders uf
      JOIN folders f ON f.id = uf.folder_id
      WHERE uf.upload_uuid = u.uuid AND f.is_inbox = 0
    )
  ORDER BY u.created_at DESC
  LIMIT @limit OFFSET @offset
`);
function getInboxUploadsForUser(userId, { limit = 100, offset = 0 } = {}) {
  return _getInboxUploadsForUser.all({ user_id: userId, limit, offset });
}

const _getFoldersForUpload = db.prepare(`
  SELECT f.* FROM upload_folders uf
  JOIN folders f ON f.id = uf.folder_id
  WHERE uf.upload_uuid = ?
  ORDER BY f.is_inbox DESC, f.sort_order ASC
`);
function getFoldersForUpload(uploadUuid) { return _getFoldersForUpload.all(uploadUuid); }

const _setUploadFields = db.prepare(`
  UPDATE uploads SET
    title = COALESCE(@title, title),
    caption = COALESCE(@caption, caption),
    visibility = COALESCE(@visibility, visibility),
    nsfw = COALESCE(@nsfw, nsfw)
  WHERE uuid = @uuid AND user_id = @user_id
`);
function updateUserUpload(userId, uuid, patch) {
  _setUploadFields.run({
    uuid, user_id: userId,
    title: patch.title ?? null,
    caption: patch.caption ?? null,
    visibility: patch.visibility ?? null,
    nsfw: patch.nsfw == null ? null : (patch.nsfw ? 1 : 0),
  });
  return getUploadById(uuid);
}

// =====================================================
// TAGS
// =====================================================
const _insertTag = db.prepare(`
  INSERT INTO tags (user_id, name, slug, color) VALUES (@user_id, @name, @slug, @color)
`);
function createTag(userId, { name, color = null }) {
  const slug = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  if (!slug) return { ok: false, reason: 'invalid_name' };
  try {
    const info = _insertTag.run({ user_id: userId, name: String(name).slice(0, 40), slug, color });
    return { ok: true, tag: { id: info.lastInsertRowid, user_id: userId, name, slug, color } };
  } catch (err) {
    if (err.message.includes('UNIQUE')) return { ok: false, reason: 'slug_taken' };
    throw err;
  }
}

const _getTagsForUser = db.prepare('SELECT * FROM tags WHERE user_id = ? ORDER BY name ASC');
function getTagsForUser(userId) { return _getTagsForUser.all(userId); }

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
  // users
  upsertUser, getUserById, getUserByHandle, isReservedHandle,
  claimHandle, updateUserProfile,
  // folders
  createFolder, getFolderById, getFolderBySlug,
  getFoldersForUser, getPublicFoldersForUser,
  updateFolder, deleteFolder, getInboxFolder,
  // associations
  addUploadToFolder, removeUploadFromFolder,
  getUploadsInFolder, getInboxUploadsForUser, getFoldersForUpload,
  updateUserUpload,
  // tags
  createTag, getTagsForUser,
};
