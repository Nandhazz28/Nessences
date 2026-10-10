import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync.js';
import { get, send } from '../api.js';
import { Badge, Btn, Card, Confirm, DataTable, Dl, ErrorBox, Field, ListCard, Loading, Modal, Note, PageHead, SearchBox, dt, label, money, useAction, useList, useToast } from '../ui.jsx';
import { REASON_LABEL } from '../../utils/labels.js';

const ORDER_STATUSES = ['confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'refunded'];

export function Orders() {
  const nav = useNavigate(); const list = useList('/orders', { limit: 20 });
  const cols = [{ header: 'Order', render: (r) => <span className="mono"><b>{r.orderNumber}</b></span> }, { header: 'Customer', render: (r) => r.customer && <div>{r.customer.name}<div style={{ color: 'var(--a-muted)', fontSize: 12 }}>{r.customer.email}</div></div> },
    { header: 'Placed', render: (r) => dt(r.createdAt) }, { header: 'Items', num: true, right: true, key: 'itemCount' }, { header: 'Status', render: (r) => <span><Badge value={r.status} />{r.attention && <> <Badge tone="bad" value="needs_attention" /></>}</span> }, { header: 'Total', right: true, num: true, render: (r) => money(r.total) }];
  return (<div><PageHead title="Orders" sub="Paid orders. Unpaid checkouts are not listed." />
    <ListCard list={list} columns={cols} onRow={(r) => nav(`/admin/orders/${r.id}`)} empty="No orders match." filters={<>
      <SearchBox onSearch={(q) => list.set({ q })} placeholder="Order number or customer email" />
      <select className="a-select" aria-label="Status" onChange={(e) => list.set({ status: e.target.value || undefined })}><option value="">All statuses</option>{ORDER_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
      <label className="a-check" style={{ margin: 0 }}><input type="checkbox" onChange={(e) => list.set({ attention: e.target.checked ? 'true' : undefined })} />Needs attention</label></>} /></div>);
}

function StatusModal({ order, to, onClose, onDone }) {
  const [note, setNote] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const go = async () => { setBusy(true); setErr(''); try { await send('POST', `/orders/${order.id}/status`, { status: to, note: note || undefined }); onDone(); } catch (e) { setErr(e.message); setBusy(false); } };
  return (<Modal title={`Mark as ${label(to).toLowerCase()}`} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind={to === 'cancelled' ? 'danger' : 'primary'} disabled={busy} onClick={go}>{busy ? 'Updating…' : `Confirm ${label(to).toLowerCase()}`}</Btn></>}>
    <Note tone="bad">{err}</Note>
    {to === 'cancelled' ? <Note tone="warn">The customer is notified, stock goes back on sale, and a refund of {money(order.totals.total)} is queued for you to process on the Refunds page.</Note> : <p style={{ marginTop: 0 }}>The customer will see this update{['shipped', 'delivered'].includes(to) ? ' and receive an email' : ''}.</p>}
    <Field label="Note (optional, saved in order history)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={to === 'shipped' ? 'e.g. Courier + tracking number' : ''} /></Modal>);
}

export function OrderDetail() {
  const { id } = useParams(); const { data: o, error, loading, reload } = useAsync(() => get(`/orders/${id}`).then((r) => r.data), [id]); const [to, setTo] = useState(null);
  if (loading) return <Loading />; if (error) return <ErrorBox error={error} onRetry={reload} />;
  const a = o.shippingAddress;
  return (<div>
    <PageHead title={`Order ${o.orderNumber}`} sub={`Placed ${dt(o.createdAt)}`}><Link className="a-btn" to="/admin/orders">Back</Link>
      {o.allowedTransitions.map((t) => <Btn key={t} kind={t === 'cancelled' ? 'danger' : 'primary'} onClick={() => setTo(t)}>{t === 'cancelled' ? 'Cancel order' : `Mark ${label(t).toLowerCase()}`}</Btn>)}</PageHead>
    {o.attention && <Note tone="warn">Needs attention: {label(o.attention)}. {o.attention.includes('REFUND') && <Link to="/admin/refunds">Open refunds</Link>}</Note>}
    <div className="a-grid a-g32">
      <div className="a-grid">
        <Card flush title="Items"><DataTable columns={[{ header: '', render: (i) => (i.image ? <img className="a-thumb" src={i.image.url} alt="" /> : null) }, { header: 'Product', render: (i) => <div><b>{i.name}</b><div style={{ color: 'var(--a-muted)', fontSize: 12 }}>{i.color} · {i.size} · <span className="mono">{i.sku}</span></div></div> }, { header: 'Qty', right: true, num: true, key: 'qty' }, { header: 'Unit', right: true, num: true, render: (i) => money(i.unitPrice) }, { header: 'Total', right: true, num: true, render: (i) => money(i.lineTotal) }]} rows={o.items.map((i) => ({ ...i, id: i._id }))} /></Card>
        <Card title="History"><ol style={{ margin: 0, paddingLeft: 18 }}>{[...o.statusHistory].reverse().map((h, i) => <li key={i} style={{ marginBottom: 6 }}><Badge value={h.status} /> <span style={{ color: 'var(--a-muted)' }}>{dt(h.at)}</span>{h.note ? ` — ${h.note}` : ''}</li>)}</ol></Card>
      </div>
      <div className="a-grid" style={{ alignContent: 'start' }}>
        <Card title="Summary"><Dl items={[['Status', <Badge value={o.status} />], ['Payment', <Badge value={o.paymentStatus === 'captured' ? 'captured' : o.paymentStatus} />], ['Subtotal', <span className="num">{money(o.totals.subtotal)}</span>], o.totals.discount ? ['Discount', <span className="num">−{money(o.totals.discount)}{o.coupon ? ` (${o.coupon.code})` : ''}</span>] : null, ['Shipping', <span className="num">{money(o.totals.shipping)}</span>], ['Tax', <span className="num">{money(o.totals.tax)}</span>], ['Total', <b className="num">{money(o.totals.total)}</b>]]} /></Card>
        <Card title="Customer"><p style={{ margin: 0 }}><Link to={`/admin/customers/${o.customer.id}`}>{o.customer.name}</Link><br />{o.customer.email}<br />{o.customer.phone}</p></Card>
        <Card title="Ship to"><p style={{ margin: 0 }}>{a.fullName}<br />{a.line1}{a.line2 ? `, ${a.line2}` : ''}<br />{a.city}, {a.state} {a.pincode}<br />{a.phone}</p><p style={{ color: 'var(--a-muted)', marginBottom: 0 }}>{o.delivery.label}</p></Card>
        <Card title="Payments & refunds">{o.payments.map((p) => <Dl key={p.id} items={[['Provider', p.provider], ['Reference', <span className="mono">{p.providerPaymentId ?? p.providerOrderId}</span>], ['Method', p.method], ['Status', <Badge value={p.status} />], p.failureReason ? ['Failure', p.failureReason] : null]} />)}
          {o.refunds.length > 0 && <><hr style={{ border: 0, borderTop: '1px solid var(--a-line)' }} />{o.refunds.map((r) => <p key={r.id} style={{ margin: '6px 0' }}><span className="num">{money(r.amount)}</span> <Badge value={r.status} /> {label(r.reason)}{r.failureReason ? ` — ${r.failureReason}` : ''}</p>)}</>}</Card>
        {o.returns.length > 0 && <Card title="Returns">{o.returns.map((r) => <p key={r.id} style={{ margin: '4px 0' }}><Link to="/admin/returns">{r.returnNumber}</Link> <Badge value={r.status} /></p>)}</Card>}
      </div>
    </div>
    {to && <StatusModal order={o} to={to} onClose={() => setTo(null)} onDone={() => { setTo(null); reload(); }} />}
  </div>);
}

function ReturnModal({ r, onClose, onDone }) {
  const [note, setNote] = useState(''); const [amount, setAmount] = useState(String(r.estimatedRefund / 100)); const [restock, setRestock] = useState(true); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const act = async (action) => { setBusy(true); setErr(''); try { await send('POST', `/returns/${r.id}/decision`, { action, note: note || undefined, ...(action === 'receive' ? { refundAmount: Math.round(parseFloat(amount) * 100), restock } : {}) }); onDone(); } catch (e) { setErr(e.message); setBusy(false); } };
  const allowed = r.allowed ?? [];
  return (<Modal title={`Return ${r.returnNumber}`} onClose={onClose} footer={<>{allowed.includes('rejected') && <Btn kind="danger" disabled={busy} onClick={() => act('reject')}>Reject</Btn>}{allowed.includes('approved') && <Btn kind="primary" disabled={busy} onClick={() => act('approve')}>Approve</Btn>}{allowed.includes('received') && <Btn kind="primary" disabled={busy} onClick={() => act('receive')}>Mark received</Btn>}</>}>
    <p style={{ marginTop: 0 }}>Order <Link to={`/admin/orders/${r.orderId}`}>{r.orderNumber}</Link> · {r.customer?.name} · <Badge value={r.status} /></p>
    <DataTable columns={[{ header: 'Item', render: (i) => <div>{i.name}<div style={{ color: 'var(--a-muted)', fontSize: 12 }}>{i.color} · {i.size}</div></div> }, { header: 'Qty', num: true, right: true, key: 'qty' }, { header: 'Reason', render: (i) => <span>{REASON_LABEL[i.reason]}{i.comment && <div style={{ color: 'var(--a-muted)', fontSize: 12 }}>“{i.comment}”</div>}</span> }]} rows={r.items.map((i, n) => ({ ...i, id: n }))} />
    <Note tone="bad">{err}</Note>
    {allowed.length === 0 ? <p style={{ color: 'var(--a-muted)' }}>No further actions. {r.staffNote && <>Note sent: “{r.staffNote}”</>}</p> : <>
      <Field as="textarea" label={allowed.includes('rejected') ? 'Message to customer (required to reject)' : 'Note to customer (optional)'} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
      {allowed.includes('received') && <><Field label="Refund amount (₹)" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} hint={`Up to ${money(r.estimatedRefund)}. A pending refund is created for you to process.`} /><label className="a-check"><input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />Return items to sellable stock</label></>}</>}
  </Modal>);
}

export function Returns() {
  const list = useList('/returns', { limit: 20 }); const [open, setOpen] = useState(null); const toast = useToast();
  const cols = [{ header: 'Return', render: (r) => <b className="mono">{r.returnNumber}</b> }, { header: 'Order', render: (r) => <span className="mono">{r.orderNumber}</span> }, { header: 'Customer', render: (r) => r.customer?.name }, { header: 'Items', num: true, right: true, render: (r) => r.items.reduce((s, i) => s + i.qty, 0) },
    { header: 'Requested', render: (r) => dt(r.createdAt) }, { header: 'Status', render: (r) => <Badge value={r.status} /> }, { header: 'Est. refund', right: true, num: true, render: (r) => money(r.estimatedRefund) }];
  return (<div><PageHead title="Returns" sub="Review customer return requests." />
    <ListCard list={list} columns={cols} onRow={async (r) => { try { setOpen((await get(`/returns/${r.id}`)).data); } catch (e) { toast(e.message, 'bad'); } }} empty="No returns." filters={<select className="a-select" aria-label="Status" onChange={(e) => list.set({ status: e.target.value || undefined })}><option value="">All statuses</option>{['requested', 'approved', 'received', 'refunded', 'rejected', 'withdrawn'].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>} />
    {open && <ReturnModal r={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); list.reload(); }} />}</div>);
}

