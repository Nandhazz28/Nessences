import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { request, onSessionExpired, __resetHttpForTests } from '../src/services/http.js';
import { AuthProvider, useAuth } from '../src/context/AuthContext.jsx';
import { CartProvider, useCart } from '../src/context/CartContext.jsx';
import { ErrorState } from '../src/components/common/States.jsx';
import { Notice } from '../src/components/common/Notice.jsx';
import Wishlist from '../src/pages/Wishlist.jsx';

const ok = (data, status = 200) => new Response(JSON.stringify({ success: true, data }), { status, headers: { 'content-type': 'application/json' } });
const fail = (status, code, message = 'x') => new Response(JSON.stringify({ success: false, code, message }), { status, headers: { 'content-type': 'application/json' } });
const emptyCart = (owner = 'user', n = 0) => ({ items: [], saved: [], owner, totals: { itemCount: n, subtotal: 0, total: 0 } });

function network(rules) {
  const calls = [];
  const f = vi.fn(async (url, init = {}) => {
    const path = String(url).split('?')[0]; const method = init.method ?? 'GET'; calls.push(`${method} ${path}`);
    for (const [m, re, h] of rules) if (m === method && re.test(path)) return typeof h === 'function' ? h(calls) : h.clone();
    throw new Error(`unscripted request ${method} ${path}`);
  });
  vi.stubGlobal('fetch', f); return { calls, count: (s) => calls.filter((c) => c.includes(s)).length };
}

