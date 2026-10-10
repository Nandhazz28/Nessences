import test from 'node:test';
import assert from 'node:assert/strict';
process.env.MONGODB_URI ??= 'mongodb://x'; // pricing is pure; env not needed but keep imports safe
import { computeTotals, evaluateCoupon } from '../src/services/pricing.js';

const pct = { active: true, type: 'percent', value: 10, minOrder: 200000, maxDiscount: 300000, usedCount: 0 };

test('free shipping at/above ₹5,000 after discount, flat ₹299 below', () => {
  assert.equal(computeTotals(500000, 0, 1).shipping, 0);
  assert.equal(computeTotals(499900, 0, 1).shipping, 29900);
  assert.equal(computeTotals(520000, 30000, 1).shipping, 29900); // discount pushes it under threshold
});
test('empty bag has no shipping or tax', () => {
  assert.deepEqual(computeTotals(0, 0, 0), { subtotal: 0, discount: 0, shipping: 0, tax: 0, total: 0, itemCount: 0 });
});
test('tax is 5% of the discounted subtotal and total adds up', () => {
  const t = computeTotals(3990000, 0, 3);
  assert.equal(t.tax, 199500); assert.equal(t.shipping, 0); assert.equal(t.total, 4189500); // ₹41,895 as in the design reference
});
test('percent coupon is floored and capped', () => {
  assert.equal(evaluateCoupon(pct, 999999), 99999);
  assert.equal(evaluateCoupon(pct, 9000000), 300000);
});
test('fixed coupon cannot exceed subtotal', () => {
  assert.equal(evaluateCoupon({ active: true, type: 'fixed', value: 50000, minOrder: 0, usedCount: 0 }, 30000), 30000);
});
test('coupon rejections carry specific codes', () => {
  const code = (c, sub, now) => { try { evaluateCoupon(c, sub, now); } catch (e) { return e.code; } return 'ok'; };
  assert.equal(code(null, 1), 'COUPON_INVALID');
  assert.equal(code({ ...pct, active: false }, 300000), 'COUPON_INVALID');
  assert.equal(code({ ...pct, expiresAt: new Date('2020-01-01') }, 300000), 'COUPON_EXPIRED');
  assert.equal(code({ ...pct, startsAt: new Date('2999-01-01') }, 300000), 'COUPON_NOT_STARTED');
  assert.equal(code({ ...pct, usageLimit: 5, usedCount: 5 }, 300000), 'COUPON_EXHAUSTED');
  assert.equal(code(pct, 100000), 'COUPON_MIN_ORDER');
  assert.equal(code(pct, 300000), 'ok');
});
