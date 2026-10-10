import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync.js';
import { api, get, send, fieldErrors } from '../api.js';
import { Badge, Btn, Card, DataTable, Dl, ErrorBox, Field, ListCard, Loading, Modal, Note, PageHead, Tabs, day, dt, label, money, useAction, useList, useToast } from '../ui.jsx';

const toP = (v) => (v === '' || v == null ? undefined : Math.round(parseFloat(v) * 100));
const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

function CouponForm({ item, onClose, onSaved }) {
  const edit = Boolean(item);
  const [f, setF] = useState({ code: item?.code ?? '', description: item?.description ?? '', type: item?.type ?? 'percent', value: item ? (item.type === 'fixed' ? String(item.value / 100) : String(item.value)) : '', maxDiscount: item?.maxDiscount != null ? String(item.maxDiscount / 100) : '', minOrder: item ? String(item.minOrder / 100) : '', startsAt: iso(item?.startsAt), expiresAt: iso(item?.expiresAt), usageLimit: item?.usageLimit ?? '', active: item?.active ?? true });
  const [err, setErr] = useState(null); const [busy, setBusy] = useState(false); const fe = fieldErrors(err); const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = async () => {
    setBusy(true); setErr(null);
    const value = f.type === 'fixed' ? toP(f.value) : parseInt(f.value, 10);
    const common = { description: f.description || undefined, value, maxDiscount: f.type === 'percent' ? (f.maxDiscount === '' ? null : toP(f.maxDiscount)) : undefined, minOrder: toP(f.minOrder) ?? 0, startsAt: f.startsAt || null, expiresAt: f.expiresAt ? `${f.expiresAt}T23:59:59` : null, usageLimit: f.usageLimit === '' ? null : parseInt(f.usageLimit, 10), active: f.active };
    Object.keys(common).forEach((k) => common[k] === undefined && delete common[k]);
    try { edit ? await send('PATCH', `/coupons/${item._id}`, common) : await send('POST', '/coupons', { code: f.code, type: f.type, ...common }); onSaved(); } catch (e) { setErr(e); setBusy(false); }
  };
  return (<Modal title={edit ? `Edit ${item.code}` : 'New coupon'} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</Btn></>}>
    <Note tone="bad">{err && !err.details?.length ? err.message : ''}</Note>
    <div className="a-row"><Field label="Code" value={f.code} disabled={edit} onChange={set('code')} error={fe.code} style={{ textTransform: 'uppercase' }} /><Field as="select" label="Type" value={f.type} disabled={edit} onChange={set('type')}><option value="percent">Percentage</option><option value="fixed">Fixed amount</option></Field></div>
    <Field label="Description (shown to customers)" value={f.description} onChange={set('description')} />
    <div className="a-row"><Field label={f.type === 'percent' ? 'Percent off' : 'Amount off (₹)'} type="number" min="1" step={f.type === 'percent' ? '1' : '0.01'} value={f.value} onChange={set('value')} error={fe.value} />
      {f.type === 'percent' && <Field label="Maximum discount (₹)" type="number" min="0" value={f.maxDiscount} onChange={set('maxDiscount')} hint="Optional cap" />}</div>
    <div className="a-row"><Field label="Minimum order (₹)" type="number" min="0" value={f.minOrder} onChange={set('minOrder')} /><Field label="Usage limit" type="number" min="1" value={f.usageLimit} onChange={set('usageLimit')} hint="Empty = unlimited" /></div>
    <div className="a-row"><Field label="Starts" type="date" value={f.startsAt} onChange={set('startsAt')} /><Field label="Expires (end of day)" type="date" value={f.expiresAt} onChange={set('expiresAt')} error={fe.expiresAt} /></div>
    <label className="a-check"><input type="checkbox" checked={f.active} onChange={set('active')} />Active</label></Modal>);
}

