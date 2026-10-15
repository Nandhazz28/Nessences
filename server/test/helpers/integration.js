// Integration harness: the real Express app and real Mongoose models against a real MongoDB-compatible server.
//
//   TEST_MONGODB_URI=mongodb://127.0.0.1:27017 npm test
//
// Each test file gets its own throw-away database (dropped afterwards). When TEST_MONGODB_URI is not set the integration
// tests are SKIPPED (reported as skipped, never as passed). Nothing here talks to Razorpay, Brevo or Cloudinary.
import crypto from 'node:crypto';
import { once } from 'node:events';

export const TEST_URI = process.env.TEST_MONGODB_URI;
export const integrationEnabled = Boolean(TEST_URI);
export const SKIP = integrationEnabled ? false : 'TEST_MONGODB_URI is not set (integration tests need a MongoDB-compatible server)';

export const SECRETS = { access: 'a'.repeat(40), refresh: 'b'.repeat(40), paymentKey: 'rzp_test_key', paymentSecret: 'rzp_test_secret', webhook: 'whsec_test_secret' };

// Must run before anything imports src/config/env.js (which validates process.env once, at import time).
export function configureEnv(extra = {}) {
  const dbName = `nessence_test_${process.pid}_${crypto.randomBytes(3).toString('hex')}`;
  const uri = new URL(TEST_URI ?? 'mongodb://127.0.0.1:27017');
  uri.pathname = `/${dbName}`;
  Object.assign(process.env, {
    NODE_ENV: 'test', LOG_LEVEL: 'silent', MONGODB_URI: uri.toString(),
    JWT_ACCESS_SECRET: SECRETS.access, JWT_REFRESH_SECRET: SECRETS.refresh,
    PAYMENT_KEY: SECRETS.paymentKey, PAYMENT_SECRET: SECRETS.paymentSecret, PAYMENT_WEBHOOK_SECRET: SECRETS.webhook,
    CLIENT_URL: 'http://localhost:5173', SERVER_URL: 'http://localhost:4000',
    ...extra,
  });
  return dbName;
}

export async function bootApp() {
  const mongoose = (await import('mongoose')).default;
  const { connectDb } = await import('../../src/config/db.js');
  await connectDb();
  (await import('../../src/config/lifecycle.js')).lifecycle.started = true; // the real bootstrap sets this once the database is connected
  const { createApp } = await import('../../src/app.js');
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base, mongoose,
    browser: () => new Browser(base),
    async stop() { server.close(); server.closeAllConnections?.(); try { await mongoose.connection.dropDatabase(); } finally { await mongoose.disconnect(); } },
  };
}

