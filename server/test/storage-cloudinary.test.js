import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
Object.assign(process.env, { NODE_ENV: 'test', STORAGE_PROVIDER: 'cloudinary', CLOUDINARY_CLOUD_NAME: 'democloud', CLOUDINARY_API_KEY: 'key123', CLOUDINARY_API_SECRET: 'topsecret', MONGODB_URI: 'mongodb://127.0.0.1:1/x', LOG_LEVEL: 'silent', JWT_ACCESS_SECRET: 'a'.repeat(40), JWT_REFRESH_SECRET: 'b'.repeat(40) });
const { createCloudinaryProvider } = await import('../src/services/storage/cloudinaryProvider.js');
const { createStorage, sniffImage } = await import('../src/services/storage.js');
const { deliveryUrl, presentImage, isCloudinaryAssetUrl, isAllowedImageUrl } = await import('../src/services/imageUrls.js');

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
const silent = { error() {}, warn() {}, info() {} };

function mockClient({ uploadResult, uploadError, destroyResult = { result: 'ok' }, destroyError } = {}) {
  const calls = { uploads: [], destroys: [] };
  return { calls, uploader: {
    upload_stream(opts, cb) {
      calls.uploads.push(opts); const s = new PassThrough(); s.on('data', () => {});
      s.on('finish', () => setImmediate(() => (uploadError ? cb(uploadError) : cb(null, uploadResult ?? { public_id: opts.public_id, secure_url: `https://res.cloudinary.com/democloud/image/upload/v1/${opts.public_id}.jpg`, bytes: 68, width: 800, height: 600, format: 'jpg', version: 1 }))));
      return s;
    },
    async destroy(id, opts) { calls.destroys.push([id, opts]); if (destroyError) throw destroyError; return destroyResult; },
  } };
}
const provider = (c, extra = {}) => createCloudinaryProvider({ client: c, folder: 'nessence', timeoutMs: 5000, log: silent, ...extra });

