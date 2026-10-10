import test from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env, { NODE_ENV: 'test', STORAGE_PROVIDER: 'cloudinary', CLOUDINARY_CLOUD_NAME: 'democloud', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's', MONGODB_URI: 'mongodb://127.0.0.1:1/x', LOG_LEVEL: 'silent', JWT_ACCESS_SECRET: 'a'.repeat(40), JWT_REFRESH_SECRET: 'b'.repeat(40) });
const { createMediaService, PENDING_GRACE_MS, UPLOAD_GRACE_MS } = await import('../src/services/mediaService.js');
const { fakeModel } = await import('./helpers/fakeDb.js');
const { ApiError } = await import('../src/utils/ApiError.js');

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
const URL_OF = (id) => `https://res.cloudinary.com/democloud/image/upload/v1/${id}.jpg`;
const silent = { error() {}, warn() {}, info() {} };

function setup({ assets = [], products = [], articles = [], orders = [], returns = [] } = {}) {
  const models = { MediaAsset: fakeModel(assets), Product: fakeModel(products), Article: fakeModel(articles), Order: fakeModel(orders), ReturnRequest: fakeModel(returns) };
  const log = { destroyed: [], legacyRemoved: [], uploadErr: null, destroyErr: null, n: 0 };
  const storage = {
    supportsRegistry: true,
    validate: (b) => { if (!b.length) throw ApiError.badRequest('NO_FILE', 'x'); },
    newPublicId: () => `nessence/products/id-${++log.n}`,
    async save(_b, { publicId }) { if (log.uploadErr) throw log.uploadErr; return { publicId, url: URL_OF(publicId), bytes: 68, width: 800, height: 600, format: 'jpg', version: 1 }; },
    async destroy(id) { if (log.destroyErr) throw log.destroyErr; log.destroyed.push(id); return { deleted: true }; },
    async removeLegacy(url) { log.legacyRemoved.push(url); },
  };
  let clock = new Date('2026-10-10T00:00:00Z');
  const svc = createMediaService({ storage, models, log: silent, now: () => clock });
  return { svc, models, log, advance: (ms) => { clock = new Date(clock.getTime() + ms); }, A: models.MediaAsset };
}
const asset = (id, extra = {}) => ({ publicId: id, url: URL_OF(id), purpose: 'product', status: 'pending', uploadedBy: 'staff1', updatedAt: new Date('2026-10-10T00:00:00Z'), ...extra });

// ---------- upload ----------
test('upload registers the asset BEFORE storing it, then records url + metadata', async () => {
  const { svc, A } = setup();
  const r = await svc.uploadImage(jpeg, { staffId: 'staff1' });
  assert.equal(A.docs.length, 1);
  assert.equal(A.docs[0].status, 'pending'); assert.equal(A.docs[0].url, r.url); assert.equal(A.docs[0].width, 800); assert.equal(A.docs[0].uploadedBy, 'staff1');
  assert.equal(r.assetId, A.docs[0]._id); assert.equal(r.publicId, undefined);
});

test('invalid file is rejected before anything is registered or stored', async () => {
  const { svc, A, log } = setup();
  await assert.rejects(svc.uploadImage(Buffer.alloc(0)), (e) => e.code === 'NO_FILE');
  assert.equal(A.docs.length, 0); assert.equal(log.n, 0);
});

test('provider failure on upload: the caller gets the provider error and the registry row remains for the sweep', async () => {
  const { svc, A, log, advance } = setup();
  log.uploadErr = new ApiError(504, 'STORAGE_TIMEOUT', 'timeout');
  await assert.rejects(svc.uploadImage(jpeg, { staffId: 's' }), (e) => e.code === 'STORAGE_TIMEOUT');
  assert.equal(A.docs.length, 1); assert.equal(A.docs[0].lastError, 'STORAGE_TIMEOUT'); assert.equal(A.docs[0].url, undefined);
  // the asset may have landed despite the timeout, so the sweep tries to destroy it (idempotent) and drops the row
  assert.deepEqual(await svc.reconcile(), { checked: 0, deleted: 0, repaired: 0, failed: 0 }); // too fresh
  advance(UPLOAD_GRACE_MS + 1000); log.uploadErr = null;
  A.docs[0].updatedAt = new Date('2026-10-10T00:00:00Z');
  const s = await svc.reconcile();
  assert.equal(s.deleted, 1); assert.equal(A.docs.length, 0); assert.equal(log.destroyed.length, 1);
});

