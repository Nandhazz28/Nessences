import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AdminApp from '../src/admin/AdminApp.jsx';

const ALL = ['dashboard:read', 'products:read', 'products:write', 'inventory:read', 'inventory:write', 'orders:read', 'orders:write', 'customers:read', 'customers:manage', 'coupons:write', 'reviews:moderate', 'returns:manage', 'refunds:process', 'analytics:read', 'content:write', 'newsletter:read', 'messages:read', 'staff:manage', 'settings:manage', 'audit:read'];
const pag = { page: 1, limit: 20, total: 1, pages: 1 };
const list = (rows, meta = {}) => ({ success: true, data: rows, meta: { pagination: pag, ...meta } });
const one = (data) => ({ success: true, data });
const now = new Date().toISOString();
const oid = (n) => String(n).padStart(24, 'a');
const trend = Array.from({ length: 14 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, revenue: i * 100000, orders: i }));
const product = { _id: oid(1), id: oid(1), name: 'Bias Slip Dress', slug: 'bias-slip-dress-women', description: 'A bias-cut slip dress in matte satin.', gender: 'women', category: oid(2), collections: [oid(3)], tags: ['dress'], price: 940000, salePrice: null, status: 'published', featured: false, materials: 'Satin', care: ['Dry clean'], details: ['Fits true'], images: [{ url: '/media/seed/x.svg', alt: 'Front', color: 'Ink', order: 0 }], variants: [{ id: oid(4), sku: 'NS-BIAS-INK-M', color: { name: 'Ink', hex: '#181510' }, size: 'M', active: true, stock: 5, reserved: 1, lowStockThreshold: 5 }], seo: {} };
const order = { id: oid(5), orderNumber: 'NS-2610-ABC123', status: 'confirmed', paymentStatus: 'captured', total: 940000, itemCount: 1, customer: { id: oid(6), name: 'Ananya Raghavan', email: 'a@x.com', phone: '+91 98765 43210' }, createdAt: now, attention: null,
  items: [{ _id: oid(7), name: 'Bias Slip Dress', color: 'Ink', size: 'M', sku: 'NS-BIAS-INK-M', qty: 1, unitPrice: 940000, lineTotal: 940000, image: { url: '/media/seed/x.svg' } }], shippingAddress: { fullName: 'Ananya', line1: '14 Test St', city: 'Chennai', state: 'Tamil Nadu', pincode: '600020', phone: '+91 98765 43210' },
  delivery: { label: 'Standard delivery' }, totals: { subtotal: 940000, discount: 0, shipping: 29900, tax: 47000, total: 1016900 }, statusHistory: [{ status: 'confirmed', at: now }], payments: [{ id: oid(8), provider: 'razorpay', providerOrderId: 'order_1', providerPaymentId: 'pay_1', amount: 1016900, status: 'captured', method: 'upi' }], refunds: [], returns: [], allowedTransitions: ['processing', 'cancelled'] };
const ret = { id: oid(9), returnNumber: 'RT-AB12CD', status: 'requested', orderNumber: 'NS-2610-ABC123', orderId: oid(5), customer: { name: 'Ananya', email: 'a@x.com' }, estimatedRefund: 940000, createdAt: now, items: [{ name: 'Bias Slip Dress', color: 'Ink', size: 'M', qty: 1, unitPrice: 940000, reason: 'wrong_size' }], allowed: ['approved', 'rejected'], history: [] };

