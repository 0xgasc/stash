/**
 * Webhook handlers for Stripe, Recurrente, and StablePay.
 *
 * These endpoints are called directly by payment providers — no
 * admin-secret required. Every provider MUST present a valid signature:
 * if the corresponding secret env var is not configured the endpoint
 * fails closed (501) instead of trusting unsigned input.
 *
 * Signatures are verified over the RAW request bytes (express.raw),
 * never over a re-serialized JSON.stringify(req.body) — re-serialization
 * is not byte-identical to what the provider signed.
 */
const express = require('express');
const crypto = require('crypto');
const { assignPlan, activatePendingPlan, getPlanBySlug, getPlanById } = require('../db');
const { sendAlert } = require('../utils/alerts');

const router = express.Router();

function computeEndsAt(plan) {
  if (plan.billing_period === 'one_time') return null;
  const d = new Date();
  if (plan.billing_period === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (plan.billing_period === 'yearly') d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

function timingSafeHex(sigHex, expectedHex) {
  const a = Buffer.from(String(sigHex), 'utf8');
  const b = Buffer.from(String(expectedHex), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function activatePlan(userId, plan, provider, reference) {
  const endsAt = computeEndsAt(plan);
  // Promote a pending row from the checkout flow if one exists;
  // otherwise create the active assignment directly.
  const promoted = activatePendingPlan(userId, plan.id, { payment_reference: reference, ends_at: endsAt });
  if (!promoted) {
    assignPlan(userId, {
      plan_id: plan.id,
      status: 'active',
      payment_status: 'paid',
      payment_provider: provider,
      payment_reference: reference,
      ends_at: endsAt,
    });
  }
  console.log(`✅ ${provider}: activated ${plan.slug} for user ${userId} (ref: ${reference})`);
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

function alertUnmatchedPayment(provider, summary) {
  console.error(`⚠️ ${provider}: payment received but could not be matched to a user/plan`, summary);
  sendAlert({
    key: `webhook-unmatched-${provider}`,
    subject: `[stash] ${provider} payment needs manual activation`,
    html: `<p>A verified <b>${provider}</b> webhook arrived but could not be matched to a user/plan automatically.</p>
<pre>${JSON.stringify(summary, null, 2).slice(0, 2000)}</pre>
<p>Activate manually via the admin panel (Users → assign plan).</p>`,
  }).catch(() => {});
}

function alertNotConfigured(provider) {
  console.error(`❌ ${provider} webhook hit but signing secret is not configured — rejecting`);
  sendAlert({
    key: `webhook-unconfigured-${provider}`,
    subject: `[stash] ${provider} webhook rejected — secret not configured`,
    html: `<p>A ${provider} webhook arrived but its signing secret env var is missing, so it was rejected (fail closed). Configure the secret to process payments.</p>`,
  }).catch(() => {});
}

// ─── Stripe ──────────────────────────────────────────
router.post('/stripe', express.raw({ type: 'application/json' }), (req, res) => {
  const SECRET = process.env.STRIPE_SECRET_KEY;
  const WH_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  if (!SECRET || !WH_SECRET) {
    alertNotConfigured('stripe');
    return res.status(501).send('not configured');
  }

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
    const plan = planSlug ? getPlanBySlug(planSlug) : null;
    if (userId && plan) activatePlan(userId, plan, 'stripe', s.id);
    else alertUnmatchedPayment('stripe', { type: event.type, session: s.id, metadata: s.metadata });
  }

  if (event.type === 'invoice.paid') {
    const inv = event.data.object;
    const sub = inv.subscription_details || {};
    const userId = sub.metadata?.user_id || inv.metadata?.user_id;
    const planSlug = sub.metadata?.plan_slug || inv.metadata?.plan_slug;
    const plan = planSlug ? getPlanBySlug(planSlug) : null;
    if (userId && plan) activatePlan(userId, plan, 'stripe', inv.id);
    // First invoice arrives alongside checkout.session.completed without
    // subscription metadata — no alert; the session event handles it.
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    const userId = sub.metadata?.user_id;
    if (userId) downgradeToFree(userId, 'stripe', sub.id, 'subscription cancelled');
  }

  res.json({ received: true });
});

// ─── Recurrente ──────────────────────────────────────
// NOTE: metadata round-trip from checkout-URL query params is NOT
// guaranteed by Recurrente. When metadata is absent the payment is
// alerted for manual activation rather than silently dropped.
router.post('/recurrente', express.raw({ type: 'application/json' }), (req, res) => {
  const SECRET = process.env.RECURRENTE_SECRET_KEY;
  if (!SECRET) {
    alertNotConfigured('recurrente');
    return res.status(501).json({ error: 'not configured' });
  }

  const sig = req.headers['x-recurrente-signature'] || req.headers['svix-signature'] || '';
  const expected = crypto.createHmac('sha256', SECRET).update(req.body).digest('hex');
  if (!timingSafeHex(sig, expected)) {
    console.error('Recurrente sig mismatch');
    return res.status(400).json({ error: 'invalid signature' });
  }

  let body;
  try { body = JSON.parse(req.body.toString('utf8')); } catch { return res.status(400).json({ error: 'invalid json' }); }

  const { event, data } = body;
  if (event === 'payment.completed' || event === 'charge.completed') {
    const userId = data?.metadata?.user_id;
    const planId = data?.metadata?.plan_id ? Number(data.metadata.plan_id) : null;
    const plan = planId ? getPlanById(planId) : null;
    if (userId && plan) {
      activatePlan(userId, plan, 'recurrente', data.id || data.charge_id);
    } else {
      alertUnmatchedPayment('recurrente', { event, id: data?.id, email: data?.customer?.email || data?.customer_email, amount: data?.amount });
    }
  }

  if (event === 'subscription.cancelled') {
    const userId = data?.metadata?.user_id;
    if (userId) downgradeToFree(userId, 'recurrente', data.id, 'subscription cancelled');
  }

  res.json({ received: true });
});

// ─── StablePay ───────────────────────────────────────
// This is the ONLY path that activates a crypto-paid plan. The client
// "confirm" endpoint merely records a pending row — see checkout.js.
router.post('/stablepay', express.raw({ type: 'application/json' }), (req, res) => {
  const SECRET = process.env.STABLEPAY_WEBHOOK_SECRET;
  if (!SECRET) {
    alertNotConfigured('stablepay');
    return res.status(501).json({ error: 'not configured' });
  }

  const sig = req.headers['x-stablepay-signature'] || '';
  const expected = crypto.createHmac('sha256', SECRET).update(req.body).digest('hex');
  if (!timingSafeHex(sig, expected)) {
    console.error('StablePay sig mismatch');
    return res.status(400).json({ error: 'invalid signature' });
  }

  let body;
  try { body = JSON.parse(req.body.toString('utf8')); } catch { return res.status(400).json({ error: 'invalid json' }); }

  const { event, payment } = body;
  if (event === 'payment.confirmed' || event === 'payment.completed') {
    const userId = payment?.metadata?.user_id;
    const planSlug = payment?.metadata?.plan_slug;
    const plan = planSlug ? getPlanBySlug(planSlug) : null;
    if (userId && plan) {
      activatePlan(userId, plan, 'stablepay', payment.id || payment.txHash);
    } else {
      alertUnmatchedPayment('stablepay', { event, id: payment?.id, txHash: payment?.txHash, amount: payment?.amount });
    }
  }

  res.json({ received: true });
});

module.exports = router;
module.exports.computeEndsAt = computeEndsAt;
module.exports.timingSafeHex = timingSafeHex;