test('registry write failing after a successful upload removes the stored asset (no orphan) and reports 503', async () => {
  const { svc, A, log } = setup();
  const realUpdate = A.updateOne.bind(A); let first = true;
  A.updateOne = async (f, u) => { if (first && u.$set?.url) { first = false; throw new Error('db down'); } return realUpdate(f, u); };
  await assert.rejects(svc.uploadImage(jpeg, { staffId: 's' }), (e) => e.status === 503 && e.code === 'STORAGE_REGISTRY_UNAVAILABLE');
  assert.equal(log.destroyed.length, 1); assert.equal(A.docs.length, 0);
});

test('registry unavailable before upload: nothing is sent to storage', async () => {
  const { svc, A, log } = setup();
  A.failNext = new Error('db down');
  await assert.rejects(svc.uploadImage(jpeg, {}), (e) => e.status === 503);
  assert.equal(log.n, 1); assert.equal(log.destroyed.length, 0);
});

// ---------- attach ----------
test('resolveImages: publicId comes from the registry; a client-supplied publicId is ignored', async () => {
  const { svc } = setup({ assets: [asset('nessence/products/a1', { width: 10 })] });
  const [img] = await svc.resolveImages([{ url: URL_OF('nessence/products/a1'), alt: 'Front', color: 'Ink', publicId: 'nessence/products/VICTIM' }]);
  assert.equal(img.publicId, 'nessence/products/a1'); assert.equal(img.width, 10); assert.equal(img.color, 'Ink');
});

test('resolveImages rejects unknown, foreign and removed assets', async () => {
  const { svc } = setup({ assets: [asset('nessence/products/gone', { status: 'delete_pending' })] });
  await assert.rejects(svc.resolveImages([{ url: URL_OF('nessence/products/never-uploaded'), alt: 'abc' }]), (e) => e.code === 'INVALID_IMAGE');
  await assert.rejects(svc.resolveImages([{ url: 'https://evil.example/a.jpg', alt: 'abc' }]), (e) => e.code === 'INVALID_IMAGE');
  await assert.rejects(svc.resolveImages([{ url: URL_OF('nessence/products/gone'), alt: 'abc' }]), (e) => e.status === 409 && e.code === 'IMAGE_REMOVED');
});

test('legacy documents without publicId keep working: legacy URLs pass through, existing Cloudinary images need no registry row', async () => {
  const { svc } = setup();
  const existing = [{ url: URL_OF('nessence/products/kept'), publicId: 'nessence/products/kept', width: 5 }];
  const out = await svc.resolveImages([{ url: '/media/seed/coat.svg', alt: 'Front' }, { url: '/media/products/' + 'a'.repeat(36) + '.jpg', alt: 'Side' }, { url: existing[0].url, alt: 'Kept' }], { existing });
  assert.equal(out[0].publicId, undefined); assert.equal(out[1].publicId, undefined);
  assert.equal(out[2].publicId, 'nessence/products/kept'); assert.equal(out[2].width, 5);
});

test('markAttached promotes pending to active; failures are swallowed for the reconciler', async () => {
  const { svc, A } = setup({ assets: [asset('nessence/products/a1')] });
  await svc.markAttached([{ publicId: 'nessence/products/a1' }, {}]);
  assert.equal(A.docs[0].status, 'active');
  A.updateMany = async () => { throw new Error('x'); };
  await svc.markAttached([{ publicId: 'nessence/products/a1' }]); // must not throw
});

