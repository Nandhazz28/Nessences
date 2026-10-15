import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SKIP, integrationEnabled, configureEnv, bootApp, makeUser, makeProduct, signIn, probeCapabilities } from './helpers/integration.js';

configureEnv();
let app; let caps = {};
before(async () => { if (integrationEnabled) { app = await bootApp(); caps = await probeCapabilities(app.mongoose); } });
after(async () => { await app?.stop(); });
const vid = (v) => String(v._id);

test('guest bag: add, change quantity, remove; the server owns every number', { skip: SKIP }, async () => {
  const { variant } = await makeProduct({ price: 300000, salePrice: 250000, stock: 5 }); const b = app.browser();
  let r = await b.post('/api/cart/items', { variantId: vid(variant), qty: 2 });
  assert.equal(r.status, 200); assert.equal(r.data.owner, 'guest');
  assert.equal(r.data.items[0].unitPrice, 250000); assert.equal(r.data.totals.subtotal, 500000);
  assert.equal(r.data.totals.tax, 25000); assert.equal(r.data.totals.shipping, 0); assert.equal(r.data.totals.total, 525000);
  r = await b.patch(`/api/cart/items/${vid(variant)}`, { qty: 3 }); assert.equal(r.data.items[0].qty, 3);
  r = await b.del(`/api/cart/items/${vid(variant)}`); assert.equal(r.data.items.length, 0);
});

test('quantity rules are enforced on the server: 0, negative, fractional, over the limit, over the stock', { skip: SKIP }, async () => {
  const { variant } = await makeProduct({ stock: 3 }); const b = app.browser();
  await b.post('/api/cart/items', { variantId: vid(variant), qty: 1 });
  for (const qty of [0, -1, 1.5, 11, 'abc']) assert.equal((await b.patch(`/api/cart/items/${vid(variant)}`, { qty })).status, 400, `qty=${qty}`);
  const over = await b.patch(`/api/cart/items/${vid(variant)}`, { qty: 4 });
  assert.equal(over.status, 409); assert.equal(over.code, 'INSUFFICIENT_STOCK');
  assert.match(over.json.message, /3/);
  const ghost = await b.patch(`/api/cart/items/${'a'.repeat(24)}`, { qty: 1 });
  assert.equal(ghost.status, 404);
});

test('out-of-stock and unpublished products cannot be added', { skip: SKIP }, async () => {
  const oos = await makeProduct({ stock: 0 }); const draft = await makeProduct({ status: 'draft' }); const b = app.browser();
  assert.equal((await b.post('/api/cart/items', { variantId: vid(oos.variant), qty: 1 })).code, 'OUT_OF_STOCK');
  assert.equal((await b.post('/api/cart/items', { variantId: vid(draft.variant), qty: 1 })).code, 'VARIANT_UNAVAILABLE');
});

test('REGRESSION: the first two simultaneous requests of a brand-new guest do not fail with a duplicate-key error', { skip: SKIP }, async () => {
  const { variant } = await makeProduct({ stock: 9 }); const b = app.browser();
  const first = await b.get('/api/cart'); assert.equal(first.status, 200); // gives the browser its guest cookie
  const [x, y] = await Promise.all([b.fork().post('/api/cart/items', { variantId: vid(variant), qty: 1 }), b.fork().post('/api/cart/items', { variantId: vid(variant), qty: 1 })]);
  assert.deepEqual([x.status, y.status], [200, 200], `${x.status}/${x.code} ${y.status}/${y.code}`);
  const lines = (await b.get('/api/cart')).data.items;
  if (caps.atomicClaims) { assert.equal(lines.length, 1); assert.equal(lines[0].qty, 2, 'both adds must be applied exactly once'); } // needs a database with atomic conditional updates
});

