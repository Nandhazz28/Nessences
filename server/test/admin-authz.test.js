import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SKIP, integrationEnabled, configureEnv, bootApp, makeUser, makeStaff, signIn } from './helpers/integration.js';

configureEnv({ LOG_LEVEL: process.env.TEST_LOG ?? 'silent' });
let app;
before(async () => { if (integrationEnabled) app = await bootApp(); });
after(async () => { await app?.stop(); });
const staffIn = async (b, s) => { const r = await b.post('/api/admin/auth/login', { email: s.email, password: s.password }); assert.equal(r.status, 200); return r; };

test('customers cannot reach any admin endpoint, with or without a session', { skip: SKIP }, async () => {
  const u = await makeUser(); const b = app.browser(); await signIn(b, u);
  for (const path of ['/api/admin/permissions', '/api/admin/dashboard', '/api/admin/orders', '/api/admin/customers', '/api/admin/products', '/api/admin/staff']) {
    assert.equal((await b.get(path)).status, 401, `customer session on ${path}`);
    assert.equal((await app.browser().get(path)).status, 401, `anonymous on ${path}`);
  }
  assert.equal((await b.post('/api/admin/auth/login', { email: u.email, password: u.password })).status, 401, 'a customer password is not a staff password');
});

test('a staff token is not a customer session and vice versa', { skip: SKIP }, async () => {
  const s = await makeStaff({ role: 'super_admin' }); const b = app.browser(); await staffIn(b, s);
  assert.equal((await b.get('/api/admin/permissions')).status, 200);
  assert.equal((await b.get('/api/auth/me')).status, 401); assert.equal((await b.get('/api/orders')).status, 401);
});

test('role permissions are enforced on the server (support cannot write products or process refunds)', { skip: SKIP }, async () => {
  const s = await makeStaff({ role: 'support' }); const b = app.browser(); await staffIn(b, s);
  assert.equal((await b.get('/api/admin/orders')).status, 200);
  assert.equal((await b.post('/api/admin/products', { name: 'x' })).status, 403);
  assert.equal((await b.post(`/api/admin/refunds/${'a'.repeat(24)}/process`)).status, 403);
  assert.equal((await b.get('/api/admin/staff')).status, 403);
});

test('REGRESSION: a temporary password is useless for anything except changing it (enforced by the API, not the UI)', { skip: SKIP }, async () => {
  const s = await makeStaff({ role: 'super_admin', mustChangePassword: true }); const b = app.browser(); await staffIn(b, s);
  assert.equal((await b.get('/api/admin/permissions')).data.staff.mustChangePassword, true, 'the UI can still learn it must show the change screen');
  for (const path of ['/api/admin/dashboard', '/api/admin/orders', '/api/admin/customers', '/api/admin/staff', '/api/admin/reviews']) {
    const r = await b.get(path); assert.equal(r.status, 403, path); assert.equal(r.code, 'PASSWORD_CHANGE_REQUIRED');
  }
  assert.equal((await b.post('/api/admin/coupons', { code: 'FREE100' })).code, 'PASSWORD_CHANGE_REQUIRED');
  const ch = await b.post('/api/admin/auth/change-password', { currentPassword: s.password, newPassword: 'ABrandNewPassw0rd' });
  assert.equal(ch.status, 200);
  assert.equal(b.has('nx_staff_at'), false, 'sessions end after the change');
  const again = app.browser(); const r = await again.post('/api/admin/auth/login', { email: s.email, password: 'ABrandNewPassw0rd' });
  assert.equal(r.status, 200); assert.equal((await again.get('/api/admin/orders')).status, 200);
});

test('staff sessions refresh, rotate and log out like customer sessions', { skip: SKIP }, async () => {
  const s = await makeStaff({ role: 'admin' }); const b = app.browser(); await staffIn(b, s);
  assert.equal((await b.post('/api/admin/auth/refresh')).status, 200);
  assert.equal(b.cookie('nx_staff_rt').path, '/api/admin/auth');
  assert.equal((await b.post('/api/admin/auth/logout')).status, 200);
  assert.equal((await b.get('/api/admin/permissions')).status, 401);
});
