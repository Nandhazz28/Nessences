import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync.js';
import { get, send, fieldErrors } from '../api.js';
import { useAdmin } from '../AdminApp.jsx';
import { Badge, Btn, Card, Confirm, DataTable, Dl, ErrorBox, Field, ListCard, Loading, Modal, Note, PageHead, SearchBox, day, dt, label, money, useList, useToast } from '../ui.jsx';

export function Customers() {
  const nav = useNavigate(); const list = useList('/customers', { limit: 20 });
  const cols = [{ header: 'Customer', render: (r) => <div><b>{r.name}</b><div style={{ color: 'var(--a-muted)', fontSize: 12 }}>{r.email}</div></div> }, { header: 'Registered', render: (r) => day(r.registeredAt) }, { header: 'Orders', right: true, num: true, key: 'orders' },
    { header: 'Total spend', right: true, num: true, render: (r) => money(r.totalSpend) }, { header: 'Last order', render: (r) => day(r.lastOrder) }, { header: 'Status', render: (r) => <span><Badge value={r.status} />{!r.emailVerified && <> <Badge value="unverified" tone="warn" /></>}</span> }];
  return (<div><PageHead title="Customers" sub="Real accounts. Passwords, tokens and full addresses are never shown here." />
    <ListCard list={list} columns={cols} onRow={(r) => nav(`/admin/customers/${r.id}`)} empty="No customers match." filters={<>
      <SearchBox onSearch={(q) => list.set({ q })} placeholder="Search name or email" /><select className="a-select" aria-label="Status" onChange={(e) => list.set({ status: e.target.value || undefined })}><option value="">All</option><option value="active">Active</option><option value="suspended">Suspended</option></select></>} /></div>);
}

export function CustomerDetail() {
  const { id } = useParams(); const { can } = useAdmin(); const toast = useToast();
  const { data: c, error, loading, reload } = useAsync(() => get(`/customers/${id}`).then((r) => r.data), [id]);
  if (loading) return <Loading />; if (error) return <ErrorBox error={error} onRetry={reload} />;
  const next = c.status === 'suspended' ? 'active' : 'suspended';
  return (<div>
    <PageHead title={c.name} sub={c.email}><Link className="a-btn" to="/admin/customers">Back</Link>
      {can('customers:manage') && <Confirm danger={next === 'suspended'} trigger={next === 'suspended' ? 'Suspend account' : 'Reactivate account'} title={next === 'suspended' ? 'Suspend this customer?' : 'Reactivate this customer?'} message={next === 'suspended' ? 'They will be signed out immediately and unable to sign in or check out until reactivated.' : 'They will be able to sign in again.'} confirmLabel={next === 'suspended' ? 'Suspend' : 'Reactivate'} onConfirm={async () => { await send('PATCH', `/customers/${id}/status`, { status: next }); toast(next === 'suspended' ? 'Customer suspended' : 'Customer reactivated'); reload(); }} />}</PageHead>
    <div className="a-grid a-g32"><Card flush title="Recent orders"><DataTable columns={[{ header: 'Order', render: (o) => <Link className="mono" to={`/admin/orders/${o.id}`}>{o.orderNumber}</Link> }, { header: 'Placed', render: (o) => dt(o.createdAt) }, { header: 'Status', render: (o) => <Badge value={o.status} /> }, { header: 'Total', right: true, num: true, render: (o) => money(o.total) }]} rows={c.recentOrders} empty="No orders yet." /></Card>
      <Card title="Profile"><Dl items={[['Status', <Badge value={c.status} />], ['Email verified', c.emailVerified ? 'Yes' : 'No'], ['Phone', c.phone], ['Registered', dt(c.registeredAt)], ['Last sign-in', dt(c.lastLoginAt)], ['Orders', <span className="num">{c.orders}</span>], ['Total spend', <span className="num">{money(c.totalSpend)}</span>], ['Locations', c.locations.length ? c.locations.join('; ') : '—']]} /></Card></div></div>);
}

