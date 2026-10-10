import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axe from 'axe-core';
import App from '../src/App.jsx';
import { AuthProvider } from '../src/context/AuthContext.jsx';
import { CartProvider } from '../src/context/CartContext.jsx';
import { SettingsProvider } from '../src/context/SettingsContext.jsx';

const ok = (data, status = 200, meta) => ({ status, body: { success: true, data, ...(meta ? { meta } : {}) } });
const fail = (status, code, message) => ({ status, body: { success: false, code, message } });
const emptyCart = { items: [], saved: [], coupon: null, couponError: null, canCheckout: false, totals: { subtotal: 0, discount: 0, shipping: 0, tax: 0, total: 0, itemCount: 0 } };
const card = (n) => ({ id: `p-${n}`, slug: n, name: `Piece ${n}`, gender: 'women', category: { name: 'Coats', slug: 'coats' }, price: 1200000, salePrice: 999900, images: [{ id: `i${n}`, url: `/img/${n}.svg`, alt: `Piece ${n}` }, { id: `j${n}`, url: `/img/${n}b.svg`, alt: `Piece ${n} back` }], colors: [{ name: 'Ink', hex: '#181510' }, { name: 'Sand', hex: '#EFEAE0' }], sizes: ['M', 'L'], inStock: true, ratingAvg: 4.5, ratingCount: 3 });
const detail = { ...card('wool-coat'), description: 'A coat.', materials: 'Wool', care: ['Dry clean'], details: ['Lined'], seo: {}, related: [], collections: [],
  variants: ['Ink', 'Sand'].flatMap((c) => ['M', 'L'].map((s) => ({ id: `v-${c}-${s}`, sku: `${c}${s}`, color: { name: c, hex: c === 'Ink' ? '#181510' : '#EFEAE0' }, size: s, available: 4, status: 'in_stock' }))) };
const cats = [{ name: 'Coats', slug: 'coats', genders: ['women'] }];
const article = { id: 'a1', title: 'On wool', slug: 'on-wool', excerpt: 'Why.', author: 'Asha', tags: ['materials'], publishedAt: '2026-09-01T00:00:00Z', content: '## Cloth\nWool breathes.', seo: {} };
let user, overrides;
const route = (method, path, body, search) => {
  const k = `${method} ${path}`; if (overrides[k]) return overrides[k]();
  if (path === '/api/auth/me') return user ? ok({ user }) : fail(401, 'UNAUTHORIZED', 'x'); if (path === '/api/auth/refresh') return fail(401, 'UNAUTHORIZED', 'x');
  if (path.startsWith('/api/admin')) return fail(401, 'UNAUTHORIZED', 'Authentication required');
  if (path === '/api/cart') return ok(emptyCart); if (path === '/api/wishlist') return ok([]);
  if (path === '/api/settings/public') return ok({ storeName: 'Nessence', supportEmail: 'care@n.test', social: { instagram: 'https://instagram.com/n' } });
  if (path === '/api/categories') return ok(cats); if (path === '/api/collections') return ok([{ name: 'Autumn Edit', slug: 'autumn-edit', season: 'AW26', genders: ['women'], featured: true }]);
  if (/^\/api\/products\/[a-z-]+$/.test(path)) return ok({ ...detail, slug: path.split('/').pop() });
  if (path === '/api/products/wool-coat/reviews') return ok({ items: [{ id: 'r1', rating: 5, title: 'Superb', body: 'Fits perfectly and feels premium.', author: 'Mira', createdAt: '2026-09-01T00:00:00Z' }], summary: { average: 5, count: 1, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 } }, viewer: user ? { review: null, canReview: true } : null }, 200, { pagination: { page: 1, limit: 6, total: 1, pages: 1 } });
  if (path === '/api/products') return ok(['one', 'two', 'three', 'four'].map(card), 200, { pagination: { page: 1, limit: 12, total: 4, pages: 1 }, facets: { sizes: [{ size: 'M', count: 4 }], colors: [{ name: 'Ink', hex: '#181510', count: 4 }], price: { min: 500000, max: 2000000 } } });
  if (path === '/api/journal') return ok([article], 200, { pagination: { page: 1, limit: 9, total: 1, pages: 1 } }); if (path === '/api/journal/on-wool') return ok(article);
  if (path === '/api/collections/autumn-edit') return ok({ name: 'Autumn Edit', slug: 'autumn-edit', season: 'AW26' });
  if (path === '/api/content/faq') return ok({ key: 'faq', title: 'FAQ', body: '', data: { items: [{ q: 'How long is delivery?', a: 'Four to six days.' }] }, updatedAt: '2026-09-01T00:00:00Z' });
  if (path === '/api/content/about') return ok({ key: 'about', title: 'About', body: 'We make clothes.', updatedAt: '2026-09-01T00:00:00Z' });
  if (path === '/api/content/size-guide') return ok({ key: 'size-guide', title: 'Size guide', body: '## Women\nSize | Bust\nXS | 80', updatedAt: '2026-09-01T00:00:00Z' });
  return fail(404, 'NOT_FOUND', 'x');
};
beforeEach(() => {
  user = null; overrides = {}; window.scrollTo = () => {}; vi.spyOn(console, 'error').mockImplementation(() => {});
  globalThis.fetch = vi.fn(async (url, init = {}) => { const u = new URL(String(url), 'http://x'); const r = route(init.method ?? 'GET', u.pathname, init.body ? JSON.parse(init.body) : undefined, u.search); return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } }); });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const mount = (path) => render(<MemoryRouter initialEntries={[path]}><SettingsProvider><AuthProvider><CartProvider><App /></CartProvider></AuthProvider></SettingsProvider></MemoryRouter>);
