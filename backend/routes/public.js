/**
 * Public read-only routes for archive pages.
 *
 * No auth required. Visibility rules:
 *   - profile (handle): always returns if user has handle (no enumeration via 404)
 *   - public folders list: only folders with visibility='public', is_inbox=0
 *   - folder by slug: visibility != 'private' (public OR unlisted)
 *   - files in folder: respects file-level visibility != 'private'
 */
const express = require('express');
const {
  getUserByHandle, getPublicFoldersForUser, getFolderBySlug,
  getUploadsInFolder, getUploadById, getFolderById, getUserById,
  verifyFolderPassword, checkFolderAccess,
} = require('../db');

const router = express.Router();

function stripUser(user) {
  if (!user) return null;
  const { email, is_admin, ...publicUser } = user;
  return publicUser;
}

// GET /u/:handle — profile + list of public folders
router.get('/:handle', (req, res) => {
  const user = getUserByHandle(req.params.handle);
  if (!user) return res.status(404).json({ error: 'not_found' });
  const folders = getPublicFoldersForUser(user.id);
  res.json({ user: stripUser(user), folders });
});

function checkAccess(folder, req) {
  const mode = folder.access_mode || 'open';
  if (mode === 'open') return { granted: true };

  const needsPassword = mode === 'password' || mode === 'password_email';
  const needsEmail = mode === 'email' || mode === 'password_email';

  let passwordOk = !needsPassword;
  let emailOk = !needsEmail;

  if (needsPassword) {
    const pw = req.query.password || req.headers['x-folder-password'] || '';
    passwordOk = verifyFolderPassword(pw, folder.password_hash);
  }

  if (needsEmail) {
    const viewerEmail = req.query.viewer_email || req.headers['x-viewer-email'] || '';
    emailOk = viewerEmail ? checkFolderAccess(folder.id, viewerEmail) : false;
  }

  if (!passwordOk && !emailOk) return { granted: false, reason: mode };
  if (!passwordOk) return { granted: false, reason: 'password' };
  if (!emailOk) return { granted: false, reason: 'email' };
  return { granted: true };
}

function stripFolderSecrets(folder) {
  if (!folder) return folder;
  const { password_hash, ...safe } = folder;
  return { ...safe, has_password: !!password_hash };
}

// GET /u/:handle/f/:slug — single folder page
router.get('/:handle/f/:slug', (req, res) => {
  const user = getUserByHandle(req.params.handle);
  if (!user) return res.status(404).json({ error: 'not_found' });
  const folder = getFolderBySlug(user.id, req.params.slug);
  if (!folder || folder.visibility === 'private' || folder.is_inbox) {
    return res.status(404).json({ error: 'not_found' });
  }

  const access = checkAccess(folder, req);
  if (!access.granted) {
    return res.status(403).json({
      error: 'access_denied',
      access_mode: folder.access_mode,
      reason: access.reason,
      folder: stripFolderSecrets(folder),
      user: stripUser(user),
    });
  }

  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  const uploads = getUploadsInFolder(folder.id, { limit, offset, includePrivate: false });
  res.json({ user: stripUser(user), folder: stripFolderSecrets(folder), uploads });
});

// GET /u/:handle/f/:slug/:uuid — single file in a folder (public detail)
router.get('/:handle/f/:slug/:uuid', (req, res) => {
  const user = getUserByHandle(req.params.handle);
  if (!user) return res.status(404).json({ error: 'not_found' });
  const folder = getFolderBySlug(user.id, req.params.slug);
  if (!folder || folder.visibility === 'private' || folder.is_inbox) {
    return res.status(404).json({ error: 'not_found' });
  }

  const access = checkAccess(folder, req);
  if (!access.granted) {
    return res.status(403).json({
      error: 'access_denied',
      access_mode: folder.access_mode,
      reason: access.reason,
    });
  }

  const upload = getUploadById(req.params.uuid);
  if (!upload || upload.user_id !== user.id || upload.visibility === 'private') {
    return res.status(404).json({ error: 'not_found' });
  }
  res.json({ user: stripUser(user), folder: stripFolderSecrets(folder), upload });
});

module.exports = router;
