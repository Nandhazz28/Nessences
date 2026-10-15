import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src');

test('the index script loads every model automatically (production has autoIndex off, so a missed model has no unique constraints)', () => {
  const script = fs.readFileSync(path.join(src, 'scripts/syncIndexes.js'), 'utf8');
  assert.match(script, /readdirSync\(dir\)/); assert.match(script, /syncIndexes\(\)/);
  assert.ok(fs.readdirSync(path.join(src, 'models')).length >= 20);
});

test('every model file is a mongoose model registered under its own name (so auto-loading registers all of them)', async () => {
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://127.0.0.1:1/x', JWT_ACCESS_SECRET: 'a'.repeat(40), JWT_REFRESH_SECRET: 'b'.repeat(40), LOG_LEVEL: 'silent' });
  const mongoose = (await import('mongoose')).default;
  const files = fs.readdirSync(path.join(src, 'models')).filter((f) => f.endsWith('.js'));
  for (const f of files) await import(path.join(src, 'models', f));
  assert.equal(mongoose.modelNames().length, files.length, `models registered: ${mongoose.modelNames().join(', ')}`);
  for (const must of ['Order', 'Payment', 'Session', 'WebhookEvent', 'Coupon', 'Inventory', 'Wishlist', 'Refund']) assert.ok(mongoose.modelNames().includes(must), must);
});