test('REGRESSION: signing in merges the guest bag AND saved-for-later items without duplicating lines', { skip: SKIP }, async () => {
  const a = await makeProduct({ stock: 9, name: 'Coat' }); const c = await makeProduct({ stock: 9, name: 'Scarf' });
  const u = await makeUser(); const own = app.browser(); await signIn(own, u);
  await own.post('/api/cart/items', { variantId: vid(a.variant), qty: 1 });
  await own.post('/api/auth/logout');
  const g = app.browser();
  await g.post('/api/cart/items', { variantId: vid(a.variant), qty: 2 });
  await g.post('/api/cart/items', { variantId: vid(c.variant), qty: 1 });
  await g.post(`/api/cart/items/${vid(c.variant)}/save`);
  await signIn(g, u);
  const cart = (await g.get('/api/cart')).data;
  assert.equal(cart.owner, 'user');
  assert.equal(cart.items.filter((i) => i.variantId === vid(a.variant)).length, 1, 'no duplicate lines');
  assert.equal(cart.items.find((i) => i.variantId === vid(a.variant)).qty, 3, 'quantities add up');
  assert.equal(cart.saved.length, 1, 'saved-for-later survives sign-in'); assert.equal(cart.saved[0].variantId, vid(c.variant));
  assert.equal(g.has('nx_cart'), false, 'guest cookie is retired');
});

test('save for later and move back to the bag', { skip: SKIP }, async () => {
  const { variant } = await makeProduct({ stock: 4 }); const b = app.browser();
  await b.post('/api/cart/items', { variantId: vid(variant), qty: 2 });
  let r = await b.post(`/api/cart/items/${vid(variant)}/save`); assert.equal(r.data.items.length, 0); assert.equal(r.data.saved.length, 1);
  r = await b.post(`/api/cart/saved/${vid(variant)}/move`); assert.equal(r.data.items[0].qty, 2); assert.equal(r.data.saved.length, 0);
  assert.equal((await b.post(`/api/cart/saved/${vid(variant)}/move`)).status, 404);
});

test('a sold-out line is flagged, excluded from totals and blocks checkout', { skip: SKIP }, async () => {
  const { variant } = await makeProduct({ stock: 2 }); const b = app.browser();
  await b.post('/api/cart/items', { variantId: vid(variant), qty: 2 });
  const { Inventory } = await import('../src/models/Inventory.js');
  await Inventory.updateOne({ variant: variant._id }, { $set: { stock: 0 } });
  const r = (await b.get('/api/cart')).data;
  assert.equal(r.items[0].status, 'out_of_stock'); assert.equal(r.totals.subtotal, 0); assert.equal(r.canCheckout, false);
});

test('wishlist: needs a session; add is idempotent; list, remove and persistence across sign-ins', { skip: SKIP }, async () => {
  const { product } = await makeProduct(); const draft = await makeProduct({ status: 'draft' });
  const anon = app.browser();
  assert.equal((await anon.get('/api/wishlist')).status, 401);
  assert.equal((await anon.post('/api/wishlist', { productId: String(product._id) })).status, 401);
  const u = await makeUser(); const b = app.browser(); await signIn(b, u);
  assert.equal((await b.post('/api/wishlist', { productId: String(product._id) })).status, 201);
  const again = await b.post('/api/wishlist', { productId: String(product._id) });
  assert.equal(again.data.length, 1, 'adding twice keeps one entry');
  assert.equal((await b.post('/api/wishlist', { productId: String(draft.product._id) })).status, 404);
  assert.equal((await b.post('/api/wishlist', { productId: 'nope' })).status, 400);
  const fresh = app.browser(); await signIn(fresh, u);
  assert.equal((await fresh.get('/api/wishlist')).data[0].id, String(product._id));
  const removed = await fresh.del(`/api/wishlist/${product._id}`); assert.equal(removed.status, 200);
  if (caps.pullCondition) assert.equal(removed.data.length, 0); // (servers that ignore $pull conditions are skipped for this one assertion)
});

test('REGRESSION: wishlist requests survive an expired access token via refresh (the 401 users saw)', { skip: SKIP }, async () => {
  const { product } = await makeProduct(); const u = await makeUser(); const b = app.browser(); await signIn(b, u);
  const jwt = (await import('jsonwebtoken')).default; const p = jwt.decode(b.cookie('nx_at').value);
  b.plant('nx_at', jwt.sign({ sub: p.sub, typ: p.typ, role: p.role, iat: p.iat - 3600, exp: p.iat - 1800 }, 'a'.repeat(40), { issuer: 'nessence' }));
  const r = await b.post('/api/wishlist', { productId: String(product._id) });
  assert.equal(r.status, 401); assert.equal(r.code, 'TOKEN_EXPIRED', 'a clear, recoverable signal for the client');
  assert.equal((await b.post('/api/auth/refresh')).status, 200);
  assert.equal((await b.post('/api/wishlist', { productId: String(product._id) })).status, 201);
});
