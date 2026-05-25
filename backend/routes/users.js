/**
 * Stash user account routes.
 *
 * All write endpoints require the admin secret header (server-to-server
 * from the Next.js auth-aware layer). The Next.js layer is responsible
 * for verifying the Supabase session and passing only the verified
 * user_id in the request body. Never trust user_id from a browser.
 */
const express = require('express');
const {
  upsertUser, getUserById, getUserByHandle, claimHandle, updateUserProfile,
} = require('../db');
const { requireAdminSecret } = require('../middleware/apiAuth');

const router = express.Router();
router.use(express.json());

// =====================================================
// POST /users/bootstrap — upsert from Supabase callback
// Body: { id, email, display_name? }
// =====================================================
router.post('/bootstrap', requireAdminSecret, (req, res) => {
  const { id, email, display_name } = req.body || {};
  if (!id) return res.status(400).json({ error: 'id required' });
  const user = upsertUser({ id, email: email || null, display_name: display_name || null });
  res.json({ user });
});

// =====================================================
// GET /users/me — fetch user by id (passed via query, verified upstream)
// =====================================================
router.get('/me', requireAdminSecret, (req, res) => {
  const id = req.query.user_id;
  if (!id) return res.status(400).json({ error: 'user_id required' });
  const user = getUserById(id);
  if (!user) return res.status(404).json({ error: 'not_found' });
  res.json({ user });
});

// =====================================================
// GET /users/by-handle/:handle — public profile lookup
// =====================================================
router.get('/by-handle/:handle', (req, res) => {
  const user = getUserByHandle(req.params.handle);
  if (!user) return res.status(404).json({ error: 'not_found' });
  // Strip sensitive fields for public consumption
  const { email, is_admin, ...publicUser } = user;
  res.json({ user: publicUser });
});

// =====================================================
// POST /users/handle — claim or change handle
// Body: { user_id, handle }
// =====================================================
router.post('/handle', requireAdminSecret, (req, res) => {
  const { user_id, handle } = req.body || {};
  if (!user_id || !handle) return res.status(400).json({ error: 'user_id and handle required' });
  const result = claimHandle(user_id, handle);
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

// =====================================================
// PATCH /users/profile — update profile fields
// Body: { user_id, display_name?, bio?, avatar_uuid?, default_theme?, default_accent?, default_font?, default_fx? }
// =====================================================
router.patch('/profile', requireAdminSecret, (req, res) => {
  const { user_id, ...patch } = req.body || {};
  if (!user_id) return res.status(400).json({ error: 'user_id required' });
  const user = updateUserProfile(user_id, patch);
  res.json({ user });
});

module.exports = router;
