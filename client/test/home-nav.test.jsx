import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App.jsx';
import { AuthProvider } from '../src/context/AuthContext.jsx';
import { CartProvider } from '../src/context/CartContext.jsx';
import { SettingsProvider } from '../src/context/SettingsContext.jsx';

const ok = (data, status = 200, meta) => ({ status, body: { success: true, data, ...(meta ? { meta } : {}) } });
const fail = (status, code, message) => ({ status, body: { success: false, code, message } });
const emptyCart = { items: [], saved: [], coupon: null, couponError: null, canCheckout: false, totals: { subtotal: 0, discount: 0, shipping: 0, tax: 0, total: 0, itemCount: 0 } };
const card = (n) => ({ id: `p-${n}`, slug: n, name: `Piece ${n}`, gender: 'women', category: { name: 'Coats', slug: 'coats' }, price: 1200000, salePrice: null, images: [{ id: `i${n}`, url: `/img/${n}.svg`, alt: `Piece ${n}` }], colors: [{ name: 'Ink', hex: '#181510' }], sizes: ['M'], inStock: true, ratingAvg: 0, ratingCount: 0 });
const pg = { pagination: { page: 1, limit: 8, total: 5, pages: 1 }, facets: {} };
const cats = [{ name: 'Shirts', slug: 'shirts', genders: ['men'] }, { name: 'Dresses', slug: 'dresses', genders: ['women'] }];
const collections = [{ name: 'Autumn Edit', slug: 'autumn-edit', description: 'Layers for the season.', season: 'AW26', genders: ['men', 'women'], featured: true }, { name: 'Resort', slug: 'resort', season: 'SS26', genders: ['women'], featured: false }];
const article = (n) => ({ id: `a${n}`, slug: `story-${n}`, title: `Story ${n}`, excerpt: 'An excerpt.', publishedAt: '2026-09-01T00:00:00Z', tags: [] });
let calls, overrides;
const route = (method, path, body, search) => {
  const k = `${method} ${path}`; if (overrides[k]) return overrides[k](body, search);
  if (path === '/api/auth/me' || path === '/api/auth/refresh') return fail(401, 'UNAUTHORIZED', 'x');
  if (path === '/api/cart') return ok(emptyCart);
  if (path === '/api/settings/public') return ok({ storeName: 'Nessence', social: {} });
  if (path === '/api/categories') return ok(search.includes('gender=men') ? [cats[0]] : search.includes('gender=women') ? [cats[1]] : cats);
  if (path === '/api/collections') return ok(collections);
  if (path === '/api/products') return ok(search.includes('collection=') ? ['a', 'b', 'c'].map(card) : ['one', 'two', 'three', 'four', 'five'].map(card), 200, pg);
  if (path === '/api/journal') return ok([1, 2, 3].map(article), 200, { pagination: { page: 1, limit: 3, total: 3, pages: 1 } });
  if (path === '/api/content/about') return ok({ key: 'about', title: 'About Nessence', body: '## Who we are\nWe make considered clothes in small runs, from cloth we trust.', updatedAt: '2026-09-01T00:00:00Z' });
  return fail(404, 'NOT_FOUND', `no stub for ${k}`);
};
beforeEach(() => {
  calls = []; overrides = {}; window.scrollTo = () => {}; vi.spyOn(console, 'error').mockImplementation(() => {});
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    const u = new URL(String(url), 'http://x'); const method = init.method ?? 'GET'; const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, path: u.pathname, search: u.search, body }); const r = route(method, u.pathname, body, u.search);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const mount = (path = '/') => render(<MemoryRouter initialEntries={[path]}><SettingsProvider><AuthProvider><CartProvider><App /></CartProvider></AuthProvider></SettingsProvider></MemoryRouter>);
const h2 = (name) => screen.findByRole('heading', { name, level: 2 });