beforeEach(() => __resetHttpForTests());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('http: coordinated silent refresh', () => {
  it('many simultaneous 401s share ONE refresh, and every request is retried and succeeds', async () => {
    let refreshed = false;
    const n = network([
      ['POST', /\/api\/auth\/refresh$/, async () => { await new Promise((r) => setTimeout(r, 30)); refreshed = true; return ok({}); }],
      ['GET', /\/api\/(wishlist|orders|account\/addresses)$/, () => (refreshed ? ok(['fine']) : fail(401, 'TOKEN_EXPIRED', 'Authentication required'))],
    ]);
    const rs = await Promise.all([request('/api/wishlist'), request('/api/orders'), request('/api/account/addresses'), request('/api/wishlist')]);
    expect(rs.map((r) => r.data)).toEqual([['fine'], ['fine'], ['fine'], ['fine']]);
    expect(n.count('/api/auth/refresh')).toBe(1);
  });

  it('a request whose 401 arrives after a refresh already succeeded retries without refreshing again', async () => {
    let refreshed = false; let slow;
    const n = network([
      ['POST', /\/refresh$/, () => { refreshed = true; return ok({}); }],
      ['GET', /\/api\/fast$/, () => (refreshed ? ok('fast') : fail(401, 'TOKEN_EXPIRED'))],
      ['GET', /\/api\/slow$/, async () => { await new Promise((r) => { slow = r; }); return refreshed ? ok('slow') : fail(401, 'TOKEN_EXPIRED'); }],
    ]);
    const s = request('/api/slow'); await new Promise((r) => setTimeout(r, 5));
    await request('/api/fast'); // triggers the refresh while "slow" is still in flight with the old cookie
    refreshed = false; slow(); // the slow request now comes back 401 (it carried the old cookie)
    refreshed = true;
    expect((await s).data).toBe('slow'); expect(n.count('/refresh')).toBe(1);
  });

  it('never loops: if the retried request is still 401, that is the answer', async () => {
    const n = network([['POST', /\/refresh$/, ok({})], ['GET', /\/api\/nope$/, fail(401, 'UNAUTHORIZED', 'Authentication required')]]);
    await expect(request('/api/nope')).rejects.toMatchObject({ status: 401 });
    expect(n.count('/refresh')).toBe(1); expect(n.count('GET /api/nope')).toBe(2);
  });

  it('refresh refused by the server: listeners are told once, and the error is a plain "session ended"', async () => {
    network([['POST', /\/refresh$/, fail(401, 'REFRESH_EXPIRED')], ['GET', /\/api\/wishlist$/, fail(401, 'TOKEN_EXPIRED', 'Authentication required')]]);
    const seen = vi.fn(); onSessionExpired(seen);
    const e = await request('/api/wishlist').catch((x) => x);
    expect(e.status).toBe(401); expect(e.code).toBe('SESSION_EXPIRED'); expect(e.message).not.toMatch(/Authentication required/);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('after the session ends, an endpoint that works for guests (the bag) is retried and succeeds as a guest', async () => {
    let cleared = false;
    network([['POST', /\/refresh$/, () => { cleared = true; return fail(401, 'INVALID_REFRESH_TOKEN'); }], ['GET', /\/api\/cart$/, () => (cleared ? ok(emptyCart('guest')) : fail(401, 'TOKEN_EXPIRED'))]]);
    expect((await request('/api/cart')).data.owner).toBe('guest');
  });

  it.each([['network failure', () => { throw new TypeError('Failed to fetch'); }], ['server error', () => fail(503, 'SERVICE_UNAVAILABLE')], ['rate limit', () => fail(429, 'RATE_LIMITED')]])('a refresh that fails with a %s is NOT a logout', async (_n, refreshHandler) => {
    network([['POST', /\/refresh$/, refreshHandler], ['GET', /\/api\/wishlist$/, fail(401, 'TOKEN_EXPIRED')]]);
    const seen = vi.fn(); onSessionExpired(seen);
    const e = await request('/api/wishlist').catch((x) => x);
    expect(e.code).toBe('SESSION_REFRESH_FAILED'); expect(e.isTransient).toBe(true); expect(seen).not.toHaveBeenCalled();
  });

  it('login/register/refresh/logout 401s are answers, not triggers for a refresh', async () => {
    const n = network([['POST', /\/api\/auth\/login$/, fail(401, 'INVALID_CREDENTIALS', 'Incorrect email or password')]]);
    await expect(request('/api/auth/login', { method: 'POST', body: { email: 'a', password: 'b' } })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(n.count('/refresh')).toBe(0);
  });

  it('a dead backend (proxy 502 with an HTML body, or no connection) gives a clear, non-auth error', async () => {
    network([['GET', /\/api\/products$/, new Response('<html>Bad Gateway</html>', { status: 502 })]]);
    const e = await request('/api/products').catch((x) => x);
    expect(e.status).toBe(502); expect(e.isTransient).toBe(true); expect(e.message).toMatch(/temporarily unavailable/);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    expect(await request('/api/products').catch((x) => x)).toMatchObject({ status: 0, isNetwork: true });
  });
});

function Probe({ onAuth }) { const a = useAuth(); onAuth(a); return <div data-testid="state">{a.ready ? (a.user ? `user:${a.user.id}` : a.authError ? 'unknown' : 'anon') : 'loading'}</div>; }
const mountAuth = (onAuth = () => {}) => render(<MemoryRouter><AuthProvider><Probe onAuth={onAuth} /></AuthProvider></MemoryRouter>);

describe('AuthContext', () => {
  it('restores the session on load (page reload)', async () => {
    network([['GET', /\/api\/auth\/me$/, ok({ user: { id: 'u1', name: 'Asha' } })]]);
    mountAuth(); await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('user:u1'));
  });
  it('a visitor with no session is simply anonymous', async () => {
    network([['GET', /\/api\/auth\/me$/, fail(401, 'UNAUTHORIZED')], ['POST', /\/refresh$/, fail(401, 'NO_REFRESH_TOKEN')]]);
    mountAuth(); await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('anon'));
  });
  it('REGRESSION: a network failure while checking the session is "unknown", not "signed out" — and recovers when asked again', async () => {
    let up = false; let ctx;
    network([['GET', /\/api\/auth\/me$/, () => { if (!up) throw new TypeError('Failed to fetch'); return ok({ user: { id: 'u1' } }); }]]);
    mountAuth((a) => { ctx = a; });
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('unknown'));
    up = true; await act(async () => { await ctx.revalidate(); });
    expect(screen.getByTestId('state').textContent).toBe('user:u1');
  });
  it('REGRESSION: when the server ends the session, the user is dropped immediately (no stale account data)', async () => {
    let dead = false; let ctx;
    network([['GET', /\/api\/auth\/me$/, ok({ user: { id: 'u1' } })], ['GET', /\/api\/wishlist$/, () => (dead ? fail(401, 'TOKEN_EXPIRED') : ok([]))], ['POST', /\/refresh$/, fail(401, 'REFRESH_EXPIRED')]]);
    mountAuth((a) => { ctx = a; }); await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('user:u1'));
    dead = true; await act(async () => { await request('/api/wishlist').catch(() => {}); });
    expect(screen.getByTestId('state').textContent).toBe('anon'); expect(ctx.user).toBe(null);
  });
  it('login updates state immediately; logout ends the session; a failed logout keeps the user signed in and says so', async () => {
    let ctx; let logoutOutcome = 'ok';
    network([['GET', /\/api\/auth\/me$/, fail(401, 'UNAUTHORIZED')], ['POST', /\/refresh$/, fail(401, 'NO_REFRESH_TOKEN')],
      ['POST', /\/api\/auth\/login$/, ok({ user: { id: 'u9', name: 'Meera' } })],
      ['POST', /\/api\/auth\/logout$/, () => { if (logoutOutcome === 'offline') throw new TypeError('Failed to fetch'); return ok({}); }]]);
    mountAuth((a) => { ctx = a; }); await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('anon'));
    await act(async () => { await ctx.login({ email: 'a@b.co', password: 'x' }); });
    expect(screen.getByTestId('state').textContent).toBe('user:u9');
    logoutOutcome = 'offline';
    await act(async () => { await expect(ctx.logout()).rejects.toMatchObject({ isNetwork: true }); });
    expect(screen.getByTestId('state').textContent).toBe('user:u9');
    logoutOutcome = 'ok'; await act(async () => { await ctx.logout(); });
    expect(screen.getByTestId('state').textContent).toBe('anon');
  });
});

