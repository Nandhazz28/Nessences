import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import './admin.css';
import { api, authApi, AdminApiError, fieldErrors } from './api.js';
import { Btn, Card, ErrorBox, Field, Loading, Note, ToastProvider } from './ui.jsx';

const AdminCtx = createContext(null); export const useAdmin = () => useContext(AdminCtx);
const page = (n, f) => lazy(() => f().then((m) => ({ default: m[n] })));
const Dashboard = page('Dashboard', () => import('./pages/Dashboard.jsx'));
const Analytics = page('Analytics', () => import('./pages/System.jsx')); const AuditLogs = page('AuditLogs', () => import('./pages/System.jsx'));
const Products = page('Products', () => import('./pages/Products.jsx')); const ProductForm = page('ProductForm', () => import('./pages/Products.jsx'));
const Taxonomy = page('Taxonomy', () => import('./pages/Catalog.jsx')); const Inventory = page('Inventory', () => import('./pages/Catalog.jsx'));
const Orders = page('Orders', () => import('./pages/Sales.jsx')); const OrderDetail = page('OrderDetail', () => import('./pages/Sales.jsx'));
const Returns = page('Returns', () => import('./pages/Sales.jsx')); const Refunds = page('Refunds', () => import('./pages/Sales.jsx'));
const Customers = page('Customers', () => import('./pages/People.jsx')); const CustomerDetail = page('CustomerDetail', () => import('./pages/People.jsx')); const Staff = page('Staff', () => import('./pages/People.jsx'));
const Coupons = page('Coupons', () => import('./pages/Engage.jsx')); const Reviews = page('Reviews', () => import('./pages/Engage.jsx'));
const Newsletter = page('Newsletter', () => import('./pages/Engage.jsx')); const Messages = page('Messages', () => import('./pages/Engage.jsx'));
const Journal = page('Journal', () => import('./pages/Content.jsx')); const ArticleForm = page('ArticleForm', () => import('./pages/Content.jsx'));
const Pages = page('Pages', () => import('./pages/Content.jsx')); const Settings = page('Settings', () => import('./pages/Content.jsx'));

const NAV = [
  ['Overview', [['Dashboard', '/admin', 'dashboard:read', true], ['Analytics', '/admin/analytics', 'analytics:read']]],
  ['Catalog', [['Products', '/admin/products', 'products:read'], ['Categories', '/admin/categories', 'products:read'], ['Collections', '/admin/collections', 'products:read'], ['Inventory', '/admin/inventory', 'inventory:read']]],
  ['Sales', [['Orders', '/admin/orders', 'orders:read'], ['Returns', '/admin/returns', 'returns:manage'], ['Refunds', '/admin/refunds', 'refunds:process'], ['Customers', '/admin/customers', 'customers:read'], ['Coupons', '/admin/coupons', 'coupons:write'], ['Reviews', '/admin/reviews', 'reviews:moderate']]],
  ['Content', [['Journal', '/admin/journal', 'content:write'], ['Pages', '/admin/content', 'content:write'], ['Newsletter', '/admin/newsletter', 'newsletter:read'], ['Messages', '/admin/contact-messages', 'messages:read']]],
  ['System', [['Staff', '/admin/staff', 'staff:manage'], ['Settings', '/admin/settings', 'settings:manage'], ['Audit log', '/admin/audit-logs', 'audit:read']]],
];

function Login({ onDone }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null); const d = new FormData(e.currentTarget);
    try { await authApi.login(d.get('email'), d.get('password')); await onDone(); } catch (x) { setErr(x); setBusy(false); }
  };
  const fe = fieldErrors(err);
  return (<div className="a-login"><Card><form onSubmit={submit} noValidate>
    <div className="a-brand" style={{ padding: 0, marginBottom: 20 }}><b>N</b><span>Nessence Admin</span></div>
    <Note tone="bad">{err && !err.details?.length ? err.message : ''}</Note>
    <Field label="Email" name="email" type="email" autoComplete="username" required error={fe.email} />
    <Field label="Password" name="password" type="password" autoComplete="current-password" required error={fe.password} />
    <Btn kind="primary" type="submit" disabled={busy} style={{ width: '100%' }}>{busy ? 'Signing in…' : 'Sign in'}</Btn>
    <p style={{ color: 'var(--a-muted)', fontSize: 12, marginTop: 14 }}>Staff only. Sign-ins and actions are recorded.</p></form></Card></div>);
}

function ForceChange({ onDone }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const submit = async (e) => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(e.currentTarget)); setErr(null);
    if (d.next !== d.confirm) return setErr(new AdminApiError(400, 'X', '', [{ field: 'confirm', message: 'Passwords do not match' }]));
    setBusy(true); try { await authApi.changePassword(d.current, d.next); await onDone(); } catch (x) { setErr(x); setBusy(false); }
  };
  const fe = fieldErrors(err);
  return (<div className="a-login"><Card><form onSubmit={submit} noValidate><h1 style={{ marginBottom: 6 }}>Choose a new password</h1>
    <p style={{ color: 'var(--a-muted)', marginTop: 0 }}>Your account was set up with a temporary password. Set your own to continue.</p>
    <Note tone="bad">{err && !err.details?.length ? err.message : ''}</Note>
    <Field label="Current (temporary) password" name="current" type="password" autoComplete="current-password" required error={fe.currentPassword} />
    <Field label="New password" name="next" type="password" autoComplete="new-password" hint="At least 10 characters with a letter and a number." required error={fe.newPassword} />
    <Field label="Confirm new password" name="confirm" type="password" autoComplete="new-password" required error={fe.confirm} />
    <Btn kind="primary" type="submit" disabled={busy} style={{ width: '100%' }}>{busy ? 'Saving…' : 'Update password'}</Btn></form></Card></div>);
}

