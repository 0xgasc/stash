/**
 * App settings with Vercel KV -> env var -> hardcoded default fallback.
 *
 * getSettings() reads from KV first, falls back to env vars, then defaults.
 * updateSettings() writes to KV (throws if KV not configured).
 *
 * Defaults: MAX_ANONYMOUS_UPLOADS=3, MAX_FILE_SIZE_MB=6144, LINK_EXPIRY_DAYS=14
 */
import { kv } from '@vercel/kv'

export interface AppSettings {
  MAX_ANONYMOUS_UPLOADS: number
  MAX_FILE_SIZE_MB: number
  LINK_EXPIRY_DAYS: number
}

export const SETTING_DEFAULTS: AppSettings = {
  MAX_ANONYMOUS_UPLOADS: 3,
  MAX_FILE_SIZE_MB: 6144,
  LINK_EXPIRY_DAYS: 14,
}

const KV_KEY = 'app:settings'

function isKvConfigured(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
}

export async function getSettings(): Promise<AppSettings> {
  if (isKvConfigured()) {
    try {
      const stored = await kv.get<Partial<AppSettings>>(KV_KEY)
      if (stored) {
        return { ...SETTING_DEFAULTS, ...stored }
      }
    } catch (e) {
      console.warn('KV read failed, falling back to env/defaults:', e)
    }
  }

  return {
    MAX_ANONYMOUS_UPLOADS:
      parseInt(process.env.MAX_ANONYMOUS_UPLOADS || '') || SETTING_DEFAULTS.MAX_ANONYMOUS_UPLOADS,
    MAX_FILE_SIZE_MB:
      parseInt(process.env.MAX_FILE_SIZE_MB || '') || SETTING_DEFAULTS.MAX_FILE_SIZE_MB,
    LINK_EXPIRY_DAYS:
      parseInt(process.env.LINK_EXPIRY_DAYS || '') || SETTING_DEFAULTS.LINK_EXPIRY_DAYS,
  }
}

export async function updateSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  if (!isKvConfigured()) {
    throw new Error('Vercel KV not configured. Settings are read-only.')
  }

  const current = await getSettings()
  const updated = { ...current, ...partial }
  await kv.set(KV_KEY, updated)
  return updated
}
