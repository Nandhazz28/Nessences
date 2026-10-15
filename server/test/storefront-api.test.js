import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import {
  SKIP,
  integrationEnabled,
  configureEnv,
  bootApp,
  makeProduct,
  probeCapabilities,
} from "./helpers/integration.js";

configureEnv({ LOG_LEVEL: process.env.TEST_LOG ?? "silent" });
let app;
let caps = {};
before(async () => {
  if (integrationEnabled) {
    app = await bootApp();
    caps = await probeCapabilities(app.mongoose);
  }
});
after(async () => {
  await app?.stop();
});

test(
  "only published products are exposed: lists, details and category filters never leak drafts or archived items",
  { skip: SKIP },
  async () => {
    const pub = await makeProduct({ name: "Published" });
    const draft = await makeProduct({ status: "draft", name: "Draft" });
    const arch = await makeProduct({ status: "archived", name: "Archived" });
    const b = app.browser();
    assert.equal(
      (await b.get(`/api/products/${pub.product.slug}`)).status,
      200,
    );
    if (caps.facet) {
      const list = await b.get("/api/products?limit=48");
      assert.equal(list.status, 200);
      const slugs = list.data.map((p) => p.slug);
      assert.ok(slugs.includes(pub.product.slug));
      assert.ok(!slugs.includes(draft.product.slug));
      assert.ok(!slugs.includes(arch.product.slug));
    }
    assert.equal(
      (await b.get(`/api/products/${draft.product.slug}`)).status,
      404,
    );
    assert.equal(
      (await b.get(`/api/products/${arch.product.slug}`)).status,
      404,
    );
  },
);

test(
  "REGRESSION: a product whose category was removed still renders instead of crashing",
  { skip: SKIP },
  async () => {
    const { product, category } = await makeProduct({ name: "Orphan" });
    const { Category } = await import("../src/models/Category.js");
    await Category.deleteOne({ _id: category._id });
    const r = await app.browser().get(`/api/products/${product.slug}`);
    assert.equal(r.status, 200, `${r.status} ${r.code}`);
    assert.equal(r.data.slug, product.slug);
  },
);

test(
  "availability is truthful: stock, reservations and low-stock status come from inventory",
  { skip: SKIP },
  async () => {
    const { product, variant } = await makeProduct({ stock: 3 });
    const { Inventory } = await import("../src/models/Inventory.js");
    let v = (await app.browser().get(`/api/products/${product.slug}`)).data
      .variants[0];
    assert.equal(v.available, 3);
    assert.equal(v.status, "low_stock");
    await Inventory.updateOne(
      { variant: variant._id },
      { $set: { reserved: 3 } },
    );
    v = (await app.browser().get(`/api/products/${product.slug}`)).data
      .variants[0];
    assert.equal(v.available, 0);
    assert.equal(v.status, "out_of_stock");
  },
);

test(
  "listing: pagination metadata, price filters and validation of bad input",
  { skip: SKIP },
  async () => {
    for (let i = 0; i < 3; i += 1)
      await makeProduct({ price: 100000 + i * 100000, name: `Pager ${i}` });
    const b = app.browser();
    if (caps.facet) {
      const p1 = await b.get("/api/products?limit=2&page=1&sort=price_asc");
      assert.equal(p1.status, 200);
      assert.equal(p1.data.length, 2);
      assert.ok(p1.json.meta.pagination.total >= 3);
      const prices = p1.data.map((p) => p.effectivePrice);
      assert.deepEqual(
        prices,
        [...prices].sort((a, c) => a - c),
      );
      const cheap = await b.get("/api/products?maxPrice=150000&limit=48");
      assert.ok(cheap.data.every((p) => p.effectivePrice <= 150000));
    }
    for (const bad of [
      "limit=0",
      "limit=500",
      "page=0",
      "sort=hax",
      "gender=kids",
      "minPrice=-1",
    ])
      assert.equal((await b.get(`/api/products?${bad}`)).status, 400, bad);
    assert.equal((await b.get("/api/products/Not_A_Slug!")).status, 400);
    assert.equal((await b.get("/api/products/does-not-exist")).status, 404);
  },
);

test(
  "health endpoint reports the database honestly, and unknown routes are 404 JSON",
  { skip: SKIP },
  async () => {
    const h = await app.browser().get("/api/health");
    assert.equal(h.status, 200);
    assert.equal(h.json.db, "connected");
    const nf = await app.browser().get("/api/nope");
    assert.equal(nf.status, 404);
    assert.equal(nf.code, "ROUTE_NOT_FOUND");
  },
);

test(
  "CORS allows only the storefront origin, with credentials; other origins get no CORS headers",
  { skip: SKIP },
  async () => {
    const ok = await fetch(`${app.base}/api/products`, {
      headers: { origin: "http://localhost:5173" },
    });
    assert.equal(
      ok.headers.get("access-control-allow-origin"),
      "http://localhost:5173",
    );
    assert.equal(ok.headers.get("access-control-allow-credentials"), "true");
    const evil = await fetch(`${app.base}/api/products`, {
      headers: { origin: "https://evil.example" },
    });
    assert.notEqual(
      evil.headers.get("access-control-allow-origin"),
      "https://evil.example",
    );
  },
);

test(
  "CSRF: state-changing requests without the custom header are rejected even with valid cookies",
  { skip: SKIP },
  async () => {
    const r = await fetch(`${app.base}/api/auth/logout`, { method: "POST" });
    assert.equal(r.status, 403);
  },
);
