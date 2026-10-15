import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { resolveApiBase, resolveSiteUrl } from "../src/urlConfig.js";
import {
  buildResponse,
  robotsFallback,
  robotsDisallowAll,
  PRIVATE_PATHS,
} from "../api/seo.js";

const root = path.resolve(__dirname, "..");
const vercel = JSON.parse(
  fs.readFileSync(path.join(root, "vercel.json"), "utf8"),
);
const spa = vercel.rewrites.find((r) => r.destination === "/index.html");
const spaRe = new RegExp(`^/${spa.source.slice(2, -1)}$`);
const rule = (src) => vercel.headers.find((h) => h.source === src);

describe("production URL configuration (fails the build instead of shipping a broken site)", () => {
  it('API url: required, https, origin-only, not localhost; "same-origin" and dev-empty mean relative', () => {
    expect(() => resolveApiBase(undefined, { production: true })).toThrow(
      /VITE_API_URL is required/,
    );
    expect(() => resolveApiBase("", { production: true })).toThrow(/required/);
    expect(() =>
      resolveApiBase("http://api.example.com", { production: true }),
    ).toThrow(/https/);
    expect(() =>
      resolveApiBase("https://localhost:4000", { production: true }),
    ).toThrow(/cannot work for visitors/);
    expect(() =>
      resolveApiBase("https://api.example.com/api", { production: true }),
    ).toThrow(/without a path/);
    expect(() =>
      resolveApiBase("api.example.com", { production: true }),
    ).toThrow(/full URL/);
    expect(
      resolveApiBase("https://api.example.com/", { production: true }),
    ).toBe("https://api.example.com");
    expect(resolveApiBase("same-origin", { production: true })).toBe("");
    expect(resolveApiBase(undefined)).toBe("");
    expect(resolveApiBase("http://localhost:4000")).toBe(
      "http://localhost:4000",
    );
  });
  it("site url: required in production, https, origin-only", () => {
    expect(() => resolveSiteUrl(undefined, { production: true })).toThrow(
      /VITE_SITE_URL is required/,
    );
    expect(() =>
      resolveSiteUrl("http://www.example.com", { production: true }),
    ).toThrow(/https/);
    expect(() =>
      resolveSiteUrl("https://www.example.com/shop", { production: true }),
    ).toThrow(/without a path/);
    expect(() =>
      resolveSiteUrl("https://localhost", { production: true }),
    ).toThrow(/not a public address/);
    expect(
      resolveSiteUrl("https://www.example.com/", { production: true }),
    ).toBe("https://www.example.com");
  });
});

