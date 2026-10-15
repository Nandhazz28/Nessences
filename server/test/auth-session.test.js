import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { SKIP, integrationEnabled, configureEnv, bootApp, makeUser, makeProduct, signIn, withDbOutage, SECRETS } from './helpers/integration.js';

configureEnv({ REFRESH_REUSE_GRACE_SECONDS: '1' });
let app;
before(async () => { if (integrationEnabled) app = await bootApp(); });
after(async () => { await app?.stop(); });

const expiredAccessFor = (token) => {
  const p = jwt.decode(token);
  return jwt.sign({ sub: p.sub, typ: p.typ, role: p.role, iat: p.iat - 3600, exp: p.iat - 1800 }, SECRETS.access, { issuer: 'nessence' });
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('login sets httpOnly cookies, refresh cookie is scoped to /api/auth, and /me reflects the session', { skip: SKIP }, async () => {
  const u = await makeUser(); const b = app.browser();
  const r = await signIn(b, u);
  assert.equal(r.data.user.email, u.email);
  assert.equal(b.cookie('nx_at').httpOnly, true);
  assert.equal(b.cookie('nx_rt').httpOnly, true);
  assert.equal(b.cookie('nx_rt').path, '/api/auth');
  assert.equal((await b.get('/api/auth/me')).data.user.email, u.email);
  // the refresh token must never be sent to ordinary API routes
  const cart = await b.get('/api/cart'); assert.equal(cart.status, 200);
});

test('invalid credentials: 401, a generic message, and no cookies', { skip: SKIP }, async () => {
  const u = await makeUser(); const b = app.browser();
  const r = await b.post('/api/auth/login', { email: u.email, password: 'wrong-password1' });
  assert.equal(r.status, 401); assert.equal(r.code, 'INVALID_CREDENTIALS');
  assert.equal(b.has('nx_at'), false); assert.equal(b.has('nx_rt'), false);
  assert.equal((await b.get('/api/auth/me')).status, 401);
});

test('REGRESSION: the access cookie outlives the JWT, so an expired token is answered with 401 TOKEN_EXPIRED, never treated as a guest', { skip: SKIP }, async () => {
  const u = await makeUser(); const { variant } = await makeProduct(); const b = app.browser();
  await signIn(b, u);
  assert.equal((await b.post('/api/cart/items', { variantId: String(variant._id), qty: 2 })).status, 200);
  b.advance(16 * 60 * 1000); // the browser's view of 16 minutes later
  if (b.has('nx_at')) b.plant('nx_at', expiredAccessFor(b.cookie('nx_at').value)); // the JWT inside is, by now, really expired
  const cart = await b.get('/api/cart');
  assert.equal(cart.status, 401, 'a signed-in user must not silently fall back to an empty guest cart');
  assert.equal(cart.code, 'TOKEN_EXPIRED');
  const patch = await b.patch(`/api/cart/items/${variant._id}`, { qty: 3 });
  assert.equal(patch.status, 401, 'must not be answered as "That item is not in your bag"');
  assert.equal((await b.post('/api/auth/refresh')).status, 200);
  const after = await b.get('/api/cart');
  assert.equal(after.status, 200); assert.equal(after.data.items[0].qty, 2);
  assert.equal((await b.patch(`/api/cart/items/${variant._id}`, { qty: 3 })).status, 200);
});

test('refresh with a valid session rotates both cookies and the new session works', { skip: SKIP }, async () => {
  const u = await makeUser(); const b = app.browser(); await signIn(b, u);
  const oldRt = b.cookie('nx_rt').value;
  const r = await b.post('/api/auth/refresh');
  assert.equal(r.status, 200); assert.equal(r.data.user.email, u.email);
  assert.notEqual(b.cookie('nx_rt').value, oldRt);
  assert.equal((await b.get('/api/auth/me')).status, 200);
});

test('REGRESSION: two tabs refreshing at the same moment both succeed and nobody is signed out', { skip: SKIP }, async () => {
  const u = await makeUser(); const a = app.browser(); await signIn(a, u); const t2 = a.fork();
  const [r1, r2] = await Promise.all([a.post('/api/auth/refresh'), t2.post('/api/auth/refresh')]);
  assert.deepEqual([r1.status, r2.status], [200, 200], `got ${r1.status}/${r1.code} and ${r2.status}/${r2.code}`);
  assert.equal((await a.get('/api/auth/me')).status, 200);
  assert.equal((await t2.get('/api/auth/me')).status, 200);
  assert.equal((await a.post('/api/auth/refresh')).status, 200, 'the session must still be refreshable afterwards');
});

test('REGRESSION: an unknown refresh token for a real account does not sign out that account\'s other devices', { skip: SKIP }, async () => {
  const u = await makeUser(); const phone = app.browser(); const laptop = app.browser();
  await signIn(phone, u); await signIn(laptop, u);
  const stranger = app.browser(); stranger.plant('nx_rt', `${u.user._id}.${'f'.repeat(80)}`, { path: '/api/auth' });
  const r = await stranger.post('/api/auth/refresh');
  assert.equal(r.status, 401);
  assert.equal((await phone.post('/api/auth/refresh')).status, 200);
  assert.equal((await laptop.post('/api/auth/refresh')).status, 200);
});

test('replaying a rotated refresh token after the grace period is refused and ends that session lineage only', { skip: SKIP }, async () => {
  const u = await makeUser(); const victim = app.browser(); const other = app.browser();
  await signIn(victim, u); await signIn(other, u);
  const stolen = victim.cookie('nx_rt').value;
  assert.equal((await victim.post('/api/auth/refresh')).status, 200);
  await sleep(1300); // longer than REFRESH_REUSE_GRACE_SECONDS=1
  const thief = app.browser(); thief.plant('nx_rt', stolen, { path: '/api/auth' });
  const r = await thief.post('/api/auth/refresh');
  assert.equal(r.status, 401); assert.equal(r.code, 'REFRESH_REUSE_DETECTED');
  assert.equal((await victim.post('/api/auth/refresh')).status, 401, 'the compromised lineage is revoked');
  assert.equal((await other.post('/api/auth/refresh')).status, 200, 'other devices are untouched');
});

test('missing, malformed and expired refresh tokens: 401, cookies cleared, no crash', { skip: SKIP }, async () => {
  const b = app.browser();
  const none = await b.post('/api/auth/refresh'); assert.equal(none.status, 401); assert.equal(none.code, 'NO_REFRESH_TOKEN');
  b.plant('nx_rt', 'not-a-token', { path: '/api/auth' });
  const bad = await b.post('/api/auth/refresh'); assert.equal(bad.status, 401);
  assert.equal(b.has('nx_rt'), false, 'a dead refresh cookie is cleared');
  const u = await makeUser(); const c = app.browser(); await signIn(c, u);
  c.advance(8 * 864e5); // refresh cookie (7 days) is gone
  assert.equal((await c.post('/api/auth/refresh')).status, 401);
});

test('REGRESSION: a transient database failure during refresh does not clear a valid session', { skip: SKIP }, async () => {
  const u = await makeUser(); const b = app.browser(); await signIn(b, u);
  const rt = b.cookie('nx_rt').value;
  const r = await withDbOutage(app.mongoose, () => b.post('/api/auth/refresh'));
  assert.ok(r.status >= 500, `expected a 5xx, got ${r.status}`);
  assert.equal(b.cookie('nx_rt')?.value, rt, 'refresh cookie must survive a transient failure');
  assert.equal((await b.post('/api/auth/refresh')).status, 200, 'and the session still works once the database is back');
});

test('logout revokes the session server-side and clears cookies; signing in again works', { skip: SKIP }, async () => {
  const u = await makeUser(); const b = app.browser(); await signIn(b, u);
  const rt = b.cookie('nx_rt').value;
  assert.equal((await b.post('/api/auth/logout')).status, 200);
  assert.equal(b.has('nx_at'), false); assert.equal(b.has('nx_rt'), false);
  assert.equal((await b.get('/api/auth/me')).status, 401);
  const replay = app.browser(); replay.plant('nx_rt', rt, { path: '/api/auth' });
  assert.equal((await replay.post('/api/auth/refresh')).status, 401, 'the old refresh token must be dead');
  await signIn(b, u); assert.equal((await b.get('/api/auth/me')).status, 200);
});

test('suspended accounts are cut off immediately and cannot refresh', { skip: SKIP }, async () => {
  const u = await makeUser(); const b = app.browser(); await signIn(b, u);
  const { User } = await import('../src/models/User.js');
  await User.updateOne({ _id: u.user._id }, { $set: { status: 'suspended' } });
  assert.equal((await b.get('/api/auth/me')).status, 401);
  assert.equal((await b.post('/api/auth/refresh')).status, 403);
});

test('changing the password signs every session out', { skip: SKIP }, async () => {
  const u = await makeUser(); const a = app.browser(); const c = app.browser(); await signIn(a, u); await signIn(c, u);
  const r = await a.post('/api/auth/change-password', { currentPassword: u.password, newPassword: 'NewPassw0rd!y' });
  assert.equal(r.status, 200);
  assert.equal((await c.post('/api/auth/refresh')).status, 401);
  assert.equal((await app.browser().post('/api/auth/login', { email: u.email, password: 'NewPassw0rd!y' })).status, 200);
});

test('five wrong passwords lock the account without revealing whether the email exists', { skip: SKIP }, async () => {
  const u = await makeUser(); const b = app.browser();
  for (let i = 0; i < 5; i += 1) assert.equal((await b.post('/api/auth/login', { email: u.email, password: 'nope-nope1' })).status, 401);
  assert.equal((await b.post('/api/auth/login', { email: u.email, password: u.password })).status, 429);
  const ghost = await b.post('/api/auth/login', { email: 'nobody@example.test', password: 'nope-nope1' });
  assert.equal(ghost.code, 'INVALID_CREDENTIALS');
});
