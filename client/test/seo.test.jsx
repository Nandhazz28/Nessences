import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App.jsx';
import { AuthProvider } from '../src/context/AuthContext.jsx';
import { CartProvider } from '../src/context/CartContext.jsx';
import { SettingsProvider } from '../src/context/SettingsContext.jsx';

const ok = (data, status = 200, meta) => ({ status, body: { success: true, data, ...(meta ? { meta } : {}) } });
const fail = (status, code, message) => ({ status, body: { success: false, code, message } });
const emptyCart = { items: [], saved: [], coupon: null, couponError: null, canCheckout: false, totals: { subtotal: 0, discount: 0, shipping: 0, tax: 0, total: 0, itemCount: 0 } };
const product = { id: 'p1', slug: 'wool-coat', name: 'Wool Coat', gender: 'women', category: { name: 'Coats', slug: 'coats' }, price: 1200000, salePrice: 999900, colors: [{ name: 'Ink', hex: '#181510' }], sizes: ['M'], inStock: true, ratingAvg: 0, ratingCount: 0, description: 'A weighted wool coat cut long, lined in cupro.\n\nMade in small runs.', seo: {}, materials: '', care: [], details: [], related: [], collections: [],
  images: [{ id: 'i1', url: '/media/coat.jpg', alt: 'front', color: 'Ink' }], variants: [{ id: 'v1', sku: 'S', color: { name: 'Ink', hex: '#181510' }, size: 'M', available: 3, status: 'in_stock' }] };
const article = { id: 'a1', title: 'On wool', slug: 'on-wool', excerpt: 'Why we choose it.', author: 'Asha Rao', tags: [], publishedAt: '2026-09-01T00:00:00Z', content: 'Wool breathes.', seo: {}, coverImage: { url: 'https://cdn.example/cover.jpg', alt: 'wool' } };
let overrides, settings;
const route = (method, path) => {
  const k = `${method} ${path}`; if (overrides[k]) return overrides[k]();
  if (path === '/api/auth/me' || path === '/api/auth/refresh') return fail(401, 'UNAUTHORIZED', 'x');
  if (path === '/api/cart') return ok(emptyCart);
  if (path === '/api/settings/public') return ok(settings);
  if (path === '/api/products/wool-coat') return ok(product);
  if (path === '/api/products/wool-coat/reviews') return ok({ items: [], summary: { average: 0, count: 0, distribution: {} }, viewer: null }, 200, { pagination: { page: 1, limit: 6, total: 0, pages: 1 } });
  if (path === '/api/journal/on-wool') return ok(article);
  if (path === '/api/journal') return ok([article], 200, { pagination: { page: 2, limit: 9, total: 20, pages: 3 } });
  if (path === '/api/products') return ok([], 200, { pagination: { page: 1, limit: 8, total: 0, pages: 1 }, facets: {} });
  return fail(404, 'NOT_FOUND', 'x');
};
beforeEach(() => {
  overrides = {}; settings = { storeName: 'Nessence', social: {} }; window.scrollTo = () => {}; vi.spyOn(console, 'error').mockImplementation(() => {});
  globalThis.fetch = vi.fn(async (url, init = {}) => { const r = route(init.method ?? 'GET', new URL(String(url), 'http://x').pathname); return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } }); });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const mount = (path) => render(<MemoryRouter initialEntries={[path]}><SettingsProvider><AuthProvider><CartProvider><App /></CartProvider></AuthProvider></SettingsProvider></MemoryRouter>);
const head = (sel) => document.head.querySelector(sel); const content = (sel) => head(sel)?.getAttribute('content'); const ld = async (id) => { await waitFor(() => expect(document.getElementById(id)).toBeTruthy()); return JSON.parse(document.getElementById(id).text); };
const origin = window.location.origin;

