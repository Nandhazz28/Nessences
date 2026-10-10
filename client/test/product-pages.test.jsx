import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App.jsx';
import { AuthProvider } from '../src/context/AuthContext.jsx';
import { CartProvider } from '../src/context/CartContext.jsx';
import { SettingsProvider } from '../src/context/SettingsContext.jsx';

const ok = (data, status = 200, meta) => ({ status, body: { success: true, data, ...(meta ? { meta } : {}) } });
const fail = (status, code, message, details) => ({ status, body: { success: false, code, message, ...(details ? { details } : {}) } });
const totals = { subtotal: 0, discount: 0, shipping: 0, tax: 0, total: 0, itemCount: 0 };
const emptyCart = { items: [], saved: [], coupon: null, couponError: null, canCheckout: false, totals };
const card = (n, extra = {}) => ({ id: `p-${n}`, slug: n, name: `Piece ${n}`, gender: 'women', category: { name: 'Coats', slug: 'coats' }, price: 1200000, salePrice: null, images: [], colors: [{ name: 'Ink', hex: '#181510' }], sizes: ['M'], inStock: true, ratingAvg: 0, ratingCount: 0, ...extra });
const detail = (n = 'wool-coat', extra = {}) => ({ ...card(n, { ratingAvg: 4.5, ratingCount: 2 }), description: 'A coat.', materials: 'Wool', care: ['Dry clean'], details: ['Lined'], seo: {}, collections: [],
  images: [{ id: 'i1', url: '/img/1.jpg', alt: 'front', color: 'Ink' }], related: [],
  variants: [{ id: 'v-m', sku: 'WC-M', color: { name: 'Ink', hex: '#181510' }, size: 'M', available: 5, status: 'in_stock' }, { id: 'v-l', sku: 'WC-L', color: { name: 'Ink', hex: '#181510' }, size: 'L', available: 0, status: 'out_of_stock' }], ...extra });
const reviewList = (viewer = null, items = [{ id: 'r1', rating: 5, title: 'Superb', body: 'Fits perfectly and feels premium.', author: 'Mira S.', createdAt: '2026-09-01T00:00:00Z', verified: true }]) =>
  ok({ items, summary: { average: 4.5, count: 2, distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 } }, viewer }, 200, { pagination: { page: 1, limit: 6, total: 2, pages: 1 } });
let calls, overrides, user;
const route = (method, path, body, search) => {
  const k = `${method} ${path}`; if (overrides[k]) return overrides[k](body, search);
  if (path === '/api/auth/me') return user ? ok({ user }) : fail(401, 'UNAUTHORIZED', 'Authentication required');
  if (path === '/api/auth/refresh') return fail(401, 'UNAUTHORIZED', 'x');
  if (path === '/api/cart') return ok(emptyCart);
  if (path === '/api/wishlist') return ok([]);
  if (path === '/api/settings/public') return ok({ storeName: 'Nessence', social: {} });
  if (path === '/api/content/size-guide') return ok({ key: 'size-guide', title: 'Size guide', body: '## Women\nSize | Bust\nXS | 80', updatedAt: '2026-09-01T00:00:00Z' });
  if (path === '/api/products/wool-coat') return ok(detail());
  if (path === '/api/products/wool-coat/reviews') return reviewList();
  if (path === '/api/products') return ok([card('wool-coat'), card('silk-shirt')], 200, { pagination: { page: 1, limit: 12, total: 2, pages: 1 }, facets: { sizes: [{ size: 'M', count: 2 }, { size: 'L', count: 1 }], colors: [{ name: 'Ink', hex: '#181510', count: 2 }], price: { min: 500000, max: 2000000 } } });
  if (path === '/api/categories') return ok([]);
  return fail(404, 'NOT_FOUND', `no stub for ${k}`);
};
beforeEach(() => {
  calls = []; overrides = {}; user = null; localStorage.clear(); window.scrollTo = () => {}; vi.spyOn(console, 'error').mockImplementation(() => {});
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    const u = new URL(String(url), 'http://x'); const method = init.method ?? 'GET'; const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, path: u.pathname, search: u.search, body }); const r = route(method, u.pathname, body, u.search);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); document.head.querySelectorAll('#ld-product').forEach((n) => n.remove()); });
const mount = (path) => render(<MemoryRouter initialEntries={[path]}><SettingsProvider><AuthProvider><CartProvider><App /></CartProvider></AuthProvider></SettingsProvider></MemoryRouter>);
const pdp = async () => { mount('/products/wool-coat'); await screen.findByRole('heading', { name: 'Piece wool-coat', level: 1 }); if (user) await screen.findAllByRole('link', { name: 'Account' }); };
const ldWait = async (id) => { await waitFor(() => expect(document.getElementById(id)).toBeTruthy()); return JSON.parse(document.getElementById(id).text); };
const last = (m, p) => calls.filter((c) => c.method === m && c.path === p).at(-1);