// ---------- release / deletion ----------
test('release deletes an unreferenced asset and its registry row', async () => {
  const id = 'nessence/products/a1';
  const { svc, A, log } = setup({ assets: [asset(id, { status: 'active' })] });
  assert.deepEqual(await svc.release([{ publicId: id, url: URL_OF(id) }]), ['deleted']);
  assert.deepEqual(log.destroyed, [id]); assert.equal(A.docs.length, 0);
});

test('release NEVER deletes an asset another record still references (product, article, order snapshot, return)', async () => {
  const id = 'nessence/products/shared';
  const cases = {
    product: { products: [{ images: [{ publicId: id }] }] },
    article: { articles: [{ coverImage: { publicId: id } }] },
    order: { orders: [{ items: [{ image: { publicId: id } }] }] },
    return: { returns: [{ items: [{ image: { publicId: id } }] }] },
  };
  for (const [name, refs] of Object.entries(cases)) {
    const { svc, A, log } = setup({ assets: [asset(id, { status: 'active' })], ...refs });
    assert.deepEqual(await svc.release([{ publicId: id }]), ['kept'], name);
    assert.equal(log.destroyed.length, 0, name); assert.equal(A.docs[0].status, 'active', name);
  }
});

test('failed remote delete leaves the asset delete_pending with an attempt count; the reconciler finishes it later', async () => {
  const id = 'nessence/products/a1';
  const { svc, A, log } = setup({ assets: [asset(id, { status: 'active' })] });
  log.destroyErr = new ApiError(502, 'STORAGE_UNAVAILABLE', 'down');
  assert.deepEqual(await svc.release([{ publicId: id }]), ['failed']); // never throws into the caller
  assert.equal(A.docs[0].status, 'delete_pending'); assert.equal(A.docs[0].deleteAttempts, 1); assert.equal(A.docs[0].lastError, 'STORAGE_UNAVAILABLE');
  assert.equal((await svc.reconcile()).failed, 1); assert.equal(A.docs[0].deleteAttempts, 2);
  log.destroyErr = null;
  assert.equal((await svc.reconcile()).deleted, 1); assert.equal(A.docs.length, 0); assert.deepEqual(log.destroyed, [id]);
});

test('an asset released from one record but referenced elsewhere is repaired to active, not deleted', async () => {
  const id = 'nessence/products/a1';
  const { svc, A, log } = setup({ assets: [asset(id, { status: 'delete_pending' })], products: [{ images: [{ publicId: id }] }] });
  assert.equal((await svc.reconcile()).repaired, 1);
  assert.equal(A.docs[0].status, 'active'); assert.equal(log.destroyed.length, 0);
});

test('legacy images: referenced local files are kept, unreferenced uploads removed, seed/external URLs never touched', async () => {
  const f = '/media/products/' + 'b'.repeat(36) + '.jpg';
  const kept = setup({ orders: [{ items: [{ image: { url: f } }] }] });
  assert.deepEqual(await kept.svc.release([{ url: f }]), ['kept']); assert.equal(kept.log.legacyRemoved.length, 0);
  const free = setup();
  assert.deepEqual(await free.svc.release([{ url: f }, { url: '/media/seed/coat.svg' }, { url: 'https://evil.example/x.jpg' }]), ['deleted', 'skipped', 'skipped']);
  assert.deepEqual(free.log.legacyRemoved, [f]);
});

test('removedBetween identifies only images that actually left the record', () => {
  const { svc } = setup();
  const before = [{ url: 'u1', publicId: 'p1' }, { url: 'u2' }, { url: 'u3', publicId: 'p3' }];
  assert.deepEqual(svc.removedBetween(before, [{ url: 'u1', publicId: 'p1' }, { url: 'u3', publicId: 'p3' }]).map((i) => i.url), ['u2']);
  assert.deepEqual(svc.removedBetween(before, before), []);
});

