/**
 * Server-side upload quota enforcement.
 *
 * This is the authoritative check — the Next.js layer's cookie/usage
 * checks are advisory UX only (cookies can be cleared, the backend can
 * be hit directly). Every upload costs real Irys/Arweave spend, so the
 * limits live here, where the money is spent.
 */
const {
  getActiveUserPlan, getDefaultPlan,
  getUserDailyUsage, getUserMonthlyUsage, countAnonUploadsTodayByIp,
} = require('../db');

const ANON_DAILY_IP_LIMIT = parseInt(process.env.ANON_DAILY_IP_LIMIT || '3', 10);

/**
 * @returns {{ok: true} | {ok: false, error: string}}
 */
function checkUploadQuota(userId, ip) {
  if (!userId) {
    const n = countAnonUploadsTodayByIp(ip);
    if (n >= ANON_DAILY_IP_LIMIT) {
      return { ok: false, error: 'Anonymous upload limit reached for today. Create a free account for more uploads.' };
    }
    return { ok: true };
  }

  // Users without an explicit plan row fall back to the default (Drift).
  const plan = getActiveUserPlan(userId) || getDefaultPlan();
  if (!plan) return { ok: true };

  if (plan.daily_upload_limit != null && getUserDailyUsage(userId) >= plan.daily_upload_limit) {
    return { ok: false, error: `Daily upload limit (${plan.daily_upload_limit}) reached. Resets at midnight UTC — or upgrade your plan.` };
  }
  if (plan.monthly_upload_limit != null) {
    const { uploads_this_month } = getUserMonthlyUsage(userId);
    if (uploads_this_month >= plan.monthly_upload_limit) {
      return { ok: false, error: `Monthly upload limit (${plan.monthly_upload_limit}) reached. Upgrade your plan for more.` };
    }
  }
  if (plan.total_upload_limit != null) {
    const { total_uploads } = getUserMonthlyUsage(userId);
    if (total_uploads >= plan.total_upload_limit) {
      return { ok: false, error: `Total upload limit (${plan.total_upload_limit}) reached.` };
    }
  }
  return { ok: true };
}

module.exports = { checkUploadQuota, ANON_DAILY_IP_LIMIT };
