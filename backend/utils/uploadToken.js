/**
 * Short-lived signed upload tokens.
 *
 * Why: an external tenant (e.g. FlyIn) cannot ship a Stash API key in its
 * public JS bundle — anyone can extract it and upload on the tenant's
 * account. Instead, the tenant's server calls POST /api/v1/tus-token with
 * its real API key (kept server-side) and gets back an opaque, expiring,
 * HMAC-signed token scoped to that tenant. The browser sends that token on
 * the TUS requests via the X-Upload-Token header. The signing secret lives
 * only on Stash (ADMIN_BACKEND_SECRET) and is never shared with the tenant
 * or the browser, so a leaked token is useless after a few minutes and
 * carries no API-key privileges — upload-only, size-capped, tenant-scoped.
 *
 * Token payload:
 *   source  tenant/source string recorded on the upload (n/a attribution)
 *   k       minting api_keys.id (becomes uploads.api_key_id)
 *   mb      max bytes this token may upload
 *   ext     optional array of allowed lowercase extensions (no dot)
 *   exp     unix expiry in SECONDS
 *
 * Format: base64url(json).base64url(hmac-sha256(json))
 */
const crypto = require('crypto');

const SECRET = () => {
  if (!process.env.ADMIN_BACKEND_SECRET) throw new Error('ADMIN_BACKEND_SECRET not configured');
  return process.env.ADMIN_BACKEND_SECRET;
};

const DEFAULT_MAX_BYTES = () => Number(process.env.TUS_TOKEN_MAX_BYTES) || 2 * 1024 * 1024 * 1024; // 2 GB
const DEFAULT_EXPIRY_MIN = 15;
const MAX_EXPIRY_MIN = 60;

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function clampInt(n, lo, hi, dflt) {
  const v = Number(n);
  if (!Number.isFinite(v)) return dflt;
  return Math.min(hi, Math.max(lo, Math.round(v)));
}

/**
 * Mint a token for a tenant api key.
 * @param {object} opts { apiKeyId, source, maxBytes?, expiresInMinutes?, extensions? }
 * @returns {{token: string, exp: number(seconds), maxBytes: number}}
 */
function mintUploadToken({ apiKeyId, source, maxBytes, expiresInMinutes, extensions }) {
  if (!apiKeyId) throw new Error('apiKeyId required');
  const src = (source || '').trim();
  if (!src) throw new Error('source required');

  const mb = clampInt(maxBytes, 1024, Number(process.env.TUS_TOKEN_MAX_BYTES) || 2 * 1024 * 1024 * 1024, DEFAULT_MAX_BYTES());
  const min = clampInt(expiresInMinutes, 1, MAX_EXPIRY_MIN, DEFAULT_EXPIRY_MIN);
  const expiry = Math.floor(Date.now() / 1000) + min * 60;

  const payload = { source: src, k: apiKeyId, mb, exp: expiry };
  if (Array.isArray(extensions)) {
    const exts = extensions
      .map((e) => String(e).trim().toLowerCase().replace(/^\./, ''))
      .filter(Boolean);
    if (exts.length) payload.ext = exts;
  }

  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', SECRET()).update(body).digest('base64url');
  return { token: `${body}.${sig}`, exp: expiry, maxBytes: mb, source: src, extensions: payload.ext || null };
}

/**
 * Verify + decode a token.
 * @returns {{ok: boolean, error?: string, token?: string, payload?: object}}
 */
function verifyToken(token, nowMs = Date.now()) {
  if (typeof token !== 'string' || !token) return { ok: false, error: 'missing' };
  const i = token.indexOf('.');
  if (i <= 0) return { ok: false, error: 'malformed' };
  const body = token.slice(0, i);
  const sig = token.slice(i + 1);

  const expected = crypto.createHmac('sha256', SECRET()).update(body).digest('base64url');
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, error: 'bad signature' };
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, error: 'malformed payload' };
  }

  if (typeof payload.exp !== 'number' || nowMs > payload.exp * 1000) {
    return { ok: false, error: 'expired' };
  }
  if (typeof payload.mb !== 'number' || payload.mb <= 0) return { ok: false, error: 'bad maxBytes' };
  if (typeof payload.source !== 'string' || !payload.source) return { ok: false, error: 'bad source' };
  if (!payload.k) return { ok: false, error: 'bad apiKey' };

  return { ok: true, token, payload };
}

/**
 * Pure scope check — enforce a token's caps against a completed upload.
 * Kept separate so it's unit-testable without a server.
 * @param {object} payload verified token payload
 * @param {{size:number, filename:string}} upload
 */
function checkTokenCaps(payload, { size, filename }) {
  if (Number(size) > payload.mb) {
    return { ok: false, error: `Upload is ${size} bytes, token allows max ${payload.mb}` };
  }
  if (Array.isArray(payload.ext) && payload.ext.length) {
    const dot = (filename || '').lastIndexOf('.');
    const ext = dot >= 0 ? (filename.slice(dot + 1) || '').toLowerCase() : '';
    if (!ext || !payload.ext.includes(ext)) {
      return { ok: false, error: `File type .${ext || 'none'} not allowed by this token` };
    }
  }
  return { ok: true };
}

module.exports = {
  mintUploadToken,
  verifyToken,
  checkTokenCaps,
  DEFAULT_MAX_BYTES,
  DEFAULT_EXPIRY_MIN,
  MAX_EXPIRY_MIN,
};