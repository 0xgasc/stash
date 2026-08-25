/**
 * Admin-only routes: pre-creating users + plan management.
 *
 * All routes require the admin secret. The Next.js layer verifies the
 * admin session (HMAC cookie OR users.is_admin flag) before forwarding.
 */
const express = require('express');
const {
  createPreClaimUser, listAllUsers, getUserById,
  getAllPlans, getPlanById, createPlan, updatePlan,
  assignPlan, getActiveUserPlan, getUserPlanHistory,
  assignUserEmail, regenerateClaimToken, setAdminHandle,
} = require('../db');
const { requireAdminSecret } = require('../middleware/apiAuth');

const router = express.Router();
router.use(express.json());
router.use(requireAdminSecret);

// =====================================================
// USERS (admin)
// =====================================================
router.get('/users', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const offset = parseInt(req.query.offset) || 0;
  res.json({ users: listAllUsers({ limit, offset }) });
});

router.post('/users', (req, res) => {
  const { email, display_name, plan_id, granted_by_user_id } = req.body || {};
  const result = createPreClaimUser({ email, display_name, granted_by_user_id });
  if (!result.ok) return res.status(400).json(result);
  // Optionally assign a plan up-front
  if (plan_id) {
    assignPlan(result.user.id, {
      plan_id: parseInt(plan_id),
      payment_provider: 'admin_grant',
      payment_status: 'paid',
      notes: 'Pre-assigned at account creation',
      granted_by_user_id: granted_by_user_id || null,
    });
  }
  // Returns the claim_token so Next.js can build the URL + email it
  res.json({
    user: getUserById(result.user.id),
    claim_token: result.claim_token,
    active_plan: getActiveUserPlan(result.user.id),
  });
});

router.get('/users/:id', (req, res) => {
  const user = getUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'not_found' });
  res.json({
    user,
    active_plan: getActiveUserPlan(user.id),
    plan_history: getUserPlanHistory(user.id),
  });
});

router.post('/users/:id/assign-email', (req, res) => {
  const user = getUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'not_found' });
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });
  const result = assignUserEmail(user.id, email);
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

router.post('/users/:id/set-handle', (req, res) => {
  const user = getUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'not_found' });
  const { handle } = req.body || {};
  if (!handle) return res.status(400).json({ error: 'handle required' });
  const result = setAdminHandle(user.id, handle);
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

router.post('/users/:id/regenerate-claim-token', (req, res) => {
  const user = getUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'not_found' });
  const result = regenerateClaimToken(user.id);
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

router.post('/users/:id/assign-plan', (req, res) => {
  const user = getUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'not_found' });
  const { plan_id, status, payment_status, payment_provider, payment_reference, ends_at, notes, granted_by_user_id } = req.body || {};
  if (!plan_id) return res.status(400).json({ error: 'plan_id required' });
  const plan = getPlanById(parseInt(plan_id));
  if (!plan) return res.status(400).json({ error: 'plan not found' });
  const result = assignPlan(user.id, {
    plan_id: plan.id,
    status, payment_status, payment_provider, payment_reference, ends_at, notes, granted_by_user_id,
  });
  res.json({ user_plan: result, active_plan: getActiveUserPlan(user.id) });
});

// =====================================================
// PLANS (admin CRUD)
// =====================================================
router.get('/plans', (req, res) => {
  res.json({ plans: getAllPlans() });
});

router.post('/plans', (req, res) => {
  const result = createPlan(req.body || {});
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

router.get('/plans/:id', (req, res) => {
  const plan = getPlanById(parseInt(req.params.id));
  if (!plan) return res.status(404).json({ error: 'not_found' });
  res.json({ plan });
});

router.patch('/plans/:id', (req, res) => {
  const plan = getPlanById(parseInt(req.params.id));
  if (!plan) return res.status(404).json({ error: 'not_found' });
  res.json({ plan: updatePlan(plan.id, req.body || {}) });
});

// =====================================================
// POST /migrate-gateway — Bulk swap gateway domain in all irys_url values
// =====================================================
router.post('/migrate-gateway', (req, res) => {
  const { from, to } = req.body || {};
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });

  const { db } = require('../db');
  const result = db.prepare(`
    UPDATE uploads SET irys_url = REPLACE(irys_url, ?, ?)
    WHERE irys_url LIKE ?
  `).run(from, to, `${from}%`);

  const linkResult = db.prepare(`
    UPDATE upload_links SET irys_url = REPLACE(irys_url, ?, ?)
    WHERE irys_url LIKE ?
  `).run(from, to, `${from}%`);

  res.json({
    uploads_updated: result.changes,
    links_updated: linkResult.changes,
  });
});