describe('per-page head tags', () => {
  it('a product has a canonical, Open Graph product tags, an absolute image and a description from its own copy', async () => {
    mount('/products/wool-coat?utm_source=ad'); await screen.findByRole('heading', { name: 'Wool Coat', level: 1 });
    await waitFor(() => expect(document.title).toBe('Wool Coat — Nessence'));
    expect(head('link[rel="canonical"]').getAttribute('href')).toBe(`${origin}/products/wool-coat`);   // tracking params never reach the canonical
    expect(content('meta[property="og:url"]')).toBe(`${origin}/products/wool-coat`); expect(content('meta[property="og:type"]')).toBe('product'); expect(content('meta[property="og:title"]')).toBe('Wool Coat — Nessence');
    expect(content('meta[property="og:image"]')).toBe(`${origin}/media/coat.jpg`); expect(content('meta[name="twitter:card"]')).toBe('summary_large_image');
    expect(content('meta[name="description"]')).toContain('weighted wool coat'); expect(content('meta[name="robots"]')).toBe('index,follow');
  });
  it('a product emits breadcrumb structured data matching the real category path', async () => {
    mount('/products/wool-coat'); await screen.findByRole('heading', { name: 'Wool Coat', level: 1 });
    const items = (await ld('ld-breadcrumb')).itemListElement; expect(items.map((i) => i.name)).toEqual(['Home', 'Women', 'Coats', 'Wool Coat']); expect(items[2].item).toBe(`${origin}/women?category=coats`); expect(items.map((i) => i.position)).toEqual([1, 2, 3, 4]);
  });
  it('an article is typed as an article and uses its cover as the share image', async () => {
    mount('/journal/on-wool'); await screen.findByRole('heading', { name: 'On wool', level: 1 });
    await waitFor(() => expect(content('meta[property="og:type"]')).toBe('article')); expect(content('meta[property="og:image"]')).toBe('https://cdn.example/cover.jpg');
  });
  it('private pages are noindex, have no canonical, and inherit nothing from the previous page', async () => {
    mount('/products/wool-coat'); await screen.findByRole('heading', { name: 'Wool Coat', level: 1 }); await waitFor(() => expect(head('link[rel="canonical"]')).toBeTruthy());
    cleanup(); mount('/cart'); await waitFor(() => expect(content('meta[name="robots"]')).toBe('noindex,nofollow'));
    expect(head('link[rel="canonical"]')).toBeNull(); expect(head('meta[property="og:url"]')).toBeNull(); expect(head('meta[property="og:image"]')).toBeNull(); expect(content('meta[name="twitter:card"]')).toBe('summary');
  });
  it('pagination keeps its page in the canonical but drops filters', async () => {
    mount('/journal?page=2&tag=materials'); await screen.findByRole('heading', { name: 'Journal', level: 1 });
    await waitFor(() => expect(head('link[rel="canonical"]').getAttribute('href')).toBe(`${origin}/journal?page=2`));
  });
  it('search results are noindex', async () => { mount('/search?q=coat'); await waitFor(() => expect(content('meta[name="robots"]')).toBe('noindex,nofollow')); });
});

describe('site structured data', () => {
  it('home declares the brand and a search action, with no social profiles unless configured', async () => {
    mount('/'); await screen.findByRole('heading', { name: /in-between/, level: 1 }); const g = (await ld('ld-site'))['@graph'];
    expect(g.find((x) => x['@type'] === 'Organization').sameAs).toBeUndefined();
    expect(g.find((x) => x['@type'] === 'WebSite').potentialAction.target).toBe(`${origin}/search?q={search_term_string}`);
  });
  it('lists only the social profiles the store has actually configured', async () => {
    settings = { storeName: 'Nessence', social: { instagram: 'https://instagram.com/nessence' } };
    mount('/'); await screen.findByRole('heading', { name: /in-between/, level: 1 }); await waitFor(async () => expect((await ld('ld-site'))['@graph'][0].sameAs).toEqual(['https://instagram.com/nessence']));
  });
});
