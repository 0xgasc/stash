/**
 * API authentication middleware for Stash.
 *
 * Supports two auth mechanisms:
 * - API key via X-API-Key header (for external tools)
 * - Admin secret via X-Admin-Secret header (for Next.js proxy)
 */
const crypto = require('crypto');
const { findApiKeyByHash, updateApiKeyLastUsed } = require('../db');

const ADMIN_BACKEND_SECRET = process.env.ADMIN_BACKEND_SECRET;

function isValidAdminSecret(value) {
  return ADMIN_BACKEND_SECRET && value === ADMIN_BACKEND_SECRET;
}

/**
 * Validate API key and attach req.apiKey = { id, name }
 */
function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key) {
    return res.status(401).json({ error: 'Missing X-API-Key header' });
  }

  const hash = crypto.createHash('sha256').update(key).digest('hex');
  const apiKey = findApiKeyByHash(hash);
  if (!apiKey) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  updateApiKeyLastUsed(apiKey.id);
  req.apiKey = { id: apiKey.id, name: apiKey.name };
  next();
}

/**
 * Validate admin backend secret
 */
function requireAdminSecret(req, res, next) {
  const secret = req.headers['x-admin-secret'];
  if (!isValidAdminSecret(secret)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.isAdmin = true;
  next();
}

/**
 * Accept either API key or admin secret
 */
function requireAuth(req, res, next) {
  const secret = req.headers['x-admin-secret'];
  if (isValidAdminSecret(secret)) {
    req.isAdmin = true;
    return next();
  }

  const key = req.headers['x-api-key'];
  if (key) {
    const hash = crypto.createHash('sha256').update(key).digest('hex');
    const apiKey = findApiKeyByHash(hash);
    if (apiKey) {
      updateApiKeyLastUsed(apiKey.id);
      req.apiKey = { id: apiKey.id, name: apiKey.name };
      return next();
    }
  }

  return res.status(401).json({ error: 'Unauthorized — provide X-API-Key or X-Admin-Secret' });
}

module.exports = { requireApiKey, requireAdminSecret, requireAuth };
