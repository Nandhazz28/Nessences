import test from 'node:test';
import assert from 'node:assert/strict';
const { parseEnv } = await import('../src/config/envSchema.js');

const base = { MONGODB_URI: 'mongodb://x', JWT_ACCESS_SECRET: 'a'.repeat(40), JWT_REFRESH_SECRET: 'b'.repeat(40) };
const prodOk = { ...base, NODE_ENV: 'production', CLOUDINARY_CLOUD_NAME: 'demo', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 'sekret', BREVO_API_KEY: 'xkeysib-abc', BREVO_SENDER_EMAIL: 'no-reply@nessence.test' };
const errs = (src) => { const r = parseEnv(src); return r.ok ? [] : r.errors; };

test('development defaults to local storage and needs no email credentials', () => {
  const r = parseEnv(base);
  assert.equal(r.ok, true);
  assert.equal(r.data.STORAGE_PROVIDER, 'local');
  assert.equal(r.data.BREVO_SENDER_NAME, 'Nessence');
});

test('a complete production config is accepted and defaults to cloudinary', () => {
  const r = parseEnv(prodOk);
  assert.equal(r.ok, true);
  assert.equal(r.data.STORAGE_PROVIDER, 'cloudinary');
  assert.equal(r.data.CLOUDINARY_FOLDER, 'nessence');
});

test('production with nothing configured fails clearly, naming every missing variable', () => {
  const e = errs({ ...base, NODE_ENV: 'production' }).join('\n');
  for (const k of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET', 'BREVO_API_KEY', 'BREVO_SENDER_EMAIL']) assert.match(e, new RegExp(k));
});

test('production never falls back to local disk', () => {
  assert.match(errs({ ...prodOk, STORAGE_PROVIDER: 'local' }).join(), /STORAGE_PROVIDER/);
});

test('explicit cloudinary in development still requires its credentials', () => {
  assert.match(errs({ ...base, STORAGE_PROVIDER: 'cloudinary' }).join(), /CLOUDINARY_API_SECRET: required/);
});

test('a stale IMAGE_STORAGE=s3 deployment fails loudly instead of being ignored', () => {
  assert.match(errs({ ...base, IMAGE_STORAGE: 's3' }).join(), /S3 storage was removed/);
});

test('a Brevo key needs a sender; an SMTP-style key and a bad sender are rejected', () => {
  assert.match(errs({ ...base, BREVO_API_KEY: 'xkeysib-abc' }).join(), /BREVO_SENDER_EMAIL/);
  assert.match(errs({ ...base, BREVO_API_KEY: 'xsmtpsib-abc', BREVO_SENDER_EMAIL: 'a@b.test' }).join(), /SMTP key/);
  assert.match(errs({ ...base, BREVO_API_KEY: 'xkeysib-abc', BREVO_SENDER_EMAIL: 'not-an-email' }).join(), /valid email/);
});

test('EMAIL_DEV_LOG_BODY is refused in production', () => {
  assert.match(errs({ ...prodOk, EMAIL_DEV_LOG_BODY: 'true' }).join(), /EMAIL_DEV_LOG_BODY/);
});

test('folder prefix and size limit are validated', () => {
  assert.match(errs({ ...prodOk, CLOUDINARY_FOLDER: 'Bad Folder!' }).join(), /CLOUDINARY_FOLDER/);
  assert.match(errs({ ...base, IMAGE_MAX_BYTES: '10' }).join(), /IMAGE_MAX_BYTES/);
  assert.equal(parseEnv({ ...base, IMAGE_MAX_BYTES: '2000000' }).data.IMAGE_MAX_BYTES, 2000000);
});

test('validation messages never contain secret values', () => {
  const all = errs({ ...prodOk, CLOUDINARY_FOLDER: 'BAD!', BREVO_API_KEY: 'xsmtpsib-SUPERSECRET', STORAGE_PROVIDER: 'local' }).join('\n');
  assert.ok(!all.includes('SUPERSECRET') && !all.includes('sekret'));
});
