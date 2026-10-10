import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://127.0.0.1:1/x', LOG_LEVEL: 'silent', JWT_ACCESS_SECRET: 'a'.repeat(40), JWT_REFRESH_SECRET: 'b'.repeat(40) });
const R = await import('../src/services/returnRules.js');
const { createApp } = await import('../src/app.js');

const id = () => new mongoose.Types.ObjectId();
const day = 86400000;
const item = (qty = 2) => ({ _id: id(), name: 'Bias Slip Dress', qty, unitPrice: 940000, color: 'Ink', size: 'M' });
const delivered = (daysAgo, items = [item()]) => ({ status: 'delivered', items, statusHistory: [{ status: 'confirmed', at: new Date(Date.now() - (daysAgo + 5) * day) }, { status: 'delivered', at: new Date(Date.now() - daysAgo * day) }] });

test('returns only open after delivery and close after 14 days', () => {
  assert.equal(R.checkEligibility({ status: 'shipped', statusHistory: [] }).eligible, false);
  assert.equal(R.checkEligibility(delivered(3)).eligible, true);
  assert.equal(R.checkEligibility(delivered(13)).eligible, true);
  assert.equal(R.checkEligibility(delivered(15)).eligible, false);
  assert.equal(R.checkEligibility({ status: 'delivered', statusHistory: [] }).eligible, false);
});

test('quantities already in active returns are deducted; rejected/withdrawn ones are not', () => {
  const o = delivered(2, [item(3)]); const it = o.items[0];
  const prior = [{ status: 'requested', items: [{ orderItem: it._id, qty: 1 }] }, { status: 'rejected', items: [{ orderItem: it._id, qty: 2 }] }, { status: 'withdrawn', items: [{ orderItem: it._id, qty: 2 }] }];
  assert.equal(R.remainingQuantities(o, prior).get(String(it._id)), 2);
});

test('validateReturnLines enforces membership, duplicates and quantity caps', () => {
  const o = delivered(1, [item(2)]); const it = o.items[0]; const line = (o2 = {}) => ({ itemId: String(it._id), qty: 1, reason: 'wrong_size', ...o2 });
  const code = (fn) => { try { fn(); return 'ok'; } catch (e) { return e.code; } };
  assert.equal(code(() => R.validateReturnLines(o, [line()], [])), 'ok');
  assert.equal(code(() => R.validateReturnLines(o, [line({ itemId: String(id()) })], [])), 'ITEM_NOT_IN_ORDER');
  assert.equal(code(() => R.validateReturnLines(o, [line(), line()], [])), 'DUPLICATE_ITEM');
  assert.equal(code(() => R.validateReturnLines(o, [line({ qty: 3 })], [])), 'RETURN_QTY_EXCEEDED');
  assert.equal(code(() => R.validateReturnLines(o, [line({ qty: 2 })], [{ status: 'approved', items: [{ orderItem: it._id, qty: 1 }] }])), 'RETURN_QTY_EXCEEDED');
});

test('customers can self-cancel only while confirmed', () => {
  for (const s of ['confirmed']) assert.equal(R.canCustomerCancel({ status: s }), true);
  for (const s of ['pending_payment', 'processing', 'packed', 'shipped', 'delivered', 'cancelled']) assert.equal(R.canCustomerCancel({ status: s }), false, s);
});

test('account, returns and cancel endpoints require a session', async () => {
  const server = createApp().listen(0); const base = `http://127.0.0.1:${server.address().port}`;
  const call = (path, method = 'GET', body) => fetch(base + path, { method, headers: { 'content-type': 'application/json', 'x-requested-with': 'nessence' }, body: body && JSON.stringify(body) });
  for (const [p, m] of [['/api/account/profile', 'GET'], ['/api/account/returns', 'GET'], ['/api/account/sessions', 'DELETE'], ['/api/account/notifications', 'GET'], [`/api/orders/${id()}/cancel`, 'POST']])
    assert.equal((await call(p, m, m === 'POST' ? {} : undefined)).status, 401, `${m} ${p}`);
  server.close();
});
