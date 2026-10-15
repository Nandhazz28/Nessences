import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { accountApi } from '../../services/account.js';
import { addressApi } from '../../services/checkout.js';
import { authApi } from '../../services/auth.js';
import { Field, fieldErrors } from '../../components/auth/AuthShell.jsx';
import { AddressForm } from '../../components/checkout/AddressForm.jsx';
import { ErrorState, EmptyState, Spinner } from '../../components/common/States.jsx';
import { date } from '../../utils/labels.js';

const Note = ({ tone, children }) => children ? <p role={tone === 'bad' ? 'alert' : 'status'} className={`mb-5 p-3 text-small border ${tone === 'bad' ? 'border-oxblood text-oxblood' : 'border-ink'}`}>{children}</p> : null;
const H = ({ children }) => <h2 className="text-[length:var(--text-h2)] mb-6">{children}</h2>;

export function Profile() {
  const { user, setUser } = useAuth(); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null); const [ok, setOk] = useState('');
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null); setOk('');
    const d = Object.fromEntries(new FormData(e.currentTarget));
    try { setUser((await accountApi.updateProfile(d)).user); setOk('Your details have been saved.'); } catch (x) { setErr(x); } finally { setBusy(false); }
  };
  const fe = fieldErrors(err);
  return (
    <form onSubmit={save} noValidate className="max-w-lg"><H>Profile</H>
      <Note tone="bad">{err && !err.details?.length ? err.message : ''}</Note><Note>{ok}</Note>
      <Field label="Full name" name="name" defaultValue={user.name} required error={fe.name} />
      <Field label="Phone" name="phone" type="tel" defaultValue={user.phone ?? ''} error={fe.phone} />
      <Field label="Date of birth (optional)" name="dateOfBirth" type="date" defaultValue={user.dateOfBirth?.slice(0, 10) ?? ''} max={new Date().toISOString().slice(0, 10)} error={fe.dateOfBirth} />
      <div className="mb-5"><p className="eyebrow !text-ink font-semibold mb-2">Email</p><p>{user.email}{user.emailVerified && <span className="text-small text-muted ml-2">verified</span>}</p><p className="text-small text-muted mt-1">To change your email address, contact support.</p></div>
      <p className="text-small text-muted mb-5">Member since {date(user.createdAt)}</p>
      <button className="btn btn-solid" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
    </form>
  );
}

export function Addresses() {
  const { data, error, loading, reload } = useAsync(() => addressApi.list(), []);
  const [list, setList] = useState(null); const [mode, setMode] = useState(null); const [err, setErr] = useState('');
  const items = list ?? data;
  if (loading) return <Spinner />; if (error) return <ErrorState error={error} onRetry={reload} />;
  const run = async (fn) => { setErr(''); try { setList(await fn()); } catch (e) { setErr(e.message); } };
  return (
    <div><H>Saved addresses</H><Note tone="bad">{err}</Note>
      {items.length === 0 && mode !== 'new' && <EmptyState title="No saved addresses" body="Add one to speed up checkout." />}
      <ul className="grid sm:grid-cols-2 gap-4">{items.map((a) => (
        <li key={a.id} className="border border-stone p-4 text-small">
          {mode === a.id ? <AddressForm initial={a} onCancel={() => setMode(null)} onSaved={(l) => { setList(l); setMode(null); }} /> : (<>
            <p><strong>{a.fullName}</strong> <span className="eyebrow border border-stone px-1.5 ml-1">{a.label}</span>{a.isDefault && <span className="eyebrow ml-2">Default</span>}</p>
            <p className="text-muted mt-1">{a.line1}{a.line2 ? `, ${a.line2}` : ''}<br />{a.city}, {a.state} {a.pincode}<br />{a.phone}</p>
            <p className="mt-3 flex gap-4"><button className="link-u" onClick={() => setMode(a.id)}>Edit</button>
              {!a.isDefault && <button className="link-u" onClick={() => run(() => addressApi.update(a.id, { isDefault: true }))}>Make default</button>}
              <button className="link-u text-oxblood" onClick={() => { if (window.confirm('Delete this address?')) run(() => addressApi.remove(a.id)); }}>Delete</button></p></>)}
        </li>))}</ul>
      {mode === 'new' ? <AddressForm onCancel={() => setMode(null)} onSaved={(l) => { setList(l); setMode(null); }} /> : <button className="btn btn-line mt-6" onClick={() => setMode('new')}>Add new address</button>}
    </div>
  );
}

export function Notifications() {
  const { data, error, loading, reload } = useAsync(() => accountApi.notifications(), []);
  const [cleared, setCleared] = useState(false);
  if (loading) return <Spinner />; if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data.items.length) return <EmptyState title="No notifications" body="Order and return updates will show up here." />;
  return (
    <div><div className="flex justify-between items-end mb-6"><h2 className="text-[length:var(--text-h2)]">Notifications</h2>
      {data.unread > 0 && !cleared && <button className="link-u text-small" onClick={async () => { await accountApi.readAll(); setCleared(true); }}>Mark all as read</button>}</div>
      <ul className="border-t rule">{data.items.map((n) => (
        <li key={n.id} className="py-4 border-b rule"><p className={`${!n.readAt && !cleared ? 'font-semibold' : ''}`}>{n.link ? <Link to={n.link} className="link-u">{n.title}</Link> : n.title}</p>
          {n.body && <p className="text-small text-muted">{n.body}</p>}<p className="text-small text-muted">{date(n.createdAt)}</p></li>))}</ul>
    </div>
  );
}