test('upload sends a server-chosen public_id, restricted formats, a size cap and a timeout; returns metadata', async () => {
  const c = mockClient(); const p = provider(c);
  const id = p.newPublicId('product');
  assert.match(id, /^nessence\/products\/[0-9a-f-]{36}$/);
  assert.match(p.newPublicId('article'), /^nessence\/journal\//);
  const r = await p.upload(jpeg, { publicId: id });
  assert.equal(r.publicId, id); assert.equal(r.width, 800); assert.ok(r.url.startsWith('https://'));
  const o = c.calls.uploads[0];
  assert.equal(o.public_id, id); assert.equal(o.resource_type, 'image'); assert.equal(o.overwrite, false); assert.equal(o.timeout, 5000);
  assert.deepEqual(o.allowed_formats, ['jpg', 'png', 'webp']);
  assert.equal(o.transformation[0].crop, 'limit');
  assert.ok(!('upload_preset' in o));
});

test('upload refuses a public_id outside the configured folder', () => {
  assert.throws(() => provider(mockClient()).upload(jpeg, { publicId: 'other/stuff' }), (e) => e.status === 500);
  assert.throws(() => provider(mockClient()).upload(jpeg, { publicId: 'nessence/../x' }), (e) => e.status === 500);
});

test('provider failures become safe 502/504 errors with no provider text', async () => {
  const bad = await provider(mockClient({ uploadError: { message: 'Invalid api_key key123 secret topsecret', http_code: 401, name: 'Error' } })).upload(jpeg, { publicId: 'nessence/products/x' }).catch((e) => e);
  assert.equal(bad.status, 502); assert.equal(bad.code, 'STORAGE_UNAVAILABLE'); assert.ok(!/key123|topsecret/.test(bad.message));
  const slow = await provider(mockClient({ uploadError: { error: { message: 'Request Timeout', http_code: 499, name: 'TimeoutError' } } })).upload(jpeg, { publicId: 'nessence/products/x' }).catch((e) => e);
  assert.equal(slow.status, 504); assert.equal(slow.code, 'STORAGE_TIMEOUT');
});

test('destroy deletes by stored public_id; "not found" is success; anything else throws', async () => {
  const c = mockClient(); const p = provider(c);
  assert.deepEqual(await p.destroy('nessence/products/abc'), { deleted: true });
  assert.equal(c.calls.destroys[0][0], 'nessence/products/abc'); assert.equal(c.calls.destroys[0][1].invalidate, true);
  assert.deepEqual(await provider(mockClient({ destroyResult: { result: 'not found' } })).destroy('nessence/products/abc'), { deleted: false });
  await assert.rejects(provider(mockClient({ destroyResult: { result: 'error' } })).destroy('nessence/products/abc'), (e) => e.status === 502);
  await assert.rejects(provider(mockClient({ destroyError: { http_code: 500 } })).destroy('nessence/products/abc'), (e) => e.status === 502);
});

test('destroy never touches an asset outside our folder, even if the database says so', async () => {
  const c = mockClient();
  await assert.rejects(provider(c).destroy('someone-elses/asset'), (e) => e.status === 500);
  await assert.rejects(provider(c).destroy('nessence/../../x'), (e) => e.status === 500);
  assert.equal(c.calls.destroys.length, 0);
});

test('storage validation: type is sniffed from bytes, size limit is configurable', () => {
  const s = createStorage({ provider: provider(mockClient()), maxBytes: 100 });
  assert.equal(s.validate(jpeg).ext, 'jpg');
  assert.throws(() => s.validate(Buffer.alloc(101, 0xff)), (e) => e.status === 413 && e.code === 'FILE_TOO_LARGE');
  assert.throws(() => s.validate(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>')), (e) => e.status === 400 && e.code === 'INVALID_IMAGE');
  assert.throws(() => s.validate(Buffer.from('GIF89a' + 'x'.repeat(30))), (e) => e.code === 'INVALID_IMAGE');
  assert.throws(() => s.validate(Buffer.alloc(0)), (e) => e.code === 'NO_FILE');
  assert.equal(sniffImage(Buffer.from('MZ' + 'x'.repeat(30))), null); // an executable renamed .jpg
});

test('save() stays call-compatible and returns metadata; remove() deletes by publicId only', async () => {
  const c = mockClient(); const s = createStorage({ provider: provider(c), maxBytes: 1e6 });
  const r = await s.save(jpeg);
  assert.ok(r.publicId.startsWith('nessence/products/') && r.mime === 'image/jpeg' && r.url);
  await s.remove({ publicId: 'nessence/products/zz', url: 'https://res.cloudinary.com/democloud/image/upload/v1/other/path.jpg' });
  assert.equal(c.calls.destroys.at(-1)[0], 'nessence/products/zz'); // the URL is ignored
  const before = c.calls.destroys.length;
  await s.remove('https://res.cloudinary.com/democloud/image/upload/v1/nessence/products/y.jpg'); // bare URL: never a remote delete
  assert.equal(c.calls.destroys.length, before);
});

test('delivery URLs: optimised transformation for Cloudinary images, untouched for legacy images', () => {
  const u = deliveryUrl({ url: 'x', publicId: 'nessence/products/abc' }, 'card');
  assert.match(u, /^https:\/\/res\.cloudinary\.com\/democloud\/image\/upload\/c_limit,w_720\/f_auto,q_auto\/v1\/nessence\/products\/abc$/);
  assert.match(deliveryUrl({ url: 'x', publicId: 'nessence/products/abc' }, 'thumb'), /w_240/);
  assert.equal(deliveryUrl({ url: '/media/seed/coat.svg' }, 'card'), '/media/seed/coat.svg'); // no publicId: unchanged
  assert.equal(deliveryUrl(undefined, 'card'), undefined);
});

test('presentImage hides storage internals unless a snapshot needs the publicId', () => {
  const img = { url: '/x', alt: 'a', publicId: 'nessence/products/abc', width: 1, bytes: 2, format: 'jpg', color: 'Ink' };
  const pub = presentImage(img, 'thumb');
  assert.deepEqual(Object.keys(pub).sort(), ['alt', 'color', 'url']); assert.match(pub.url, /w_240/);
  assert.equal(presentImage(img, 'thumb', { keepPublicId: true }).publicId, 'nessence/products/abc');
  assert.deepEqual(presentImage({ url: '/media/seed/a.svg', alt: 'a' }, 'thumb'), { url: '/media/seed/a.svg', alt: 'a' });
});

test('URL allowlist: only this account + folder over https, or legacy /media paths', () => {
  const ok = 'https://res.cloudinary.com/democloud/image/upload/v1/nessence/products/abc.jpg';
  assert.equal(isAllowedImageUrl(ok), true);
  assert.equal(isAllowedImageUrl('/media/products/x.jpg'), true);
  for (const bad of ['http://res.cloudinary.com/democloud/image/upload/v1/nessence/products/a.jpg', 'https://res.cloudinary.com/othercloud/image/upload/v1/nessence/products/a.jpg',
    'https://evil.example/democloud/image/upload/v1/nessence/products/a.jpg', 'https://res.cloudinary.com/democloud/image/upload/v1/other/a.jpg', ok + '?x=1', 'https://res.cloudinary.com.evil.example/democloud/image/upload/nessence/a.jpg', 'javascript:alert(1)'])
    assert.equal(isCloudinaryAssetUrl(bad), false, bad);
});