const ROUTES = [
  ['/permissions', one({ role: 'super_admin', permissions: ALL, staff: { id: oid(20), name: 'Store Admin', email: 'admin@x.com', role: 'super_admin', mustChangePassword: false } })],
  ['/dashboard', one({ periodDays: 30, kpis: { revenue: { value: 1842300, change: 12.4 }, orders: { value: 31, change: null }, newCustomers: { value: 8, change: -2 }, averageOrderValue: { value: 59000, change: 0 } }, totals: { customers: 40, publishedProducts: 28, pendingOrders: 3, refundsAwaiting: 1, returnsAwaitingReview: 2 }, trend, lowStock: [{ sku: 'NS-A', product: 'Wool Overcoat', available: 2 }], bestSellers: [{ productId: oid(1), name: 'Merino Crewneck', units: 9, revenue: 5000 }], recentOrders: [{ id: oid(5), orderNumber: 'NS-2610-ABC123', customer: 'Ananya', status: 'confirmed', total: 940000, createdAt: now }] })],
  ['/analytics', one({ summary: { revenue: 100000, orders: 2, averageOrderValue: 50000, discountsGiven: 0, refunded: 0, refundCount: 0 }, sales: trend.map((t) => ({ period: t.date, revenue: t.revenue, orders: t.orders, units: 1 })), customerAcquisition: [{ period: '2026-10-01', customers: 2 }], categories: [{ category: 'Dresses', revenue: 5000, units: 2 }], topProducts: [{ productId: oid(1), name: 'Bias Slip Dress', units: 2, revenue: 5000 }], paymentMethods: [{ method: 'upi', count: 1, amount: 5000 }], coupons: [{ code: 'NESSENCE10', uses: 1, discount: 100 }], traffic: { configured: false, message: 'No web analytics integration is connected.' } })],
  ['/products/' + oid(1), one(product)],
  ['/products', list([{ id: oid(1), name: 'Bias Slip Dress', slug: 'bias-slip-dress-women', status: 'published', gender: 'women', category: 'Dresses', price: 940000, salePrice: null, image: '/media/seed/x.svg', available: 4, updatedAt: now }])],
  ['/categories', one([{ _id: oid(2), name: 'Dresses', slug: 'dresses', genders: ['women'], sortOrder: 0, active: true }])],
  ['/collections', one([{ _id: oid(3), name: 'Quiet Evening', slug: 'quiet-evening', genders: ['women'], sortOrder: 0, active: true, season: 'AW26' }])],
  ['/inventory', list([{ variantId: oid(4), sku: 'NS-BIAS-INK-M', product: 'Bias Slip Dress', productId: oid(1), color: 'Ink', size: 'M', stock: 5, reserved: 1, available: 4, lowStockThreshold: 5 }])],
  ['/orders/' + oid(5), one(order)], ['/orders', list([order])],
  ['/returns/' + oid(9), one(ret)], ['/returns', list([ret])],
  ['/refunds', list([{ id: oid(10), orderId: oid(5), orderNumber: 'NS-2610-ABC123', customer: { name: 'Ananya' }, amount: 940000, reason: 'customer_cancelled', status: 'pending', createdAt: now }])],
  ['/customers/' + oid(6), one({ id: oid(6), name: 'Ananya Raghavan', email: 'a@x.com', status: 'active', emailVerified: true, registeredAt: now, orders: 1, totalSpend: 940000, locations: ['Chennai, Tamil Nadu'], recentOrders: [{ id: oid(5), orderNumber: 'NS-2610-ABC123', status: 'confirmed', total: 940000, createdAt: now }] })],
  ['/customers', list([{ id: oid(6), name: 'Ananya Raghavan', email: 'a@x.com', status: 'active', emailVerified: true, registeredAt: now, orders: 1, totalSpend: 940000, lastOrder: now }])],
  ['/coupons', one([{ _id: oid(11), code: 'NESSENCE10', type: 'percent', value: 10, minOrder: 200000, maxDiscount: 300000, usedCount: 2, active: true }])],
  ['/review-reports', list([{ id: oid(12), reason: 'spam', status: 'open', reporter: 'Priya', review: { id: oid(13), rating: 2, body: 'Buy cheap watches here', status: 'approved', product: 'Bias Slip Dress' } }])],
  ['/reviews', list([{ id: oid(13), rating: 4, title: 'Lovely', body: 'Beautiful drape and weight.', status: 'pending', reportCount: 0, createdAt: now, product: { id: oid(1), name: 'Bias Slip Dress' }, customer: { name: 'Priya', email: 'p@x.com' } }])],
  ['/newsletter', list([{ id: oid(14), email: 'sub@x.com', status: 'subscribed', source: 'footer', subscribedAt: now }], { counts: { subscribed: 1, pending: 2 } })],
  ['/contact-messages/' + oid(15), one({ id: oid(15), name: 'Asha', email: 'asha@x.com', subject: 'Sizing question', message: 'Does it run small?', category: 'product', status: 'new', createdAt: now, replies: [] })],
  ['/contact-messages', list([{ id: oid(15), name: 'Asha', email: 'asha@x.com', category: 'product', subject: 'Sizing question', status: 'new', replies: 0, createdAt: now }], { newCount: 1 })],
  ['/journal/' + oid(16), one({ id: oid(16), title: 'On wool', slug: 'on-wool', excerpt: 'Weight matters a great deal.', author: 'Studio', tags: ['materials'], status: 'published', content: 'Body text that is long enough to pass.', coverImage: null })],
  ['/journal', list([{ id: oid(16), title: 'On wool', slug: 'on-wool', author: 'Studio', status: 'published', publishedAt: now, updatedAt: now }])],
  ['/content', one([{ key: 'about', title: 'About Nessence', body: 'Hello', updatedAt: now }, { key: 'faq', title: 'FAQ', body: '', data: { items: [{ q: 'How long?', a: 'Four days.' }] }, updatedAt: now }])],
  ['/settings', one({ storeName: 'Nessence', supportEmail: '', supportPhone: '', social: {} })],
  ['/staff', one([{ id: oid(20), name: 'Store Admin', email: 'admin@x.com', role: 'super_admin', active: true, mustChangePassword: false, lastLoginAt: now }, { id: oid(21), name: 'Sam Support', email: 'sam@x.com', role: 'support', active: true, mustChangePassword: true }])],
  ['/audit-logs', list([{ id: oid(17), actor: 'admin@x.com', action: 'order.status_changed', resource: 'Order', resourceId: oid(5), metadata: { from: 'confirmed', to: 'processing' }, ip: '::1', at: now }])],
];
const respond = (url) => { const path = new URL(url, 'http://x').pathname.replace('/api/admin', ''); const hit = ROUTES.find(([p]) => path === p); return hit ? hit[1] : { success: false, code: 'NOT_FOUND', message: `no fixture for ${path}` }; };

