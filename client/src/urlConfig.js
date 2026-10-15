const isLocal = (h) =>
  /^(localhost|127\.0\.0\.1|\[?::1\]?)$/i.test(h) || h.endsWith(".localhost");

const parse = (name, raw) => {
  try {
    return new URL(raw);
  } catch {
    throw new Error(
      `${name} must be a full URL such as https://www.example.com (got "${raw}")`,
    );
  }
};

export function resolveApiBase(raw, { production = false } = {}) {
  const v = (raw ?? "").trim();
  if (!v) {
    if (production)
      throw new Error(
        "VITE_API_URL is required for a production build. Set it to your API's https URL (e.g. https://api.example.com), or to \"same-origin\" if /api is proxied from the site's own domain.",
      );
    return "";
  }
  if (v === "same-origin") return "";
  const u = parse("VITE_API_URL", v);
  if (u.pathname !== "/" || u.search || u.hash)
    throw new Error(
      `VITE_API_URL must be an origin only, without a path (got "${v}"); the app adds /api itself`,
    );
  if (production && u.protocol !== "https:")
    throw new Error(
      `VITE_API_URL must use https in a production build (got "${v}")`,
    );
  if (production && isLocal(u.hostname))
    throw new Error(
      `VITE_API_URL points at ${u.hostname}, which cannot work for visitors; use the public API URL`,
    );
  return u.origin;
}

export function resolveSiteUrl(raw, { production = false } = {}) {
  const v = (raw ?? "").trim();
  if (!v) {
    if (production)
      throw new Error(
        "VITE_SITE_URL is required for a production build: it is the canonical address used in canonical links, social previews and structured data (e.g. https://www.example.com).",
      );
    return "";
  }
  const u = parse("VITE_SITE_URL", v);
  if (u.pathname !== "/" || u.search || u.hash)
    throw new Error(
      `VITE_SITE_URL must be an origin only, without a path (got "${v}")`,
    );
  if (production && u.protocol !== "https:")
    throw new Error(
      `VITE_SITE_URL must use https in a production build (got "${v}")`,
    );
  if (production && isLocal(u.hostname))
    throw new Error(
      `VITE_SITE_URL points at ${u.hostname}, which is not a public address`,
    );
  return u.origin;
}
