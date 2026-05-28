/**
 * Authenticated-user routes: folders, uploads-to-folder management.
 *
 * All endpoints require admin secret AND a user_id (sent in body for
 * writes, query for reads). The Next.js proxy layer verifies the
 * Supabase session and only ever passes the authenticated user's id.
 */
const express = require('express');
const {
  getFoldersForUser, getFolderById, getFolderBySlug, createFolder, updateFolder, deleteFolder,
  addUploadToFolder, removeUploadFromFolder,
  getUploadsInFolder, getInboxUploadsForUser, getFoldersForUpload,
  getUploadById, updateUserUpload,
  createTag, getTagsForUser,
  getInboxFolder,
  setFolderPassword, setFolderAccessMode,
  addFolderAccess, removeFolderAccess, getFolderAccessList,
  getActiveUserPlan,
} = require('../db');
const { requireAdminSecret } = require('../middleware/apiAuth');

const router = express.Router();
router.use(express.json());
router.use(requireAdminSecret);

function uid(req) {
  // For GETs, user_id comes via query; for writes, body.
  return req.body?.user_id || req.query?.user_id;
}

function assertOwner(req, res, folder) {
  if (!folder) { res.status(404).json({ error: 'not_found' }); return false; }
  const userId = uid(req);
  if (folder.user_id !== userId) { res.status(403).json({ error: 'forbidden' }); return false; }
  return true;
}

// =====================================================
// FOLDERS
// =====================================================
router.get('/folders', (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(400).json({ error: 'user_id required' });
  res.json({ folders: getFoldersForUser(userId) });
});

router.post('/folders', (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(400).json({ error: 'user_id required' });
  const result = createFolder(userId, req.body);
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

router.get('/folders/:id', (req, res) => {
  const folder = getFolderById(parseInt(req.params.id));
  if (!assertOwner(req, res, folder)) return;
  res.json({ folder });
});

router.patch('/folders/:id', (req, res) => {
  const folder = getFolderById(parseInt(req.params.id));
  if (!assertOwner(req, res, folder)) return;
  if (folder.is_inbox) {
    // Allow changing display name only on inbox
    const { name } = req.body || {};
    return res.json({ folder: updateFolder(folder.user_id, folder.id, { name }) });
  }
  const updated = updateFolder(folder.user_id, folder.id, req.body || {});
  res.json({ folder: updated });
});

router.delete('/folders/:id', (req, res) => {
  const folder = getFolderById(parseInt(req.params.id));
  if (!assertOwner(req, res, folder)) return;
  if (folder.is_inbox) return res.status(400).json({ error: 'cannot_delete_inbox' });
  const ok = deleteFolder(folder.user_id, folder.id);
  res.json({ ok });
});

// Add or remove a file from a folder
// POST /folders/:id/files { action: 'add' | 'remove', upload_uuid }
router.post('/folders/:id/files', (req, res) => {
  const folder = getFolderById(parseInt(req.params.id));
  if (!assertOwner(req, res, folder)) return;
  const { action, upload_uuid } = req.body || {};
  if (!upload_uuid) return res.status(400).json({ error: 'upload_uuid required' });
  // Owner check on the upload too
  const upload = getUploadById(upload_uuid);
  if (!upload || upload.user_id !== folder.user_id) return res.status(403).json({ error: 'not_owner_of_upload' });
  if (action === 'remove') {
    return res.json({ ok: removeUploadFromFolder(upload_uuid, folder.id) });
  }
  res.json({ ok: addUploadToFolder(upload_uuid, folder.id) });
});

// =====================================================
// UPLOADS
// =====================================================
router.get('/uploads', (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(400).json({ error: 'user_id required' });
  const folderId = req.query.folder_id ? parseInt(req.query.folder_id) : null;
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;

  if (folderId) {
    const folder = getFolderById(folderId);
    if (!folder || folder.user_id !== userId) return res.status(404).json({ error: 'folder_not_found' });
    return res.json({ uploads: getUploadsInFolder(folderId, { limit, offset, includePrivate: true }) });
  }
  // Default: inbox (uploads not in any non-inbox folder)
  res.json({ uploads: getInboxUploadsForUser(userId, { limit, offset }) });
});

router.get('/uploads/:uuid', (req, res) => {
  const upload = getUploadById(req.params.uuid);
  const userId = uid(req);
  if (!upload || upload.user_id !== userId) return res.status(404).json({ error: 'not_found' });
  res.json({ upload, folders: getFoldersForUpload(upload.uuid) });
});

router.patch('/uploads/:uuid', (req, res) => {
  const upload = getUploadById(req.params.uuid);
  const userId = uid(req);
  if (!upload || upload.user_id !== userId) return res.status(404).json({ error: 'not_found' });
  const { user_id, ...patch } = req.body || {};
  const updated = updateUserUpload(userId, upload.uuid, patch);
  res.json({ upload: updated });
});

// =====================================================
// FOLDER PRIVACY
// =====================================================
function requireFeature(userId, feature) {
  const plan = getActiveUserPlan(userId);
  if (!plan) return false;
  try {
    const f = JSON.parse(plan.features_json || '{}');
    return !!f[feature];
  } catch { return false; }
}

// POST /folders/:id/password  { password: string | null }
router.post('/folders/:id/password', (req, res) => {
  const folder = getFolderById(parseInt(req.params.id));
  if (!assertOwner(req, res, folder)) return;
  const userId = uid(req);
  if (!requireFeature(userId, 'password_lock')) {
    return res.status(403).json({ error: 'upgrade_required', feature: 'password_lock' });
  }
  const { password } = req.body || {};
  const updated = setFolderPassword(userId, folder.id, password || null);
  res.json({ folder: updated });
});

// GET /folders/:id/access — list email access
router.get('/folders/:id/access', (req, res) => {
  const folder = getFolderById(parseInt(req.params.id));
  if (!assertOwner(req, res, folder)) return;
  res.json({ access: getFolderAccessList(folder.id) });
});

// POST /folders/:id/access  { email }
router.post('/folders/:id/access', (req, res) => {
  const folder = getFolderById(parseInt(req.params.id));
  if (!assertOwner(req, res, folder)) return;
  const userId = uid(req);
  if (!requireFeature(userId, 'email_sharing')) {
    return res.status(403).json({ error: 'upgrade_required', feature: 'email_sharing' });
  }
  const { email } = req.body || {};
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'valid_email_required' });
  }
  const result = addFolderAccess(userId, folder.id, email);
  if (!result.ok) return res.status(400).json(result);
  res.json({ ok: true, access: getFolderAccessList(folder.id) });
});

// DELETE /folders/:id/access  { email }
router.delete('/folders/:id/access', (req, res) => {
  const folder = getFolderById(parseInt(req.params.id));
  if (!assertOwner(req, res, folder)) return;
  const userId = uid(req);
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email_required' });
  const result = removeFolderAccess(userId, folder.id, email);
  if (!result.ok) return res.status(400).json(result);
  res.json({ ok: true, access: getFolderAccessList(folder.id) });
});

// =====================================================
// TAGS
// =====================================================
router.get('/tags', (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(400).json({ error: 'user_id required' });
  res.json({ tags: getTagsForUser(userId) });
});

router.post('/tags', (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(400).json({ error: 'user_id required' });
  const result = createTag(userId, req.body);
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

// =====================================================
// INBOX folder shortcut (so the Next layer can quickly get the auto-created inbox)
// =====================================================
router.get('/inbox', (req, res) => {
  const userId = uid(req);
  if (!userId) return res.status(400).json({ error: 'user_id required' });
  res.json({ folder: getInboxFolder(userId) });
});

module.exports = router;
