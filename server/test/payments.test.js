import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

Object.assign(process.env, {
  NODE_ENV: 'test', MONGODB_URI: 'mongodb://127.0.0.1:1/x', LOG_LEVEL: 'silent',
  JWT_ACCESS_SECRET: 'a'.repeat(40), JWT_REFRESH_SECRET: 'b'.repeat(40),
  PAYMENT_KEY: 'rzp_test_key', PAYMENT_SECRET: 'test_secret_value', PAYMENT_WEBHOOK_SECRET: 'whsec_test_value',
});
const { razorpay, PaymentProviderError } = await import('../src/services/payments/razorpay.js');
const { createApp } = await import('../src/app.js');
const { computeTotals } = await import('../src/services/pricing.js');
const h = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');

test('checkout signature: accepts genuine, rejects tampered order/payment/signature', () => {
  const good = h('test_secret_value', 'order_1|pay_1');
  assert.equal(razorpay.verifyCheckoutSignature({ orderId: 'order_1', paymentId: 'pay_1', signature: good }), true);
  assert.equal(razorpay.verifyCheckoutSignature({ orderId: 'order_2', paymentId: 'pay_1', signature: good }), false);
  assert.equal(razorpay.verifyCheckoutSignature({ orderId: 'order_1', paymentId: 'pay_9', signature: good }), false);
  assert.equal(razorpay.verifyCheckoutSignature({ orderId: 'order_1', paymentId: 'pay_1', signature: 'deadbeef' }), false);
  assert.equal(razorpay.verifyCheckoutSignature({ orderId: 'order_1', paymentId: 'pay_1', signature: undefined }), false);
});

test('webhook signature is over the raw bytes (whitespace change breaks it)', () => {
  const body = Buffer.from('{"event":"payment.captured"}');
  const sig = h('whsec_test_value', body);
  assert.equal(razorpay.verifyWebhookSignature(body, sig), true);
  assert.equal(razorpay.verifyWebhookSignature(Buffer.from('{"event": "payment.captured"}'), sig), false);
  assert.equal(razorpay.verifyWebhookSignature(body, h('wrong', body)), false);
});

test('createOrder sends Basic auth + integer paise to Razorpay and maps failures', async () => {
  const real = globalThis.fetch; let seen;
  globalThis.fetch = async (url, init) => { seen = { url, init }; return new Response(JSON.stringify({ id: 'order_X', amount: 4189500, currency: 'INR' }), { status: 200 }); };
  const r = await razorpay.createOrder({ amount: 4189500, receipt: 'NS-2610-ABC123' });
  assert.deepEqual(r, { id: 'order_X', amount: 4189500, currency: 'INR' });
  assert.equal(seen.url, 'https://api.razorpay.com/v1/orders');
  assert.equal(seen.init.headers.Authorization, `Basic ${Buffer.from('rzp_test_key:test_secret_value').toString('base64')}`);
  assert.equal(JSON.parse(seen.init.body).amount, 4189500);
  globalThis.fetch = async () => new Response('{}', { status: 400 });
  await assert.rejects(razorpay.createOrder({ amount: 100, receipt: 'x' }), PaymentProviderError);
  globalThis.fetch = async () => { throw new Error('boom'); };
  await assert.rejects(razorpay.createOrder({ amount: 100, receipt: 'x' }), PaymentProviderError);
  globalThis.fetch = real;
});

test('express delivery is a flat fee even above the free-shipping threshold', () => {
  assert.equal(computeTotals(900000, 0, 2, 'standard').shipping, 0);
  assert.equal(computeTotals(900000, 0, 2, 'express').shipping, 49900);
});

test('webhook endpoint rejects missing/forged signatures before touching the database', async () => {
  const server = createApp().listen(0); const { port } = server.address();
  const post = (headers, body) => fetch(`http://127.0.0.1:${port}/api/webhooks/razorpay`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body });
  const body = '{"event":"payment.captured"}';
  assert.equal((await post({}, body)).status, 400);
  assert.equal((await post({ 'x-razorpay-signature': 'forged' }, body)).status, 400);
  assert.equal((await post({ 'x-razorpay-signature': h('whsec_test_value', 'not-the-body') }, body)).status, 400);
  const bad = 'not json'; // validly signed but unparseable
  assert.equal((await post({ 'x-razorpay-signature': h('whsec_test_value', bad) }, bad)).status, 400);
  // checkout config is public and reports provider state honestly
  const cfg = await (await fetch(`http://127.0.0.1:${port}/api/checkout/config`)).json();
  assert.equal(cfg.data.paymentsEnabled, true);
  assert.equal(cfg.data.delivery.length, 2);
  // creating an order requires login
  const r = await fetch(`http://127.0.0.1:${port}/api/checkout/orders`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'nessence' }, body: '{}' });
  assert.equal(r.status, 401);
  server.close();
});
