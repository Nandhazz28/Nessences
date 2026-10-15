import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import fs from 'node:fs';

Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://127.0.0.1:1/x', LOG_LEVEL: 'silent', JWT_ACCESS_SECRET: 'a'.repeat(40), JWT_REFRESH_SECRET: 'b'.repeat(40) });
await import('../src/config/db.js'); 
const { createApp } = await import('../src/app.js');
const { sanitizeInput } = await import('../src/middleware/security.js');

const Model = mongoose.model('RegressionProbe', new mongoose.Schema({ status: String, price: Number, tags: [String], when: Date, stock: Number, reserved: Number }));
const cast = (q) => { q._castConditions(); return q.getFilter(); };

test('mongoose global sanitizeFilter is OFF (it silently turns every $in/$ne/$gte filter into a never-matching $eq)', () => {
  assert.notEqual(mongoose.get('sanitizeFilter'), true);
  assert.ok(!/sanitizeFilter['"]?\s*,\s*true/.test(fs.readFileSync(new URL('../src/config/db.js', import.meta.url), 'utf8')), 'db.js must not enable sanitizeFilter');
});

test('operator filters used across the app survive query casting under the real config', () => {
  assert.deepEqual(cast(Model.find({ status: { $ne: 'pending_payment' } })), { status: { $ne: 'pending_payment' } });
  assert.deepEqual(cast(Model.find({ tags: { $in: ['S', 'M'] } })), { tags: { $in: ['S', 'M'] } });
  assert.deepEqual(cast(Model.countDocuments({ price: { $gte: 100, $lte: 900 } })), { price: { $gte: 100, $lte: 900 } });
  const when = new Date(); assert.deepEqual(cast(Model.find({ when: { $gt: when } })), { when: { $gt: when } });
  const expr = { $gte: [{ $subtract: ['$stock', '$reserved'] }, 2] };
  assert.deepEqual(cast(Model.updateOne({ $expr: expr }, { $inc: { stock: 1 } })), { $expr: expr });
  const or = [{ status: { $regex: '^a' } }, { price: 1 }]; assert.equal(cast(Model.find({ $or: or })).$or.length, 2);
  assert.ok(cast(Model.find({ $or: or })).$or[0].status.$regex);
});

test('operator injection is still blocked at the edge: sanitizeInput strips $ and dotted keys from body and query', () => {
  const req = { body: { email: { $gt: '' }, 'a.b': 1, ok: 'x', nested: { $where: 'x', fine: 1 } }, query: { q: 'dress', 'price[$gt]': '1', $or: 'x' } };
  sanitizeInput(req, {}, () => {});
  assert.deepEqual(req.body, { email: {}, ok: 'x', nested: { fine: 1 } });
  assert.equal(req.query.q, 'dress'); assert.equal(req.query.$or, undefined);
});

test('login rejects an operator object for email/password at validation (no query is ever built from it)', async () => {
  const s = createApp().listen(0); const base = `http://127.0.0.1:${s.address().port}`;
  const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'nessence' }, body: JSON.stringify({ email: { $gt: '' }, password: { $ne: 'x' } }) });
  assert.equal(r.status, 400); s.close();
});

test('public forms use their own rate-limit bucket: exhausting track-order does not lock out sign-in', async () => {
  const s = createApp().listen(0); const base = `http://127.0.0.1:${s.address().port}`;
  const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'nessence' }, body: JSON.stringify(b) });
  let last; for (let i = 0; i < 25; i++) last = (await post('/api/track-order', { orderNumber: 'bad' })).status;
  assert.equal(last, 429, 'track-order should be limited by its own bucket');
  for (let i = 0; i < 10; i++) assert.equal((await post('/api/newsletter', { email: 'bad' })).status, 400, 'newsletter bucket independent of track-order');
  assert.equal((await post('/api/auth/login', { email: 'a@b.com' })).status, 400, 'login is not limited by other forms');
  s.close();
});
