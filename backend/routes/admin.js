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

module.exports = router;
