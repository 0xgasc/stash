/**
 * Checkout routes — create payment sessions for all three providers.
 *
 * All routes require the admin-secret header (called from the Next.js proxy,
 * never from the browser).
 */
const express = require('express');
const { getPlanBySlug, getUserById } = require('../db');

const router = express.Router();
router.use(express.json());

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

function requireTrusted(req, res, next) {
  const secret = req.headers['x-admin-secret'];
  if (!secret || secret !== process.env.ADMIN_BACKEND_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}
router.use(requireTrusted);

function validateRequest(req, res) {
  const { user_id, plan_slug } = req.body;
  if (!user_id || !plan_slug) {
    res.status(400).json({ error: 'user_id and plan_slug required' });
    return null;
  }
  const plan = getPlanBySlug(plan_slug);
  if (!plan || !plan.is_active) {
    res.status(404).json({ error: 'plan not found' });
    return null;
  }
  if (plan.price_cents === 0) {
    res.status(400).json({ error: 'cannot checkout a free plan' });
    return null;
  }
  const user = getUserById(user_id);
  if (!user) {
    res.status(404).json({ error: 'user not found' });
    return null;
  }
  return { user, plan };
}

// POST /checkout/stripe
router.post('/stripe', async (req, res) => {
  const ctx = validateRequest(req, res);
  if (!ctx) return;
  const { user, plan } = ctx;

  const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET) return res.status(500).json({ error: 'stripe not configured' });
  if (!plan.stripe_price_id) return res.status(400).json({ error: 'stripe not configured for this plan' });

  try {
    const stripe = require('stripe')(STRIPE_SECRET);
    const isSubscription = plan.billing_period === 'monthly' || plan.billing_period === 'yearly';

    const params = {
      mode: isSubscription ? 'subscription' : 'payment',
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      success_url: `${FRONTEND_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/pricing`,
      metadata: { user_id: user.id, plan_id: String(plan.id), plan_slug: plan.slug },
      client_reference_id: user.id,
    };
    if (user.email) params.customer_email = user.email;

    const session = await stripe.checkout.sessions.create(params);
    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err.message);
    res.status(500).json({ error: 'checkout failed' });
  }
});

// POST /checkout/recurrente
router.post('/recurrente', (req, res) => {
  const ctx = validateRequest(req, res);
  if (!ctx) return;
  const { user, plan } = ctx;

  if (!plan.recurrente_url) {
    return res.status(400).json({ error: 'recurrente not configured for this plan' });
  }

  const url = new URL(plan.recurrente_url);
  url.searchParams.set('user_id', user.id);
  url.searchParams.set('plan_id', String(plan.id));
  url.searchParams.set('success_url', `${FRONTEND_URL}/checkout/success?provider=recurrente&plan=${plan.slug}`);

  res.json({ url: url.toString() });
});

// POST /checkout/stablepay-confirm
// Called after the StablePay widget fires payment.success on the client.
// The widget handles the on-chain payment; we just activate the plan.
router.post('/stablepay-confirm', (req, res) => {
  const { user_id, plan_slug, payment } = req.body;
  if (!user_id || !plan_slug) {
    return res.status(400).json({ error: 'user_id and plan_slug required' });
  }
  const plan = getPlanBySlug(plan_slug);
  if (!plan || !plan.is_active || plan.price_cents === 0) {
    return res.status(404).json({ error: 'plan not found' });
  }
  const user = getUserById(user_id);
  if (!user) return res.status(404).json({ error: 'user not found' });

  const ref = payment?.txHash || payment?.transactionHash || payment?.id || null;
  const { assignPlan } = require('../db');
  const endsAt = plan.billing_period === 'one_time' ? null : (() => {
    const d = new Date();
    if (plan.billing_period === 'monthly') d.setMonth(d.getMonth() + 1);
    else if (plan.billing_period === 'yearly') d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().replace('T', ' ').slice(0, 19);
  })();

  assignPlan(user_id, {
    plan_id: plan.id,
    status: 'active',
    payment_status: 'paid',
    payment_provider: 'stablepay',
    payment_reference: ref,
    ends_at: endsAt,
  });
  console.log(`✅ StablePay widget: activated ${plan.slug} for user ${user_id} (ref: ${ref})`);
  res.json({ ok: true });
});

module.exports = router;
