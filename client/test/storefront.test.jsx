import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App.jsx';
import { AuthProvider } from '../src/context/AuthContext.jsx';
import { CartProvider } from '../src/context/CartContext.jsx';
import { SettingsProvider } from '../src/context/SettingsContext.jsx';
import { parseRichText, excerptOf } from '../src/utils/richText.js';
import { RichText } from '../src/components/common/RichText.jsx';

// ---------- parser (pure) ----------
describe('parseRichText (CMS plain-text format)', () => {
  it('parses headings, paragraphs with line breaks, lists', () => {
    const b = parseRichText('Intro line one\nline two\n\n## Delivery\nStandard takes 4 days.\n\n1. Request\n2. Review\n\n- one\n- two');
    expect(b.map((x) => x.type)).toEqual(['p', 'h2', 'p', 'ol', 'ul']);
    expect(b[0].lines).toEqual(['Intro line one', 'line two']); expect(b[3].items).toEqual(['Request', 'Review']);
  });
  it('a table can follow its heading directly (as in the seeded size guide) and ends at the next section', () => {
    const b = parseRichText('## Women\nSize | Bust | Waist\nXS | 80 | 62\nS | 84 | 66\n\n## Men\nSize | Chest\nM | 98');
    expect(b.map((x) => x.type)).toEqual(['h2', 'table', 'h2', 'table']);
    expect(b[1].head).toEqual(['Size', 'Bust', 'Waist']); expect(b[1].rows).toHaveLength(2); expect(b[3].rows).toEqual([['M', '98']]);
  });
  it('a lone "a | b" line is plain text, not a one-row table', () => { expect(parseRichText('Fast | cheap')[0]).toEqual({ type: 'p', lines: ['Fast | cheap'] }); });
  it('tolerates empty/undefined input and Windows newlines', () => { expect(parseRichText(undefined)).toEqual([]); expect(parseRichText('a\r\n\r\nb').map((x) => x.type)).toEqual(['p', 'p']); });
  it('excerptOf returns the first paragraph, trimmed for meta descriptions', () => {
    expect(excerptOf('## Title\nHello there.\n\nSecond.')).toBe('Hello there.');
    expect(excerptOf('x'.repeat(400), 50)).toHaveLength(50);
  });
});

describe('RichText renders content as text only (no markup injection)', () => {
  afterEach(cleanup);
  it('HTML and scripts in content stay inert text', () => {
    const { container } = render(<RichText text={'## <img src=x onerror=alert(1)>\n<script>alert(1)</script> <b>bold</b>\n\nSize | A\n<i>x</i> | 1\nB | 2'} />);
    expect(container.querySelector('script')).toBeNull(); expect(container.querySelector('img')).toBeNull(); expect(container.querySelector('b')).toBeNull(); expect(container.querySelector('i')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
  });
  it('tables get column and row headers for screen readers', () => {
    const { container } = render(<RichText text={'Size | Bust\nXS | 80\nS | 84'} />);
    expect(container.querySelectorAll('th[scope="col"]')).toHaveLength(2); expect(container.querySelectorAll('tbody th[scope="row"]')).toHaveLength(2);
  });
});

// ---------- app-level, with the API stubbed at the network boundary ----------
const now = new Date().toISOString();
const PAGES = { about: ['About Nessence', 'We make clothes.\n\n## Cloth before trend\nFabric first.'], 'returns-policy': ['Returns policy', 'Return within 14 days.'], 'size-guide': ['Size guide', '## Women\nSize | Bust\nXS | 80\nS | 84'], privacy: ['Privacy policy', 'We care.'], terms: ['Terms', 'Rules.'], 'cookie-policy': ['Cookie policy', 'Only essential.'], 'refund-policy': ['Refund policy', 'Refunds.'], shipping: ['Shipping', 'Delivery info.'], careers: ['Careers', 'No roles now.'] };
const ok = (data, status = 200, meta) => ({ status, body: { success: true, data, ...(meta ? { meta } : {}) } });
const fail = (status, code, message) => ({ status, body: { success: false, code, message } });
let calls; let settings; let overrides;
const emptyCart = { items: [], saved: [], coupon: null, couponError: null, canCheckout: false, totals: { subtotal: 0, discount: 0, shipping: 0, tax: 0, total: 0, itemCount: 0 } };
const route = (method, path, body) => {
  if (overrides[`${method} ${path}`]) return overrides[`${method} ${path}`](body);
  if (path === '/api/auth/me' || path === '/api/auth/refresh') return fail(401, 'UNAUTHORIZED', 'Authentication required');
  if (path === '/api/cart') return ok(emptyCart);
  if (path === '/api/settings/public') return ok(settings);
  if (path === '/api/products') return ok([], 200, { pagination: { page: 1, limit: 12, total: 0, pages: 1 }, facets: { colors: [], sizes: [], price: null } });
  if (path === '/api/categories') return ok([]);
  if (path === '/api/newsletter') return ok({ message: 'Almost there — check your inbox to confirm your subscription.' }, 202);
  const m = /^\/api\/content\/([a-z-]+)$/.exec(path);
  if (m) {
    if (m[1] === 'faq') return ok({ key: 'faq', title: 'Frequently asked questions', body: '', data: { items: [{ q: 'How long does delivery take?', a: 'Four to six days.' }] }, updatedAt: now });
    return PAGES[m[1]] ? ok({ key: m[1], title: PAGES[m[1]][0], body: PAGES[m[1]][1], updatedAt: now }) : fail(404, 'PAGE_NOT_FOUND', 'This page has not been published yet');
  }
  return fail(404, 'NOT_FOUND', `no stub for ${method} ${path}`);
};
beforeEach(() => {
  calls = []; overrides = {}; settings = { storeName: 'Nessence', supportEmail: null, supportPhone: null, social: { instagram: 'https://www.instagram.com/nessence' } };
  vi.spyOn(console, 'error').mockImplementation(() => {});
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    const path = new URL(String(url), 'http://x').pathname; const method = init.method ?? 'GET'; const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, body }); const r = route(method, path, body);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
  });
  window.scrollTo = () => {};
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const mount = (path, strict = false) => {
  const tree = <MemoryRouter initialEntries={[path]}><SettingsProvider><AuthProvider><CartProvider><App /></CartProvider></AuthProvider></SettingsProvider></MemoryRouter>;
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
};
const loaded = () => waitFor(() => expect(screen.queryByText(/^Loading…$/)).toBeNull());

