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

// GET /u/:handle/f/:slug — single folder page
router.get('/:handle/f/:slug', (req, res) => {
  const user = getUserByHandle(req.params.handle);
  if (!user) return res.status(404).json({ error: 'not_found' });
  const folder = getFolderBySlug(user.id, req.params.slug);
  if (!folder || folder.visibility === 'private' || folder.is_inbox) {
    return res.status(404).json({ error: 'not_found' });
  }
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  const uploads = getUploadsInFolder(folder.id, { limit, offset, includePrivate: false });
  res.json({ user: stripUser(user), folder, uploads });
});

// GET /u/:handle/f/:slug/:uuid — single file in a folder (public detail)
router.get('/:handle/f/:slug/:uuid', (req, res) => {
  const user = getUserByHandle(req.params.handle);
  if (!user) return res.status(404).json({ error: 'not_found' });
  const folder = getFolderBySlug(user.id, req.params.slug);
  if (!folder || folder.visibility === 'private' || folder.is_inbox) {
    return res.status(404).json({ error: 'not_found' });
  }
  const upload = getUploadById(req.params.uuid);
  if (!upload || upload.user_id !== user.id || upload.visibility === 'private') {
    return res.status(404).json({ error: 'not_found' });
  }
  res.json({ user: stripUser(user), folder, upload });
});

module.exports = router;