function Shell({ children }) {
  const { staff, can, logout } = useAdmin(); const [open, setOpen] = useState(false); const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  return (
    <div className="a-shell">
      <aside className={`a-side ${open ? 'open' : ''}`} aria-label="Admin navigation">
        <div className="a-brand"><b>N</b><span>Nessence Admin</span></div>
        {NAV.map(([group, items]) => { const vis = items.filter(([, , p]) => can(p)); return vis.length ? (
          <nav key={group} className="a-navgroup" aria-label={group}><div className="a-navlabel">{group}</div>
            {vis.map(([l, to, , end]) => <NavLink key={to} to={to} end={end} className={({ isActive }) => `a-nav ${isActive ? 'active' : ''}`}>{l}</NavLink>)}</nav>) : null; })}
        <div className="a-user"><div style={{ fontWeight: 600 }}>{staff.name}</div><div style={{ color: 'var(--a-muted)' }}>{staff.role.replace(/_/g, ' ')}</div>
          <Btn size="sm" style={{ marginTop: 8 }} onClick={logout}>Sign out</Btn></div>
      </aside>
      <div className="a-main">
        <div className="a-top"><Btn className="a-menu-btn" size="sm" aria-expanded={open} aria-label="Menu" onClick={() => setOpen((o) => !o)}>Menu</Btn><span style={{ color: 'var(--a-muted)' }}>Production</span>
          <Link to="/" target="_blank" rel="noreferrer">View storefront ↗</Link></div>
        <main className="a-page" id="main">{children}</main>
      </div>
    </div>
  );
}

export default function AdminApp() {
  const [state, setState] = useState({ loading: true, staff: null, permissions: [], error: null }); const nav = useNavigate(); const loc = useLocation();
  useEffect(() => { document.title = 'Nessence Admin'; const m = document.createElement('meta'); m.name = 'robots'; m.content = 'noindex,nofollow'; document.head.appendChild(m);
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap'; document.head.appendChild(l);
    return () => { m.remove(); l.remove(); }; }, []);
  const load = useCallback(async () => {
    try { const r = await api('/permissions'); setState({ loading: false, staff: r.data.staff, permissions: r.data.permissions, error: null }); }
    catch (e) { setState({ loading: false, staff: null, permissions: [], error: e.status === 401 ? null : e }); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const logout = useCallback(async () => { await authApi.logout(); setState({ loading: false, staff: null, permissions: [], error: null }); nav('/admin/login'); }, [nav]);

  if (state.loading) return <div className="admin"><Loading /></div>;
  if (state.error) return <div className="admin"><ErrorBox error={state.error} onRetry={load} /></div>;
  if (!state.staff) return <div className="admin"><ToastProvider>{loc.pathname === '/admin/login' ? <Login onDone={async () => { await load(); nav('/admin'); }} /> : <Navigate to="/admin/login" replace />}</ToastProvider></div>;
  if (state.staff.mustChangePassword) return <div className="admin"><ForceChange onDone={() => { setState((s) => ({ ...s, staff: null })); nav('/admin/login'); }} /></div>;

  const can = (p) => state.permissions.includes(p);
  const guard = (perm, el) => (can(perm) ? el : <Card><div className="a-empty">You don’t have permission to view this page.</div></Card>);
  return (
    <div className="admin"><ToastProvider><AdminCtx.Provider value={{ staff: state.staff, can, logout }}><Shell>
      <Suspense fallback={<Loading />}><Routes>
        <Route index element={guard('dashboard:read', <Dashboard />)} />
        <Route path="login" element={<Navigate to="/admin" replace />} />
        <Route path="analytics" element={guard('analytics:read', <Analytics />)} />
        <Route path="products" element={guard('products:read', <Products />)} />
        <Route path="products/new" element={guard('products:write', <ProductForm />)} />
        <Route path="products/:id/edit" element={guard('products:write', <ProductForm />)} />
        <Route path="categories" element={guard('products:read', <Taxonomy kind="categories" />)} />
        <Route path="collections" element={guard('products:read', <Taxonomy kind="collections" />)} />
        <Route path="inventory" element={guard('inventory:read', <Inventory />)} />
        <Route path="orders" element={guard('orders:read', <Orders />)} />
        <Route path="orders/:id" element={guard('orders:read', <OrderDetail />)} />
        <Route path="returns" element={guard('returns:manage', <Returns />)} />
        <Route path="refunds" element={guard('refunds:process', <Refunds />)} />
        <Route path="customers" element={guard('customers:read', <Customers />)} />
        <Route path="customers/:id" element={guard('customers:read', <CustomerDetail />)} />
        <Route path="coupons" element={guard('coupons:write', <Coupons />)} />
        <Route path="reviews" element={guard('reviews:moderate', <Reviews />)} />
        <Route path="journal" element={guard('content:write', <Journal />)} />
        <Route path="journal/new" element={guard('content:write', <ArticleForm />)} />
        <Route path="journal/:id" element={guard('content:write', <ArticleForm />)} />
        <Route path="content" element={guard('content:write', <Pages />)} />
        <Route path="newsletter" element={guard('newsletter:read', <Newsletter />)} />
        <Route path="contact-messages" element={guard('messages:read', <Messages />)} />
        <Route path="staff" element={guard('staff:manage', <Staff />)} />
        <Route path="settings" element={guard('settings:manage', <Settings />)} />
        <Route path="audit-logs" element={guard('audit:read', <AuditLogs />)} />
        <Route path="*" element={<Card><div className="a-empty">Page not found. <Link to="/admin">Back to dashboard</Link></div></Card>} />
      </Routes></Suspense></Shell></AdminCtx.Provider></ToastProvider></div>
  );
}
