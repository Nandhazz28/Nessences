import test from "node:test";
import assert from "node:assert/strict";
process.env.MONGODB_URI ??= "mongodb://127.0.0.1:1/x";
process.env.JWT_ACCESS_SECRET ??= "a".repeat(40);
process.env.JWT_REFRESH_SECRET ??= "b".repeat(40);
process.env.CLIENT_URL = "https://shop.nessence.test/";
const {
  renderRobots,
  renderSitemap,
  buildSitemapEntries,
  getSitemapXml,
  clearSitemapCache,
  STATIC_PATHS,
  PRIVATE_PATHS,
  MAX_URLS,
} = await import("../src/services/seoService.js");
const { createApp } = await import("../src/app.js");

const q = (rows) => ({
  select() {
    return this;
  },
  sort() {
    return this;
  },
  limit() {
    return this;
  },
  lean: async () => rows,
});
const t = new Date("2026-09-01T10:00:00Z");
const models = {
  Product: {
    find: (f) => {
      models.calls.push(["Product", f]);
      return q([
        { slug: "wool-coat", updatedAt: t },
        { slug: 'a&b "shirt"', updatedAt: t },
      ]);
    },
  },
  Collection: {
    find: (f) => {
      models.calls.push(["Collection", f]);
      return q([{ slug: "autumn-edit", updatedAt: t }]);
    },
  },
  Article: {
    find: (f) => {
      models.calls.push(["Article", f]);
      return q([{ slug: "on-wool", updatedAt: t }]);
    },
  },
  SiteContent: {
    find: (f) => {
      models.calls.push(["SiteContent", f]);
      return q([
        { key: "about", updatedAt: t },
        { key: "privacy", updatedAt: t },
      ]);
    },
  },
  calls: [],
};

test("robots.txt: production allows the storefront, blocks private areas, and points to an absolute sitemap", () => {
  const r = renderRobots({
    clientUrl: "https://shop.nessence.test/",
    indexable: true,
  });
  assert.match(r, /^User-agent: \*\nAllow: \//);
  for (const p of [
    "/admin",
    "/account",
    "/cart",
    "/checkout",
    "/login",
    "/search",
    "/api",
  ])
    assert.ok(r.includes(`Disallow: ${p}\n`), p);
  assert.ok(
    r.includes("Sitemap: https://shop.nessence.test/sitemap.xml\n"),
    "no double slash, absolute URL",
  );
});
test("robots.txt: anything that is not production blocks all crawling", () => {
  assert.equal(
    renderRobots({ clientUrl: "https://staging.test", indexable: false }),
    "User-agent: *\nDisallow: /\n",
  );
});
test("every private path is absent from the sitemap list", () => {
  for (const p of PRIVATE_PATHS)
    assert.ok(!STATIC_PATHS.some((s) => s === p || s.startsWith(p + "/")), p);
});
test("sitemap lists only published records, with escaped URLs and ISO lastmod", async () => {
  models.calls.length = 0;
  const entries = await buildSitemapEntries(
    models,
    new Date("2026-10-01T00:00:00Z"),
  );
  const xml = renderSitemap(entries, "https://shop.nessence.test/");
  assert.match(
    xml,
    /^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/,
  );
  for (const loc of [
    "/",
    "/men",
    "/women",
    "/collections",
    "/journal",
    "/about",
    "/privacy",
    "/collections/autumn-edit",
    "/journal/on-wool",
    "/products/wool-coat",
  ])
    assert.ok(xml.includes(`<loc>https://shop.nessence.test${loc}</loc>`), loc);
  assert.ok(
    xml.includes("/products/a%26b%20%22shirt%22"),
    "path segment is URI-encoded",
  );
  assert.ok(!xml.includes("a&b"), "no raw ampersand");
  assert.ok(xml.includes("<lastmod>2026-09-01T10:00:00.000Z</lastmod>"));
  assert.ok(
    !xml.includes("/cart") &&
      !xml.includes("/admin") &&
      !xml.includes("/checkout"),
  );
  const f = Object.fromEntries(models.calls);
  assert.equal(f.Product.status, "published");
  assert.equal(f.Collection.active, true);
  assert.equal(f.Article.status, "published");
  assert.ok(
    f.Article.publishedAt.$lte instanceof Date,
    "scheduled articles stay out",
  );
  assert.ok(
    Array.isArray(f.SiteContent.key.$in) &&
      !f.SiteContent.key.$in.includes("settings"),
  );
});
test("the sitemap never exceeds the protocol limit", () => {
  const many = Array.from({ length: MAX_URLS + 10 }, (_, i) => ({
    path: `/products/p${i}`,
  }));
  assert.equal(
    renderSitemap(many, "https://x.test").match(/<url>/g).length,
    MAX_URLS,
  );
});
test("the sitemap is cached so crawlers cannot hammer the database", async () => {
  clearSitemapCache();
  models.calls.length = 0;
  await getSitemapXml("https://x.test", { models, now: 1000 });
  await getSitemapXml("https://x.test", { models, now: 2000 });
  assert.equal(models.calls.filter(([n]) => n === "Product").length, 1);
  await getSitemapXml("https://x.test", { models, now: 1000 + 3600_001 });
  assert.equal(models.calls.filter(([n]) => n === "Product").length, 2);
  clearSitemapCache();
});
test("HTTP: /robots.txt is served as text and /sitemap.xml is honestly 503 while the database is down", async () => {
  const server = createApp().listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const r = await fetch(`${base}/robots.txt`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type"), /text\/plain/);
    assert.equal(await r.text(), "User-agent: *\nDisallow: /\n"); // test env is not production
    const s = await fetch(`${base}/sitemap.xml`);
    assert.equal(s.status, 503);
    assert.equal(s.headers.get("retry-after"), "300");
    assert.ok(!(await s.text()).includes("<urlset"));
  } finally {
    server.close();
  }
});

test("a trailing slash in CLIENT_URL is normalised so CORS still matches the browser Origin", async () => {
  const { env } = await import("../src/config/env.js");
  assert.equal(env.CLIENT_URL, "https://shop.nessence.test");
  const server = createApp().listen(0);
  try {
    const r = await fetch(
      `http://127.0.0.1:${server.address().port}/api/health`,
      { headers: { origin: "https://shop.nessence.test" } },
    );
    assert.equal(
      r.headers.get("access-control-allow-origin"),
      "https://shop.nessence.test",
    );
  } finally {
    server.close();
  }
});
