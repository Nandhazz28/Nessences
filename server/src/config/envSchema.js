import { z } from 'zod';

const bool = (def) => z.enum(['true', 'false']).default(def).transform((v) => v === 'true');
const opt = z.string().optional().transform((v) => v?.trim() || undefined);
const emptyAsUndefined = (schema) => z.preprocess((v) => (v === '' ? undefined : v), schema);

// Cloudinary folder prefix: lowercase path segments only, so a public_id can be checked against it before any destroy call.
const FOLDER = /^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*$/;

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.string().default('info'),
  MONGODB_URI: z.string().min(1, 'required'),
  JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'must be at least 32 characters'),
  REQUIRE_EMAIL_VERIFICATION: bool('true'),
  CLIENT_URL: z.string().url().default('http://localhost:5173').transform((u) => u.replace(/\/+$/, '')), // an Origin never has a trailing slash; CORS would silently fail
  SERVER_URL: z.string().url().default('http://localhost:4000').transform((u) => u.replace(/\/+$/, '')),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  COOKIE_DOMAIN: opt,

  // --- Email: Brevo transactional API ---
  BREVO_API_KEY: opt,
  BREVO_SENDER_EMAIL: opt,
  BREVO_SENDER_NAME: emptyAsUndefined(z.string().trim().min(1).max(70).default('Nessence')),
  BREVO_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
  EMAIL_DEV_LOG_BODY: bool('false'), // development only: print message bodies (incl. links) instead of sending

  PAYMENT_PROVIDER: z.string().default('razorpay'),
  PAYMENT_KEY: opt,
  PAYMENT_SECRET: opt,
  PAYMENT_WEBHOOK_SECRET: opt,

  // --- Image storage ---
  STORAGE_PROVIDER: emptyAsUndefined(z.enum(['cloudinary', 'local']).optional()),
  CLOUDINARY_CLOUD_NAME: opt,
  CLOUDINARY_API_KEY: opt,
  CLOUDINARY_API_SECRET: opt,
  CLOUDINARY_FOLDER: emptyAsUndefined(z.string().trim().max(60).default('nessence')),
  CLOUDINARY_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
  IMAGE_MAX_BYTES: z.coerce.number().int().min(50_000).max(25_000_000).default(5 * 1024 * 1024),
  IMAGE_STORAGE: opt, // removed (S3 era). Only read so a stale deployment fails loudly instead of silently ignoring it.
}).superRefine((v, ctx) => {
  const add = (path, message) => ctx.addIssue({ code: 'custom', path: [path], message });
  const prod = v.NODE_ENV === 'production';
  const provider = v.STORAGE_PROVIDER ?? (prod ? 'cloudinary' : 'local');

  if (v.IMAGE_STORAGE === 's3') add('IMAGE_STORAGE', 'S3 storage was removed. Set STORAGE_PROVIDER=cloudinary and remove IMAGE_STORAGE*');
  if (provider === 'local' && prod) add('STORAGE_PROVIDER', 'local disk storage is for development only; production must use STORAGE_PROVIDER=cloudinary');
  if (provider === 'cloudinary') {
    for (const k of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']) if (!v[k]) add(k, 'required when STORAGE_PROVIDER=cloudinary');
    if (!FOLDER.test(v.CLOUDINARY_FOLDER)) add('CLOUDINARY_FOLDER', 'use lowercase letters, digits, "-" or "_", with "/" between segments (e.g. nessence)');
  }

  if (v.BREVO_API_KEY && !v.BREVO_SENDER_EMAIL) add('BREVO_SENDER_EMAIL', 'required when BREVO_API_KEY is set (must be a sender verified in Brevo)');
  if (v.BREVO_SENDER_EMAIL && !z.string().email().safeParse(v.BREVO_SENDER_EMAIL).success) add('BREVO_SENDER_EMAIL', 'must be a valid email address');
  if (v.BREVO_API_KEY?.startsWith('xsmtpsib-')) add('BREVO_API_KEY', 'this looks like an SMTP key; the transactional API needs an API key (Brevo → SMTP & API → API Keys)');
  if (prod && !v.BREVO_API_KEY) add('BREVO_API_KEY', 'required in production (email verification and password reset depend on it)');
  if (prod && !v.BREVO_SENDER_EMAIL) add('BREVO_SENDER_EMAIL', 'required in production');
  if (prod && v.EMAIL_DEV_LOG_BODY) add('EMAIL_DEV_LOG_BODY', 'must not be enabled in production (it would write reset/verification links to the logs)');
}).transform((v) => ({
  ...v,
  STORAGE_PROVIDER: v.STORAGE_PROVIDER ?? (v.NODE_ENV === 'production' ? 'cloudinary' : 'local'),
}));

// Returns issues as plain strings: they name variables, never values, so they are safe to print.
export function parseEnv(source = process.env) {
  const r = schema.safeParse(source);
  if (r.success) return { ok: true, data: r.data };
  return { ok: false, errors: r.error.issues.map((i) => `${i.path.join('.') || 'env'}: ${i.message}`) };
}
