import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SKIP, TEST_URI, SECRETS } from './helpers/integration.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://www.nessence.test'; const API = 'https://api.nessence.test';
let child; let base; let dbUri; const out = [];
const freePort = () => new Promise((res) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const proxied = (ip, extra = {}) => ({ 'x-forwarded-for': ip, 'x-forwarded-proto': 'https', 'x-requested-with': 'nessence', ...extra });
const call = async (p, { method = 'GET', headers = {}, body } = {}) => { const r = await fetch(base + p, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined }); const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* not json */ } return { status: r.status, headers: r.headers, text, json, cookies: r.headers.getSetCookie() }; };

before(async () => {
  if (SKIP) return;
  const port = await freePort(); base = `http://127.0.0.1:${port}`;
  const u = new URL(TEST_URI); u.pathname = `/nessence_prodmode_${process.pid}`; dbUri = u.toString();
  Object.assign(process.env, { NODE_ENV: 'test', LOG_LEVEL: 'silent', MONGODB_URI: dbUri, JWT_ACCESS_SECRET: SECRETS.access, JWT_REFRESH_SECRET: SECRETS.refresh });
  child = spawn(process.execPath, ['src/server.js'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH, NODE_ENV: 'production', LOG_LEVEL: 'info', PORT: String(port), HOST: '127.0.0.1', MONGODB_URI: dbUri,
    JWT_ACCESS_SECRET: SECRETS.access, JWT_REFRESH_SECRET: SECRETS.refresh, CLIENT_URL: SITE, SERVER_URL: API, ALLOWED_ORIGINS: 'https://nessence.test', COOKIE_SAMESITE: 'lax', TRUST_PROXY_HOPS: '1',
    PAYMENT_KEY: 'rzp_test_x', PAYMENT_SECRET: 'rzp_test_secret', PAYMENT_WEBHOOK_SECRET: 'whsec_x', STORAGE_PROVIDER: 'cloudinary', CLOUDINARY_CLOUD_NAME: 'demo-cloud', CLOUDINARY_API_KEY: '123456789012345', CLOUDINARY_API_SECRET: 'not-a-real-secret', BREVO_API_KEY: 'xkeysib-test', BREVO_SENDER_EMAIL: 'no-reply@nessence.test' } });
  child.stdout.on('data', (d) => out.push(String(d))); child.stderr.on('data', (d) => out.push(String(d)));
  for (let i = 0; i < 150; i += 1) { try { if ((await fetch(`${base}/health`)).status === 200) return; } catch { /* booting */ } await sleep(100); }
  throw new Error(`production-mode server did not become healthy:\n${out.join('')}`);
});
after(async () => { child?.kill('SIGKILL'); const m = (await import('mongoose')).default; if (m.connection.readyState) { await m.connection.dropDatabase().catch(() => {}); await m.disconnect(); } });

test('production boots only with explicit https URLs, and runs as production', { skip: SKIP }, async () => {
  const r = await call('/health'); assert.equal(r.status, 200);
  assert.match(out.join(''), /\(production\)/);
});

test('behind the proxy: auth cookies are Secure + HttpOnly + SameSite=Lax with the right paths, and never reach JavaScript', { skip: SKIP }, async () => {
  const mongoose = (await import('mongoose')).default; await mongoose.connect(dbUri);
  const { makeUser } = await import('./helpers/integration.js'); const u = await makeUser();
  const r = await call('/api/auth/login', { method: 'POST', headers: proxied('203.0.113.7', { origin: SITE }), body: { email: u.email, password: u.password } });
  assert.equal(r.status, 200, r.text);
  const at = r.cookies.find((c) => c.startsWith('nx_at=')); const rt = r.cookies.find((c) => c.startsWith('nx_rt='));
  for (const c of [at, rt]) { assert.match(c, /; Secure/); assert.match(c, /; HttpOnly/); assert.match(c, /SameSite=Lax/); assert.ok(!/Domain=/i.test(c), 'no Domain attribute unless configured'); }
  assert.match(at, /Path=\/api(;|$)/); assert.match(rt, /Path=\/api\/auth(;|$)/);
  assert.equal(r.headers.get('access-control-allow-origin'), SITE); assert.equal(r.headers.get('access-control-allow-credentials'), 'true');
  assert.ok(!JSON.stringify(r.json).includes(rt.split(';')[0].split('=')[1]), 'the refresh token is never in the body');
});