const ROLES = ['super_admin', 'admin', 'manager', 'support', 'inventory_manager', 'content_manager'];
function StaffForm({ person, onClose, onSaved }) {
  const [f, setF] = useState({ name: person?.name ?? '', email: person?.email ?? '', role: person?.role ?? 'support', password: '' }); const [err, setErr] = useState(null); const [busy, setBusy] = useState(false); const fe = fieldErrors(err);
  const save = async () => { setBusy(true); setErr(null); try { person ? await send('PATCH', `/staff/${person.id}`, { name: f.name, role: f.role }) : await send('POST', '/staff', f); onSaved(); } catch (e) { setErr(e); setBusy(false); } };
  return (<Modal title={person ? `Edit ${person.name}` : 'Add staff member'} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</Btn></>}>
    <Note tone="bad">{err && !err.details?.length ? err.message : ''}</Note>
    <Field label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={fe.name} />
    <Field label="Email" type="email" value={f.email} disabled={Boolean(person)} onChange={(e) => setF({ ...f, email: e.target.value })} error={fe.email} />
    <Field as="select" label="Role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} error={fe.role}>{ROLES.map((r) => <option key={r} value={r}>{label(r)}</option>)}</Field>
    {!person && <Field label="Temporary password" type="text" autoComplete="off" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} error={fe.password} hint="Share it securely. They must choose their own at first sign-in." />}
    {person && <p style={{ color: 'var(--a-muted)', fontSize: 12 }}>Role changes sign the person out so the new permissions apply immediately.</p>}
  </Modal>);
}
function ResetModal({ person, onClose }) {
  const [pw, setPw] = useState(''); const [err, setErr] = useState(null); const [busy, setBusy] = useState(false); const toast = useToast(); const fe = fieldErrors(err);
  const go = async () => { setBusy(true); setErr(null); try { await send('POST', `/staff/${person.id}/reset-password`, { password: pw }); toast('Password reset. They must change it at next sign-in.'); onClose(); } catch (e) { setErr(e); setBusy(false); } };
  return (<Modal title={`Reset password — ${person.name}`} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy} onClick={go}>Reset</Btn></>}><Note tone="bad">{err && !err.details?.length ? err.message : ''}</Note>
    <Field label="New temporary password" autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} error={fe.password} hint="They will be signed out everywhere and asked to choose a new password." /></Modal>);
}

export function Staff() {
  const { staff: me } = useAdmin(); const { data, error, loading, reload } = useAsync(() => get('/staff').then((r) => r.data), []); const [form, setForm] = useState(null); const [reset, setReset] = useState(null); const toast = useToast();
  if (loading) return <Loading />; if (error) return <ErrorBox error={error} onRetry={reload} />;
  const toggle = async (s) => { try { await send('PATCH', `/staff/${s.id}`, { active: !s.active }); toast(s.active ? 'Staff member deactivated' : 'Staff member reactivated'); reload(); } catch (e) { toast(e.message, 'bad'); } };
  return (<div><PageHead title="Staff" sub="Permissions are enforced by the server for every request."><Btn kind="primary" onClick={() => setForm({})}>Add staff member</Btn></PageHead>
    <Card flush><DataTable columns={[{ header: 'Name', render: (s) => <div><b>{s.name}</b>{s.id === me.id && <> <Badge value="you" tone="info" /></>}<div style={{ color: 'var(--a-muted)', fontSize: 12 }}>{s.email}</div></div> }, { header: 'Role', render: (s) => label(s.role) }, { header: 'Status', render: (s) => <span><Badge value={s.active ? 'active' : 'suspended'} tone={s.active ? 'ok' : 'bad'} />{s.mustChangePassword && <> <Badge value="password change pending" tone="warn" /></>}</span> }, { header: 'Last sign-in', render: (s) => dt(s.lastLoginAt) },
      { header: '', right: true, render: (s) => <span className="a-actions" style={{ justifyContent: 'flex-end' }}><Btn size="sm" onClick={() => setForm(s)}>Edit</Btn><Btn size="sm" onClick={() => setReset(s)}>Reset password</Btn>{s.id !== me.id && <Btn size="sm" kind={s.active ? 'danger' : ''} onClick={() => toggle(s)}>{s.active ? 'Deactivate' : 'Reactivate'}</Btn>}</span> }]} rows={data} /></Card>
    <Card title="Roles"><ul style={{ margin: 0, paddingLeft: 18, color: 'var(--a-muted)' }}><li><b>Super admin</b> — everything, including staff.</li><li><b>Admin</b> — everything except staff management.</li><li><b>Manager</b> — catalogue, orders, returns, refunds, coupons, reviews, analytics.</li><li><b>Support</b> — orders, customers, returns, reviews and messages (read-mostly).</li><li><b>Inventory manager</b> — products and stock.</li><li><b>Content manager</b> — journal, pages, newsletter, reviews.</li></ul></Card>
    {form && <StaffForm person={form.id ? form : null} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); toast('Saved'); }} />}{reset && <ResetModal person={reset} onClose={() => setReset(null)} />}</div>);
}
