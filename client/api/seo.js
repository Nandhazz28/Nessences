export const PRIVATE_PATHS = [
  "/admin",
  "/account",
  "/cart",
  "/checkout",
  "/login",
  "/register",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
  "/search",
  "/track-order",
  "/newsletter",
  "/api",
];
const TIMEOUT_MS = 8000;
const CACHE = "public, s-maxage=3600, stale-while-revalidate=86400";

export const robotsFallback = (site) =>
  [
    "User-agent: *",
    "Allow: /",
    ...PRIVATE_PATHS.map((p) => `Disallow: ${p}`),
    "",
    ...(site ? [`Sitemap: ${site}/sitemap.xml`] : []),
    "",
  ].join("\n");
export const robotsDisallowAll = () => "User-agent: *\nDisallow: /\n";

const apiOrigin = (env) => {
  const raw = (env.SEO_API_ORIGIN || env.VITE_API_URL || "").trim();
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.hostname === "localhost"
      ? u.origin
      : null;
  } catch {
    return null;
  }
};

export async function buildResponse({
  file,
  env = process.env,
  fetchImpl = fetch,
  log = console,
} = {}) {
  const site = (env.VITE_SITE_URL || "").trim().replace(/\/+$/, "");
  const text = (body, extra = {}) => ({
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": CACHE,
      ...extra,
    },
    body,
  });

  if (file !== "robots" && file !== "sitemap")
    return {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      body: "Not found",
    };

  if (env.VERCEL_ENV && env.VERCEL_ENV !== "production") {
    return file === "robots"
      ? text(robotsDisallowAll(), { "X-Robots-Tag": "noindex" })
      : {
          status: 404,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "X-Robots-Tag": "noindex",
          },
          body: "No sitemap for non-production deployments",
        };
  }

  const origin = apiOrigin(env);
  const path = file === "robots" ? "/robots.txt" : "/sitemap.xml";
  let upstream = null;
  if (origin) {
    try {
      const r = await fetchImpl(`${origin}${path}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          Accept: file === "robots" ? "text/plain" : "application/xml",
        },
      });
      if (r.ok) upstream = await r.text();
      else log.error(`[seo] API answered ${r.status} for ${path}`);
    } catch (err) {
      log.error(`[seo] could not fetch ${path} from the API: ${err?.name}`);
    }
  } else
    log.error(
      "[seo] no usable API origin (set VITE_API_URL or SEO_API_ORIGIN)",
    );

  if (file === "robots") return text(upstream ?? robotsFallback(site));
  if (!upstream)
    return {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Retry-After": "300",
        "Cache-Control": "no-store",
      },
      body: "Sitemap temporarily unavailable",
    };
  if (site && !upstream.includes(`<loc>${site}/`))
    log.error(
      `[seo] the sitemap does not use ${site}: set the API's CLIENT_URL to the storefront's canonical address`,
    );
  return {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": CACHE,
    },
    body: upstream,
  };
}

export default async function handler(req, res) {
  const out = await buildResponse({
    file: new URL(req.url, "http://x").searchParams.get("file"),
  });
  for (const [k, v] of Object.entries(out.headers)) res.setHeader(k, v);
  res.status(out.status).send(out.body);
}
