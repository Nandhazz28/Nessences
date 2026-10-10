// Single API client: cookies, CSRF header, one silent refresh on 401, normalised errors.
const BASE = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details; }
  get isNetwork() { return this.status === 0; }
}

let refreshing = null;
const refresh = () => (refreshing ??= fetch(`${BASE}/api/auth/refresh`, {
  method: 'POST', credentials: 'include', headers: { 'X-Requested-With': 'nessence' },
}).then((r) => r.ok).finally(() => { refreshing = null; }));

export async function request(path, { method = 'GET', body, query, signal, retry = true } = {}) {
  const qs = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== '' && v !== null)).toString() : '';
  let res;
  try {
    res = await fetch(`${BASE}${path}${qs}`, {
      method, credentials: 'include', signal,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), 'X-Requested-With': 'nessence' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError(0, 'NETWORK_ERROR', 'We could not reach the server. Check your connection and try again.');
  }
  if (res.status === 401 && retry && !/^\/api\/auth\/(login|register|refresh|logout)/.test(path)) {
    if (await refresh()) return request(path, { method, body, query, signal, retry: false });
  }
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON error page */ }
  if (!res.ok || !json?.success) {
    throw new ApiError(res.status, json?.code ?? 'UNKNOWN', json?.message ?? 'Something went wrong. Please try again.', json?.details);
  }
  return json;
}