// =====================================================
// POST /backfill — Reset skipped flags + trigger backfill run
// GET  /backfill — Get backfill stats
// =====================================================
router.get('/backfill', (req, res) => {
  const { getBackfillStats } = require('../db');
  res.json(getBackfillStats());
});

router.post('/backfill', async (req, res) => {
  const { resetAllBackfillSkipped, getBackfillStats } = require('../db');
  const reset = resetAllBackfillSkipped();
  const stats = getBackfillStats();

  const { runOnce } = require('../cron/reuploadStale');
  runOnce().catch((err) => console.error('Manual backfill error:', err));

  res.json({ reset_count: reset, stats, message: 'Backfill triggered in background' });
});

// =====================================================
// POST /refresh — Trigger a devnet refresh run now
// GET  /refresh — How many uploads are past the refresh threshold
// =====================================================
router.get('/refresh', (req, res) => {
  const { findStaleUploads } = require('../db');
  const days = parseInt(process.env.REFRESH_AFTER_DAYS || '20', 10);
  const stale = findStaleUploads({ olderThanDays: days, limit: 1000 });
  res.json({ threshold_days: days, stale_count: stale.length });
});

router.post('/refresh', (req, res) => {
  const { runOnce } = require('../cron/refreshDevnet');
  runOnce().catch((err) => console.error('Manual refresh error:', err));
  res.json({ message: 'Refresh triggered in background' });
});

// POST /optimize/:uuid — Trigger video optimization for an existing upload
router.post('/optimize/:uuid', async (req, res) => {
  const { getUploadById } = require('../db');
  const { optimizeAndUpload } = require('../utils/videoOptimize');
  const upload = getUploadById(req.params.uuid);
  if (!upload) return res.status(404).json({ error: 'not_found' });
  if (!upload.content_type?.startsWith('video/')) {
    return res.status(400).json({ error: 'not_a_video' });
  }
  if (upload.stream_url) {
    return res.json({ message: 'already_optimized', stream_url: upload.stream_url });
  }
  optimizeAndUpload(upload.uuid, upload.content_type, upload.filename)
    .catch(err => console.error(`⚠️ Admin optimize failed: ${err.message}`));
  res.json({ message: 'Optimization triggered in background' });
});

// PATCH /uploads/:uuid — Update upload metadata (content_type, title, caption, visibility, refresh_skipped)
router.patch('/uploads/:uuid', (req, res) => {
  const { getUploadById, db } = require('../db');
  const upload = getUploadById(req.params.uuid);
  if (!upload) return res.status(404).json({ error: 'not_found' });
  const allowed = ['content_type', 'title', 'caption', 'visibility', 'refresh_skipped'];
  const updates = [];
  const values = [];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      updates.push(`${key} = ?`);
      values.push(req.body[key]);
    }
  }
  if (!updates.length) return res.status(400).json({ error: 'nothing to update' });
  values.push(req.params.uuid);
  db.prepare(`UPDATE uploads SET ${updates.join(', ')} WHERE uuid = ?`).run(...values);
  res.json({ upload: getUploadById(req.params.uuid) });
});

// POST /uploads/bulk-skip-refresh — Mark multiple uploads to skip devnet refresh
router.post('/uploads/bulk-skip-refresh', (req, res) => {
  const { setRefreshSkipped } = require('../db');
  const { uuids, skip = true } = req.body;
  if (!Array.isArray(uuids) || uuids.length === 0) {
    return res.status(400).json({ error: 'uuids must be a non-empty array' });
  }
  let updated = 0;
  for (const uuid of uuids) {
    const result = setRefreshSkipped(uuid, skip);
    if (result.changes > 0) updated++;
  }
  res.json({ updated, total: uuids.length, refresh_skipped: !!skip });
});

module.exports = router;