describe('home page', () => {
  it('tells the story in order using only API data', async () => {
    mount(); expect(await screen.findByRole('heading', { name: /in-between/, level: 1 })).toBeTruthy(); expect(screen.getByText('Autumn/Winter 2026', { selector: 'p' })).toBeTruthy();
    for (const t of ['New arrivals', 'Autumn Edit', 'Featured pieces', 'From the journal', 'Shop by category', 'Worn together', 'First sight of every release.']) await h2(t);
    expect(screen.getByText(/We make considered clothes/)).toBeTruthy(); expect(screen.getByRole('link', { name: 'Explore the collection' }).getAttribute('href')).toBe('/collections/autumn-edit');
    expect(screen.getByRole('heading', { name: 'Story 1', level: 3 }).closest('a').getAttribute('href')).toBe('/journal/story-1');
    expect(calls.some((c) => c.path === '/api/products' && c.search.includes('collection=autumn-edit'))).toBe(true);
  });
  it('omits optional sections cleanly when there is nothing real to show', async () => {
    overrides['GET /api/collections'] = () => ok([]); overrides['GET /api/journal'] = () => ok([], 200, { pagination: { page: 1, limit: 3, total: 0, pages: 1 } }); overrides['GET /api/content/about'] = () => fail(404, 'PAGE_NOT_FOUND', 'x');
    mount(); await h2('New arrivals'); await h2('Shop by category');
    await waitFor(() => expect(calls.some((c) => c.path === '/api/content/about')).toBe(true));
    expect(screen.queryByRole('heading', { name: 'From the journal' })).toBeNull(); expect(screen.queryByText('Featured collection', { exact: false })).toBeNull(); expect(screen.queryByText('Our story')).toBeNull();
  });
  it('shows an honest empty state if the catalogue is empty', async () => {
    overrides['GET /api/products'] = () => ok([], 200, pg); mount(); await screen.findByText('New pieces arrive soon'); expect(screen.queryByRole('heading', { name: 'Worn together' })).toBeNull();
  });
  it('the home newsletter signs up with source "home"', async () => {
    overrides['POST /api/newsletter'] = () => ok({ message: 'Almost there — check your inbox.' }, 202); mount(); await h2('First sight of every release.');
    const form = screen.getByRole('heading', { name: 'First sight of every release.' }).closest('section'); fireEvent.change(within(form).getByLabelText('Email address'), { target: { value: 'mira@example.com' } }); fireEvent.click(within(form).getByRole('button', { name: 'Sign up' }));
    await waitFor(() => expect(calls.find((c) => c.path === '/api/newsletter')?.body).toEqual({ email: 'mira@example.com', source: 'home' })); await screen.findByText(/check your inbox/);
  });
  it('uses drawn icons, not emoji', async () => { mount(); await h2('New arrivals'); expect(document.body.textContent).not.toMatch(/[♥♡🔒]/); });
});

describe('mega-menu and mobile drawer', () => {
  it('opens on hover with real categories, collections for that gender, and the newest piece', async () => {
    mount('/about'); const nav = await screen.findByRole('navigation', { name: 'Primary' }); expect(screen.queryByRole('navigation', { name: 'Men categories' })).toBeNull();
    fireEvent.mouseEnter(within(nav).getByRole('link', { name: 'Men' }));
    const cat = await screen.findByRole('navigation', { name: 'Men categories' }); expect(within(cat).getByRole('link', { name: 'Shirts' }).getAttribute('href')).toBe('/men?category=shirts');
    const col = screen.getByRole('navigation', { name: 'Men collections' }); expect(within(col).getByText('Autumn Edit')).toBeTruthy(); expect(within(col).queryByText('Resort')).toBeNull();   // Resort is women-only
    expect(screen.getByRole('link', { name: /New in: Piece one/ })).toBeTruthy();
  });
  it('switching to Women swaps the panel, and Escape or leaving the header closes it', async () => {
    mount('/about'); const nav = await screen.findByRole('navigation', { name: 'Primary' });
    fireEvent.mouseEnter(within(nav).getByRole('link', { name: 'Men' })); await screen.findByRole('navigation', { name: 'Men categories' });
    fireEvent.mouseEnter(within(nav).getByRole('link', { name: 'Women' })); const w = await screen.findByRole('navigation', { name: 'Women categories' }); expect(within(w).getByRole('link', { name: 'Dresses' })).toBeTruthy(); expect(screen.queryByRole('navigation', { name: 'Men categories' })).toBeNull();
    expect(within(screen.getByRole('navigation', { name: 'Women collections' })).getByText('Resort')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' }); await waitFor(() => expect(screen.queryByRole('navigation', { name: 'Women categories' })).toBeNull());
  });
  it('hovering a plain link such as Collections closes the panel', async () => {
    mount('/about'); const nav = await screen.findByRole('navigation', { name: 'Primary' });
    fireEvent.mouseEnter(within(nav).getByRole('link', { name: 'Men' })); await screen.findByRole('navigation', { name: 'Men categories' });
    fireEvent.mouseEnter(within(nav).getByRole('link', { name: 'Collections' })); await waitFor(() => expect(screen.queryByRole('navigation', { name: 'Men categories' })).toBeNull());
  });
  it('the mobile drawer lists each department with its categories', async () => {
    mount('/about'); await screen.findByRole('navigation', { name: 'Primary' }); fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    const d = await screen.findByRole('dialog', { name: 'Menu' }); expect(await within(d).findByRole('link', { name: 'Shirts' })).toBeTruthy(); expect(within(d).getByRole('link', { name: 'Dresses' }).getAttribute('href')).toBe('/women?category=dresses');
    expect(within(d).getByRole('link', { name: 'Collections' })).toBeTruthy();
  });
});
