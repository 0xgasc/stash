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

if (currentVersion < 6) {
  db.exec(`
    -- Pre-claim users + claim-token flow
    ALTER TABLE users ADD COLUMN supabase_user_id TEXT;
    ALTER TABLE users ADD COLUMN claim_token TEXT;
    ALTER TABLE users ADD COLUMN claim_token_expires_at TEXT;
    ALTER TABLE users ADD COLUMN claimed_at TEXT;
    ALTER TABLE users ADD COLUMN created_by_admin INTEGER NOT NULL DEFAULT 0;

    CREATE UNIQUE INDEX idx_users_supabase_user_id ON users(supabase_user_id) WHERE supabase_user_id IS NOT NULL;
    CREATE INDEX idx_users_claim_token ON users(claim_token) WHERE claim_token IS NOT NULL;

    -- Backfill: existing users.id WAS the Supabase auth uuid in v5
    UPDATE users SET supabase_user_id = id, claimed_at = created_at WHERE supabase_user_id IS NULL;

    -- Add 'claim' to reserved handles (the /claim route was introduced in this migration)
    INSERT OR IGNORE INTO reserved_handles (handle) VALUES ('claim');

    CREATE TABLE plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL COLLATE NOCASE,
      name TEXT NOT NULL,
      tagline TEXT,
      description TEXT,
      billing_period TEXT NOT NULL CHECK (billing_period IN ('free','monthly','yearly','one_time')),
      price_cents INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'USD',
      monthly_upload_limit INTEGER,             -- null = unlimited
      total_upload_limit INTEGER,               -- null = unlimited (for one_time / lifetime)
      features_json TEXT NOT NULL DEFAULT '{}',
      stripe_price_id TEXT,
      recurrente_url TEXT,
      stablepay_url TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_default INTEGER NOT NULL DEFAULT 0,    -- the Free baseline plan
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE user_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      plan_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending','active','paused','cancelled','expired')),
      payment_status TEXT CHECK (payment_status IN ('unpaid','paid','failed','refunded')),
      payment_provider TEXT CHECK (payment_provider IN ('stripe','recurrente','stablepay','manual','admin_grant')),
      payment_reference TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      ends_at TEXT,
      notes TEXT,
      granted_by_user_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (plan_id) REFERENCES plans(id)
    );
    CREATE INDEX idx_user_plans_user_status ON user_plans(user_id, status);
    CREATE INDEX idx_user_plans_plan ON user_plans(plan_id);

    -- Pre-seed thematic plans (cyberpunk-flavoured, upload-quota based).
    -- Admin can edit prices/limits/links in the UI later.
    INSERT INTO plans (slug, name, tagline, description, billing_period, price_cents, currency, monthly_upload_limit, total_upload_limit, features_json, sort_order, is_default) VALUES
      ('drift',   'Drift',   'Free forever, light touch',          'Get your archive online with 10 uploads per month. Auto-refresh keeps your links alive.',         'free',     0,    'USD', 10,   NULL, '{"custom_accent":false,"custom_domain":false,"private_folders":true,"og_image":false}',                          1, 1),
      ('signal',  'Signal',  'For regulars',                       '100 uploads per month, custom accent + bio, all-folder previews, faster cron refresh.',          'monthly',  900,  'USD', 100,  NULL, '{"custom_accent":true,"custom_domain":false,"private_folders":true,"og_image":true,"priority_refresh":true}',     2, 0),
      ('beacon',  'Beacon',  'Power archivist',                    '500 uploads per month, custom domain, OG images for shareability, bulk operations.',            'monthly',  2900, 'USD', 500,  NULL, '{"custom_accent":true,"custom_domain":true,"private_folders":true,"og_image":true,"priority_refresh":true,"bulk":true,"analytics":true}', 3, 0),
      ('archive', 'Archive', 'One-time, forever',                  'Lifetime plan, unlimited uploads, every feature, no recurring fees.',                            'one_time', 29900,'USD', NULL, NULL, '{"custom_accent":true,"custom_domain":true,"private_folders":true,"og_image":true,"priority_refresh":true,"bulk":true,"analytics":true,"lifetime":true}', 4, 0);
  `);
  db.pragma('user_version = 6');
  console.log('✅ Database migrated to v6 (plans, user_plans, pre-claim users)');
}