export function Coupons() {
  const { data, error, loading, reload } = useAsync(() => get('/coupons').then((r) => r.data), []); const [edit, setEdit] = useState(null); const act = useAction();
  if (loading) return <Loading />; if (error) return <ErrorBox error={error} onRetry={reload} />;
  const expired = (c) => c.expiresAt && new Date(c.expiresAt) < new Date();
  return (<div><PageHead title="Coupons" sub="Validated by the server at checkout. Customers can’t alter discounts."><Btn kind="primary" onClick={() => setEdit({})}>New coupon</Btn></PageHead>
    <Card flush><DataTable columns={[{ header: 'Code', render: (c) => <b className="mono">{c.code}</b> }, { header: 'Discount', render: (c) => (c.type === 'percent' ? `${c.value}%${c.maxDiscount ? ` (max ${money(c.maxDiscount)})` : ''}` : money(c.value)) }, { header: 'Min order', right: true, num: true, render: (c) => (c.minOrder ? money(c.minOrder) : '—') },
      { header: 'Used', right: true, num: true, render: (c) => `${c.usedCount}${c.usageLimit ? ` / ${c.usageLimit}` : ''}` }, { header: 'Expires', render: (c) => (c.expiresAt ? day(c.expiresAt) : 'Never') }, { header: 'Status', render: (c) => (expired(c) ? <Badge value="expired" tone="bad" /> : <Badge value={c.active ? 'active' : 'draft'} tone={c.active ? 'ok' : 'warn'} />) },
      { header: '', right: true, render: (c) => <span className="a-actions" style={{ justifyContent: 'flex-end' }}><Btn size="sm" onClick={() => setEdit(c)}>Edit</Btn><Btn size="sm" onClick={() => act(async () => { await send('PATCH', `/coupons/${c._id}`, { active: !c.active }); reload(); }, c.active ? 'Coupon disabled' : 'Coupon enabled')}>{c.active ? 'Disable' : 'Enable'}</Btn></span> }]} rows={data.map((c) => ({ ...c, id: c._id }))} empty="No coupons yet." /></Card>
    {edit && <CouponForm item={edit._id ? edit : null} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}</div>);
}

