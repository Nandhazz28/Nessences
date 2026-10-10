import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

const SECRET = 'a'.repeat(40);
Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://127.0.0.1:1/x', LOG_LEVEL: 'silent', JWT_ACCESS_SECRET: SECRET, JWT_REFRESH_SECRET: 'b'.repeat(40), PAYMENT_KEY: 'k', PAYMENT_SECRET: 's' });
const { admin } = await import('../src/routes/admin.js');
const { can, ROLES, ROLE_PERMISSIONS } = await import('../src/config/permissions.js');
const { TRANSITIONS, canTransition } = await import('../src/services/admin/orderAdmin.js');
const { RETURN_TRANSITIONS } = await import('../src/services/admin/returnAdmin.js');
const { sniffImage } = await import('../src/services/storage.js');
const { createBody, updateBody } = await import('../src/services/admin/productAdmin.js');
const { couponBody } = await import('../src/services/admin/couponAdmin.js');
const { razorpay } = await import('../src/services/payments/razorpay.js');
const { createApp } = await import('../src/app.js');

test('every admin route (except /permissions) is behind a named permission check', () => {
  const routes = admin.stack.filter((l) => l.route).map((l) => l.route);
  assert.ok(routes.length >= 35, `expected many routes, found ${routes.length}`);
  const unguarded = routes.filter((r) => r.path !== '/permissions' && !r.stack.some((l) => l.name.startsWith('perm:'))).map((r) => `${Object.keys(r.methods)[0].toUpperCase()} ${r.path}`);
  assert.deepEqual(unguarded, []);
});

test('role matrix: least privilege holds', () => {
  assert.ok(can('super_admin', 'staff:manage'));
  assert.equal(can('admin', 'staff:manage'), false);
  assert.equal(can('support', 'products:write'), false);
  assert.equal(can('support', 'refunds:process'), false);
  assert.equal(can('inventory_manager', 'inventory:write'), true);
  assert.equal(can('inventory_manager', 'orders:write'), false);
  assert.equal(can('content_manager', 'orders:read'), false);
  assert.equal(can('manager', 'audit:read'), false);
  assert.equal(can('nonsense', 'dashboard:read'), false);
  assert.equal(can(undefined, 'dashboard:read'), false);
  for (const r of ROLES) assert.ok(ROLE_PERMISSIONS[r], r);
});

test('order status machine only moves forward; cancellation is limited to pre-shipment', () => {
  assert.equal(canTransition('confirmed', 'processing'), true);
  assert.equal(canTransition('packed', 'cancelled'), true);
  assert.equal(canTransition('shipped', 'cancelled'), false);
  assert.equal(canTransition('delivered', 'shipped'), false);
  assert.equal(canTransition('confirmed', 'delivered'), false);
  assert.equal(canTransition('cancelled', 'confirmed'), false);
  assert.equal(canTransition('pending_payment', 'confirmed'), false); // payment, not staff, confirms
  assert.deepEqual(Object.keys(TRANSITIONS), ['confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery']);
  assert.deepEqual(RETURN_TRANSITIONS.requested, ['approved', 'rejected']);
  assert.equal(RETURN_TRANSITIONS.rejected, undefined);
});

test('image uploads are identified by bytes, not by claimed type', () => {
  assert.equal(sniffImage(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)])).ext, 'jpg');
  assert.equal(sniffImage(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)])).ext, 'png');
  assert.equal(sniffImage(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)])).ext, 'webp');
  assert.equal(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')), null); // SVG/XSS rejected
  assert.equal(sniffImage(Buffer.from('<?php echo 1; ?>')), null);
  assert.equal(sniffImage(Buffer.alloc(0)), null);
});

test('product/coupon payload validation', () => {
  const ok = { name: 'Wool Scarf', description: 'A soft wool scarf.', gender: 'men', categoryId: 'a'.repeat(24), price: 450000, images: [{ url: '/media/products/x.jpg', alt: 'Scarf front' }] };
  assert.equal(createBody.safeParse(ok).success, true);
  assert.equal(createBody.safeParse({ ...ok, price: 12.5 }).success, false);              // fractional paise
  assert.equal(createBody.safeParse({ ...ok, images: [{ url: 'https://evil.example/x.jpg', alt: 'x y z' }] }).success, false); // external image URL
  assert.equal(createBody.safeParse({ ...ok, role: 'admin' }).success, false);            // unknown field
  assert.equal(updateBody.safeParse({ price: 100000 }).success, true);
  assert.equal(updateBody.safeParse({}).success, true);
  assert.equal(couponBody.safeParse({ code: 'save10', type: 'percent', value: 10 }).data.code, 'SAVE10');
  assert.equal(couponBody.safeParse({ code: 'BIG', type: 'percent', value: 150 }).success, false);
  assert.equal(couponBody.safeParse({ code: 'BAD', type: 'fixed', value: 100, startsAt: '2026-05-01', expiresAt: '2026-04-01' }).success, false);
});

test('refund call hits the payment refund endpoint with whole paise and surfaces gateway errors', async () => {
  const real = globalThis.fetch; let seen;
  globalThis.fetch = async (url, init) => { seen = { url, body: JSON.parse(init.body) }; return new Response(JSON.stringify({ id: 'rfnd_1', status: 'processed' }), { status: 200 }); };
  assert.deepEqual(await razorpay.refund({ paymentId: 'pay_9', amount: 125000 }), { id: 'rfnd_1', status: 'processed' });
  assert.equal(seen.url, 'https://api.razorpay.com/v1/payments/pay_9/refund'); assert.equal(seen.body.amount, 125000);
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { description: 'The refund amount is greater than the amount available for refund' } }), { status: 400 });
  await assert.rejects(razorpay.refund({ paymentId: 'pay_9', amount: 9e9 }), /greater than the amount available/);
  globalThis.fetch = real;
});

test('admin API rejects: no session, customer-typed token, garbage token, missing CSRF header', async () => {
  const server = createApp().listen(0); const base = `http://127.0.0.1:${server.address().port}`;
  const customerToken = jwt.sign({ sub: 'a'.repeat(24), typ: 'customer', role: 'customer' }, SECRET, { issuer: 'nessence', expiresIn: 60 });
  const get = (path, cookie) => fetch(base + path, { headers: cookie ? { cookie } : {} });
  for (const p of ['/api/admin/dashboard', '/api/admin/products', '/api/admin/orders', '/api/admin/refunds', '/api/admin/customers', '/api/admin/audit-logs']) {
    assert.equal((await get(p)).status, 401, `no session ${p}`);
    assert.equal((await get(p, `nx_staff_at=${customerToken}`)).status, 401, `customer token ${p}`);
    assert.equal((await get(p, 'nx_staff_at=garbage')).status, 401, `garbage ${p}`);
    assert.equal((await get(p, `nx_at=${customerToken}`)).status, 401, `customer cookie name ${p}`);
  }
  const noCsrf = await fetch(`${base}/api/admin/products`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(noCsrf.status, 403);
  server.close();
});
