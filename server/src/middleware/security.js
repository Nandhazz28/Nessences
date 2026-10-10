import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

export const securityHeaders = helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } });

export const corsPolicy = cors({
  origin: env.CLIENT_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'X-Requested-With'],
});

// Strip Mongo operator keys ($...) and dotted keys from user-supplied objects.
const clean = (v) => {
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      if (k.startsWith('$') || k.includes('.')) continue;
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

// CSRF defence for cookie auth: SameSite cookies + a custom header that cross-site forms cannot set.
export const csrfGuard = (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.originalUrl.startsWith('/api/webhooks/')) return next(); // verified by gateway signature
  if (req.get('x-requested-with') !== 'nessence') return next(new ApiError(403, 'CSRF_REJECTED', 'Request rejected'));
  next();
};

const limiter = (windowMs, limit, code) =>
  rateLimit({
    windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ success: false, code, message: 'Too many requests. Please try again shortly.' }),
  });
export const globalLimiter = limiter(15 * 60 * 1000, 600, 'RATE_LIMITED');
export const authLimiter = limiter(15 * 60 * 1000, 30, 'AUTH_RATE_LIMITED');
// Separate buckets so one public form can never lock out sign-in (each limiter instance counts per client IP on its own).
export const staffLoginLimiter = limiter(15 * 60 * 1000, 20, 'STAFF_AUTH_RATE_LIMITED');
export const newsletterLimiter = limiter(60 * 60 * 1000, 15, 'NEWSLETTER_RATE_LIMITED');
export const trackOrderLimiter = limiter(15 * 60 * 1000, 20, 'TRACK_RATE_LIMITED');
export const contactLimiter = limiter(60 * 60 * 1000, 5, 'CONTACT_RATE_LIMITED');
export const reviewLimiter = limiter(60 * 60 * 1000, 20, 'REVIEW_RATE_LIMITED');
