import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SKIP, integrationEnabled, configureEnv, bootApp, makeUser, makeStaff, makeProduct, makeAddress, signIn } from './helpers/integration.js';

configureEnv({ BREVO_API_KEY: 'xkeysib-test', BREVO_SENDER_EMAIL: 'no-reply@nessence.test', REQUIRE_EMAIL_VERIFICATION: 'true' });
let app; const mails = []; const realFetch = globalThis.fetch;
before(async () => {
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('api.brevo.com')) { mails.push(JSON.parse(init.body)); return new Response(JSON.stringify({ messageId: `<m${mails.length}>` }), { status: 201, headers: { 'content-type': 'application/json' } }); }
    return realFetch(url, init);
  };
  if (integrationEnabled) app = await bootApp();
});
after(async () => { globalThis.fetch = realFetch; await app?.stop(); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lastTo = (email, tag) => mails.filter((m) => m.to[0].email === email && m.tags.includes(tag)).at(-1);
const linkIn = (m) => m.textContent.match(/https?:\/\/\S+/)[0];

test('registration sends a verification email with a working link; verifying sends the welcome email', { skip: SKIP }, async () => {
  const b = app.browser(); const email = 'new.customer@example.test';
  const r = await b.post('/api/auth/register', { name: 'Meera Nair', email, password: 'Passw0rd!xyz' });
  assert.equal(r.status, 201); assert.equal(r.data.emailAccepted, true);
  const m = lastTo(email, 'verifyEmail'); assert.ok(m); assert.equal(m.subject, 'Verify Your Nessence Account');
  assert.match(m.textContent, /Hello Meera,/); assert.ok(m.htmlContent.includes('<!doctype html>'));
  const link = new URL(linkIn(m)); assert.equal(link.origin, 'http://localhost:5173'); assert.equal(link.pathname, '/verify-email');
  assert.equal((await b.post('/api/auth/verify-email', { token: link.searchParams.get('token') })).status, 200);
  await sleep(150); const w = lastTo(email, 'welcome'); assert.ok(w); assert.equal(w.subject, 'Welcome to Nessence');
});

test('forgot-password: same response for known and unknown addresses; the real one gets a usable reset link; completing it sends a security notice', { skip: SKIP }, async () => {
  const u = await makeUser({ name: 'Ravi Kumar' }); const b = app.browser();
  const known = await b.post('/api/auth/forgot-password', { email: u.email }); const unknown = await b.post('/api/auth/forgot-password', { email: 'ghost@example.test' });
  assert.equal(known.status, unknown.status); assert.deepEqual(known.json, unknown.json);
  await sleep(150);
  assert.equal(mails.filter((m) => m.to[0].email === 'ghost@example.test').length, 0, 'no mail to an address with no account');
  const m = lastTo(u.email, 'resetPassword'); assert.equal(m.subject, 'Reset Your Nessence Password'); assert.match(m.textContent, /1 hour/);
  const token = new URL(linkIn(m)).searchParams.get('token');
  assert.equal((await b.post('/api/auth/reset-password', { token, password: 'BrandNewPassw0rd' })).status, 200);
  assert.equal((await b.post('/api/auth/reset-password', { token, password: 'AnotherPassw0rd1' })).status, 400, 'the link works once');
  await sleep(150); assert.equal(lastTo(u.email, 'passwordChanged').subject, 'Your Nessence Password Was Changed');
  assert.ok(!JSON.stringify(mails).includes('BrandNewPassw0rd'), 'no password is ever placed in an email');
});

test('changing the password while signed in sends the security notice', { skip: SKIP }, async () => {
  const u = await makeUser(); const b = app.browser(); await signIn(b, u);
  await b.post('/api/auth/change-password', { currentPassword: u.password, newPassword: 'ChangedPassw0rd!' }); await sleep(150);
  assert.ok(lastTo(u.email, 'passwordChanged'));
});

test('staff status changes: shipped and delivered mail the customer; cancellation mails with refund wording; opted-out customers skip optional notices only', { skip: SKIP }, async () => {
  const u = await makeUser({ name: 'Asha Rao' }); const staff = await makeStaff({ role: 'super_admin' }); const sb = app.browser();
  await sb.post('/api/admin/auth/login', { email: staff.email, password: staff.password });
  const { Order } = await import('../src/models/Order.js'); const { variant, product } = await makeProduct(); const address = await makeAddress(u.user._id);
  const mk = async (status = 'confirmed', paymentStatus = 'captured') => Order.create({ user: u.user._id, status, paymentStatus, items: [{ variant: variant._id, product: product._id, sku: variant.sku, name: product.name, slug: product.slug, color: 'Black', size: 'M', unitPrice: 100000, qty: 1, lineTotal: 100000 }], delivery: { method: 'standard', label: 'Standard' }, shippingAddress: { fullName: 'A', phone: '9876543210', line1: 'x', city: 'c', state: 's', pincode: '600001', country: 'IN' }, totals: { subtotal: 100000, discount: 0, shipping: 29900, tax: 5000, total: 134900 }, statusHistory: [{ status }] });
  const o = await mk('packed');
  assert.equal((await sb.post(`/api/admin/orders/${o._id}/status`, { status: 'shipped' })).status, 200); await sleep(150);
  const shipped = lastTo(u.email, 'orderStatus'); assert.equal(shipped.subject, 'Your Nessence Order Is on Its Way'); assert.ok(shipped.textContent.includes(o.orderNumber));
  assert.ok(!/Tracking number/.test(shipped.textContent), 'no tracking details exist, so none are claimed');
  assert.ok(new URL(linkIn(shipped)).pathname.startsWith('/account/orders/'));
  const paid = await mk('confirmed'); await sb.post(`/api/admin/orders/${paid._id}/status`, { status: 'cancelled' }); await sleep(150);
  const c = lastTo(u.email, 'orderCancelled'); assert.match(c.subject, new RegExp(`Cancelled — #${paid.orderNumber}`)); assert.match(c.textContent, /refunded to your original payment method/);
  const { User } = await import('../src/models/User.js'); await User.updateOne({ _id: u.user._id }, { $set: { 'preferences.orderUpdates': false } });
  const before = mails.length; const o2 = await mk('packed'); await sb.post(`/api/admin/orders/${o2._id}/status`, { status: 'shipped' }); await sleep(150);
  assert.equal(mails.length, before, 'shipping updates respect the opt-out');
  const o3 = await mk('confirmed'); await sb.post(`/api/admin/orders/${o3._id}/status`, { status: 'cancelled' }); await sleep(150);
  assert.ok(mails.length > before, 'but a cancellation notice is not optional');
});

test('a provider outage never breaks the account or order operation that triggered the mail', { skip: SKIP }, async () => {
  const saved = globalThis.fetch;
  globalThis.fetch = async (url, init) => (String(url).includes('api.brevo.com') ? new Response('{}', { status: 500 }) : saved(url, init));
  try {
    const r = await app.browser().post('/api/auth/register', { name: 'Outage Test', email: 'outage@example.test', password: 'Passw0rd!xyz' });
    assert.equal(r.status, 201, 'the account is created'); assert.equal(r.data.emailAccepted, false, 'and the caller is told the mail was not accepted (the UI offers a resend)');
    const { User } = await import('../src/models/User.js'); assert.ok(await User.exists({ email: 'outage@example.test' }));
  } finally { globalThis.fetch = saved; }
});