function CartProbe({ onCart }) { const c = useCart(); onCart(c); return <div data-testid="c">{c.cart ? `${c.cart.owner}:${c.count}` : 'none'}</div>; }
const mountCart = (onCart, extra = null) => render(<MemoryRouter><AuthProvider><CartProvider><CartProbe onCart={onCart} />{extra}</CartProvider></AuthProvider></MemoryRouter>);

describe('CartContext', () => {
  it('REGRESSION: an older, slower response can never overwrite a newer bag', async () => {
    let ctx; let releaseSlowGet;
    network([['GET', /\/api\/auth\/me$/, ok({ user: { id: 'u1' } })], ['GET', /\/api\/wishlist$/, ok([])],
      ['GET', /\/api\/cart$/, () => new Promise((r) => { releaseSlowGet = () => r(ok(emptyCart('user', 1))); })],
      ['PATCH', /\/api\/cart\/items\/v1$/, ok(emptyCart('user', 5))]]);
    mountCart((c) => { ctx = c; }); await waitFor(() => expect(releaseSlowGet).toBeTypeOf('function'));
    await act(async () => { await ctx.setQty('v1', 5); });
    expect(screen.getByTestId('c').textContent).toBe('user:5');
    await act(async () => { releaseSlowGet(); await new Promise((r) => setTimeout(r, 10)); });
    expect(screen.getByTestId('c').textContent).toBe('user:5');
  });
  it('a failed edit resyncs from the server and rethrows the real message', async () => {
    let ctx; let gets = 0;
    network([['GET', /\/api\/auth\/me$/, ok({ user: { id: 'u1' } })], ['GET', /\/api\/wishlist$/, ok([])], ['GET', /\/api\/cart$/, () => ok(emptyCart('user', ++gets))],
      ['PATCH', /\/api\/cart\/items\/v1$/, fail(409, 'INSUFFICIENT_STOCK', 'Only 2 left')]]);
    mountCart((c) => { ctx = c; }); await waitFor(() => expect(screen.getByTestId('c').textContent).toBe('user:1'));
    await act(async () => { await expect(ctx.setQty('v1', 9)).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK', message: 'Only 2 left' }); });
    await waitFor(() => expect(gets).toBe(2));
  });
  it('REGRESSION: signing out clears the previous account\'s bag from the screen straight away', async () => {
    let authCtx; let signedIn = true; let release;
    network([['GET', /\/api\/auth\/me$/, () => (signedIn ? ok({ user: { id: 'u1' } }) : fail(401, 'UNAUTHORIZED'))], ['POST', /\/refresh$/, fail(401, 'NO_REFRESH_TOKEN')], ['GET', /\/api\/wishlist$/, ok([])],
      ['GET', /\/api\/cart$/, () => (signedIn ? ok(emptyCart('user', 3)) : new Promise((r) => { release = () => r(ok(emptyCart('guest', 0))); }))],
      ['POST', /\/api\/auth\/logout$/, ok({})]]);
    function Grab() { authCtx = useAuth(); return null; }
    mountCart(() => {}, <Grab />); await waitFor(() => expect(screen.getByTestId('c').textContent).toBe('user:3'));
    signedIn = false; await act(async () => { await authCtx.logout(); });
    expect(screen.getByTestId('c').textContent).toBe('none'); // not "user:3"
    await act(async () => { release(); }); await waitFor(() => expect(screen.getByTestId('c').textContent).toBe('guest:0'));
  });
  it('REGRESSION: a signed-in user who gets a guest bag back triggers ONE session re-check instead of editing the wrong bag', async () => {
    const n = network([['GET', /\/api\/auth\/me$/, ok({ user: { id: 'u1' } })], ['GET', /\/api\/wishlist$/, ok([])], ['GET', /\/api\/cart$/, ok(emptyCart('guest', 0))]]);
    mountCart(() => {}); await waitFor(() => expect(screen.getByTestId('c').textContent).toBe('guest:0'));
    await waitFor(() => expect(n.count('/api/auth/me')).toBe(2)); await new Promise((r) => setTimeout(r, 30));
    expect(n.count('/api/auth/me')).toBe(2);
  });
  it('REGRESSION: a failing wishlist request is reported, never silently turned into an empty wishlist', async () => {
    let ctx; let wishFails = false;
    network([['GET', /\/api\/auth\/me$/, ok({ user: { id: 'u1' } })], ['GET', /\/api\/cart$/, ok(emptyCart())],
      ['GET', /\/api\/wishlist$/, () => (wishFails ? fail(503, 'SERVICE_UNAVAILABLE', 'down') : ok([{ id: 'p1', name: 'Coat' }]))]]);
    mountCart((c) => { ctx = c; }); await waitFor(() => expect(ctx.wishStatus).toBe('ready')); expect(ctx.wish).toHaveLength(1);
    wishFails = true; await act(async () => { await ctx.reloadWish(); });
    expect(ctx.wishStatus).toBe('error'); expect(ctx.wishError.status).toBe(503); expect(ctx.wish).toHaveLength(1); // the last known list is kept
  });
  it('double-clicking the heart sends one request', async () => {
    let ctx; let release;
    const n = network([['GET', /\/api\/auth\/me$/, ok({ user: { id: 'u1' } })], ['GET', /\/api\/cart$/, ok(emptyCart())], ['GET', /\/api\/wishlist$/, ok([])],
      ['POST', /\/api\/wishlist$/, () => new Promise((r) => { release = () => r(ok([{ id: 'p1' }], 201)); })]]);
    mountCart((c) => { ctx = c; }); await waitFor(() => expect(ctx.wishStatus).toBe('ready'));
    let a; let b; await act(async () => { a = ctx.toggleWish('p1'); b = ctx.toggleWish('p1'); await new Promise((r) => setTimeout(r, 5)); release(); await Promise.all([a, b]); });
    expect(n.count('POST /api/wishlist')).toBe(1);
  });
});

describe('what the customer sees', () => {
  it('REGRESSION: an expired session reads "Your session has ended" with a sign-in link, never "Authentication required"', () => {
    render(<ErrorState error={Object.assign(new Error('Authentication required'), { status: 401, code: 'UNAUTHORIZED' })} onRetry={() => {}} />);
    expect(screen.getByText('Your session has ended')).toBeTruthy(); expect(screen.queryByText(/Authentication required/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/login');
  });
  it('server trouble is described as ours, not the customer\'s', () => {
    render(<ErrorState error={Object.assign(new Error('boom'), { status: 503 })} onRetry={() => {}} />);
    expect(screen.getByText('Nessence is having a moment')).toBeTruthy(); expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
  it('REGRESSION: the wishlist page shows the failure (with retry), not "Nothing saved yet", when the request fails', async () => {
    network([['GET', /\/api\/auth\/me$/, ok({ user: { id: 'u1', name: 'A' } })], ['GET', /\/api\/cart$/, ok(emptyCart())], ['GET', /\/api\/wishlist$/, fail(503, 'SERVICE_UNAVAILABLE', 'down')]]);
    render(<MemoryRouter><AuthProvider><CartProvider><Wishlist /></CartProvider></AuthProvider></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy());
    expect(screen.queryByText('Nothing saved yet')).toBeNull();
  });
  it('REGRESSION: wishlist/bag errors are visible on any page through the notice region', async () => {
    let ctx; network([['GET', /\/api\/auth\/me$/, fail(401, 'UNAUTHORIZED')], ['POST', /\/refresh$/, fail(401, 'X')], ['GET', /\/api\/cart$/, ok(emptyCart('guest'))]]);
    mountCart((c) => { ctx = c; }, <Notice />); await waitFor(() => expect(ctx.cart).toBeTruthy());
    await act(async () => { ctx.setNotice('Please sign in to save items'); });
    expect(screen.getByRole('status').textContent).toMatch(/Please sign in to save items/);
  });
});

describe('http: timeouts and safe retries (Render cold starts, flaky networks)', () => {
  it('a GET that hits a waking server (503 twice) is retried with backoff and then succeeds', async () => {
    __resetHttpForTests({ retryDelays: [1, 1] }); let n = 0;
    const calls = network([['GET', /\/api\/products$/, () => (++n < 3 ? fail(503, 'SERVICE_UNAVAILABLE') : ok(['p']))]]);
    expect((await request('/api/products')).data).toEqual(['p']); expect(calls.count('GET /api/products')).toBe(3);
  });
  it('gives up after two retries with a clear transient error carrying the request id', async () => {
    __resetHttpForTests({ retryDelays: [1, 1] });
    const calls = network([['GET', /\/api\/products$/, () => new Response(JSON.stringify({ success: false, code: 'SERVICE_UNAVAILABLE', message: 'down', requestId: 'req-1234' }), { status: 503 })]]);
    const e = await request('/api/products').catch((x) => x);
    expect(calls.count('GET')).toBe(3); expect(e.isTransient).toBe(true); expect(e.requestId).toBe('req-1234');
  });
  it('a network drop on a GET is retried; the same drop on a payment/order/bag WRITE is never retried', async () => {
    __resetHttpForTests({ retryDelays: [1, 1] });
    let g = 0; const a = network([['GET', /\/api\/orders$/, () => { if (++g < 2) throw new TypeError('Failed to fetch'); return ok([]); }]]);
    expect((await request('/api/orders')).data).toEqual([]); expect(a.count('GET')).toBe(2);
    for (const [method, path] of [['POST', '/api/checkout/orders'], ['POST', '/api/orders/x/verify-payment'], ['POST', '/api/cart/items'], ['PATCH', '/api/cart/items/v1'], ['DELETE', '/api/wishlist/p1']]) {
      const b = network([[method, new RegExp(`${path.replace(/\//g, '\\/')}$`), () => { throw new TypeError('Failed to fetch'); }]]);
      expect(await request(path, { method, body: {} }).catch((x) => x)).toMatchObject({ code: 'NETWORK_ERROR' });
      expect(b.calls).toHaveLength(1);
    }
    const c = network([['POST', /\/api\/checkout\/orders$/, fail(503, 'SERVICE_UNAVAILABLE')]]);
    await request('/api/checkout/orders', { method: 'POST', body: {} }).catch(() => {}); expect(c.calls).toHaveLength(1);
  });
  it('client errors (4xx) are answers, not failures to retry', async () => {
    __resetHttpForTests({ retryDelays: [1, 1] }); const n = network([['GET', /\/api\/products\/x$/, fail(404, 'PRODUCT_NOT_FOUND', 'Not found')]]);
    await expect(request('/api/products/x')).rejects.toMatchObject({ status: 404 }); expect(n.calls).toHaveLength(1);
  });
  it('REGRESSION: a request that never answers ends with a TIMEOUT error instead of an endless spinner', async () => {
    vi.useFakeTimers();
    try {
      __resetHttpForTests({ retryDelays: [] });
      vi.stubGlobal('fetch', vi.fn((_u, init) => new Promise((_res, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))))));
      const p = request('/api/products').catch((x) => x); await vi.advanceTimersByTimeAsync(30_001);
      const e = await p; expect(e).toMatchObject({ status: 0, code: 'TIMEOUT', isTransient: true }); expect(e.message).toMatch(/starting up/);
    } finally { vi.useRealTimers(); }
  });
  it('a caller that cancels its own request still gets an AbortError (not a timeout or network message)', async () => {
    vi.stubGlobal('fetch', vi.fn((_u, init) => new Promise((_r, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('x'), { name: 'AbortError' }))))));
    const c = new AbortController(); const p = request('/api/products', { signal: c.signal }).catch((x) => x); c.abort();
    expect((await p).name).toBe('AbortError');
  });
});
