import { z } from 'zod';

const bool = (def) => z.enum(['true', 'false']).default(def).transform((v) => v === 'true');
const opt = z.string().optional().transform((v) => v?.trim() || undefined);
const emptyAsUndefined = (schema) => z.preprocess((v) => (v === '' ? undefined : v), schema);

const FOLDER = /^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*$/;

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000), 
  HOST: z.string().default('0.0.0.0'),
  DB_STARTUP_TIMEOUT_SECONDS: z.coerce.number().int().min(0).max(900).optional(), 
  SHUTDOWN_TIMEOUT_SECONDS: z.coerce.number().int().min(1).max(120).default(25), 
  MONGODB_MAX_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(10),
  LOG_LEVEL: z.string().default('info'),
  MONGODB_URI: z.string().min(1, 'required'),
  JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'must be at least 32 characters'),
  REQUIRE_EMAIL_VERIFICATION: bool('true'),
  CLIENT_URL: z.string().url().optional().transform((u) => u?.replace(/\/+$/, '')),
  SERVER_URL: z.string().url().optional().transform((u) => u?.replace(/\/+$/, '')),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  COOKIE_DOMAIN: opt,
  ALLOWED_ORIGINS: z.string().optional().default(''),
  REFRESH_REUSE_GRACE_SECONDS: z.coerce.number().int().min(0).max(120).default(20), 
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1), 

  BREVO_API_KEY: opt,
  BREVO_SENDER_EMAIL: opt,
  BREVO_SENDER_NAME: emptyAsUndefined(z.string().trim().min(1).max(70).default('Nessence')),
  BREVO_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
  EMAIL_DEV_LOG_BODY: bool('false'), 

  PAYMENT_PROVIDER: z.string().default('razorpay'),
  PAYMENT_KEY: opt,
  PAYMENT_SECRET: opt,
  PAYMENT_WEBHOOK_SECRET: opt,

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

  const host = (u) => { try { return new URL(u).hostname; } catch { return undefined; } };
  const local = (h) => !h || h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.localhost');
  if (prod) {
    for (const k of ['CLIENT_URL', 'SERVER_URL']) {
      if (!v[k]) add(k, 'required in production (it is used for CORS, cookies and the links inside emails)');
      else if (local(host(v[k]))) add(k, 'must be the real public URL in production, not localhost');
      else if (!v[k].startsWith('https://')) add(k, 'must use https in production (cookies are Secure)');
    }
  }
  for (const o of v.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)) {
    let u; try { u = new URL(o); } catch { add('ALLOWED_ORIGINS', `"${o}" is not a valid origin`); continue; }
    if (u.origin !== o) add('ALLOWED_ORIGINS', `"${o}" must be a bare origin (scheme + host [+ port]) with no path, query or trailing slash; wildcards are not supported`);
    else if (prod && (u.protocol !== 'https:' || local(u.hostname))) add('ALLOWED_ORIGINS', `"${o}" must be a public https origin in production`);
  }
  if (v.COOKIE_SAMESITE === 'none' && !prod) add('COOKIE_SAMESITE', 'none requires Secure cookies, which are only issued in production; use lax in development');
  if (v.COOKIE_DOMAIN) {
    const d = v.COOKIE_DOMAIN.replace(/^\./, '').toLowerCase();
    if (/[/:\s]/.test(d)) add('COOKIE_DOMAIN', 'must be a bare domain such as example.com (no scheme, port or path); leave it unset unless you need to share cookies across subdomains');
    else if (isPublicSuffix(d)) add('COOKIE_DOMAIN', `"${d}" is a public suffix: browsers reject cookies scoped to it. Leave COOKIE_DOMAIN unset`);
    else {
      const ok = (h) => h && (h === d || h.endsWith(`.${d}`));
      if (v.CLIENT_URL && v.SERVER_URL && !ok(host(v.CLIENT_URL)) && !ok(host(v.SERVER_URL))) add('COOKIE_DOMAIN', 'matches neither CLIENT_URL nor SERVER_URL, so browsers would discard every auth cookie. Leave it unset');
    }
  }

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
  CLIENT_URL: v.CLIENT_URL ?? 'http://localhost:5173',
  DB_STARTUP_TIMEOUT_SECONDS: v.DB_STARTUP_TIMEOUT_SECONDS ?? (v.NODE_ENV === 'production' ? 120 : 0),
  ALLOWED_ORIGINS_LIST: [...new Set([v.CLIENT_URL ?? 'http://localhost:5173', ...v.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)])],
  SERVER_URL: v.SERVER_URL ?? 'http://localhost:4000',
  STORAGE_PROVIDER: v.STORAGE_PROVIDER ?? (v.NODE_ENV === 'production' ? 'cloudinary' : 'local'),
}));

const PLATFORM_SUFFIXES = ['vercel.app', 'onrender.com', 'netlify.app', 'herokuapp.com', 'railway.app', 'up.railway.app', 'fly.dev', 'pages.dev', 'workers.dev', 'github.io', 'azurewebsites.net', 'web.app', 'firebaseapp.com', 'ngrok.app', 'ngrok-free.app', 'cloudfront.net', 'amplifyapp.com'];
const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'gov', 'ac', 'edu']);
export const isPublicSuffix = (d) => PLATFORM_SUFFIXES.includes(d) || (d.split('.').length === 2 && SECOND_LEVEL.has(d.split('.')[0]) && d.split('.')[1].length === 2) || !d.includes('.');
export function siteOf(hostname) {
  const h = String(hostname).toLowerCase(); const p = h.split('.');
  const plat = PLATFORM_SUFFIXES.find((s) => h.endsWith(`.${s}`));
  if (plat) return `${p[p.length - plat.split('.').length - 1]}.${plat}`;
  if (p.length >= 3 && SECOND_LEVEL.has(p[p.length - 2]) && p[p.length - 1].length === 2) return p.slice(-3).join('.');
  return p.slice(-2).join('.');
}
export function configWarnings(c) {
  const out = []; const h = (u) => { try { return new URL(u).hostname; } catch { return ''; } };
  if (c.NODE_ENV === 'production') {
    const same = siteOf(h(c.CLIENT_URL)) === siteOf(h(c.SERVER_URL));
    if (!same && c.COOKIE_SAMESITE !== 'none') out.push(`CLIENT_URL (${h(c.CLIENT_URL)}) and SERVER_URL (${h(c.SERVER_URL)}) are different sites but COOKIE_SAMESITE=${c.COOKIE_SAMESITE}: browsers will not send the login cookies on API calls. Either serve the API under the storefront's domain (reverse proxy / rewrite) or set COOKIE_SAMESITE=none (note: Safari blocks third-party cookies regardless).`);
    if (same && c.COOKIE_SAMESITE === 'none') out.push('CLIENT_URL and SERVER_URL are same-site; COOKIE_SAMESITE=none is unnecessary and weakens CSRF protection. Prefer lax.');
  }
  return out;
}

export function parseEnv(source = process.env) {
  const r = schema.safeParse(source);
  if (r.success) return { ok: true, data: r.data };
  return { ok: false, errors: r.error.issues.map((i) => `${i.path.join('.') || 'env'}: ${i.message}`) };
}
