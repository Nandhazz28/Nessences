import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App.jsx';
import { AuthProvider } from '../src/context/AuthContext.jsx';
import { CartProvider } from '../src/context/CartContext.jsx';
import { SettingsProvider } from '../src/context/SettingsContext.jsx';

const ok = (data, status = 200, meta) => ({ status, body: { success: true, data, ...(meta ? { meta } : {}) } });
const fail = (status, code, message, details) => ({ status, body: { success: false, code, message, ...(details ? { details } : {}) } });
const emptyCart = { items: [], saved: [], coupon: null, couponError: null, canCheckout: false, totals: { subtotal: 0, discount: 0, shipping: 0, tax: 0, total: 0, itemCount: 0 } };
const pagination = { page: 1, limit: 9, total: 1, pages: 1 };
const article = { id: 'a1', title: 'On wool', slug: 'on-wool', excerpt: 'Why we choose it.', author: 'Asha Rao', tags: ['materials'], publishedAt: '2026-09-01T00:00:00Z', content: '## Cloth first\nWool breathes.', seo: {} };
const product = { id: 'p1', slug: 'coat', name: 'Wool Coat', price: 12000, salePrice: null, images: [], colors: [], inStock: true, gender: 'women', category: { name: 'Coats', slug: 'coats' } };
let calls, overrides;
const route = (method, path, body, search) => {
  const k = `${method} ${path}`; if (overrides[k]) return overrides[k](body, search);
  if (path === '/api/auth/me' || path === '/api/auth/refresh') return fail(401, 'UNAUTHORIZED', 'Authentication required');
  if (path === '/api/cart') return ok(emptyCart);
  if (path === '/api/settings/public') return ok({ storeName: 'Nessence', supportEmail: 'care@nessence.test', supportPhone: null, social: {} });
  if (path === '/api/journal') return ok([article], 200, { pagination });
  if (path === '/api/journal/on-wool') return ok(article);
  if (path === '/api/collections') return ok([{ name: 'Autumn Edit', slug: 'autumn-edit', description: 'Layers.', season: 'AW26', genders: ['men', 'women'] }]);
  if (path === '/api/collections/autumn-edit') return ok({ name: 'Autumn Edit', slug: 'autumn-edit', description: 'Layers.', season: 'AW26' });
  if (path === '/api/products') return ok([product], 200, { pagination: { page: 1, limit: 12, total: 1, pages: 1 }, facets: {} });
  return fail(404, 'NOT_FOUND', `no stub for ${k}`);
};
beforeEach(() => {
  calls = []; overrides = {}; vi.spyOn(console, 'error').mockImplementation(() => {}); window.scrollTo = () => {};
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    const u = new URL(String(url), 'http://x'); const method = init.method ?? 'GET'; const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, path: u.pathname, search: u.search, body }); const r = route(method, u.pathname, body, u.search);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); document.head.querySelectorAll('#ld-article').forEach((n) => n.remove()); });
const mount = (path) => render(<MemoryRouter initialEntries={[path]}><SettingsProvider><AuthProvider><CartProvider><App /></CartProvider></AuthProvider></SettingsProvider></MemoryRouter>);
const ldWait = async (id) => { await waitFor(() => expect(document.getElementById(id)).toBeTruthy()); return JSON.parse(document.getElementById(id).text); };
const fill = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('contact', () => {
  const fillAll = () => { fill('Name', 'Mira Shah'); fill('Email', 'mira@example.com'); fill('Subject', 'Sizing help'); fill('Message', 'Does the coat run large?'); };
  it('submits to the backend and shows the real reference', async () => {
    overrides['POST /api/contact'] = () => ok({ received: true, reference: 'AB12CD34' }, 201);
    mount('/contact'); await screen.findByRole('heading', { name: 'Contact us' }); fillAll(); fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await screen.findByText('AB12CD34'); const c = calls.find((x) => x.path === '/api/contact');
    expect(c.body).toMatchObject({ name: 'Mira Shah', email: 'mira@example.com', subject: 'Sizing help', category: 'other' });
  });
  it('shows the server validation message and does not claim success', async () => {
    overrides['POST /api/contact'] = () => fail(400, 'VALIDATION_ERROR', 'Invalid input', [{ message: 'Order numbers look like NS-2610-A1B2C3' }]);
    mount('/contact'); await screen.findByRole('heading', { name: 'Contact us' }); fillAll(); fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Order numbers look like'); expect(screen.queryByText(/we have your message/i)).toBeNull();
  });
  it('lists only support details the store has configured', async () => {
    mount('/contact'); expect(await screen.findByRole('link', { name: 'care@nessence.test' })).toBeTruthy(); expect(screen.queryByText('Phone')).toBeNull();
  });
});

