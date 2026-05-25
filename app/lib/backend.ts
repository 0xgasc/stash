/**
 * Server-to-server fetch helpers for the Express backend.
 *
 * Sends the admin secret so the backend trusts the caller. The
 * Next.js layer is responsible for verifying the Supabase session
 * BEFORE calling these.
 */
const UPLOAD_SERVER = process.env.NEXT_PUBLIC_UPLOAD_SERVER || 'http://localhost:5050'
const ADMIN_SECRET = process.env.ADMIN_BACKEND_SECRET || ''

type BackendInit = Omit<RequestInit, 'headers'> & {
  headers?: Record<string, string>
}

export async function backendFetch(path: string, init: BackendInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    'X-Admin-Secret': ADMIN_SECRET,
    ...init.headers,
  }
  if (init.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }
  return fetch(`${UPLOAD_SERVER}${path}`, { ...init, headers })
}

export async function backendJson<T = unknown>(path: string, init: BackendInit = {}): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  const res = await backendFetch(path, init)
  let data: T | null = null
  try { data = await res.json() as T } catch { data = null }
  if (!res.ok) {
    const errMsg = (data && typeof data === 'object' && 'error' in data) ? (data as { error: string }).error : `HTTP ${res.status}`
    return { ok: false, status: res.status, data, error: errMsg }
  }
  return { ok: true, status: res.status, data }
}