export function Refunds() {
  const list = useList('/refunds', { limit: 20 }); const act = useAction();
  const cols = [{ header: 'Order', render: (r) => <Link to={`/admin/orders/${r.orderId}`} className="mono">{r.orderNumber}</Link> }, { header: 'Customer', render: (r) => r.customer?.name }, { header: 'Reason', render: (r) => label(r.reason) }, { header: 'Created', render: (r) => dt(r.createdAt) },
    { header: 'Status', render: (r) => <span><Badge value={r.status} />{r.failureReason && <div style={{ color: 'var(--a-danger)', fontSize: 12 }}>{r.failureReason}</div>}</span> }, { header: 'Amount', right: true, num: true, render: (r) => money(r.amount) },
    { header: '', right: true, render: (r) => ['pending', 'failed'].includes(r.status) ? <Confirm trigger={r.status === 'failed' ? 'Retry' : 'Process'} title={`Refund ${money(r.amount)}?`} message={`This sends ${money(r.amount)} back to the customer’s original payment method through the payment gateway. It can’t be undone.`} confirmLabel="Send refund" onConfirm={async () => { await send('POST', `/refunds/${r.id}/process`); list.reload(); }} /> : r.providerRefundId ? <span className="mono" style={{ fontSize: 12 }}>{r.providerRefundId}</span> : null }];
  return (<div><PageHead title="Refunds" sub="Money owed to customers. Processing sends a real refund through the payment gateway." />
    <ListCard list={list} columns={cols} empty="No refunds." filters={<select className="a-select" aria-label="Status" onChange={(e) => list.set({ status: e.target.value || undefined })}><option value="">All statuses</option>{['pending', 'processing', 'processed', 'failed'].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>} /></div>);
}