describe('track order', () => {
  const order = { orderNumber: 'NS-2610-A1B2C3', status: 'shipped', placedAt: '2026-10-01T00:00:00Z', statusHistory: [{ status: 'confirmed', at: '2026-10-01T00:00:00Z' }, { status: 'shipped', at: '2026-10-03T00:00:00Z' }], delivery: { label: 'Standard', eta: '4–6 days' }, city: 'Chennai', items: [{ name: 'Wool Coat', color: 'Ink', size: 'M', qty: 1 }] };
  it('retrieves the real order with the number and email', async () => {
    overrides['POST /api/track-order'] = () => ok(order);
    mount('/track-order'); await screen.findByRole('heading', { name: 'Track your order' }); fill('Order number', 'ns-2610-a1b2c3'); fill('Email', 'mira@example.com'); fireEvent.click(screen.getByRole('button', { name: 'Track' }));
    await screen.findByRole('heading', { name: 'NS-2610-A1B2C3' }); expect(screen.getByText('Wool Coat')).toBeTruthy(); expect(screen.getByRole('list', { name: 'Order progress' })).toBeTruthy();
    expect(calls.find((c) => c.path === '/api/track-order').body).toEqual({ orderNumber: 'ns-2610-a1b2c3', email: 'mira@example.com' });
  });
  it('a non-matching order shows a neutral not-found message', async () => {
    overrides['POST /api/track-order'] = () => fail(404, 'ORDER_NOT_FOUND', 'x');
    mount('/track-order'); await screen.findByRole('heading', { name: 'Track your order' }); fill('Order number', 'NS-2610-AAAAAA'); fill('Email', 'x@example.com'); fireEvent.click(screen.getByRole('button', { name: 'Track' }));
    expect((await screen.findByRole('alert')).textContent).toContain('could not find an order'); expect(screen.queryByRole('list', { name: 'Order progress' })).toBeNull();
  });
});

describe('journal', () => {
  it('lists published articles from the API and links to each', async () => {
    mount('/journal'); const h = await screen.findByRole('heading', { name: 'On wool', level: 2 });
    expect(h.closest('a').getAttribute('href')).toBe('/journal/on-wool');
  });
  it('shows an honest empty state', async () => {
    overrides['GET /api/journal'] = () => ok([], 200, { pagination: { ...pagination, total: 0 } }); mount('/journal'); await screen.findByText('No articles published yet');
  });
  it('renders the article body as text and emits Article structured data', async () => {
    mount('/journal/on-wool'); await screen.findByRole('heading', { name: 'On wool', level: 1 });
    expect(screen.getByRole('heading', { name: 'Cloth first', level: 2 })).toBeTruthy();
    const ld = await ldWait('ld-article'); expect(ld['@type']).toBe('Article'); expect(ld.author.name).toBe('Asha Rao');
  });
  it('an unpublished slug shows not-available', async () => {
    overrides['GET /api/journal/gone'] = () => fail(404, 'ARTICLE_NOT_FOUND', 'x'); mount('/journal/gone'); await screen.findByText('This article isn’t available');
  });
});

describe('collections', () => {
  it('lists collections and opens one with its products filtered server-side', async () => {
    mount('/collections'); const h = await screen.findByRole('heading', { name: 'Autumn Edit', level: 2 }); expect(h.closest('a').getAttribute('href')).toBe('/collections/autumn-edit');
    cleanup(); mount('/collections/autumn-edit'); await screen.findByRole('heading', { name: 'Autumn Edit', level: 1 }); await screen.findByText('Wool Coat');
    expect(calls.some((c) => c.path === '/api/products' && c.search.includes('collection=autumn-edit'))).toBe(true);
  });
  it('an unknown collection shows not-available', async () => {
    overrides['GET /api/collections/nope'] = () => fail(404, 'COLLECTION_NOT_FOUND', 'x'); mount('/collections/nope'); await screen.findByText('This collection isn’t available');
  });
});

describe('navigation reaches the new pages', () => {
  it('header and footer link to Collections, Journal, Contact and Track order', async () => {
    mount('/contact'); await screen.findByRole('heading', { name: 'Contact us' });
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    for (const h of ['/collections', '/journal', '/contact', '/track-order']) expect(hrefs).toContain(h);
  });
});