let errors;
beforeEach(() => {
  errors = []; vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a.map(String).join(' ')));
  globalThis.fetch = vi.fn(async (url) => { const body = respond(String(url)); return new Response(JSON.stringify(body), { status: body.success ? 200 : 404, headers: { 'content-type': 'application/json' } }); });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const mount = (path) => render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/admin/*" element={<AdminApp />} /></Routes></MemoryRouter>);
const realErrors = () => errors.filter((e) => !/not wrapped in act|ReactDOMTestUtils/.test(e));

const PAGES = [
  ['/admin', 'Recent orders'], ['/admin/analytics', 'Sales by category'], ['/admin/products', 'Search name or slug', 'placeholder'], ['/admin/products/new', 'Pricing'], ['/admin/products/' + oid(1) + '/edit', 'Variants & stock'],
  ['/admin/categories', 'Dresses'], ['/admin/collections', 'Quiet Evening'], ['/admin/inventory', 'NS-BIAS-INK-M'], ['/admin/orders', 'Ananya Raghavan'], ['/admin/orders/' + oid(5), 'Payments & refunds'],
  ['/admin/returns', 'RT-AB12CD'], ['/admin/refunds', 'Money owed to customers', 'sub'], ['/admin/customers', 'a@x.com'], ['/admin/customers/' + oid(6), 'Recent orders'], ['/admin/coupons', 'NESSENCE10'],
  ['/admin/reviews', 'Beautiful drape and weight.'], ['/admin/newsletter', 'Export subscribers (CSV)'], ['/admin/contact-messages', 'Sizing question'], ['/admin/journal', 'On wool'], ['/admin/journal/' + oid(16), 'Cover image'],
  ['/admin/content', 'Cookie policy'], ['/admin/settings', 'Social links'], ['/admin/staff', 'Sam Support'], ['/admin/audit-logs', 'order.status_changed'],
];

describe('admin screens render against the API contract', () => {
  it.each(PAGES)('%s', async (path, text, mode) => {
    mount(path);
    if (mode === 'placeholder') await screen.findByPlaceholderText(text); else await screen.findAllByText(new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), {}, { timeout: 8000 });
    expect(realErrors()).toEqual([]);
  });

  it('sidebar only lists sections the role may use', async () => {
    globalThis.fetch = vi.fn(async (url) => { const b = String(url).includes('/permissions') ? one({ role: 'support', permissions: ['dashboard:read', 'orders:read', 'customers:read'], staff: { id: oid(30), name: 'Sam', email: 's@x.com', role: 'support', mustChangePassword: false } }) : respond(String(url)); return new Response(JSON.stringify(b), { status: b.success ? 200 : 404 }); });
    mount('/admin');
    await screen.findByText('Orders'); // nav item
    expect(screen.queryByRole('link', { name: 'Staff' })).toBeNull(); expect(screen.queryByRole('link', { name: 'Refunds' })).toBeNull(); expect(screen.queryByRole('link', { name: 'Products' })).toBeNull();
  });

  it('a forbidden URL shows a permission message, not the page', async () => {
    globalThis.fetch = vi.fn(async (url) => { const b = String(url).includes('/permissions') ? one({ role: 'support', permissions: ['dashboard:read'], staff: { id: oid(30), name: 'Sam', email: 's@x.com', role: 'support', mustChangePassword: false } }) : respond(String(url)); return new Response(JSON.stringify(b), { status: 200 }); });
    mount('/admin/staff');
    await screen.findByText(/don’t have permission/);
  });

  it('unauthenticated visitors are sent to the login form', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ success: false, code: 'UNAUTHORIZED', message: 'Authentication required' }), { status: 401 }));
    mount('/admin/orders');
    await screen.findByText('Staff only. Sign-ins and actions are recorded.');
  });

  it('staff with a temporary password must choose a new one before seeing anything', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(one({ role: 'support', permissions: ['dashboard:read'], staff: { id: oid(30), name: 'Sam', email: 's@x.com', role: 'support', mustChangePassword: true } })), { status: 200 }));
    mount('/admin');
    await screen.findByText('Choose a new password');
    expect(screen.queryByText('Recent orders')).toBeNull();
  });

  it('inventory adjust opens with live preview and blocks nothing it should not', async () => {
    mount('/admin/inventory'); fireEvent.click(await screen.findByRole('button', { name: 'Adjust' }));
    await screen.findByText(/Adjust stock/); fireEvent.change(screen.getByLabelText(/Change \(use a negative/), { target: { value: '-3' } });
    await screen.findByText(/New stock will be 2/);
  });
});

const posts = () => globalThis.fetch.mock.calls.filter(([, init]) => init && init.method && init.method !== 'GET').map(([url, init]) => ({ url: new URL(String(url), 'http://x').pathname.replace('/api/admin', ''), method: init.method, body: init.body && typeof init.body === 'string' ? JSON.parse(init.body) : init.body }));
const withWrites = () => { const base = globalThis.fetch; globalThis.fetch = vi.fn(async (url, init) => { if (init?.method && init.method !== 'GET') return new Response(JSON.stringify(one({ id: oid(1), _id: oid(1), status: 'processed' })), { status: 200 }); return base(url, init); }); };

describe('forms send correct payloads (rupees → paise, nulls, ids)', () => {
  it('new product: ₹ price becomes integer paise; empty sale price is null; variants spec included', async () => {
    mount('/admin/products/new'); withWrites();
    await screen.findByText('Pricing');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Wool Scarf' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'A soft wool scarf for cold evenings.' } });
    await screen.findByRole('option', { name: 'Dresses' }); fireEvent.change(screen.getByLabelText('Category'), { target: { value: oid(2) } });
    fireEvent.change(screen.getByLabelText('Price (₹)'), { target: { value: '1499.50' } });
    fireEvent.change(screen.getByLabelText('Colour name'), { target: { value: 'Oxblood' } });
    fireEvent.change(screen.getByLabelText('Starting stock per variant'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(posts().length).toBe(1));
    const { url, method, body } = posts()[0];
    expect(method).toBe('POST'); expect(url).toBe('/products');
    expect(body.price).toBe(149950); expect(Number.isInteger(body.price)).toBe(true);
    expect(body.salePrice).toBeNull(); expect(body.status).toBe('draft'); expect(body.categoryId).toBe(oid(2));
    expect(body.variants.colors[0].name).toBe('Oxblood'); expect(body.variants.stock).toBe(12); expect(body.variants.sizes).toEqual(['XS', 'S', 'M', 'L', 'XL']);
  });

  it('edit product: PATCH keeps image order/alt and converts stored paise back to rupees in the form', async () => {
    mount('/admin/products/' + oid(1) + '/edit'); withWrites();
    await screen.findByText('Variants & stock');
    await waitFor(() => expect(screen.getByLabelText('Price (₹)').value).toBe('9400'));
    fireEvent.change(screen.getByLabelText('Sale price (₹)'), { target: { value: '7999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(posts().length).toBe(1));
    const { url, method, body } = posts()[0];
    expect(method).toBe('PATCH'); expect(url).toBe('/products/' + oid(1));
    expect(body.price).toBe(940000); expect(body.salePrice).toBe(799900);
    expect(body.images).toEqual([{ url: '/media/seed/x.svg', alt: 'Front', color: 'Ink' }]);
  });

  it('coupon: fixed amount is sent in paise, percent as a whole number, expiry as end of day', async () => {
    mount('/admin/coupons'); withWrites();
    fireEvent.click(await screen.findByRole('button', { name: 'New coupon' }));
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'SAVE500' } });
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'fixed' } });
    fireEvent.change(screen.getByLabelText('Amount off (₹)'), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText('Minimum order (₹)'), { target: { value: '4000' } });
    fireEvent.change(screen.getByLabelText('Expires (end of day)'), { target: { value: '2026-12-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(posts().length).toBe(1));
    const { url, body } = posts()[0];
    expect(url).toBe('/coupons'); expect(body).toMatchObject({ code: 'SAVE500', type: 'fixed', value: 50000, minOrder: 400000, active: true });
    expect(body.expiresAt).toBe('2026-12-31T23:59:59'); expect('maxDiscount' in body).toBe(false);
  });

  it('refund is only sent after an explicit confirmation, and calls the process endpoint', async () => {
    mount('/admin/refunds'); withWrites();
    fireEvent.click(await screen.findByRole('button', { name: 'Process' }));
    await screen.findByText(/original payment method through the payment gateway/);
    expect(posts().length).toBe(0);                                  // opening the dialog sends nothing
    fireEvent.click(screen.getByRole('button', { name: 'Send refund' }));
    await waitFor(() => expect(posts().length).toBe(1));
    expect(posts()[0]).toMatchObject({ method: 'POST', url: '/refunds/' + oid(10) + '/process' });
  });

  it('order status action asks first, then posts the chosen status with the note', async () => {
    mount('/admin/orders/' + oid(5)); withWrites();
    fireEvent.click(await screen.findByRole('button', { name: 'Mark processing' }));
    fireEvent.change(await screen.findByLabelText(/Note \(optional/), { target: { value: 'Picked' } });
    expect(posts().length).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm processing' }));
    await waitFor(() => expect(posts().length).toBe(1));
    expect(posts()[0]).toMatchObject({ method: 'POST', url: '/orders/' + oid(5) + '/status', body: { status: 'processing', note: 'Picked' } });
  });

  it('rejecting a return requires a message; approving does not', async () => {
    mount('/admin/returns'); withWrites();
    fireEvent.click(await screen.findByText('RT-AB12CD'));
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(posts().length).toBe(1));
    expect(posts()[0]).toMatchObject({ url: '/returns/' + oid(9) + '/decision', body: { action: 'approve' } });
  });
});
