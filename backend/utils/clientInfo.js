/**
 * Extracts client identity info from a request for upload logging.
 * Honors X-Forwarded-For (we `trust proxy` in server.js) so the real
 * client IP is captured even behind Railway/Render/Cloudflare.
 */
function getClientInfo(req) {
  const ip = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || null;
  const userAgent = req.headers['user-agent'] || null;
  const referer = req.headers.referer || req.headers.referrer || null;
  return {
    ip_address: ip,
    user_agent: userAgent ? userAgent.slice(0, 500) : null,
    referer: referer ? referer.slice(0, 500) : null,
  };
}

module.exports = { getClientInfo };
