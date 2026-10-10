import test from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://127.0.0.1:1/x', LOG_LEVEL: 'silent', JWT_ACCESS_SECRET: 'a'.repeat(40), JWT_REFRESH_SECRET: 'b'.repeat(40) });
const { admin } = await import('../src/routes/admin.js');
const { createApp } = await import('../src/app.js');
const { articleBody } = await import('../src/services/engage/contentService.js');
const { createBody } = await import('../src/services/admin/productAdmin.js');

const route = (method, path) => admin.stack.map((l) => l.route).find((r) => r && r.path === path && r.methods[method]);

test('upload and discard routes exist and are behind named permission checks', () => {
  for (const [m, p] of [['post', '/uploads/product-image'], ['delete', '/uploads/:assetId']]) {
    const r = route(m, p); assert.ok(r, `${m} ${p}`);
    assert.ok(r.stack.some((l) => l.name.startsWith('perm:products:write|content:write')), `${m} ${p} has no permission guard`);
  }
});

test('an explicit upload purpose needs that purpose\'s permission (content_manager cannot write to the product folder)', () => {
  const guard = route('post', '/uploads/product-image').stack.map((l) => l.handle).find((h) => h.length === 3 && !h.name.startsWith('perm:') && /purpose/.test(h.toString()));
  const run = (role, purpose) => { let out; guard({ staff: { role }, query: { purpose } }, {}, (e) => { out = e ?? 'allowed'; }); return out === 'allowed' ? 'allowed' : out.status; };
  assert.equal(run('content_manager', 'article'), 'allowed');
  assert.equal(run('content_manager', 'product'), 403);
  assert.equal(run('manager', 'product'), 'allowed');
  assert.equal(run('manager', 'article'), 403);
  assert.equal(run('super_admin', 'article'), 'allowed');
  assert.equal(run('content_manager', undefined), 'allowed'); // legacy callers without a purpose keep working
});

test('unauthenticated upload and discard are refused before any storage or database work', async () => {
  const s = createApp().listen(0); const base = `http://127.0.0.1:${s.address().port}`;
  const h = { 'x-requested-with': 'nessence' };
  const up = await fetch(`${base}/api/admin/uploads/product-image`, { method: 'POST', headers: h });
  const del = await fetch(`${base}/api/admin/uploads/${'a'.repeat(24)}`, { method: 'DELETE', headers: h });
  const customer = await fetch(`${base}/api/admin/uploads/product-image`, { method: 'POST', headers: { ...h, cookie: 'ns_at=whatever' } });
  assert.equal(up.status, 401); assert.equal(del.status, 401); assert.equal(customer.status, 401);
  s.close();
});

test('image URLs from other hosts are refused by product and article validation; a smuggled publicId is stripped', () => {
  const p = { name: 'Wool Scarf', description: 'A soft wool scarf.', gender: 'men', categoryId: 'a'.repeat(24), price: 450000 };
  assert.equal(createBody.safeParse({ ...p, images: [{ url: 'https://evil.example/x.jpg', alt: 'Scarf front' }] }).success, false);
  assert.equal(createBody.safeParse({ ...p, images: [{ url: '/media/products/x.jpg', alt: 'Scarf front' }] }).success, true);
  const parsed = createBody.parse({ ...p, images: [{ url: '/media/products/x.jpg', alt: 'Scarf front', publicId: 'nessence/products/VICTIM' }] });
  assert.equal('publicId' in parsed.images[0], false);
  const a = { title: 'A title', excerpt: 'An excerpt long enough.', content: 'Some body content that is long enough.', author: 'Studio' };
  assert.equal(articleBody.safeParse({ ...a, coverImage: { url: 'https://evil.example/x.jpg', alt: 'cover' } }).success, false);
  assert.equal(articleBody.safeParse({ ...a, coverImage: { url: '/media/seed/x.svg', alt: 'cover', publicId: 'x' } }).success, false); // strict: no extra keys
});
