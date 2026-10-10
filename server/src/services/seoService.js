import { Product } from '../models/Product.js';
import { Collection } from '../models/Collection.js';
import { Article } from '../models/Article.js';
import { SiteContent, CONTENT_KEYS } from '../models/SiteContent.js';

// Public, indexable storefront routes that are not database records. (Cart, checkout, account, auth, search and
// track-order are deliberately absent: they are private or thin and carry noindex.)
export const STATIC_PATHS = ['/', '/men', '/women', '/new-arrivals', '/collections', '/sale', '/journal', '/contact'];
// Everything robots.txt asks crawlers to stay out of. Keep in step with the storefront's noindex pages.
export const PRIVATE_PATHS = ['/admin', '/account', '/cart', '/checkout', '/login', '/register', '/verify-email', '/forgot-password', '/reset-password', '/search', '/track-order', '/newsletter', '/api'];
export const MAX_URLS = 50000; // sitemap protocol limit per file

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const trimBase = (u) => u.replace(/\/+$/, '');

export function renderRobots({ clientUrl, indexable }) {
  const base = trimBase(clientUrl);
  // Anything that is not production (staging, previews, local) must never be indexed.
  if (!indexable) return 'User-agent: *\nDisallow: /\n';
  return ['User-agent: *', 'Allow: /', ...PRIVATE_PATHS.map((p) => `Disallow: ${p}`), '', `Sitemap: ${base}/sitemap.xml`, ''].join('\n');
}

export function renderSitemap(entries, base) {
  const b = trimBase(base);
  const urls = entries.slice(0, MAX_URLS).map((e) => `  <url><loc>${esc(b + e.path)}</loc>${e.lastmod ? `<lastmod>${new Date(e.lastmod).toISOString()}</lastmod>` : ''}</url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

const enc = encodeURIComponent;
export async function buildSitemapEntries(models = { Product, Collection, Article, SiteContent }, now = new Date()) {
  const [products, collections, articles, pages] = await Promise.all([
    models.Product.find({ status: 'published' }).select('slug updatedAt').sort({ updatedAt: -1 }).limit(MAX_URLS).lean(),
    models.Collection.find({ active: true }).select('slug updatedAt').lean(),
    models.Article.find({ status: 'published', publishedAt: { $lte: now } }).select('slug updatedAt').sort({ publishedAt: -1 }).limit(5000).lean(),
    models.SiteContent.find({ key: { $in: CONTENT_KEYS } }).select('key updatedAt').lean(),
  ]);
  return [
    ...STATIC_PATHS.map((path) => ({ path })),
    ...pages.map((p) => ({ path: `/${enc(p.key)}`, lastmod: p.updatedAt })),
    ...collections.map((c) => ({ path: `/collections/${enc(c.slug)}`, lastmod: c.updatedAt })),
    ...articles.map((a) => ({ path: `/journal/${enc(a.slug)}`, lastmod: a.updatedAt })),
    ...products.map((p) => ({ path: `/products/${enc(p.slug)}`, lastmod: p.updatedAt })),
  ];
}

let cache = { at: 0, xml: null };
export const clearSitemapCache = () => { cache = { at: 0, xml: null }; };
export async function getSitemapXml(base, { ttlMs = 3600_000, models, now = Date.now() } = {}) {
  if (cache.xml && now - cache.at < ttlMs) return cache.xml;
  const xml = renderSitemap(await buildSitemapEntries(models), base);
  cache = { at: now, xml }; return xml;
}
