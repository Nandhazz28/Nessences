import test from 'node:test';
import assert from 'node:assert/strict';

Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://127.0.0.1:1/x', LOG_LEVEL: 'silent', JWT_ACCESS_SECRET: 'a'.repeat(40), JWT_REFRESH_SECRET: 'b'.repeat(40) });
const { adminEngage } = await import('../src/routes/adminEngage.js');
const { can } = await import('../src/config/permissions.js');
const { toCsv } = await import('../src/services/engage/newsletterService.js');
const { settingsBody, contentUpdate, articleBody } = await import('../src/services/engage/contentService.js');
const { AUTO_FLAG_AT } = await import('../src/services/engage/reviewService.js');
const { createApp } = await import('../src/app.js');

test('every second-router admin route is behind a named permission check', () => {
  const routes = adminEngage.stack.filter((l) => l.route).map((l) => l.route);
  assert.ok(routes.length >= 24, `found ${routes.length}`);
  assert.deepEqual(routes.filter((r) => !r.stack.some((l) => l.name.startsWith('perm:'))).map((r) => `${Object.keys(r.methods)[0]} ${r.path}`), []);
});

test('who can do what (11b)', () => {
  assert.ok(can('content_manager', 'reviews:moderate') && can('content_manager', 'newsletter:read') && can('content_manager', 'content:write'));
  assert.equal(can('content_manager', 'settings:manage'), false);
  assert.ok(can('support', 'messages:read') && can('support', 'reviews:moderate'));
  assert.equal(can('support', 'newsletter:read'), false);
  assert.equal(can('support', 'analytics:read'), false);
  assert.equal(can('inventory_manager', 'messages:read'), false);
  assert.ok(can('admin', 'settings:manage') && can('admin', 'analytics:read'));
  assert.equal(can('admin', 'staff:manage'), false);
  assert.equal(can('manager', 'staff:manage'), false);
  assert.ok(can('super_admin', 'staff:manage'));
});

test('subscriber CSV export neutralises spreadsheet formulas and quotes', () => {
  const csv = toCsv([{ email: '=HYPERLINK("http://x")@a.com', status: 'subscribed', source: '+cmd', subscribedAt: new Date('2026-01-02T00:00:00Z') }, { email: 'a"b@x.com', status: 'subscribed', source: 'footer' }]).split('\n');
  assert.equal(csv[0], 'email,status,source,subscribed_at');
  assert.ok(csv[1].startsWith(`"'=HYPERLINK`)); assert.ok(csv[1].includes(`"'+cmd"`));
  assert.ok(csv[2].startsWith('"a""b@x.com"'));
});

test('settings only accept real https links on the right platform', () => {
  const ok = (social) => settingsBody.safeParse({ storeName: 'Nessence', social }).success;
  assert.equal(ok({ instagram: 'https://www.instagram.com/nessence' }), true);
  assert.equal(ok({ instagram: '' }), true);
  assert.equal(ok({ instagram: 'http://instagram.com/x' }), false);
  assert.equal(ok({ instagram: 'https://evil.example/instagram.com' }), false);
  assert.equal(ok({ instagram: 'https://instagram.com.evil.example/x' }), false);
  assert.equal(ok({ facebook: 'javascript:alert(1)' }), false);
  assert.equal(ok({ youtube: 'https://youtube.com/@nessence' }), true);
});

test('content payloads: FAQ items validated; articles reject HTML-shaped cover URLs and unknown fields', () => {
  assert.equal(contentUpdate.safeParse({ title: 'FAQ', data: { items: [{ q: 'How long?', a: 'Four days.' }] } }).success, true);
  assert.equal(contentUpdate.safeParse({ title: 'FAQ', data: { items: [{ q: 'x', a: 'y' }] } }).success, false);
  const a = { title: 'A title', excerpt: 'An excerpt long enough.', content: 'Some body content that is long enough.', author: 'Studio' };
  assert.equal(articleBody.safeParse(a).success, true);
  assert.equal(articleBody.safeParse({ ...a, coverImage: { url: 'https://evil.example/x.jpg', alt: 'cover' } }).success, false);
  assert.equal(articleBody.safeParse({ ...a, isAdmin: true }).success, false);
  assert.equal(AUTO_FLAG_AT, 3);
});

test('public endpoints: validation, honeypot, auth guards — none of these need the database', async () => {
  const server = createApp().listen(0); const base = `http://127.0.0.1:${server.address().port}`;
  const post = (p, body, headers = {}) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'nessence', ...headers }, body: JSON.stringify(body) });
  const good = { name: 'Asha', email: 'asha@example.com', subject: 'Sizing question', message: 'Does the slip dress run small?' };

  assert.equal((await post('/api/contact', { ...good, email: 'nope' })).status, 400);
  assert.equal((await post('/api/contact', { ...good, message: 'short' })).status, 400);
  assert.equal((await post('/api/contact', { ...good, orderNumber: 'ABC' })).status, 400);
  assert.equal((await post('/api/contact', { ...good, extra: 1 })).status, 400);
  const bot = await post('/api/contact', { ...good, website: 'http://spam.example' });  
  assert.equal(bot.status, 201); assert.deepEqual((await bot.json()).data, { received: true });

  assert.equal((await post('/api/newsletter', { email: 'bad' })).status, 400);
  assert.equal((await post('/api/newsletter/confirm', { token: 'short' })).status, 400);
  assert.equal((await post('/api/track-order', { orderNumber: 'nope', email: 'a@b.com' })).status, 400);
  assert.equal((await post('/api/track-order', { orderNumber: 'NS-2610-ABC123' })).status, 400);

  for (const [m, p] of [['POST', '/api/products/some-slug/reviews'], ['PATCH', `/api/reviews/${'a'.repeat(24)}`], ['DELETE', `/api/reviews/${'a'.repeat(24)}`], ['POST', `/api/reviews/${'a'.repeat(24)}/report`], ['GET', '/api/account/reviews']])
    assert.equal((await fetch(base + p, { method: m, headers: { 'content-type': 'application/json', 'x-requested-with': 'nessence' }, body: m === 'GET' ? undefined : '{}' })).status, 401, `${m} ${p}`);
  for (const p of ['/api/admin/staff', '/api/admin/reviews', '/api/admin/newsletter/export.csv', '/api/admin/analytics', '/api/admin/settings', '/api/admin/contact-messages', '/api/admin/journal', '/api/admin/content'])
    assert.equal((await fetch(base + p)).status, 401, p);

  assert.equal((await fetch(base + '/api/content/not-a-page')).status, 404);       
  assert.equal((await fetch(base + '/api/content/..%2Fsecret')).status, 400);
  server.close();
});
