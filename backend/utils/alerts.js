/**
 * Alerting via Resend. Skips silently if RESEND_API_KEY isn't set so
 * dev environments don't fail. Each alert key is rate-limited via an
 * in-memory cooldown so we don't spam the inbox if a condition stays
 * unhealthy for hours.
 */
const { Resend } = require('resend');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ALERT_FROM = process.env.ALERT_FROM || 'alerts@offsetworks.xyz';
const ALERT_TO = process.env.ALERT_TO || 'gasolomonc@gmail.com';
const COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6h

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
const lastSent = new Map();

async function sendAlert({ key, subject, html }) {
  const last = lastSent.get(key) || 0;
  if (Date.now() - last < COOLDOWN_MS) return { skipped: 'cooldown' };
  if (!resend) {
    console.log(`📭 Alert (no Resend key): ${subject}`);
    lastSent.set(key, Date.now());
    return { skipped: 'no-api-key' };
  }
  try {
    const result = await resend.emails.send({
      from: ALERT_FROM,
      to: ALERT_TO,
      subject,
      html,
    });
    lastSent.set(key, Date.now());
    console.log(`📨 Alert sent: ${subject}`);
    return { id: result.data?.id };
  } catch (err) {
    console.error(`❌ Resend send failed: ${err.message}`);
    return { error: err.message };
  }
}

module.exports = { sendAlert };