describe('content pages', () => {
  it.each(Object.keys(PAGES).map((k) => [k]))('/%s renders the CMS page from the API', async (key) => {
    mount('/' + key); expect(await screen.findByRole('heading', { level: 1, name: PAGES[key][0] })).toBeTruthy();
    expect(calls.some((c) => c.path === `/api/content/${key}`)).toBe(true);
  });
  it('renders rich content: heading, and a real table with headers', async () => {
    mount('/size-guide'); await screen.findByRole('heading', { name: 'Size guide', level: 1 });
    expect(screen.getByRole('heading', { name: 'Women', level: 2 })).toBeTruthy(); expect(screen.getByRole('columnheader', { name: 'Bust' })).toBeTruthy(); expect(screen.getByRole('rowheader', { name: 'XS' })).toBeTruthy();
  });
  it('FAQ renders items as expandable details', async () => {
    mount('/faq'); const q = await screen.findByText('How long does delivery take?'); expect(q.closest('details')).toBeTruthy(); expect(screen.getByText('Four to six days.')).toBeTruthy();
  });
  it('an unpublished page shows an honest not-available state (no "coming soon")', async () => {
    overrides['GET /api/content/careers'] = () => fail(404, 'PAGE_NOT_FOUND', 'x'); mount('/careers');
    await screen.findByText('This page isn’t available'); expect(screen.queryByText(/coming soon/i)).toBeNull();
  });
  it('a server failure shows a retry state', async () => {
    overrides['GET /api/content/terms'] = () => fail(500, 'INTERNAL_ERROR', 'Something went wrong on our side.'); mount('/terms');
    await screen.findByRole('button', { name: 'Try again' });
  });
  it('/returns redirects to the CMS returns policy, which offers to start a return', async () => {
    mount('/returns'); await screen.findByRole('heading', { name: 'Returns policy', level: 1 });
    expect(screen.getByRole('link', { name: 'Sign in to start a return' }).getAttribute('href')).toBe('/login');
  });
});