describe('product page', () => {
  it('shows rating, delivery info, Product structured data and in-stock-only sizes', async () => {
    await pdp(); expect(screen.getByRole('img', { name: /4.5 out of 5 from 2 reviews/ })).toBeTruthy();
    const ld = await ldWait('ld-product'); expect(ld['@type']).toBe('Product'); expect(ld.offers.price).toBe('12000.00'); expect(ld.offers.availability).toContain('InStock'); expect(ld.aggregateRating.reviewCount).toBe(2);
    expect(screen.getByRole('button', { name: /^L/ }).disabled).toBe(true);
  });
  it('opens the size guide from the CMS and closes it with Escape', async () => {
    await pdp(); fireEvent.click(screen.getByRole('button', { name: 'Size guide' }));
    const dlg = await screen.findByRole('dialog', { name: 'Size guide' }); expect(await within(dlg).findByRole('columnheader', { name: 'Bust' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' }); await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('image zoom toggles by button', async () => {
    await pdp(); const z = screen.getByRole('button', { name: 'Zoom in on image' }); fireEvent.click(z); expect(z.getAttribute('aria-pressed')).toBe('true'); expect(z.getAttribute('aria-label')).toBe('Zoom out');
  });
  it('Buy now needs a size, then adds the real variant and goes to checkout', async () => {
    overrides['POST /api/cart/items'] = () => ok({ ...emptyCart });
    await pdp(); fireEvent.click(screen.getByRole('button', { name: 'Buy now' })); expect(await screen.findByText('Please select a size.')).toBeTruthy(); expect(last('POST', '/api/cart/items')).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'M' })); fireEvent.click(screen.getByRole('button', { name: 'Buy now' }));
    await waitFor(() => expect(last('POST', '/api/cart/items')?.body).toEqual({ variantId: 'v-m', qty: 1 }));
  });
  it('the wishlist button sends guests to sign in', async () => {
    await pdp(); fireEvent.click(screen.getByRole('button', { name: /Add to wishlist/ })); expect((await screen.findAllByRole('heading', { name: /sign in|welcome back/i })).length).toBeGreaterThan(0);
    expect(last('POST', '/api/wishlist')).toBeUndefined();
  });
  it('a signed-in user adds to the real wishlist', async () => {
    user = { id: 'u1', name: 'Mira Shah', email: 'm@example.com', role: 'customer' }; overrides['POST /api/wishlist'] = () => ok([{ id: 'p-wool-coat' }]);
    await pdp(); await screen.findByRole('button', { name: /Add to wishlist/ }); fireEvent.click(screen.getByRole('button', { name: /Add to wishlist/ }));
    await waitFor(() => expect(last('POST', '/api/wishlist')?.body).toEqual({ productId: 'p-wool-coat' })); await screen.findByRole('button', { name: /Saved to wishlist/ });
  });
  it('remembers viewed products on this device and loads them from the API by slug', async () => {
    await pdp(); cleanup(); localStorage.setItem('nessence.recent', JSON.stringify(['silk-shirt'])); overrides['GET /api/products'] = (_b, search) => ok(search.includes('slugs=silk-shirt') ? [card('silk-shirt')] : [], 200, { pagination: {}, facets: {} });
    await pdp(); await screen.findByRole('heading', { name: 'Recently viewed' }); expect(calls.some((c) => c.path === '/api/products' && c.search.includes('slugs=silk-shirt'))).toBe(true);
  });
});

