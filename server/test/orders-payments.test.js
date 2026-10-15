import test, { before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { SKIP, integrationEnabled, configureEnv, bootApp, makeUser, makeProduct, makeAddress, signIn, probeCapabilities, rzpCheckoutSignature, rzpWebhookSignature } from './helpers/integration.js';

configureEnv({ BREVO_API_KEY: 'xkeysib-test', BREVO_SENDER_EMAIL: 'orders@nessence.test' });
let app; let caps = {}; const sent = []; const realFetch = globalThis.fetch;
before(async () => {
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('api.brevo.com')) { sent.push(JSON.parse(init.body)); return new Response(JSON.stringify({ messageId: `<m${sent.length}@test>` }), { status: 201, headers: { 'content-type': 'application/json' } }); }
    if (u.includes('api.razorpay.com/v1/orders')) { const b = JSON.parse(init.body); return new Response(JSON.stringify({ id: `order_${Math.random().toString(36).slice(2, 12)}`, amount: b.amount, currency: b.currency }), { status: 200, headers: { 'content-type': 'application/json' } }); }
    return realFetch(url, init);
  };
  if (integrationEnabled) { app = await bootApp(); caps = await probeCapabilities(app.mongoose); }
});
after(async () => { globalThis.fetch = realFetch; await app?.stop(); });