describe('footer', () => {
  it('shows only social links the store has configured, opening safely in a new tab', async () => {
    mount('/about'); await screen.findByRole('heading', { name: 'About Nessence', level: 1 });
    const social = await screen.findByRole('list', { name: 'Social' });
    const links = within(social).getAllByRole('link'); expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('https://www.instagram.com/nessence'); expect(links[0].getAttribute('rel')).toContain('noopener'); expect(links[0].getAttribute('target')).toBe('_blank');
    expect(screen.queryByRole('link', { name: /facebook/i })).toBeNull(); expect(screen.queryByRole('link', { name: /youtube/i })).toBeNull();
  });
  it('shows no social section at all when nothing is configured, and survives a settings failure', async () => {
    overrides['GET /api/settings/public'] = () => fail(500, 'INTERNAL_ERROR', 'x'); mount('/about'); await screen.findByRole('heading', { name: 'About Nessence', level: 1 });
    await waitFor(() => expect(calls.some((c) => c.path === '/api/settings/public')).toBe(true)); expect(screen.queryByRole('list', { name: 'Social' })).toBeNull(); expect(screen.getByRole('contentinfo')).toBeTruthy();
  });
  it('crawl: every internal footer link leads to a real page (not the 404)', async () => {
    mount('/about'); await screen.findByRole('heading', { name: 'About Nessence', level: 1 });
    const hrefs = [...new Set(within(screen.getByRole('contentinfo')).getAllByRole('link').map((a) => a.getAttribute('href')).filter((h) => h.startsWith('/')))];
    expect(hrefs.length).toBeGreaterThanOrEqual(15); cleanup();
    for (const href of hrefs) {
      mount(href); await loaded();
      expect(screen.queryByText('Nothing at this address.'), `footer link ${href} is a dead link`).toBeNull(); cleanup();
    }
  }, 60000);
});

describe('newsletter', () => {
  it('footer form posts the email (and source) and shows the server’s double-opt-in message', async () => {
    mount('/about'); const input = await screen.findByLabelText('Email address');
    fireEvent.change(input, { target: { value: 'asha@example.com' } }); fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    await screen.findByText(/check your inbox to confirm/);
    expect(calls.filter((c) => c.path === '/api/newsletter')).toEqual([{ method: 'POST', path: '/api/newsletter', body: { email: 'asha@example.com', source: 'footer' } }]);
  });
  it('shows validation and rate-limit errors from the API', async () => {
    overrides['POST /api/newsletter'] = () => fail(429, 'NEWSLETTER_RATE_LIMITED', 'Too many requests. Please try again shortly.');
    mount('/about'); fireEvent.change(await screen.findByLabelText('Email address'), { target: { value: 'a@b.co' } }); fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Too many requests/);
  });
  it('/newsletter/confirm sends the single-use token exactly once, even under StrictMode', async () => {
    mount('/newsletter/confirm?token=' + 'a'.repeat(64), true);
    overrides['POST /api/newsletter/confirm'] = () => ok({ subscribed: true });
    await screen.findByText('You’re subscribed.');
    expect(calls.filter((c) => c.path === '/api/newsletter/confirm')).toHaveLength(1); expect(calls.find((c) => c.path === '/api/newsletter/confirm').body).toEqual({ token: 'a'.repeat(64) });
  });
  it('/newsletter/confirm with a used/invalid token shows the server’s error', async () => {
    overrides['POST /api/newsletter/confirm'] = () => fail(400, 'INVALID_TOKEN', 'This confirmation link is invalid or has already been used');
    mount('/newsletter/confirm?token=' + 'b'.repeat(64)); await screen.findByText(/invalid or has already been used/);
  });
  it('/newsletter/confirm without a token never calls the API', async () => {
    mount('/newsletter/confirm'); await screen.findByText('Link not valid.'); expect(calls.some((c) => c.path === '/api/newsletter/confirm')).toBe(false);
  });
  it('/newsletter/unsubscribe requires an explicit click (scanners opening the link do nothing)', async () => {
    overrides['POST /api/newsletter/unsubscribe'] = () => ok({ unsubscribed: true });
    mount('/newsletter/unsubscribe?token=' + 'c'.repeat(48)); const btn = await screen.findByRole('button', { name: 'Unsubscribe' });
    expect(calls.some((c) => c.path === '/api/newsletter/unsubscribe')).toBe(false);
    fireEvent.click(btn); await screen.findByText('You’ve been unsubscribed.');
    expect(calls.find((c) => c.path === '/api/newsletter/unsubscribe').body).toEqual({ token: 'c'.repeat(48) });
  });
});

describe('email verification link (existing flow, StrictMode regression)', () => {
  it('sends the single-use verify token once and shows success', async () => {
    overrides['POST /api/auth/verify-email'] = () => ok({ verified: true });
    mount('/verify-email?token=' + 'd'.repeat(64), true); expect((await screen.findAllByText('Email verified.')).length).toBeGreaterThan(0);
    expect(calls.filter((c) => c.path === '/api/auth/verify-email')).toHaveLength(1);
  });
});