describe('reviews', () => {
  it('shows the real summary and approved reviews; guests are invited to sign in', async () => {
    await pdp(); expect(await screen.findByText('Superb')).toBeTruthy(); expect(screen.getByRole('list', { name: 'Rating breakdown' })).toBeTruthy(); expect(screen.getByText(/to review a piece/i)).toBeTruthy(); expect(screen.queryByRole('button', { name: 'Write a review' })).toBeNull();
  });
  it('a customer who has not received the product is told why they cannot review', async () => {
    user = { id: 'u1', name: 'A B', email: 'a@b.co', role: 'customer' }; overrides['GET /api/products/wool-coat/reviews'] = () => reviewList({ review: null, canReview: false, reason: 'Only customers who have received this product can review it.' });
    await pdp(); expect(await screen.findByText(/Only customers who have received/)).toBeTruthy(); expect(screen.queryByRole('button', { name: 'Write a review' })).toBeNull();
  });
  it('an eligible buyer submits a review to the API and sees the list reload', async () => {
    user = { id: 'u1', name: 'A B', email: 'a@b.co', role: 'customer' }; overrides['GET /api/products/wool-coat/reviews'] = () => reviewList({ review: null, canReview: true });
    overrides['POST /api/products/wool-coat/reviews'] = () => ok({ id: 'new' }, 201);
    await pdp(); fireEvent.click(await screen.findByRole('button', { name: 'Write a review' }));
    fireEvent.change(screen.getByLabelText('Your review'), { target: { value: 'Lovely weight and drape.' } }); fireEvent.click(screen.getByRole('button', { name: 'Submit review' })); expect(await screen.findByText('Please choose a rating.')).toBeTruthy(); expect(last('POST', '/api/products/wool-coat/reviews')).toBeUndefined();
    fireEvent.click(screen.getByRole('radio', { name: '4 out of 5' })); fireEvent.click(screen.getByRole('button', { name: 'Submit review' }));
    await waitFor(() => expect(last('POST', '/api/products/wool-coat/reviews')?.body).toMatchObject({ rating: 4, body: 'Lovely weight and drape.' }));
  });
  it('shows the server error instead of pretending the review was saved', async () => {
    user = { id: 'u1', name: 'A B', email: 'a@b.co', role: 'customer' }; overrides['GET /api/products/wool-coat/reviews'] = () => reviewList({ review: null, canReview: true });
    overrides['POST /api/products/wool-coat/reviews'] = () => fail(409, 'ALREADY_REVIEWED', 'You have already reviewed this product');
    await pdp(); fireEvent.click(await screen.findByRole('button', { name: 'Write a review' })); fireEvent.click(screen.getByRole('radio', { name: '5 out of 5' })); fireEvent.change(screen.getByLabelText('Your review'), { target: { value: 'Great coat indeed.' } }); fireEvent.click(screen.getByRole('button', { name: 'Submit review' }));
    expect((await screen.findByRole('alert')).textContent).toContain('already reviewed');
  });
  it('the owner sees their pending review with its moderation status, and deletes it only after confirming', async () => {
    user = { id: 'u1', name: 'A B', email: 'a@b.co', role: 'customer' }; overrides['GET /api/products/wool-coat/reviews'] = () => reviewList({ review: { id: 'mine', rating: 4, title: 'Good', body: 'Solid coat overall.', status: 'pending' }, canReview: false });
    overrides['DELETE /api/reviews/mine'] = () => ok({ deleted: true });
    await pdp(); expect(await screen.findByText(/Awaiting moderation/)).toBeTruthy(); fireEvent.click(screen.getByRole('button', { name: 'Delete' })); expect(last('DELETE', '/api/reviews/mine')).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' })); await waitFor(() => expect(last('DELETE', '/api/reviews/mine')).toBeTruthy());
  });
  it('a signed-in user can report a review', async () => {
    user = { id: 'u1', name: 'A B', email: 'a@b.co', role: 'customer' }; overrides['POST /api/reviews/r1/report'] = () => ok({ reported: true }, 201);
    await pdp(); fireEvent.click(await screen.findByRole('button', { name: 'Report' })); fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
    await screen.findByText('Thanks — reported.'); expect(last('POST', '/api/reviews/r1/report')?.body).toEqual({ reason: 'spam' });
  });
});

