/**
 * Looks up country/region/city from an IP using ipapi.co (free, no key,
 * 1000 req/day). Per-IP results are cached on the uploads table itself
 * (geo_looked_up_at), so repeat IPs only resolve once.
 *
 * Fire-and-forget — never throws into the caller. Designed to run
 * after a successful upload without blocking the response.
 */
const { updateGeo, findCachedGeoForIp, findUuidsNeedingGeo } = require('../db');

const SKIP_PREFIXES = ['10.', '127.', '192.168.', '172.16.', '172.17.', '172.18.', '172.19.', '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.', '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.', '::1'];

function isPrivate(ip) {
  if (!ip) return true;
  return SKIP_PREFIXES.some((p) => ip.startsWith(p)) || ip === 'localhost';
}

async function fetchGeo(ip) {
  const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
    headers: { 'User-Agent': 'stash-upload-server' },
  });
  if (!res.ok) throw new Error(`ipapi.co returned ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`ipapi.co error: ${data.reason || 'unknown'}`);
  return {
    country: data.country_code || data.country || null,
    region: data.region || null,
    city: data.city || null,
  };
}

async function scheduleGeoLookup(uuid, ip) {
  if (!uuid || !ip || isPrivate(ip)) return;

  // Check cached result for this IP first — saves API quota
  const cached = findCachedGeoForIp(ip);
  if (cached) {
    try { updateGeo(uuid, cached); } catch (e) { console.error('geo cache write failed:', e.message); }
    return;
  }

  // Fire-and-forget the network call
  try {
    const geo = await fetchGeo(ip);
    // Apply to all uuids from this IP that don't yet have geo
    const uuidsToUpdate = [uuid, ...findUuidsNeedingGeo(ip).filter(u => u !== uuid)];
    for (const u of uuidsToUpdate) {
      try { updateGeo(u, geo); } catch (e) { /* row may have been deleted */ }
    }
  } catch (err) {
    console.error(`geo lookup failed for ${ip}: ${err.message}`);
  }
}

module.exports = { scheduleGeoLookup };
