import test from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://127.0.0.1:1/x', JWT_ACCESS_SECRET: 'a'.repeat(40), JWT_REFRESH_SECRET: 'b'.repeat(40), LOG_LEVEL: 'silent', STORAGE_PROVIDER: 'cloudinary', CLOUDINARY_CLOUD_NAME: 'demo-cloud', CLOUDINARY_API_KEY: '123456789012345', CLOUDINARY_API_SECRET: 'not-a-real-secret' });
const { deliverySrcSet, deliveryUrl, RESPONSIVE_WIDTHS } = await import('../src/services/imageUrls.js');
const { toListItem } = await import('../src/services/catalogService.js');
const cfg = { active: true, cloudName: 'demo-cloud' };

test('Cloudinary images get width variants with automatic format and quality; the largest equals the plain url', () => {
  const s = deliverySrcSet({ publicId: 'nessence/a', url: 'x' }, 'card', cfg);
  const parts = s.split(', '); assert.equal(parts.length, 2);
  assert.match(parts[0], /^https:\/\/res\.cloudinary\.com\/demo-cloud\/image\/upload\/.*w_360.*\/nessence\/a 360w$/); assert.match(parts[1], /w_720.* 720w$/);
  for (const p of parts) assert.match(p, /f_auto/), assert.match(p, /q_auto/), assert.match(p, /c_limit/);
  assert.equal(parts[1].replace(/ 720w$/, ''), deliveryUrl({ publicId: 'nessence/a', url: 'x' }, 'card', cfg));
  assert.deepEqual(RESPONSIVE_WIDTHS.card, [360, 720]);
});

test('legacy local images, inactive storage and unknown presets get no srcset (nothing invented)', () => {
  assert.equal(deliverySrcSet({ url: '/media/products/x.jpg' }, 'card', cfg), undefined);
  assert.equal(deliverySrcSet({ publicId: 'p', url: 'x' }, 'card', { active: false }), undefined);
  assert.equal(deliverySrcSet({ publicId: 'p', url: 'x' }, 'thumb', cfg), undefined);
  assert.equal(deliverySrcSet(null, 'card', cfg), undefined);
});

test('list items carry srcSet only on the two images a card paints, and never expose publicId', () => {
  const imgs = [0, 1, 2, 3].map((n) => ({ url: `https://res.cloudinary.com/demo-cloud/image/upload/nessence/${n}.jpg`, alt: `a${n}`, order: n, publicId: `nessence/${n}` }));
  const item = toListItem({ _id: 'x', slug: 's', name: 'n', gender: 'men', price: 100, effectivePrice: 100, images: imgs, facets: {}, colorOptions: [] });
  assert.equal(item.images.length, 4); assert.ok(item.images.every((i) => !('publicId' in i)));
  assert.deepEqual(item.images.map((i) => Boolean(i.srcSet)), [true, true, false, false], 'only the front and hover images');
  assert.match(item.images[0].srcSet, /360w, .* 720w$/); assert.match(item.images[0].url, /w_720/);
});