// ---------- explicit discard + authorization ----------
test('discardUpload: only the uploader, only unattached images', async () => {
  const id = 'nessence/products/a1';
  const mk = (extra) => setup({ assets: [asset(id, extra)] });
  const ok = mk(); await ok.svc.discardUpload(ok.A.docs[0]._id, 'staff1');
  assert.deepEqual(ok.log.destroyed, [id]); assert.equal(ok.A.docs.length, 0);
  const other = mk(); await assert.rejects(other.svc.discardUpload(other.A.docs[0]._id, 'staff2'), (e) => e.status === 403);
  const active = mk({ status: 'active' }); await assert.rejects(active.svc.discardUpload(active.A.docs[0]._id, 'staff1'), (e) => e.status === 409);
  const used = setup({ assets: [asset(id)], products: [{ images: [{ publicId: id }] }] });
  await assert.rejects(used.svc.discardUpload(used.A.docs[0]._id, 'staff1'), (e) => e.status === 409);
  await assert.rejects(ok.svc.discardUpload('missing', 'staff1'), (e) => e.status === 404);
  assert.equal(other.log.destroyed.length + active.log.destroyed.length + used.log.destroyed.length, 0);
});

// ---------- reconcile ----------
test('reconcile leaves recent and active assets alone, removes stale unattached uploads', async () => {
  const old = new Date('2026-10-10T00:00:00Z');
  const { svc, A, log, advance } = setup({ assets: [asset('nessence/products/fresh'), asset('nessence/products/active', { status: 'active' }), asset('nessence/products/stale', { updatedAt: old })] });
  A.docs[0].updatedAt = new Date(old.getTime() + PENDING_GRACE_MS); // just uploaded
  advance(PENDING_GRACE_MS + 1000);
  const s = await svc.reconcile();
  assert.equal(s.deleted, 1); assert.deepEqual(log.destroyed, ['nessence/products/stale']);
  assert.deepEqual(A.docs.map((d) => d.publicId).sort(), ['nessence/products/active', 'nessence/products/fresh']);
});

// ---------- legacy migration ----------
test('migrateLegacy: dry run only counts; apply uploads, rewrites the document and keeps the local file', async () => {
  const f = '/media/products/' + 'c'.repeat(36) + '.jpg';
  const mkDoc = () => ({ images: [{ url: f, alt: 'a' }, { url: '/media/seed/x.svg', alt: 'b' }], saved: 0, async save() { this.saved++; } });
  const { svc, A, log } = setup({});
  const p = mkDoc();
  const prodSvc = createMediaService({ storage: { supportsRegistry: true, validate() {}, newPublicId: () => 'nessence/products/m1', save: async (_b, { publicId }) => ({ publicId, url: URL_OF(publicId), bytes: 1, width: 2, height: 3, format: 'jpg' }), destroy: async () => ({}), removeLegacy: async () => {} },
    models: { MediaAsset: A, Product: { find: async () => [p] }, Article: { find: async () => [] }, Order: fakeModel(), ReturnRequest: fakeModel() }, log: silent });
  const dry = await prodSvc.migrateLegacy({ apply: false, readFile: async () => jpeg });
  assert.deepEqual(dry, { candidates: 1, migrated: 0, failed: 0, dryRun: true }); assert.equal(p.saved, 0); assert.equal(A.docs.length, 0);
  const done = await prodSvc.migrateLegacy({ apply: true, readFile: async () => jpeg });
  assert.equal(done.migrated, 1); assert.equal(p.saved, 1);
  assert.equal(p.images[0].publicId, 'nessence/products/m1'); assert.equal(p.images[0].url, URL_OF('nessence/products/m1')); assert.equal(p.images[1].url, '/media/seed/x.svg');
  assert.equal(A.docs[0].status, 'active'); assert.equal(log.legacyRemoved.length, 0);
});
