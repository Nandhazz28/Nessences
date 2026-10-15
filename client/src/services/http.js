import { resolveApiBase } from "../urlConfig.js";
const BASE = resolveApiBase(import.meta.env.VITE_API_URL); // validated at build time (vite.config.js); 'same-origin' and unset both mean relative /api

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
  get isNetwork() {
    return this.status === 0;
  }
  get isTransient() {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
  get isAuth() {
    return this.status === 401;
  }
}

const expiredListeners = new Set();
export const onSessionExpired = (fn) => {
  expiredListeners.add(fn);
  return () => expiredListeners.delete(fn);
};

const AUTH_PATHS =
  /^\/api\/(admin\/)?auth\/(login|register|refresh|logout|forgot-password|reset-password|verify-email|resend-verification)/;
const now = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

let inFlight = null;
let lastRefreshOkAt = -1;

function refreshSession() {
  inFlight ??= (async () => {
    try {
      const res = await fetch(`${BASE}/api/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "X-Requested-With": "nessence" },
      });
      if (res.ok) {
        lastRefreshOkAt = now();
        return "ok";
      }
      return res.status === 401 || res.status === 403 ? "ended" : "transient";
    } catch {
      return "transient";
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export const REQUEST_TIMEOUT_MS = 30_000;
async function send(
  path,
  { method, body, query, signal, timeoutMs = REQUEST_TIMEOUT_MS },
) {
  const qs = query
    ? "?" +
      new URLSearchParams(
        Object.entries(query).filter(
          ([, v]) => v !== undefined && v !== "" && v !== null,
        ),
      ).toString()
    : "";
  const ctl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctl.abort();
  }, timeoutMs);
  const relay = () => ctl.abort();
  signal?.addEventListener("abort", relay);
  try {
    return await fetch(`${BASE}${path}${qs}`, {
      method,
      credentials: "include",
      signal: ctl.signal,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        "X-Requested-With": "nessence",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if (timedOut)
      throw new ApiError(
        0,
        "TIMEOUT",
        "The server is taking longer than usual to respond. It may be starting up: please try again in a moment.",
      );
    if (e.name === "AbortError") throw e;
    throw new ApiError(
      0,
      "NETWORK_ERROR",
      "We could not reach the server. Check your connection and try again.",
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", relay);
  }
}

let RETRY_DELAYS = [500, 1500];
const RETRYABLE_STATUS = new Set([502, 503, 504]);
async function sendWithRetry(path, opts) {
  const idempotent =
    !opts.method || opts.method === "GET" || opts.method === "HEAD";
  for (let attempt = 0; ; attempt += 1) {
    let res;
    let err;
    try {
      res = await send(path, opts);
    } catch (e) {
      err = e;
    }
    const failed = err
      ? err instanceof ApiError && err.code === "NETWORK_ERROR"
      : RETRYABLE_STATUS.has(res.status);
    if (!idempotent || !failed || attempt >= RETRY_DELAYS.length) {
      if (err) throw err;
      return res;
    }
    await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
  }
}

const friendly = (status, json) => {
  if (json?.message) return json.message;
  if (status === 502 || status === 503 || status === 504)
    return "Nessence is temporarily unavailable. Please try again in a moment.";
  return "Something went wrong. Please try again.";
};

export async function request(path, opts = {}) {
  const { retry = true } = opts;
  const startedAt = now();
  let res = await sendWithRetry(path, opts);

  if (res.status === 401 && retry && !AUTH_PATHS.test(path)) {
    let outcome = lastRefreshOkAt > startedAt ? "ok" : await refreshSession();
    if (outcome === "ok") return request(path, { ...opts, retry: false });
    if (outcome === "ended") {
      expiredListeners.forEach((fn) => fn());
      if (path === "/api/auth/me")
        throw new ApiError(
          401,
          "SESSION_EXPIRED",
          "Your session has ended. Please sign in again.",
        );
      res = await sendWithRetry(path, opts);
      if (res.status === 401)
        throw new ApiError(
          401,
          "SESSION_EXPIRED",
          "Your session has ended. Please sign in again.",
        );
    } else {
      throw new ApiError(
        503,
        "SESSION_REFRESH_FAILED",
        "We could not refresh your session just now. Check your connection and try again.",
      );
    }
  }

  let json = null;
  try {
    json = await res.json();
  } catch {}
  if (!res.ok || !json?.success) {
    const e = new ApiError(
      res.status,
      json?.code ?? (res.status >= 500 ? "SERVER_UNAVAILABLE" : "UNKNOWN"),
      friendly(res.status, json),
      json?.details,
    );
    e.requestId =
      json?.requestId ?? res.headers.get("x-request-id") ?? undefined; // quote this to support: it finds the exact request in the server logs
    throw e;
  }
  return json;
}

export const __resetHttpForTests = ({ retryDelays } = {}) => {
  inFlight = null;
  lastRefreshOkAt = -1;
  expiredListeners.clear();
  RETRY_DELAYS = retryDelays ?? [500, 1500];
};