describe("vercel.json", () => {
  it("builds the Vite app from the client directory into dist", () => {
    expect(vercel.framework).toBe("vite");
    expect(vercel.buildCommand).toBe("npm run build");
    expect(vercel.outputDirectory).toBe("dist");
    expect(vercel.installCommand).toBe("npm ci");
  });
  it("rewrites every real storefront route (and deep links) to the SPA", () => {
    for (const p of [
      "/",
      "/men",
      "/women",
      "/new-arrivals",
      "/sale",
      "/search",
      "/products/linen-shirt",
      "/collections",
      "/collections/summer",
      "/journal/some-post",
      "/cart",
      "/checkout",
      "/checkout/success",
      "/account",
      "/account/orders/abc123",
      "/wishlist",
      "/admin",
      "/admin/products/12",
      "/login",
      "/reset-password",
      "/about",
    ])
      expect(spaRe.test(p), p).toBe(true);
  });
  it("never swallows API calls, build assets, or real files (a missing asset must 404, not return HTML)", () => {
    for (const p of [
      "/api/products",
      "/api/auth/me",
      "/assets/index-abc.js",
      "/assets/missing.css",
      "/favicon.ico",
      "/robots.txt",
      "/sitemap.xml",
      "/logo.png",
    ])
      expect(spaRe.test(p), p).toBe(false);
  });
  it("serves robots.txt and sitemap.xml through the SEO function, and has no backend rewrite", () => {
    expect(vercel.rewrites).toContainEqual({
      source: "/robots.txt",
      destination: "/api/seo?file=robots",
    });
    expect(vercel.rewrites).toContainEqual({
      source: "/sitemap.xml",
      destination: "/api/seo?file=sitemap",
    });
    expect(JSON.stringify({ ...vercel, $schema: undefined })).not.toMatch(
      /onrender\.com|localhost|https?:\/\//,
    ); // no hard-coded hosts anywhere
    expect(
      vercel.rewrites.findIndex((r) => r.source === "/robots.txt"),
    ).toBeLessThan(
      vercel.rewrites.findIndex((r) => r.destination === "/index.html"),
    );
  });
  it("hashed assets are immutable for a year; HTML always revalidates; nothing else is immutable", () => {
    expect(rule("/assets/(.*)").headers).toContainEqual({
      key: "Cache-Control",
      value: "public, max-age=31536000, immutable",
    });
    const html = rule("/((?!assets/|api/).*)");
    const cc = html.headers.find((h) => h.key === "Cache-Control").value;
    expect(cc).toMatch(/max-age=0/);
    expect(cc).toMatch(/must-revalidate/);
    expect(cc).not.toMatch(/immutable|s-maxage/);
    expect(
      new RegExp(`^/${html.source.slice(2, -1)}$`).test("/assets/x.js"),
    ).toBe(false);
    expect(JSON.stringify(vercel).match(/immutable/g)).toHaveLength(1);
  });
  it("sets safe, non-breaking security headers on pages", () => {
    const keys = Object.fromEntries(
      rule("/((?!assets/|api/).*)").headers.map((h) => [h.key, h.value]),
    );
    expect(keys["X-Content-Type-Options"]).toBe("nosniff");
    expect(keys["X-Frame-Options"]).toBe("DENY");
    expect(keys["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(keys["Content-Security-Policy"]).toBeUndefined(); // deliberately not enforced blind: see docs/PRODUCTION_DEPLOYMENT.md
  });
  it("the build output is valid for static hosting: a hashed vendor chunk exists and entry html references assets with absolute paths", () => {
    const html = fs.existsSync(path.join(root, "dist/index.html"))
      ? fs.readFileSync(path.join(root, "dist/index.html"), "utf8")
      : null;
    if (html) {
      expect(html).toMatch(/src="\/assets\/index-[\w-]+\.js"/);
      expect(html).not.toMatch(/localhost|127\.0\.0\.1/);
    }
  });
});

describe("robots.txt / sitemap.xml function", () => {
  const prod = {
    VERCEL_ENV: "production",
    VITE_API_URL: "https://api.example.com",
    VITE_SITE_URL: "https://www.example.com",
  };
  const ok = (body) => vi.fn(async () => new Response(body, { status: 200 }));
  const quiet = { error: vi.fn() };

  it("production: relays the API's generated files, cacheable at the CDN, with the right content types", async () => {
    const f = ok(
      "<urlset><url><loc>https://www.example.com/products/a</loc></url></urlset>",
    );
    const s = await buildResponse({
      file: "sitemap",
      env: prod,
      fetchImpl: f,
      log: quiet,
    });
    expect(f).toHaveBeenCalledWith(
      "https://api.example.com/sitemap.xml",
      expect.anything(),
    );
    expect(s.status).toBe(200);
    expect(s.headers["Content-Type"]).toMatch(/application\/xml/);
    expect(s.headers["Cache-Control"]).toMatch(
      /s-maxage=3600.*stale-while-revalidate/,
    );
    const r = await buildResponse({
      file: "robots",
      env: prod,
      fetchImpl: ok("User-agent: *\nAllow: /\n"),
      log: quiet,
    });
    expect(r.body).toBe("User-agent: *\nAllow: /\n");
    expect(r.headers["Content-Type"]).toMatch(/text\/plain/);
  });
  it("preview and development deployments are never indexable", async () => {
    for (const VERCEL_ENV of ["preview", "development"]) {
      const f = vi.fn();
      const r = await buildResponse({
        file: "robots",
        env: { ...prod, VERCEL_ENV },
        fetchImpl: f,
        log: quiet,
      });
      expect(r.body).toBe(robotsDisallowAll());
      expect(r.headers["X-Robots-Tag"]).toBe("noindex");
      expect(
        (
          await buildResponse({
            file: "sitemap",
            env: { ...prod, VERCEL_ENV },
            fetchImpl: f,
            log: quiet,
          })
        ).status,
      ).toBe(404);
      expect(f).not.toHaveBeenCalled();
    }
  });
  it('API asleep or down: robots falls back to a correct file, the sitemap says "try later" and is never cached as empty', async () => {
    const down = vi.fn(async () => {
      throw Object.assign(new Error("x"), { name: "TimeoutError" });
    });
    const r = await buildResponse({
      file: "robots",
      env: prod,
      fetchImpl: down,
      log: quiet,
    });
    expect(r.status).toBe(200);
    expect(r.body).toBe(robotsFallback("https://www.example.com"));
    expect(r.body).toMatch(
      /Sitemap: https:\/\/www\.example\.com\/sitemap\.xml/,
    );
    const s = await buildResponse({
      file: "sitemap",
      env: prod,
      fetchImpl: down,
      log: quiet,
    });
    expect(s.status).toBe(503);
    expect(s.headers["Retry-After"]).toBeTruthy();
    expect(s.headers["Cache-Control"]).toBe("no-store");
    const bad = await buildResponse({
      file: "sitemap",
      env: prod,
      fetchImpl: vi.fn(async () => new Response("x", { status: 500 })),
      log: quiet,
    });
    expect(bad.status).toBe(503);
  });
  it("missing API configuration is reported in logs and degrades safely", async () => {
    const log = { error: vi.fn() };
    const r = await buildResponse({
      file: "robots",
      env: {
        VERCEL_ENV: "production",
        VITE_SITE_URL: "https://www.example.com",
      },
      fetchImpl: vi.fn(),
      log,
    });
    expect(r.status).toBe(200);
    expect(log.error).toHaveBeenCalledWith(
      expect.stringMatching(/no usable API origin/),
    );
  });
  it("warns loudly when the API builds the sitemap for a different domain than the storefront", async () => {
    const log = { error: vi.fn() };
    await buildResponse({
      file: "sitemap",
      env: prod,
      fetchImpl: ok("<loc>https://other.vercel.app/</loc>"),
      log,
    });
    expect(log.error).toHaveBeenCalledWith(expect.stringMatching(/CLIENT_URL/));
  });
  it("SEO_API_ORIGIN overrides VITE_API_URL (needed in same-origin proxy mode); http is refused except localhost", async () => {
    const f = ok("<x/>");
    await buildResponse({
      file: "sitemap",
      env: {
        ...prod,
        VITE_API_URL: "same-origin",
        SEO_API_ORIGIN: "https://svc.onrender.com",
      },
      fetchImpl: f,
      log: quiet,
    });
    expect(f).toHaveBeenCalledWith(
      "https://svc.onrender.com/sitemap.xml",
      expect.anything(),
    );
    const g = vi.fn();
    await buildResponse({
      file: "sitemap",
      env: { ...prod, VITE_API_URL: "http://api.example.com" },
      fetchImpl: g,
      log: quiet,
    });
    expect(g).not.toHaveBeenCalled();
  });
  it("unknown file requests are 404 (the function is not an open proxy)", async () => {
    const f = vi.fn();
    expect(
      (
        await buildResponse({
          file: "../../admin",
          env: prod,
          fetchImpl: f,
          log: quiet,
        })
      ).status,
    ).toBe(404);
    expect(f).not.toHaveBeenCalled();
  });
  it("the fallback robots.txt blocks every private route and points at the real sitemap", () => {
    const t = robotsFallback("https://www.example.com");
    for (const p of ["/admin", "/account", "/cart", "/checkout"])
      expect(t).toContain(`Disallow: ${p}`);
    expect(t).not.toMatch(/localhost|vercel\.app|onrender/);
    expect(PRIVATE_PATHS).toContain("/admin");
  });
});