export function Settings() {
  const { user, setUser } = useAuth(); const nav = useNavigate();
  const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); const [del, setDel] = useState(false); const [busy, setBusy] = useState(false);
  const toggle = async (key, value) => { setErr(''); setMsg(''); try { setUser((await accountApi.setPrefs({ [key]: value })).user); setMsg('Preferences saved.'); } catch (e) { setErr(e.message); } };
  const remove = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await accountApi.deleteAccount(new FormData(e.currentTarget).get('password')); setUser(null); nav('/', { replace: true }); }
    catch (x) { setErr(x.message); setBusy(false); }
  };
  const p = user.preferences ?? {};
  return (
    <div className="max-w-lg"><H>Account settings</H><Note>{msg}</Note><Note tone="bad">{err}</Note>
      <fieldset className="space-y-4"><legend className="eyebrow !text-ink font-semibold mb-3">Email preferences</legend>
        <label className="flex gap-3 items-start"><input type="checkbox" className="mt-1" checked={p.orderUpdates !== false} onChange={(e) => toggle('orderUpdates', e.target.checked)} /><span>Order updates<span className="block text-small text-muted">Confirmations, shipping and delivery emails.</span></span></label>
        <label className="flex gap-3 items-start"><input type="checkbox" className="mt-1" checked={Boolean(p.marketing)} onChange={(e) => toggle('marketing', e.target.checked)} /><span>New arrivals and offers<span className="block text-small text-muted">Occasional news about new collections.</span></span></label>
      </fieldset>
      <div className="mt-14 pt-6 border-t rule"><h3 className="text-[length:var(--text-h3)]">Delete account</h3>
        <p className="text-small text-muted mt-2">This removes your profile, addresses, wishlist and bag. Past orders are kept for legal and accounting records without your personal details. This can’t be undone.</p>
        {!del ? <button className="btn btn-line mt-4" onClick={() => setDel(true)}>Delete my account</button> : (
          <form onSubmit={remove} className="mt-4"><Field label="Confirm with your password" name="password" type="password" autoComplete="current-password" required />
            <div className="flex gap-3"><button className="btn btn-solid" disabled={busy}>{busy ? 'Deleting…' : 'Permanently delete'}</button><button type="button" className="btn btn-line" onClick={() => setDel(false)}>Cancel</button></div></form>)}</div>
    </div>
  );
}

export function Security() {
  const { setUser } = useAuth(); const nav = useNavigate();
  const sessions = useAsync(() => accountApi.sessions(), []);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const change = async (e) => {
    e.preventDefault(); setErr(null); const d = Object.fromEntries(new FormData(e.currentTarget));
    if (d.newPassword !== d.confirm) return setErr({ details: [{ field: 'confirm', message: 'Passwords do not match' }] });
    setBusy(true);
    try { await authApi.changePassword(d.currentPassword, d.newPassword); setUser(null); nav('/login', { replace: true }); } // server ends all sessions on change
    catch (x) { setErr(x); setBusy(false); }
  };
  const fe = fieldErrors(err);
  return (
    <div className="max-w-lg"><H>Password & security</H>
      <form onSubmit={change} noValidate><Note tone="bad">{err && !err.details?.length ? err.message : ''}</Note>
        <Field label="Current password" name="currentPassword" type="password" autoComplete="current-password" required error={fe.currentPassword} />
        <Field label="New password" name="newPassword" type="password" autoComplete="new-password" required error={fe.newPassword} />
        <Field label="Confirm new password" name="confirm" type="password" autoComplete="new-password" required error={fe.confirm} />
        <p className="-mt-3 mb-5 text-small text-muted">At least 8 characters with a letter and a number. You’ll be signed out everywhere after changing it.</p>
        <button className="btn btn-solid" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button></form>
      <div className="mt-14 pt-6 border-t rule"><h3 className="text-[length:var(--text-h3)]">Active sessions</h3>
        {sessions.loading ? <p className="text-small text-muted mt-3">Loading…</p> : sessions.error ? <ErrorState error={sessions.error} onRetry={sessions.reload} /> : (
          <ul className="mt-3 text-small">{sessions.data.map((s) => <li key={s.id} className="py-2 border-b rule">{s.device}<span className="text-muted"> · expires {date(s.expiresAt)}</span></li>)}</ul>)}
        <button className="btn btn-line mt-4" onClick={async () => { await accountApi.signOutEverywhere(); setUser(null); nav('/login', { replace: true }); }}>Sign out of all devices</button></div>
    </div>
  );
}
