import { resolveApiBase } from "../urlConfig.js";
const BASE = resolveApiBase(import.meta.env.VITE_API_URL);
export class AdminApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let refreshing = null;
const refresh = () =>
  (refreshing ??= (async () => {
    try {
      const r = await fetch(`${BASE}/api/admin/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "X-Requested-With": "nessence" },
      });
      return r.ok
        ? "ok"
        : r.status === 401 || r.status === 403
          ? "ended"
          : "transient";
    } catch {
      return "transient";
    } finally {
      refreshing = null;
    }
  })());

export async function api(
  path,
  { method = "GET", body, query, form, signal, raw, retry = true } = {},
) {
  const qs = query
    ? "?" +
      new URLSearchParams(
        Object.entries(query).filter(
          ([, v]) => v !== undefined && v !== "" && v !== null,
        ),
      )
    : "";
  let res;
  try {
    res = await fetch(`${BASE}/api/admin${path}${qs}`, {
      method,
      credentials: "include",
      signal,
      headers: {
        "X-Requested-With": "nessence",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: form ?? (body ? JSON.stringify(body) : undefined),
    });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw new AdminApiError(
      0,
      "NETWORK_ERROR",
      "Cannot reach the server. Check your connection.",
    );
  }
  if (res.status === 401 && retry && !path.startsWith("/auth/login")) {
    const outcome = await refresh();
    if (outcome === "ok")
      return api(path, {
        method,
        body,
        query,
        form,
        signal,
        raw,
        retry: false,
      });
    if (outcome === "transient")
      throw new AdminApiError(
        503,
        "SESSION_REFRESH_FAILED",
        "We could not refresh your session just now. Check your connection and try again.",
      );
  }
  if (raw && res.ok) return res;
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* not JSON */
  }
  if (!res.ok || !json?.success)
    throw new AdminApiError(
      res.status,
      json?.code ?? "UNKNOWN",
      json?.message ?? "Something went wrong.",
      json?.details,
    );
  return json;
}
export const get = (p, query, signal) => api(p, { query, signal });
export const send = (method, p, body) => api(p, { method, body });
export const authApi = {
  login: (email, password) =>
    fetch(`${BASE}/api/admin/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "nessence",
      },
      body: JSON.stringify({ email, password }),
    }).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok)
        throw new AdminApiError(
          r.status,
          j.code,
          j.message ?? "Sign-in failed",
          j.details,
        );
      return j.data.staff;
    }),
  logout: () =>
    fetch(`${BASE}/api/admin/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: { "X-Requested-With": "nessence" },
    }),
  changePassword: (currentPassword, newPassword) =>
    fetch(`${BASE}/api/admin/auth/change-password`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "nessence",
      },
      body: JSON.stringify({ currentPassword, newPassword }),
    }).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok)
        throw new AdminApiError(
          r.status,
          j.code,
          j.message ?? "Could not change password",
          j.details,
        );
    }),
};
export const fieldErrors = (e) =>
  Object.fromEntries((e?.details ?? []).map((d) => [d.field, d.message]));