// color-contrast needs real layout (jsdom has none); contrast is verified from the token values instead.
async function violations() {
  const r = await axe.run(document.body, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }, rules: { 'color-contrast': { enabled: false }, 'landmark-one-main': { enabled: false }, 'page-has-heading-one': { enabled: false }, region: { enabled: false } } });
  return r.violations.map((v) => `${v.id}: ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}
const clean = async () => { const v = await violations(); if (v.length) throw new Error(`${v.length} accessibility violation(s):\n${v.join('\n')}`); };

// Generous wait: lazy route chunks (notably the admin bundle) compile slowly on a cold cache.
describe('axe: pages', () => {
  const pages = [['home', '/', /in-between/], ['shop', '/women', 'Piece one'], ['product', '/products/wool-coat', 'Piece wool-coat'], ['cart', '/cart', /bag/i], ['contact', '/contact', 'Contact us'], ['sign in', '/login', /sign in|welcome/i], ['register', '/register', /create|register/i],
    ['track order', '/track-order', 'Track your order'], ['journal', '/journal', 'Journal'], ['article', '/journal/on-wool', 'On wool'], ['collection', '/collections/autumn-edit', 'Autumn Edit'], ['faq', '/faq', 'FAQ'], ['not found', '/no-such-page', /not found|404/i], ['admin sign-in', '/admin/login', /sign in/i]];
  for (const [name, path, ready] of pages) {
    it(`${name} has no violations`, async () => { mount(path); await screen.findAllByText(ready, { exact: typeof ready === 'string' }, { timeout: 8000 }); await new Promise((r) => setTimeout(r, 50)); await clean(); });
  }
});

describe('axe: interactive states', () => {
  it('mobile menu drawer', async () => { mount('/faq'); await screen.findByRole('navigation', { name: 'Primary' }); fireEvent.click(screen.getByRole('button', { name: 'Menu' })); await screen.findByRole('dialog', { name: 'Menu' }); await screen.findAllByRole('link', { name: 'Coats' }); await clean(); });
  it('mega-menu panel', async () => { mount('/faq'); const nav = await screen.findByRole('navigation', { name: 'Primary' }); fireEvent.mouseEnter(within(nav).getByRole('link', { name: 'Women' })); await screen.findByRole('navigation', { name: 'Women categories' }); await clean(); });
  it('quick view dialog', async () => { mount('/women'); fireEvent.click((await screen.findAllByRole('button', { name: /Quick add Piece one/ }))[0]); await screen.findByRole('dialog', { name: 'Piece one' }); await screen.findByRole('button', { name: 'Add to bag' }); await clean(); });
  it('size guide dialog', async () => { mount('/products/wool-coat'); fireEvent.click(await screen.findByRole('button', { name: 'Size guide' })); await screen.findByRole('columnheader', { name: 'Bust' }); await clean(); });
  it('review form (signed in)', async () => { user = { id: 'u1', name: 'A B', email: 'a@b.co', role: 'customer' }; mount('/products/wool-coat'); fireEvent.click(await screen.findByRole('button', { name: 'Write a review' })); await screen.findByRole('form', { name: 'Write a review' }); await clean(); });
  it('shop filters panel on mobile', async () => { mount('/women'); await screen.findByText('Piece one'); fireEvent.click(screen.getByRole('button', { name: 'Filters' })); await clean(); });
});

describe('keyboard and focus behaviour', () => {
  const tab = (shift = false) => fireEvent.keyDown(document, { key: 'Tab', shiftKey: shift });
  it('the mobile menu takes focus, keeps Tab inside, closes on Escape and returns focus to its button', async () => {
    mount('/faq'); await screen.findByRole('navigation', { name: 'Primary' }); const opener = screen.getByRole('button', { name: 'Menu' }); opener.focus(); fireEvent.click(opener);
    const dlg = await screen.findByRole('dialog', { name: 'Menu' }); await screen.findAllByRole('link', { name: 'Coats' }); expect(dlg.contains(document.activeElement)).toBe(true);
    const all = [...dlg.querySelectorAll('a[href],button:not([disabled])')]; all.at(-1).focus(); tab(); expect(document.activeElement).toBe(all[0]);      // forward wraps to the first control
    all[0].focus(); tab(true); expect(document.activeElement).toBe(all.at(-1));                                                                         // backward wraps to the last
    document.body.focus(); tab(); expect(dlg.contains(document.activeElement)).toBe(true);                                                               // focus that escaped is pulled back
    fireEvent.keyDown(window, { key: 'Escape' }); await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull()); expect(document.activeElement).toBe(opener);
  });
  it('a modal dialog returns focus to the control that opened it', async () => {
    mount('/products/wool-coat'); const opener = await screen.findByRole('button', { name: 'Size guide' }); opener.focus(); fireEvent.click(opener);
    await screen.findByRole('dialog', { name: 'Size guide' }); expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' })); await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull()); expect(document.activeElement).toBe(opener);
  });
  it('navigating moves focus to <main>, scrolls to the top and announces the new page', async () => {
    const scroll = vi.fn(); window.scrollTo = scroll; mount('/women'); await screen.findByText('Piece one'); scroll.mockClear();
    fireEvent.click(screen.getAllByRole('link', { name: /Piece one/ })[0]); await screen.findByRole('heading', { name: 'Piece wool-coat', level: 1 });
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById('main'))); expect(scroll).toHaveBeenCalledWith(0, 0);
    await waitFor(() => expect(screen.getAllByRole('status').some((n) => /Piece wool-coat — Nessence/.test(n.textContent))).toBe(true));
  });
  it('changing a filter does not steal focus or scroll the page', async () => {
    const scroll = vi.fn(); window.scrollTo = scroll; mount('/women'); await screen.findByText('Piece one'); scroll.mockClear();
    const box = screen.getByLabelText('In stock only'); box.focus(); fireEvent.click(box); await new Promise((r) => setTimeout(r, 250));
    expect(document.activeElement).not.toBe(document.getElementById('main')); expect(scroll).not.toHaveBeenCalled();
  });
});
