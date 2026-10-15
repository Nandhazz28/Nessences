import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

export const securityHeaders = helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
});

const allowed = new Set(env.ALLOWED_ORIGINS_LIST);
export const isAllowedOrigin = (o) => allowed.has(o);
export const corsPolicy = cors({
  origin: (origin, cb) => cb(null, !origin || allowed.has(origin)), // no Origin header = not a browser CORS request (same-origin, curl, webhooks)
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "X-Requested-With"],
  exposedHeaders: ["X-Request-Id", "Retry-After"],
  maxAge: 7200,
});

const clean = (v) => {
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      if (k.startsWith("$") || k.includes(".")) continue;
      out[k] = clean(val);
    }
    return out;
  }
  return v;
};
export const sanitizeInput = (req, _res, next) => {
  if (req.body) req.body = clean(req.body);
  if (req.query) {
    const q = clean(req.query);
    for (const k of Object.keys(req.query)) delete req.query[k];
    Object.assign(req.query, q);
  }
  next();
};

export const csrfGuard = (req, _res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.originalUrl.startsWith("/api/webhooks/")) return next(); // verified by gateway signature
  const origin = req.get("origin");
  if (origin && !allowed.has(origin))
    return next(new ApiError(403, "CSRF_REJECTED", "Request rejected")); // defence in depth for cross-site cookies
  if (req.get("x-requested-with") !== "nessence")
    return next(new ApiError(403, "CSRF_REJECTED", "Request rejected"));
  next();
};

const limiter = (windowMs, limit, code) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req, res) =>
      res
        .status(429)
        .json({
          success: false,
          code,
          message: "Too many requests. Please try again shortly.",
        }),
  });
export const globalLimiter = limiter(15 * 60 * 1000, 600, "RATE_LIMITED");
export const authLimiter = limiter(15 * 60 * 1000, 30, "AUTH_RATE_LIMITED");
export const staffLoginLimiter = limiter(
  15 * 60 * 1000,
  20,
  "STAFF_AUTH_RATE_LIMITED",
);
export const newsletterLimiter = limiter(
  60 * 60 * 1000,
  15,
  "NEWSLETTER_RATE_LIMITED",
);
export const trackOrderLimiter = limiter(
  15 * 60 * 1000,
  20,
  "TRACK_RATE_LIMITED",
);
export const contactLimiter = limiter(
  60 * 60 * 1000,
  5,
  "CONTACT_RATE_LIMITED",
);
export const reviewLimiter = limiter(60 * 60 * 1000, 20, "REVIEW_RATE_LIMITED");