test('CORS: only configured origins; preflight cached; a foreign origin is not an auth error and cannot write', { skip: SKIP }, async () => {
  for (const o of [SITE, 'https://nessence.test']) {
    const pre = await call('/api/cart', { method: 'OPTIONS', headers: { origin: o, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type,x-requested-with' } });
    assert.equal(pre.headers.get('access-control-allow-origin'), o); assert.equal(pre.headers.get('access-control-max-age'), '7200'); assert.match(pre.headers.get('access-control-allow-headers'), /x-requested-with/i);
  }
  const evilPre = await call('/api/cart', { method: 'OPTIONS', headers: { origin: 'https://evil.test', 'access-control-request-method': 'POST' } });
  assert.equal(evilPre.headers.get('access-control-allow-origin'), null);
  const read = await call('/api/products', { headers: { origin: 'https://evil.test' } });
  assert.notEqual(read.status, 401); assert.equal(read.headers.get('access-control-allow-origin'), null, 'no CORS headers: the browser blocks it; the server does not call it an auth failure');
  const write = await call('/api/cart/items', { method: 'POST', headers: proxied('198.51.100.9', { origin: 'https://evil.test' }), body: { variantId: 'a'.repeat(24), qty: 1 } });
  assert.equal(write.status, 403); assert.equal(write.json.code, 'CSRF_REJECTED');
  assert.ok((await call('/api/cart', { headers: { origin: 'https://www.nessence.test.evil.test' } })).headers.get('access-control-allow-origin') === null, 'suffix tricks do not match');
});

test('rate limiting keys on the real client IP from X-Forwarded-For (one proxy hop), not on the proxy', { skip: SKIP }, async () => {
  const hit = (ip) => call('/api/auth/forgot-password', { method: 'POST', headers: proxied(ip), body: { email: 'nobody@example.test' } });
  let last; for (let i = 0; i < 31; i += 1) last = await hit('203.0.113.50');
  assert.equal(last.status, 429, 'client A is limited after its own 30 requests');
  assert.equal((await hit('203.0.113.51')).status, 200, 'client B, behind the same proxy, is unaffected');
});

test('private API responses are never cacheable; public catalog data is; errors never leak internals', { skip: SKIP }, async () => {
  for (const p of ['/api/cart', '/api/auth/me', '/api/orders', '/api/wishlist']) assert.equal((await call(p, { headers: proxied('192.0.2.1') })).headers.get('cache-control'), 'no-store', p);
  for (const p of ['/api/categories', '/api/collections']) assert.match((await call(p)).headers.get('cache-control') ?? '', /public, max-age=\d+/, p);
  const { makeProduct } = await import('./helpers/integration.js'); const pr = await makeProduct();
  assert.match((await call(`/api/products/${pr.product.slug}`)).headers.get('cache-control'), /public, max-age=30/);
  const bad = await call('/api/auth/login', { method: 'POST', headers: { ...proxied('192.0.2.2'), 'content-type': 'application/json' }, body: undefined });
  const mal = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { ...proxied('192.0.2.3'), 'content-type': 'application/json' }, body: '{not json' });
  const j = await mal.json(); assert.equal(mal.status, 400); assert.ok(!('debug' in j) && !/at .*\.js/.test(JSON.stringify(j)) && j.requestId);
  assert.equal(bad.headers.get('x-request-id')?.length > 0, true);
});

test('production robots.txt and sitemap use the storefront domain and expose only published, public pages', { skip: SKIP }, async () => {
  const { makeProduct } = await import('./helpers/integration.js');
  const pub = await makeProduct({ name: 'Visible' }); const draft = await makeProduct({ status: 'draft', name: 'Hidden' });
  const robots = await call('/robots.txt'); assert.equal(robots.status, 200); assert.match(robots.headers.get('content-type'), /text\/plain/);
  assert.match(robots.text, new RegExp(`Sitemap: ${SITE}/sitemap.xml`)); assert.match(robots.text, /Allow: \//);
  for (const p of ['/admin', '/account', '/cart', '/checkout']) assert.ok(robots.text.includes(`Disallow: ${p}`), p);
  assert.ok(!/localhost|vercel\.app|onrender\.com|\.test\/api/.test(robots.text.replace(SITE, '')));
  const sm = await call('/sitemap.xml'); assert.equal(sm.status, 200); assert.match(sm.headers.get('content-type'), /xml/);
  assert.ok(sm.text.includes(`<loc>${SITE}/products/${pub.product.slug}</loc>`)); assert.ok(!sm.text.includes(draft.product.slug));
  assert.ok(sm.text.includes(`<loc>${SITE}/</loc>`)); assert.ok(!/<loc>[^<]*\/(admin|account|cart|checkout|login)/.test(sm.text) && !/localhost/.test(sm.text));
});