async function pendingOrder(user, { qty = 2, stock = 5, price = 200000 } = {}) {
  const { Order } = await import('../src/models/Order.js'); const { Payment } = await import('../src/models/Payment.js'); const { Inventory } = await import('../src/models/Inventory.js');
  const { variant, product } = await makeProduct({ stock, price }); const address = await makeAddress(user._id);
  await Inventory.updateOne({ variant: variant._id }, { $inc: { reserved: qty } });
  const line = price * qty; const tax = Math.round(line * 0.05); const total = line + tax + (line >= 500000 ? 0 : 29900);
  const order = await Order.create({ user: user._id, items: [{ variant: variant._id, product: product._id, sku: variant.sku, name: product.name, slug: product.slug, color: 'Black', size: 'M', unitPrice: price, qty, lineTotal: line }],
    delivery: { method: 'standard', label: 'Standard delivery', eta: '4–6 business days' }, shippingAddress: { fullName: address.fullName, phone: address.phone, line1: address.line1, city: address.city, state: address.state, pincode: address.pincode, country: 'IN' },
    totals: { subtotal: line, discount: 0, shipping: line >= 500000 ? 0 : 29900, tax, total }, statusHistory: [{ status: 'pending_payment' }], reservationExpiresAt: new Date(Date.now() + 30 * 60000) });
  const rzpOrder = `order_${order.orderNumber.replace(/\W/g, '')}`;
  const payment = await Payment.create({ order: order._id, user: user._id, provider: 'razorpay', providerOrderId: rzpOrder, amount: total, currency: 'INR' });
  return { order, payment, variant, rzpOrder, total };
}
const stockOf = async (variant) => (await (await import('../src/models/Inventory.js')).Inventory.findOne({ variant: variant._id }).lean());
const reload = async (order) => (await import('../src/models/Order.js')).Order.findById(order._id).lean();
const webhook = (browser, event, { id = `evt_${Math.random().toString(36).slice(2, 10)}`, sign = true } = {}) => {
  const raw = JSON.stringify(event);
  return fetch(`${browser.base}/api/webhooks/razorpay`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-razorpay-event-id': id, 'x-razorpay-signature': sign ? rzpWebhookSignature(raw) : 'bad' }, body: raw }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null), id }));
};
const captured = (p, pay = 'pay_TEST1', over = {}) => ({ event: 'payment.captured', payload: { payment: { entity: { id: pay, order_id: p.rzpOrder, amount: p.total, currency: 'INR', method: 'upi', ...over } } } });

test('REGRESSION: GET /api/orders returns the signed-in customer\'s own placed orders, paginated (it used to throw a 500)', { skip: SKIP }, async () => {
  const u = await makeUser(); const other = await makeUser(); const b = app.browser(); await signIn(b, u);
  assert.equal((await app.browser().get('/api/orders?page=1')).status, 401);
  const mine = await pendingOrder(u.user); const theirs = await pendingOrder(other.user);
  const { Order } = await import('../src/models/Order.js');
  await Order.updateOne({ _id: mine.order._id }, { $set: { status: 'confirmed', paymentStatus: 'captured', paidAt: new Date() } });
  await Order.updateOne({ _id: theirs.order._id }, { $set: { status: 'confirmed', paymentStatus: 'captured', paidAt: new Date() } });
  const abandoned = await pendingOrder(u.user); await Order.updateOne({ _id: abandoned.order._id }, { $set: { status: 'cancelled' } });
  const r = await b.get('/api/orders?page=1');
  assert.equal(r.status, 200, `${r.status} ${r.code}`);
  assert.deepEqual(r.data.items.map((o) => o.id), [String(mine.order._id)], 'only my placed order: not theirs, not an abandoned checkout');
  assert.equal(r.data.pagination.pages, 1); assert.equal(r.data.items[0].totals.total, mine.total);
  assert.equal((await b.get(`/api/orders/${theirs.order._id}`)).status, 404, 'no access to another customer\'s order');
  assert.equal((await b.get(`/api/orders/${mine.order._id}`)).status, 200);
  assert.equal((await b.get('/api/orders?page=0')).status, 400);
});

test('browser payment verification: a genuine signature confirms the order once; stock is committed once; one email', { skip: SKIP }, async () => {
  const u = await makeUser(); const b = app.browser(); await signIn(b, u); sent.length = 0;
  const p = await pendingOrder(u.user, { qty: 2, stock: 5 });
  const body = { razorpay_order_id: p.rzpOrder, razorpay_payment_id: 'pay_OK1', razorpay_signature: rzpCheckoutSignature(p.rzpOrder, 'pay_OK1') };
  const r1 = await b.post(`/api/orders/${p.order._id}/verify-payment`, body);
  assert.equal(r1.status, 200); assert.equal(r1.data.status, 'confirmed'); assert.equal(r1.data.paymentStatus, 'captured');
  const again = await b.post(`/api/orders/${p.order._id}/verify-payment`, body); assert.equal(again.status, 200);
  const inv = await stockOf(p.variant); assert.equal(inv.stock, 3); assert.equal(inv.reserved, 0);
  assert.equal(sent.filter((m) => m.tags?.includes('orderConfirmation')).length, 1, 'repeated callbacks must not resend the confirmation');
});

test('browser payment verification rejects a forged signature, another customer\'s order and a payment for a different order', { skip: SKIP }, async () => {
  const u = await makeUser(); const v = await makeUser(); const b = app.browser(); await signIn(b, u);
  const p = await pendingOrder(u.user); const q = await pendingOrder(v.user);
  const forged = await b.post(`/api/orders/${p.order._id}/verify-payment`, { razorpay_order_id: p.rzpOrder, razorpay_payment_id: 'pay_X', razorpay_signature: 'f'.repeat(64) });
  assert.equal(forged.status, 400); assert.equal(forged.code, 'PAYMENT_SIGNATURE_INVALID');
  assert.equal((await reload(p.order)).status, 'pending_payment', 'a forged callback must not mark the order paid');
  const stolen = await b.post(`/api/orders/${q.order._id}/verify-payment`, { razorpay_order_id: q.rzpOrder, razorpay_payment_id: 'pay_Y', razorpay_signature: rzpCheckoutSignature(q.rzpOrder, 'pay_Y') });
  assert.equal(stolen.status, 404, 'cannot confirm someone else\'s order'); assert.equal((await reload(q.order)).status, 'pending_payment');
  const mismatch = await b.post(`/api/orders/${p.order._id}/verify-payment`, { razorpay_order_id: q.rzpOrder, razorpay_payment_id: 'pay_Z', razorpay_signature: rzpCheckoutSignature(q.rzpOrder, 'pay_Z') });
  assert.equal(mismatch.status, 404);
});

test('webhook: bad signature is refused; unknown orders are acknowledged and ignored', { skip: SKIP }, async () => {
  const b = app.browser();
  assert.equal((await webhook(b, { event: 'payment.captured', payload: {} }, { sign: false })).status, 400);
  const u = await makeUser(); const p = await pendingOrder(u.user);
  assert.equal((await webhook(b, captured({ ...p, rzpOrder: 'order_unknown' }))).status, 200);
  assert.equal((await reload(p.order)).status, 'pending_payment');
});

test('webhook: a captured payment confirms the order; failed/incorrect amount or currency never does', { skip: SKIP }, async () => {
  const b = app.browser(); const u = await makeUser();
  const wrongAmount = await pendingOrder(u.user); await webhook(b, captured(wrongAmount, 'pay_A', { amount: wrongAmount.total - 100 }));
  assert.equal((await reload(wrongAmount.order)).status, 'pending_payment', 'amount mismatch must not confirm');
  const wrongCurrency = await pendingOrder(u.user); await webhook(b, captured(wrongCurrency, 'pay_B', { currency: 'USD' }));
  assert.equal((await reload(wrongCurrency.order)).status, 'pending_payment', 'currency mismatch must not confirm');
  const failed = await pendingOrder(u.user); await webhook(b, { event: 'payment.failed', payload: { payment: { entity: { id: 'pay_C', order_id: failed.rzpOrder, error_description: 'Card declined' } } } });
  const { Payment } = await import('../src/models/Payment.js');
  assert.equal((await Payment.findOne({ order: failed.order._id }).lean()).status, 'failed'); assert.equal((await reload(failed.order)).status, 'pending_payment');
  const ok = await pendingOrder(u.user); assert.equal((await webhook(b, captured(ok, 'pay_D'))).status, 200);
  const o = await reload(ok.order); assert.equal(o.status, 'confirmed'); assert.equal(o.paymentStatus, 'captured');
  await webhook(b, { event: 'payment.failed', payload: { payment: { entity: { id: 'pay_D', order_id: ok.rzpOrder } } } });
  assert.equal((await Payment.findOne({ order: ok.order._id }).lean()).status, 'captured', 'a late failure event cannot downgrade a captured payment');
});

test('REGRESSION: a webhook that fails while processing is retried by the gateway and then succeeds (it used to be discarded as a duplicate)', { skip: SKIP }, async () => {
  const b = app.browser(); const u = await makeUser(); const p = await pendingOrder(u.user, { qty: 1 });
  const { Inventory } = await import('../src/models/Inventory.js');
  const orig = Inventory.updateOne; let failures = 1;
  mock.method(Inventory, 'updateOne', function (...a) { if (failures-- > 0) throw new Error('transient database error'); return orig.apply(this, a); });
  const evt = captured(p, 'pay_RETRY'); const id = 'evt_retry_1';
  let first; try { first = await webhook(b, evt, { id }); } finally { mock.restoreAll(); }
  assert.equal(first.status, 500, 'a failure must be reported so the gateway retries');
  const second = await webhook(b, evt, { id });
  assert.equal(second.status, 200);
  const o = await reload(p.order);
  assert.equal(o.status, 'confirmed', 'the retried event must complete the order');
  const inv = await stockOf(p.variant); assert.equal(inv.reserved, 0); assert.equal(inv.stock, 4, 'stock committed exactly once');
  const third = await webhook(b, evt, { id }); assert.equal(third.status, 200);
  assert.equal((await stockOf(p.variant)).stock, 4, 'a delivered-twice event changes nothing');
});

test('duplicate webhook deliveries (sequential) are acknowledged once and applied once', { skip: SKIP }, async () => {
  const b = app.browser(); const u = await makeUser(); const p = await pendingOrder(u.user, { qty: 2 }); sent.length = 0;
  const evt = captured(p, 'pay_DUP'); const id = 'evt_dup_1';
  for (let i = 0; i < 3; i += 1) assert.equal((await webhook(b, evt, { id })).status, 200);
  const inv = await stockOf(p.variant); assert.equal(inv.stock, 3); assert.equal(inv.reserved, 0);
  assert.equal(sent.filter((m) => m.tags?.includes('orderConfirmation')).length, 1);
});

test('simultaneous duplicate webhooks cannot confirm twice or commit stock twice', { skip: SKIP || (!caps.atomicClaims && 'needs a database with atomic conditional updates') }, async (t) => {
  if (!caps.atomicClaims) return t.skip('database does not provide atomic conditional updates');
  const b = app.browser(); const u = await makeUser(); const p = await pendingOrder(u.user, { qty: 2 });
  const evt = captured(p, 'pay_RACE');
  const rs = await Promise.all(Array.from({ length: 6 }, () => webhook(b, evt, { id: 'evt_race' })));
  assert.ok(rs.every((r) => r.status === 200 || r.status === 409));
  const inv = await stockOf(p.variant); assert.equal(inv.stock, 3); assert.equal(inv.reserved, 0);
});

test('checkout: repeated submission leaves exactly one open order; totals come from the server', { skip: SKIP }, async (t) => {
  if (!caps.expr) return t.skip('needs $expr support (stock reservation); not available on this test database');
  const u = await makeUser(); const b = app.browser(); await signIn(b, u); const a = await makeAddress(u.user._id);
  const { variant } = await makeProduct({ price: 100000, stock: 5 });
  await b.post('/api/cart/items', { variantId: String(variant._id), qty: 2 });
  const body = { addressId: String(a._id), delivery: 'standard' };
  const rs = await Promise.all([b.fork().post('/api/checkout/orders', body), b.fork().post('/api/checkout/orders', body)]);
  assert.ok(rs.some((r) => r.status === 201));
  const { Order } = await import('../src/models/Order.js');
  assert.equal(await Order.countDocuments({ user: u.user._id, status: 'pending_payment' }), 1);
  const ok = rs.find((r) => r.status === 201);
  assert.equal(ok.data.order.totals.subtotal, 200000); assert.equal(ok.data.order.totals.tax, 10000); assert.equal(ok.data.order.totals.shipping, 29900);
  assert.equal(ok.data.payment.amount, ok.data.order.totals.total);
});