const Stars = ({ n }) => <span aria-label={`${n} out of 5`} style={{ color: '#B54708', letterSpacing: 1 }}>{'★'.repeat(n)}<span style={{ color: '#CBD2DC' }}>{'★'.repeat(5 - n)}</span></span>;
function RemoveModal({ title, onClose, onConfirm }) {
  const [note, setNote] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  return (<Modal title={title} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="danger" disabled={busy || !note.trim()} onClick={async () => { setBusy(true); try { await onConfirm(note); } catch (e) { setErr(e.message); setBusy(false); } }}>Remove</Btn></>}>
    <Note tone="bad">{err}</Note><Field as="textarea" label="Reason (shown in the audit log)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} /></Modal>);
}
export function Reviews() {
  const [tab, setTab] = useState('reviews'); const reviews = useList('/reviews', { limit: 15, status: 'pending' }); const reports = useList('/review-reports', { limit: 15 }); const act = useAction(); const [rm, setRm] = useState(null);
  const moderate = (id, action, note) => act(async () => { await send('POST', `/reviews/${id}/moderate`, { action, note }); reviews.reload(); reports.reload(); }, `Review ${action === 'approve' ? 'approved' : action === 'remove' ? 'removed' : 'flagged'}`);
  const rc = [{ header: 'Review', render: (r) => <div style={{ maxWidth: 440 }}><Stars n={r.rating} /> {r.title && <b>{r.title}</b>}<div>{r.body}</div><div style={{ color: 'var(--a-muted)', fontSize: 12 }}>{r.customer?.name} · {r.product?.name} · {day(r.createdAt)}{r.reportCount ? ` · ${r.reportCount} report${r.reportCount > 1 ? 's' : ''}` : ''}</div></div> }, { header: 'Status', render: (r) => <Badge value={r.status} /> },
    { header: '', right: true, render: (r) => <span className="a-actions" style={{ justifyContent: 'flex-end' }}>{r.status !== 'approved' && <Btn size="sm" kind="accent" onClick={() => moderate(r.id, 'approve')}>Approve</Btn>}{r.status !== 'flagged' && r.status !== 'removed' && <Btn size="sm" onClick={() => moderate(r.id, 'flag')}>Flag</Btn>}{r.status !== 'removed' && <Btn size="sm" kind="danger" onClick={() => setRm({ id: r.id })}>Remove</Btn>}</span> }];
  const pc = [{ header: 'Reported review', render: (x) => <div style={{ maxWidth: 440 }}><Stars n={x.review?.rating ?? 0} /> <Badge value={x.review?.status} /><div>{x.review?.body}</div><div style={{ color: 'var(--a-muted)', fontSize: 12 }}>{x.review?.product}</div></div> }, { header: 'Reason', render: (x) => <div>{label(x.reason)}{x.note && <div style={{ color: 'var(--a-muted)', fontSize: 12 }}>“{x.note}”</div>}<div style={{ color: 'var(--a-muted)', fontSize: 12 }}>by {x.reporter}</div></div> }, { header: 'Status', render: (x) => <Badge value={x.status} /> },
    { header: '', right: true, render: (x) => x.status === 'open' ? <span className="a-actions" style={{ justifyContent: 'flex-end' }}><Btn size="sm" onClick={() => act(async () => { await send('POST', `/review-reports/${x.id}/resolve`, { outcome: 'dismiss' }); reports.reload(); reviews.reload(); }, 'Report dismissed')}>Dismiss</Btn><Btn size="sm" kind="danger" onClick={() => setRm({ report: x.id })}>Remove review</Btn></span> : null }];
  return (<div><PageHead title="Reviews" sub="Only verified buyers can review. Approved reviews feed the product rating." />
    <Tabs tabs={[['reviews', 'Reviews'], ['reports', 'Reports']]} value={tab} onChange={setTab} />
    {tab === 'reviews' ? <ListCard list={reviews} columns={rc} empty="No reviews in this view." filters={<select className="a-select" aria-label="Status" defaultValue="pending" onChange={(e) => reviews.set({ status: e.target.value || undefined })}><option value="pending">Pending approval</option><option value="approved">Approved</option><option value="flagged">Flagged</option><option value="removed">Removed</option><option value="">All</option></select>} />
      : <ListCard list={reports} columns={pc} empty="No reports." filters={<select className="a-select" aria-label="Status" defaultValue="" onChange={(e) => reports.set({ status: e.target.value || undefined })}><option value="">Open</option><option value="dismissed">Dismissed</option><option value="actioned">Actioned</option></select>} />}
    {rm && <RemoveModal title="Remove review" onClose={() => setRm(null)} onConfirm={async (note) => { rm.report ? await send('POST', `/review-reports/${rm.report}/resolve`, { outcome: 'remove_review', note }) : await send('POST', `/reviews/${rm.id}/moderate`, { action: 'remove', note }); setRm(null); reviews.reload(); reports.reload(); }} />}</div>);
}

export function Newsletter() {
  const list = useList('/newsletter', { limit: 25 }); const toast = useToast(); const c = list.meta?.counts ?? {};
  const exportCsv = async () => { try { const res = await api('/newsletter/export.csv', { raw: true }); const url = URL.createObjectURL(await res.blob()); const a = Object.assign(document.createElement('a'), { href: url, download: 'nessence-subscribers.csv' }); a.click(); URL.revokeObjectURL(url); } catch (e) { toast(e.message, 'bad'); } };
  return (<div><PageHead title="Newsletter" sub="Double opt-in: people are listed as subscribed only after confirming from their inbox."><Btn onClick={exportCsv}>Export subscribers (CSV)</Btn></PageHead>
    <div className="a-grid a-g4" style={{ marginBottom: 16 }}>{[['Subscribed', c.subscribed], ['Awaiting confirmation', c.pending], ['Unsubscribed', c.unsubscribed]].map(([l, v]) => <div key={l} className="a-card a-kpi"><div className="l">{l}</div><div className="v num">{v ?? 0}</div></div>)}</div>
    <ListCard list={list} columns={[{ header: 'Email', key: 'email' }, { header: 'Status', render: (r) => <Badge value={r.status} /> }, { header: 'Source', key: 'source' }, { header: 'Confirmed', render: (r) => day(r.subscribedAt) }]} empty="No subscribers yet." filters={<select className="a-select" aria-label="Status" onChange={(e) => list.set({ status: e.target.value || undefined })}><option value="">All</option><option value="subscribed">Subscribed</option><option value="pending">Pending</option><option value="unsubscribed">Unsubscribed</option></select>} /></div>);
}

