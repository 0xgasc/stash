export interface AppSettings {
  MAX_ANONYMOUS_UPLOADS: number
  MAX_FILE_SIZE_MB: number
  LINK_EXPIRY_DAYS: number
}

export const SETTING_DEFAULTS: AppSettings = {
  MAX_ANONYMOUS_UPLOADS: 1,
  MAX_FILE_SIZE_MB: 6144,
  LINK_EXPIRY_DAYS: 14,
}

export async function getSettings(): Promise<AppSettings> {
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
  throw new Error('Runtime settings updates not supported. Use environment variables.')
}