describe('shop filters and quick add', () => {
  const shop = async () => { mount('/women'); await screen.findByText('Piece wool-coat'); };
  it('size, colour, availability and price each go to the server as query parameters', async () => {
    await shop(); fireEvent.click(screen.getByRole('button', { name: 'M', pressed: false })); await waitFor(() => expect(calls.at(-1).search).toContain('size=M'));
    fireEvent.click(screen.getByLabelText(/Ink/)); await waitFor(() => expect(calls.at(-1).search).toContain('color=Ink'));
    fireEvent.click(screen.getByLabelText('In stock only')); await waitFor(() => expect(calls.at(-1).search).toContain('availability=in_stock'));
    fireEvent.change(screen.getByLabelText('Minimum price'), { target: { value: '5000' } }); fireEvent.change(screen.getByLabelText('Maximum price'), { target: { value: '15000' } }); fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => { const s = calls.at(-1).search; expect(s).toContain('minPrice=500000'); expect(s).toContain('maxPrice=1500000'); });
  });
  it('shows an honest empty state with a way to clear filters', async () => {
    await shop(); overrides['GET /api/products'] = () => ok([], 200, { pagination: { page: 1, limit: 12, total: 0, pages: 1 }, facets: {} });
    fireEvent.click(screen.getByRole('button', { name: 'M', pressed: false })); await screen.findByText('Nothing here yet'); expect(screen.getAllByRole('button', { name: /Clear filters|Clear all filters/ }).length).toBeGreaterThan(0);
  });
  it('quick add opens a dialog, requires a size, and adds the chosen real variant', async () => {
    overrides['POST /api/cart/items'] = () => ok(emptyCart);
    await shop(); fireEvent.click(screen.getByRole('button', { name: 'Quick add Piece wool-coat' })); const dlg = await screen.findByRole('dialog', { name: 'Piece wool-coat' });
    fireEvent.click(await within(dlg).findByRole('button', { name: 'Add to bag' })); expect(within(dlg).getByText('Please select a size.')).toBeTruthy(); expect(last('POST', '/api/cart/items')).toBeUndefined();
    fireEvent.click(within(dlg).getByRole('button', { name: 'M' })); fireEvent.click(within(dlg).getByRole('button', { name: 'Add to bag' }));
    await waitFor(() => expect(last('POST', '/api/cart/items')?.body).toEqual({ variantId: 'v-m', qty: 1 })); await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Piece wool-coat' })).toBeNull());
  });
  it('cards show the rating when a product has approved reviews', async () => {
    overrides['GET /api/products'] = () => ok([card('wool-coat', { ratingAvg: 4.5, ratingCount: 12 })], 200, { pagination: { page: 1, limit: 12, total: 1, pages: 1 }, facets: {} });
    await shop(); expect(screen.getByRole('img', { name: /4.5 out of 5 from 12 reviews/ })).toBeTruthy();
  });
});

describe('my reviews (account)', () => {
  const mine = [{ id: 'm1', rating: 4, title: 'Good', body: 'Solid coat overall.', status: 'pending', createdAt: '2026-09-02T00:00:00Z', product: { name: 'Wool Coat', slug: 'wool-coat' } }];
  const open = async () => { user = { id: 'u1', name: 'A B', email: 'a@b.co', role: 'customer' }; mount('/account/reviews'); };
  it('lists the customer’s own reviews with their real moderation status', async () => {
    overrides['GET /api/account/reviews'] = () => ok(mine); await open();
    expect(await screen.findByRole('link', { name: 'Wool Coat' })).toBeTruthy(); expect(screen.getByText(/Awaiting moderation/)).toBeTruthy();
  });
  it('edits through the API and deletes only after confirmation', async () => {
    overrides['GET /api/account/reviews'] = () => ok(mine); overrides['PATCH /api/reviews/m1'] = () => ok({ id: 'm1' }); overrides['DELETE /api/reviews/m1'] = () => ok({ deleted: true });
    await open(); fireEvent.click(await screen.findByRole('button', { name: 'Edit' })); fireEvent.change(screen.getByLabelText('Your review'), { target: { value: 'Even better after a month.' } }); fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(last('PATCH', '/api/reviews/m1')?.body).toMatchObject({ rating: 4, body: 'Even better after a month.' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' })); expect(last('DELETE', '/api/reviews/m1')).toBeUndefined(); fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' })); await waitFor(() => expect(last('DELETE', '/api/reviews/m1')).toBeTruthy());
  });
  it('shows an honest empty state', async () => { overrides['GET /api/account/reviews'] = () => ok([]); await open(); await screen.findByText('No reviews yet'); });
});