function MessageModal({ id, onClose, onChanged }) {
  const { data: m, error, loading, reload } = useAsync(() => get(`/contact-messages/${id}`).then((r) => r.data), [id]); const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const toast = useToast();
  if (loading) return <Modal title="Message" onClose={onClose}><Loading /></Modal>; if (error) return <Modal title="Message" onClose={onClose}><ErrorBox error={error} /></Modal>;
  const status = async (s) => { try { await send('PATCH', `/contact-messages/${id}`, { status: s }); reload(); onChanged(); } catch (e) { toast(e.message, 'bad'); } };
  const reply = async () => { setBusy(true); setErr(''); try { await send('POST', `/contact-messages/${id}/reply`, { message: text }); setText(''); toast('Reply sent'); reload(); onChanged(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  return (<Modal title={m.subject} onClose={onClose}>
    <Dl items={[['From', `${m.name} <${m.email}>`], ['Received', dt(m.createdAt)], ['Category', label(m.category)], m.orderNumber ? ['Order', m.orderNumber] : null, ['Status', <Badge value={m.status} />]]} />
    <p style={{ whiteSpace: 'pre-wrap', background: 'var(--a-bg)', padding: 12, borderRadius: 6 }}>{m.message}</p>
    {m.replies.map((r, i) => <div key={i} style={{ borderLeft: '3px solid var(--a-accent)', paddingLeft: 10, margin: '10px 0' }}><div style={{ color: 'var(--a-muted)', fontSize: 12 }}>{r.by} · {dt(r.at)}</div><div style={{ whiteSpace: 'pre-wrap' }}>{r.message}</div></div>)}
    <Note tone="bad">{err}</Note>
    <Field as="textarea" label="Reply by email" value={text} onChange={(e) => setText(e.target.value)} maxLength={3000} hint="Sent to the customer’s email address. Only recorded once it is actually delivered." />
    <div className="a-actions"><Btn kind="primary" disabled={busy || text.trim().length < 5} onClick={reply}>{busy ? 'Sending…' : 'Send reply'}</Btn>{m.status !== 'resolved' ? <Btn onClick={() => status('resolved')}>Mark resolved</Btn> : <Btn onClick={() => status('in_progress')}>Reopen</Btn>}</div></Modal>);
}
export function Messages() {
  const list = useList('/contact-messages', { limit: 20 }); const [open, setOpen] = useState(null);
  return (<div><PageHead title="Messages" sub={list.meta?.newCount ? `${list.meta.newCount} new` : 'Customer enquiries from the Contact page.'} />
    <ListCard list={list} onRow={(r) => setOpen(r.id)} columns={[{ header: 'From', render: (r) => <div><b>{r.name}</b><div style={{ color: 'var(--a-muted)', fontSize: 12 }}>{r.email}</div></div> }, { header: 'Subject', render: (r) => <div>{r.subject}{r.orderNumber && <div className="mono" style={{ color: 'var(--a-muted)', fontSize: 12 }}>{r.orderNumber}</div>}</div> }, { header: 'Category', render: (r) => label(r.category) }, { header: 'Received', render: (r) => dt(r.createdAt) }, { header: 'Replies', num: true, right: true, key: 'replies' }, { header: 'Status', render: (r) => <Badge value={r.status} /> }]}
      empty="No messages yet." filters={<select className="a-select" aria-label="Status" onChange={(e) => list.set({ status: e.target.value || undefined })}><option value="">All</option><option value="new">New</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option></select>} />
    {open && <MessageModal id={open} onClose={() => setOpen(null)} onChanged={list.reload} />}</div>);
}
