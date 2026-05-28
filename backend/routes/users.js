/**
 * Stash user account routes.
 *
 * All write endpoints require the admin secret header (server-to-server
 * from the Next.js auth-aware layer). The Next.js layer is responsible
 * for verifying the Supabase session and passing only the verified
 * user_id in the request body. Never trust user_id from a browser.
 */
const express = require('express');
const crypto = require('crypto');
const {
  upsertUser, getUserById, getUserByAuthId, getUserByHandle, claimHandle, updateUserProfile,
  claimAccount, getUserByClaimToken, getActiveUserPlan, getUserMonthlyUsage, getUserDailyUsage,
  getAllPlans, db,
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
  const user = getUserByAuthId(id) || getUserById(id);
  if (!user) return res.status(404).json({ error: 'not_found' });
  const active_plan = getActiveUserPlan(user.id);
  const usage = getUserMonthlyUsage(user.id);
  const uploads_today = getUserDailyUsage(user.id);
  const daily_upload_limit = active_plan?.daily_upload_limit ?? null;
  res.json({ user, active_plan, usage, uploads_today, daily_upload_limit });
});

// Public list of active plans (for pricing pages / upgrade UI)
router.get('/plans', (req, res) => {
  res.json({ plans: getAllPlans({ activeOnly: true }) });
});

// =====================================================
// POST /users/email-signin — resolve email → user_id for Resend-based auth
// Body: { email, claim_token? }
//
// Cases:
//   A. claim_token supplied + valid → claim that pre-created account
//      (sets supabase_user_id = generated uuid, claimed_at = now).
//   B. email matches a claimed user → that's their login.
//   C. email matches a placeholder (admin-pre-created, supabase_user_id null,
//      no claim_token in request) → auto-claim with a fresh uuid.
//   D. no match → create a new user (upsertUser with fresh uuid).
//
// Returns { user_id, was_new, was_claim }.
// =====================================================
router.post('/email-signin', requireAdminSecret, (req, res) => {
  const { email, claim_token } = req.body || {};
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'email required' });
  const normEmail = String(email).trim().toLowerCase();

  // Case A — explicit claim_token
  if (claim_token) {
    const pre = getUserByClaimToken(claim_token);
    if (!pre) return res.status(400).json({ error: 'invalid_or_expired_claim_token' });
    if (pre.email && pre.email.toLowerCase() !== normEmail) {
      return res.status(400).json({ error: 'email_does_not_match_claim_target' });
    }
    const externalId = crypto.randomUUID();
    const result = claimAccount(claim_token, externalId);
    if (!result.ok) return res.status(400).json(result);
    return res.json({ user_id: result.user.id, was_new: false, was_claim: true });
  }

  // Look up any user with that email
  const existing = db.prepare('SELECT * FROM users WHERE LOWER(email) = ? LIMIT 1').get(normEmail);

  if (existing && existing.supabase_user_id) {
    // Case B — returning user
    return res.json({ user_id: existing.id, was_new: false, was_claim: false });
  }

  if (existing && !existing.supabase_user_id) {
    // Case C — placeholder with this email assigned; auto-claim
    const externalId = crypto.randomUUID();
    db.prepare(`
      UPDATE users SET supabase_user_id = ?, claimed_at = datetime('now'),
        claim_token = NULL, claim_token_expires_at = NULL, updated_at = datetime('now')
      WHERE id = ?
    `).run(externalId, existing.id);
    return res.json({ user_id: existing.id, was_new: false, was_claim: true });
  }

  // Case D — brand new user
  const id = crypto.randomUUID();
  const user = upsertUser({ id, email: normEmail });
  return res.json({ user_id: user.id, was_new: true, was_claim: false });
});

// =====================================================
// POST /users/claim — link Supabase id to pre-created account
// Body: { claim_token, supabase_user_id }
// =====================================================
router.post('/claim', requireAdminSecret, (req, res) => {
  const { claim_token, supabase_user_id } = req.body || {};
  if (!claim_token || !supabase_user_id) {
    return res.status(400).json({ error: 'claim_token and supabase_user_id required' });
  }
  const result = claimAccount(claim_token, supabase_user_id);
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

// =====================================================
// GET /users/claim-preview/:token — show admin-set context to the
// claimant before they sign in (no auth required, but doesn't leak
// anything beyond email + display_name + pre-assigned handle)
// =====================================================
router.get('/claim-preview/:token', (req, res) => {
  const pre = getUserByClaimToken(req.params.token);
  if (!pre) return res.status(404).json({ error: 'invalid_or_expired' });
  res.json({
    email: pre.email,
    display_name: pre.display_name,
    handle: pre.handle,
    active_plan: getActiveUserPlan(pre.id),
  });
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