if (currentVersion < 7) {
  db.exec(`
    ALTER TABLE users ADD COLUMN preferred_locale TEXT NOT NULL DEFAULT 'en';
  `);
  db.pragma('user_version = 7');
  console.log('✅ Database migrated to v7 (user preferred_locale)');
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
// For organic signups, users.id = supabase_user_id (keeps the v5 invariant
// where lookups by Supabase UUID still work). For admin-created users,
// users.id is a fresh internal UUID and supabase_user_id is null until
// they claim, at which point supabase_user_id is set but id stays put
// (so FKs on folders/uploads/etc. are stable).

const _getUserByAuthId = db.prepare(`
  SELECT * FROM users WHERE supabase_user_id = ? OR id = ? LIMIT 1
`);
function getUserByAuthId(supabaseUuid) {
  if (!supabaseUuid) return null;
  return _getUserByAuthId.get(supabaseUuid, supabaseUuid) || null;
}

const _insertUserOrganic = db.prepare(`
  INSERT INTO users (id, supabase_user_id, email, display_name, claimed_at)
  VALUES (@id, @id, @email, @display_name, datetime('now'))
`);
const _updateUserBasic = db.prepare(`
  UPDATE users SET
    email = COALESCE(@email, email),
    display_name = COALESCE(@display_name, display_name),
    updated_at = datetime('now')
  WHERE id = @id
`);
function upsertUser({ id, email = null, display_name = null }) {
  if (!id) throw new Error('upsertUser: id (supabase uuid) required');
  const existing = getUserByAuthId(id);
  if (existing) {
    _updateUserBasic.run({ id: existing.id, email, display_name });
    return getUserById(existing.id);
  }
  _insertUserOrganic.run({ id, email, display_name });
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

  // Accept either internal id or Supabase auth uuid for resilience
  const user = getUserById(userId) || getUserByAuthId(userId);
  if (!user) return { ok: false, reason: 'no_user' };
  // Use the canonical internal id for the UPDATE
  userId = user.id;
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
    preferred_locale = COALESCE(@preferred_locale, preferred_locale),
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
    preferred_locale: patch.preferred_locale ?? null,
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

// =====================================================
// ADMIN: pre-create users with claim tokens
// =====================================================
const CLAIM_TTL_DAYS = 7;

const _insertPreClaimUser = db.prepare(`
  INSERT INTO users (id, email, display_name, claim_token, claim_token_expires_at, created_by_admin)
  VALUES (@id, @email, @display_name, @claim_token, @claim_token_expires_at, 1)
`);

/**
 * Create an admin-owned account. Email is OPTIONAL:
 *   - With email: a claim_token is generated and the account is "ready to send".
 *   - Without email: the account is a placeholder. Admin must later call
 *     assignUserEmail(userId, email) to attach an email + generate a token.
 */
function createPreClaimUser({ email = null, display_name = null, handle = null, granted_by_user_id = null } = {}) {
  let normEmail = null;
  let claim_token = null;
  let claim_token_expires_at = null;

  if (email) {
    if (!email.includes('@')) return { ok: false, reason: 'invalid_email' };
    normEmail = email.trim().toLowerCase();
    const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = ? AND supabase_user_id IS NOT NULL').get(normEmail);
    if (existing) return { ok: false, reason: 'email_already_active', existingUserId: existing.id };
    claim_token = crypto.randomBytes(24).toString('base64url');
    claim_token_expires_at = new Date(Date.now() + CLAIM_TTL_DAYS * 24 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  }

  // Pre-validate handle if provided (so we don't insert a half-good user and bail)
  if (handle) {
    const h = String(handle).trim();
    if (!HANDLE_RE.test(h)) return { ok: false, reason: 'invalid_handle_format' };
    if (h.length < 3) return { ok: false, reason: 'handle_too_short' };
    if (isReservedHandle(h)) return { ok: false, reason: 'handle_reserved' };
    if (getUserByHandle(h)) return { ok: false, reason: 'handle_taken' };
  }

  const id = crypto.randomUUID();
  _insertPreClaimUser.run({ id, email: normEmail, display_name, claim_token, claim_token_expires_at });
  if (handle) {
    setAdminHandle(id, handle); // creates Inbox too
  }
  return { ok: true, user: getUserById(id), claim_token, granted_by_user_id };
}

/**
 * Attach an email to a previously-created unassigned account and
 * generate a fresh claim token. Refuses if the account is already
 * claimed (supabase_user_id non-null).
 */
const _assignEmailQuery = db.prepare(`
  UPDATE users SET
    email = @email,
    claim_token = @claim_token,
    claim_token_expires_at = @claim_token_expires_at,
    updated_at = datetime('now')
  WHERE id = @id AND claimed_at IS NULL
`);
function assignUserEmail(userId, email) {
  if (!email || !email.includes('@')) return { ok: false, reason: 'invalid_email' };
  const user = getUserById(userId);
  if (!user) return { ok: false, reason: 'not_found' };
  if (user.claimed_at) return { ok: false, reason: 'already_claimed' };

  const normEmail = email.trim().toLowerCase();
  const conflict = db.prepare('SELECT id FROM users WHERE LOWER(email) = ? AND id != ? AND supabase_user_id IS NOT NULL').get(normEmail, userId);
  if (conflict) return { ok: false, reason: 'email_already_active', existingUserId: conflict.id };

  const claim_token = crypto.randomBytes(24).toString('base64url');
  const claim_token_expires_at = new Date(Date.now() + CLAIM_TTL_DAYS * 24 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  const info = _assignEmailQuery.run({ id: userId, email: normEmail, claim_token, claim_token_expires_at });
  if (info.changes === 0) return { ok: false, reason: 'race' };
  return { ok: true, user: getUserById(userId), claim_token };
}

/**
 * Admin-pre-set the handle on an unclaimed account. Skips the 30-day
 * cooldown that applies to user-driven handle changes. Auto-creates
 * Inbox if missing.
 */
function setAdminHandle(userId, handle) {
  const h = String(handle || '').trim();
  if (!HANDLE_RE.test(h)) return { ok: false, reason: 'invalid_format' };
  if (h.length < 3) return { ok: false, reason: 'too_short' };
  if (isReservedHandle(h)) return { ok: false, reason: 'reserved' };

  const user = getUserById(userId);
  if (!user) return { ok: false, reason: 'not_found' };
  if (user.claimed_at) return { ok: false, reason: 'already_claimed' };

  const existing = getUserByHandle(h);
  if (existing && existing.id !== userId) return { ok: false, reason: 'taken' };

  const tx = db.transaction(() => {
    _claimHandle.run({ id: userId, handle: h });
    const fc = db.prepare('SELECT COUNT(*) AS c FROM folders WHERE user_id = ?').get(userId).c;
    if (fc === 0) {
      _insertFolder.run({
        user_id: userId,
        slug: 'inbox', name: 'Inbox', description: null,
        visibility: 'private', default_layout: 'grid',
        theme: null, accent_color: null, fx_enabled: null, font: null,
        banner_uuid: null, sort_order: 0, is_inbox: 1,
      });
    }
  });
  tx();
  return { ok: true, user: getUserById(userId) };
}

/**
 * Regenerate the claim token for a pending account (e.g. expired link).
 * Requires the email to already be set.
 */
function regenerateClaimToken(userId) {
  const user = getUserById(userId);
  if (!user) return { ok: false, reason: 'not_found' };
  if (user.claimed_at) return { ok: false, reason: 'already_claimed' };
  if (!user.email) return { ok: false, reason: 'no_email' };

  const claim_token = crypto.randomBytes(24).toString('base64url');
  const claim_token_expires_at = new Date(Date.now() + CLAIM_TTL_DAYS * 24 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  db.prepare('UPDATE users SET claim_token = ?, claim_token_expires_at = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(claim_token, claim_token_expires_at, userId);
  return { ok: true, user: getUserById(userId), claim_token };
}

const _getUserByClaimToken = db.prepare(`
  SELECT * FROM users
  WHERE claim_token = ? AND claim_token_expires_at > datetime('now') AND claimed_at IS NULL
`);
function getUserByClaimToken(token) {
  if (!token) return null;
  return _getUserByClaimToken.get(token) || null;
}

const _markClaimed = db.prepare(`
  UPDATE users SET
    supabase_user_id = @supabase_user_id,
    claimed_at = datetime('now'),
    claim_token = NULL,
    claim_token_expires_at = NULL,
    updated_at = datetime('now')
  WHERE id = @id AND claimed_at IS NULL
`);

function claimAccount(token, supabaseUuid) {
  const pre = getUserByClaimToken(token);
  if (!pre) return { ok: false, reason: 'invalid_or_expired_token' };
  // If this supabase id is already linked to another user, refuse
  const conflict = db.prepare('SELECT id FROM users WHERE supabase_user_id = ? AND id != ?').get(supabaseUuid, pre.id);
  if (conflict) return { ok: false, reason: 'already_linked_to_other_user' };
  const info = _markClaimed.run({ id: pre.id, supabase_user_id: supabaseUuid });
  if (info.changes === 0) return { ok: false, reason: 'race' };
  // Auto-create Inbox if the user already has a handle pre-set by admin (rare)
  const fc = db.prepare('SELECT COUNT(*) AS c FROM folders WHERE user_id = ?').get(pre.id).c;
  if (fc === 0 && pre.handle) {
    _insertFolder.run({
      user_id: pre.id, slug: 'inbox', name: 'Inbox', description: null,
      visibility: 'private', default_layout: 'grid',
      theme: null, accent_color: null, fx_enabled: null, font: null,
      banner_uuid: null, sort_order: 0, is_inbox: 1,
    });
  }
  return { ok: true, user: getUserById(pre.id) };
}

function listAllUsers({ limit = 100, offset = 0 } = {}) {
  return db.prepare(`
    SELECT u.id, u.handle, u.email, u.display_name, u.supabase_user_id, u.claimed_at,
           u.claim_token IS NOT NULL AS has_pending_claim,
           u.claim_token_expires_at, u.created_by_admin, u.created_at, u.preferred_locale,
           (SELECT p.name FROM user_plans up JOIN plans p ON p.id = up.plan_id
            WHERE up.user_id = u.id AND up.status = 'active'
            ORDER BY up.created_at DESC LIMIT 1) AS active_plan_name,
           (SELECT COUNT(*) FROM uploads WHERE user_id = u.id) AS upload_count
    FROM users u
    ORDER BY u.created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);
}

// =====================================================
// PLANS
// =====================================================
function getAllPlans({ activeOnly = false } = {}) {
  const where = activeOnly ? 'WHERE is_active = 1' : '';
  return db.prepare(`SELECT * FROM plans ${where} ORDER BY sort_order ASC, price_cents ASC`).all();
}

function getPlanById(id) {
  return db.prepare('SELECT * FROM plans WHERE id = ?').get(id) || null;
}

function getPlanBySlug(slug) {
  return db.prepare('SELECT * FROM plans WHERE slug = ? COLLATE NOCASE').get(slug) || null;
}

function getDefaultPlan() {
  return db.prepare('SELECT * FROM plans WHERE is_default = 1 AND is_active = 1 LIMIT 1').get() || null;
}

const _insertPlan = db.prepare(`
  INSERT INTO plans (slug, name, tagline, description, billing_period, price_cents, currency,
                     monthly_upload_limit, total_upload_limit, features_json,
                     stripe_price_id, recurrente_url, stablepay_url, sort_order, is_active, is_default)
  VALUES (@slug, @name, @tagline, @description, @billing_period, @price_cents, @currency,
          @monthly_upload_limit, @total_upload_limit, @features_json,
          @stripe_price_id, @recurrente_url, @stablepay_url, @sort_order, @is_active, @is_default)
`);

function createPlan(input) {
  const slug = String(input.slug || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,40}$/i.test(slug)) return { ok: false, reason: 'invalid_slug' };
  if (!['free','monthly','yearly','one_time'].includes(input.billing_period)) return { ok: false, reason: 'invalid_billing_period' };
  try {
    const features = typeof input.features_json === 'string' ? input.features_json : JSON.stringify(input.features_json || {});
    const info = _insertPlan.run({
      slug,
      name: String(input.name || slug).slice(0, 60),
      tagline: input.tagline || null,
      description: input.description || null,
      billing_period: input.billing_period,
      price_cents: parseInt(input.price_cents) || 0,
      currency: (input.currency || 'USD').toUpperCase().slice(0, 3),
      monthly_upload_limit: input.monthly_upload_limit == null ? null : parseInt(input.monthly_upload_limit),
      total_upload_limit: input.total_upload_limit == null ? null : parseInt(input.total_upload_limit),
      features_json: features,
      stripe_price_id: input.stripe_price_id || null,
      recurrente_url: input.recurrente_url || null,
      stablepay_url: input.stablepay_url || null,
      sort_order: input.sort_order || 0,
      is_active: input.is_active === false ? 0 : 1,
      is_default: input.is_default ? 1 : 0,
    });
    return { ok: true, plan: getPlanById(info.lastInsertRowid) };
  } catch (err) {
    if (err.message.includes('UNIQUE')) return { ok: false, reason: 'slug_taken' };
    throw err;
  }
}

const _updatePlan = db.prepare(`
  UPDATE plans SET
    name = COALESCE(@name, name),
    tagline = COALESCE(@tagline, tagline),
    description = COALESCE(@description, description),
    billing_period = COALESCE(@billing_period, billing_period),
    price_cents = COALESCE(@price_cents, price_cents),
    currency = COALESCE(@currency, currency),
    monthly_upload_limit = COALESCE(@monthly_upload_limit, monthly_upload_limit),
    total_upload_limit = COALESCE(@total_upload_limit, total_upload_limit),
    features_json = COALESCE(@features_json, features_json),
    stripe_price_id = COALESCE(@stripe_price_id, stripe_price_id),
    recurrente_url = COALESCE(@recurrente_url, recurrente_url),
    stablepay_url = COALESCE(@stablepay_url, stablepay_url),
    sort_order = COALESCE(@sort_order, sort_order),
    is_active = COALESCE(@is_active, is_active),
    is_default = COALESCE(@is_default, is_default),
    updated_at = datetime('now')
  WHERE id = @id
`);
function updatePlan(id, patch) {
  _updatePlan.run({
    id,
    name: patch.name ?? null,
    tagline: patch.tagline ?? null,
    description: patch.description ?? null,
    billing_period: patch.billing_period ?? null,
    price_cents: patch.price_cents == null ? null : parseInt(patch.price_cents),
    currency: patch.currency ?? null,
    monthly_upload_limit: patch.monthly_upload_limit ?? null,
    total_upload_limit: patch.total_upload_limit ?? null,
    features_json: typeof patch.features_json === 'string' ? patch.features_json : (patch.features_json ? JSON.stringify(patch.features_json) : null),
    stripe_price_id: patch.stripe_price_id ?? null,
    recurrente_url: patch.recurrente_url ?? null,
    stablepay_url: patch.stablepay_url ?? null,
    sort_order: patch.sort_order ?? null,
    is_active: patch.is_active == null ? null : (patch.is_active ? 1 : 0),
    is_default: patch.is_default == null ? null : (patch.is_default ? 1 : 0),
  });
  return getPlanById(id);
}

// =====================================================
// USER ↔ PLAN
// =====================================================
const _insertUserPlan = db.prepare(`
  INSERT INTO user_plans (user_id, plan_id, status, payment_status, payment_provider, payment_reference, started_at, ends_at, notes, granted_by_user_id)
  VALUES (@user_id, @plan_id, @status, @payment_status, @payment_provider, @payment_reference, datetime('now'), @ends_at, @notes, @granted_by_user_id)
`);

function assignPlan(userId, { plan_id, status = 'active', payment_status = null, payment_provider = 'admin_grant', payment_reference = null, ends_at = null, notes = null, granted_by_user_id = null }) {
  // Demote any existing active plan to expired
  db.prepare("UPDATE user_plans SET status = 'expired', updated_at = datetime('now') WHERE user_id = ? AND status = 'active'").run(userId);
  const info = _insertUserPlan.run({
    user_id: userId, plan_id, status, payment_status, payment_provider, payment_reference,
    ends_at, notes, granted_by_user_id,
  });
  return db.prepare('SELECT * FROM user_plans WHERE id = ?').get(info.lastInsertRowid);
}

function getActiveUserPlan(userId) {
  const row = db.prepare(`
    SELECT up.*, p.slug AS plan_slug, p.name AS plan_name, p.monthly_upload_limit, p.total_upload_limit,
           p.billing_period, p.price_cents, p.currency, p.features_json
    FROM user_plans up JOIN plans p ON p.id = up.plan_id
    WHERE up.user_id = ? AND up.status IN ('active','pending')
    ORDER BY up.created_at DESC LIMIT 1
  `).get(userId);
  return row || null;
}

function getUserPlanHistory(userId, { limit = 20 } = {}) {
  return db.prepare(`
    SELECT up.*, p.name AS plan_name, p.slug AS plan_slug
    FROM user_plans up JOIN plans p ON p.id = up.plan_id
    WHERE up.user_id = ?
    ORDER BY up.created_at DESC LIMIT ?
  `).all(userId, limit);
}

function getUserMonthlyUsage(userId) {
  const row = db.prepare(`
    SELECT COUNT(*) AS uploads_this_month
    FROM uploads
    WHERE user_id = ? AND created_at >= datetime('now', 'start of month')
  `).get(userId);
  const total = db.prepare('SELECT COUNT(*) AS total FROM uploads WHERE user_id = ?').get(userId);
  return { uploads_this_month: row.uploads_this_month, total_uploads: total.total };
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
  // users
  upsertUser, getUserById, getUserByAuthId, getUserByHandle, isReservedHandle,
  claimHandle, updateUserProfile,
  // pre-claim / admin
  createPreClaimUser, getUserByClaimToken, claimAccount, listAllUsers,
  assignUserEmail, regenerateClaimToken, setAdminHandle,
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
  // plans
  getAllPlans, getPlanById, getPlanBySlug, getDefaultPlan,
  createPlan, updatePlan,
  assignPlan, getActiveUserPlan, getUserPlanHistory, getUserMonthlyUsage,
};