// A tiny browser: a cookie jar that behaves like the real thing where it matters for these bugs
// (Path scoping, Max-Age / Expires eviction on a controllable clock, Set-Cookie deletion) and sends the same CSRF header the SPA does.
export class Browser {
  constructor(base) { this.base = base; this.jar = new Map(); this.skew = 0; this.log = []; }
  now() { return Date.now() + this.skew; }
  advance(ms) { this.skew += ms; this.#evict(); } // "time passes" for the browser: cookies past Max-Age disappear
  #evict() { for (const [k, c] of this.jar) if (c.expires <= this.now()) this.jar.delete(k); }
  #store(headers, reqPath) {
    for (const h of headers) {
      const [pair, ...attrs] = h.split(';').map((s) => s.trim());
      const i = pair.indexOf('=');
      const name = pair.slice(0, i); const value = pair.slice(i + 1);
      const a = Object.fromEntries(attrs.map((x) => { const j = x.indexOf('='); return j < 0 ? [x.toLowerCase(), true] : [x.slice(0, j).toLowerCase(), x.slice(j + 1)]; }));
      const dir = reqPath.split('?')[0].replace(/\/[^/]*$/, '') || '/';
      const path = a.path ?? dir;
      let expires = Infinity;
      if (a['max-age'] !== undefined) expires = this.now() + Number(a['max-age']) * 1000;
      else if (a.expires) expires = Date.parse(a.expires);
      const key = `${name}|${path}`;
      if (expires <= this.now() || value === '') this.jar.delete(key);
      else this.jar.set(key, { name, value, path, expires, httpOnly: Boolean(a.httponly), secure: Boolean(a.secure), sameSite: a.samesite, domain: a.domain });
    }
  }
  #header(path) {
    this.#evict();
    const p = path.split('?')[0];
    return [...this.jar.values()].filter((c) => p === c.path || p.startsWith(c.path.endsWith('/') ? c.path : `${c.path}/`)).map((c) => `${c.name}=${c.value}`).join('; ');
  }
  /** A second tab / window: same cookie jar contents, independent requests. */
  fork() { const b = new Browser(this.base); b.skew = this.skew; for (const [k, c] of this.jar) b.jar.set(k, { ...c }); return b; }
  cookie(name) { this.#evict(); return [...this.jar.values()].find((c) => c.name === name); }
  has(name) { return Boolean(this.cookie(name)); }
  /** Overwrite a cookie value as if the browser had stored it (used to plant expired / tampered tokens). */
  plant(name, value, { path = '/api', maxAgeMs = 7 * 864e5 } = {}) { this.jar.set(`${name}|${path}`, { name, value, path, expires: this.now() + maxAgeMs }); }

  async request(method, path, { body, headers = {} } = {}) {
    const cookie = this.#header(path);
    const res = await fetch(`${this.base}${path}`, {
      method, redirect: 'manual',
      headers: { 'x-requested-with': 'nessence', ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const setCookies = res.headers.getSetCookie?.() ?? [];
    this.#store(setCookies, path);
    let json = null; try { json = await res.json(); } catch { /* empty / non-JSON */ }
    const out = { status: res.status, json, headers: res.headers, setCookies, data: json?.data, code: json?.code };
    this.log.push({ method, path, status: res.status, code: json?.code });
    return out;
  }
  get(path, o) { return this.request('GET', path, o); }
  post(path, body, o) { return this.request('POST', path, { body, ...o }); }
  patch(path, body, o) { return this.request('PATCH', path, { body, ...o }); }
  put(path, body, o) { return this.request('PUT', path, { body, ...o }); }
  del(path, o) { return this.request('DELETE', path, o); }
}

// ---- data builders (all go through the real models) ----
export async function makeUser({ email = `u${crypto.randomBytes(3).toString('hex')}@example.test`, password = 'Passw0rd!x', name = 'Test Customer', ...rest } = {}) {
  const { User } = await import('../../src/models/User.js');
  const { hashPassword } = await import('../../src/services/authService.js');
  const user = await User.create({ name, email, passwordHash: await hashPassword(password), emailVerified: true, ...rest });
  return { user, email, password };
}
export async function makeStaff({ role = 'manager', email = `s${crypto.randomBytes(3).toString('hex')}@nessence.test`, password = 'StaffPassw0rd!', mustChangePassword = false } = {}) {
  const { StaffUser } = await import('../../src/models/StaffUser.js');
  const { hashPassword } = await import('../../src/services/authService.js');
  const staff = await StaffUser.create({ name: 'Staff Member', email, role, passwordHash: await hashPassword(password), mustChangePassword });
  return { staff, email, password };
}
export async function signIn(browser, { email, password }) {
  const r = await browser.post('/api/auth/login', { email, password });
  if (r.status !== 200) throw new Error(`test sign-in failed: ${r.status} ${r.code}`);
  return r;
}
export async function makeProduct({ price = 200000, salePrice = null, stock = 5, size = 'M', color = { name: 'Black', hex: '#111111' }, status = 'published', name = 'Linen Shirt' } = {}) {
  const { Category } = await import('../../src/models/Category.js');
  const { Product } = await import('../../src/models/Product.js');
  const { ProductVariant } = await import('../../src/models/ProductVariant.js');
  const { Inventory } = await import('../../src/models/Inventory.js');
  const tag = crypto.randomBytes(3).toString('hex');
  const category = await Category.create({ name: `Shirts ${tag}`, slug: `shirts-${tag}` });
  const product = await Product.create({ name: `${name} ${tag}`, slug: `${name.toLowerCase().replace(/\W+/g, '-')}-${tag}`, description: 'A test garment.', gender: 'men', category: category._id, price, salePrice, status, images: [{ url: '/media/test.jpg', alt: 'Test garment' }] });
  const variant = await ProductVariant.create({ product: product._id, sku: `SKU-${tag}`.toUpperCase(), color, size });
  await Inventory.create({ variant: variant._id, product: product._id, sku: variant.sku, stock });
  return { product, variant, category };
}
export async function makeAddress(userId) {
  const { Address } = await import('../../src/models/Address.js');
  return Address.create({ user: userId, fullName: 'Asha Rao', phone: '9876543210', line1: '12 MG Road', city: 'Chennai', state: 'Tamil Nadu', pincode: '600001', isDefault: true });
}

// ---- Razorpay helpers (signatures exactly as Razorpay documents them; no network) ----
export const rzpCheckoutSignature = (orderId, paymentId) => crypto.createHmac('sha256', SECRETS.paymentSecret).update(`${orderId}|${paymentId}`).digest('hex');
export const rzpWebhookSignature = (raw) => crypto.createHmac('sha256', SECRETS.webhook).update(raw).digest('hex');

/** Simulates the database going away for the duration of fn: every collection operation rejects like a dropped connection. */
export async function withDbOutage(mongoose, fn) {
  const names = ['find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'updateOne', 'updateMany', 'insertOne', 'deleteOne', 'deleteMany', 'countDocuments', 'aggregate'];
  const saved = [];
  for (const col of Object.values(mongoose.connection.collections)) {
    for (const n of names) {
      if (typeof col[n] !== 'function') continue;
      saved.push([col, n, col[n]]);
      col[n] = () => { const e = new Error('connection closed (simulated outage)'); e.name = 'MongoNetworkError'; throw e; };
    }
  }
  try { return await fn(); } finally { for (const [col, n, orig] of saved) col[n] = orig; }
}

/** Which server features the test database supports (FerretDB, for instance, lacks $expr). Used to skip, never to fake. */
export async function probeCapabilities(mongoose) {
  const c = mongoose.connection.collection('__probe');
  await c.insertOne({ a: 2, b: 1 });
  const caps = {};
  try { const r = await c.updateOne({ $expr: { $gte: [{ $subtract: ['$a', '$b'] }, 1] } }, { $inc: { a: 0 } }); caps.expr = r.matchedCount === 1; } catch { caps.expr = false; }
  // $pull with a condition document (used by wishlist removal): some MongoDB-compatible servers silently ignore it
  const w = mongoose.connection.collection('__probe2');
  await w.insertOne({ t: [{ h: 'a', x: 1 }, { h: 'b', x: 2 }] });
  try { await w.updateOne({}, { $pull: { t: { h: 'a' } } }); caps.pullCondition = (await w.findOne({})).t.length === 1; } catch { caps.pullCondition = false; }
  await w.drop().catch(() => {});
  try { await c.aggregate([{ $facet: { x: [{ $limit: 1 }] } }]).toArray(); caps.facet = true; } catch { caps.facet = false; }
  try { await c.aggregate([{ $group: { _id: null, f: { $first: '$a' } } }]).toArray(); caps.first = true; } catch { caps.first = false; }
  // Is a conditional find-and-update atomic under concurrency? (real MongoDB: yes. Some compatible servers: no.)
  const a = mongoose.connection.collection('__probe3');
  await a.insertOne({ k: 1, claimed: false });
  const wins = await Promise.all(Array.from({ length: 12 }, () => a.findOneAndUpdate({ k: 1, claimed: false }, { $set: { claimed: true } }, { returnDocument: 'before' }).then((r) => Boolean(r?.value ?? r)).catch(() => false)));
  caps.atomicClaims = wins.filter(Boolean).length === 1;
  await a.drop().catch(() => {});
  await c.drop().catch(() => {});
  return caps;
}
