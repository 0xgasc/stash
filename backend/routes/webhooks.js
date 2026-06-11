/**
 * Webhook handlers for Stripe, Recurrente, and StablePay.
 *
 * These endpoints are called directly by payment providers — no
 * admin-secret required. Each provider is verified via its own
 * signature mechanism.
 */
const express = require('express');
const crypto = require('crypto');
const { assignPlan, getPlanBySlug, getPlanById } = require('../db');

const router = express.Router();

function computeEndsAt(plan) {
  if (plan.billing_period === 'one_time') return null;
  const d = new Date();
  if (plan.billing_period === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (plan.billing_period === 'yearly') d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

function activatePlan(userId, plan, provider, reference) {
  assignPlan(userId, {
    plan_id: plan.id,
    status: 'active',
    payment_status: 'paid',
    payment_provider: provider,
    payment_reference: reference,
    ends_at: computeEndsAt(plan),
  });
  console.log(`✅ ${provider}: activated ${plan.slug} for user ${userId}`);
}

function downgradeToFree(userId, provider, reference, reason) {
  const free = getPlanBySlug('drift');
  if (!free) return;
  assignPlan(userId, {
    plan_id: free.id,
    status: 'active',
    payment_status: null,
    payment_provider: provider,
    payment_reference: reference,
    notes: reason,
  });
  console.log(`⬇️ ${provider}: downgraded user ${userId} to drift — ${reason}`);
}

// ─── Stripe ──────────────────────────────────────────
// Stripe requires the RAW body for signature verification.
// The route is mounted with express.raw() — NOT express.json().
router.post('/stripe', express.raw({ type: 'application/json' }), (req, res) => {
  const SECRET = process.env.STRIPE_SECRET_KEY;
  const WH_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  if (!SECRET || !WH_SECRET) return res.status(500).send('not configured');

  const stripe = require('stripe')(SECRET);
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], WH_SECRET);
  } catch (err) {
    console.error('Stripe sig failed:', err.message);
    return res.status(400).send('invalid signature');
  }

  if (event.type === 'checkout.session.completed') {
    const s = event.data.object;
    const userId = s.metadata?.user_id || s.client_reference_id;
    const planSlug = s.metadata?.plan_slug;
    if (userId && planSlug) {
      const plan = getPlanBySlug(planSlug);
      if (plan) activatePlan(userId, plan, 'stripe', s.id);
    }
  }

  if (event.type === 'invoice.paid') {
    const inv = event.data.object;
    const sub = inv.subscription_details || {};
    const userId = sub.metadata?.user_id || inv.metadata?.user_id;
    const planSlug = sub.metadata?.plan_slug || inv.metadata?.plan_slug;
    if (userId && planSlug) {
      const plan = getPlanBySlug(planSlug);
      if (plan) activatePlan(userId, plan, 'stripe', inv.id);
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    const userId = sub.metadata?.user_id;
    if (userId) downgradeToFree(userId, 'stripe', sub.id, 'subscription cancelled');
  }

  res.json({ received: true });
});

// ─── Recurrente ──────────────────────────────────────
router.post('/recurrente', express.json(), (req, res) => {
  const SECRET = process.env.RECURRENTE_SECRET_KEY;
  if (SECRET) {
    const sig = req.headers['x-recurrente-signature'] || '';
    const expected = crypto.createHmac('sha256', SECRET)
      .update(JSON.stringify(req.body)).digest('hex');
    if (sig !== expected) {
      console.error('Recurrente sig mismatch');
      return res.status(400).json({ error: 'invalid signature' });
    }
  }

  const { event, data } = req.body;
  if (event === 'payment.completed' || event === 'charge.completed') {
    const userId = data?.metadata?.user_id;
    const planId = data?.metadata?.plan_id ? Number(data.metadata.plan_id) : null;
    if (userId && planId) {
      const plan = getPlanById(planId);
      if (plan) activatePlan(userId, plan, 'recurrente', data.id || data.charge_id);
    }
  }

  if (event === 'subscription.cancelled') {
    const userId = data?.metadata?.user_id;
    if (userId) downgradeToFree(userId, 'recurrente', data.id, 'subscription cancelled');
  }

  res.json({ received: true });
});

// ─── StablePay ───────────────────────────────────────
router.post('/stablepay', express.json(), (req, res) => {
  const SECRET = process.env.STABLEPAY_WEBHOOK_SECRET;
  if (SECRET) {
    const sig = req.headers['x-stablepay-signature'] || '';
    const expected = crypto.createHmac('sha256', SECRET)
      .update(JSON.stringify(req.body)).digest('hex');
    if (sig !== expected) {
      console.error('StablePay sig mismatch');
      return res.status(400).json({ error: 'invalid signature' });
    }
  }

  const { event, payment } = req.body;
  if (event === 'payment.confirmed' || event === 'payment.completed') {
    const userId = payment?.metadata?.user_id;
    const planSlug = payment?.metadata?.plan_slug;
    if (userId && planSlug) {
      const plan = getPlanBySlug(planSlug);
      if (plan) activatePlan(userId, plan, 'stablepay', payment.id);
    }
  }

  res.json({ received: true });
});

module.exports = router;
