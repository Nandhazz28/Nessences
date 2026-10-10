import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync.js';
import { accountApi, ordersApi } from '../../services/account.js';
import { OrderTracker } from '../../components/checkout/OrderTracker.jsx';
import { Totals } from '../../components/cart/CartLines.jsx';
import { ErrorState, EmptyState, Spinner } from '../../components/common/States.jsx';
import { formatMoney } from '../../utils/format.js';
import { ORDER_LABEL, RETURN_LABEL, REASON_LABEL, REFUND_LABEL, date } from '../../utils/labels.js';

const Badge = ({ children, tone }) => <span className={`eyebrow !normal-case !tracking-normal border px-2 py-0.5 ${tone === 'bad' ? 'border-oxblood text-oxblood' : 'border-stone'}`}>{children}</span>;

export function Orders() {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useAsync(() => ordersApi.list(page), [page]);
  if (loading) return <Spinner />; if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data.items.length) return <EmptyState title="No orders yet" body="Once you place an order it will appear here." action={<Link to="/new-arrivals" className="btn btn-solid">Shop new arrivals</Link>} />;
  return (
    <div><h2 className="text-[length:var(--text-h2)] mb-6">Orders</h2>
      <ul className="border-t rule">{data.items.map((o) => (
        <li key={o.id} className="py-5 border-b rule flex gap-4 items-center">
          <div className="flex -space-x-3">{o.items.slice(0, 3).map((i) => <div key={i.id} className="w-12 aspect-[4/5] bg-sand border border-paper">{i.image && <img src={i.image.url} alt="" className="w-full h-full object-cover" />}</div>)}</div>
          <div className="flex-1 min-w-0"><p className="font-semibold">{o.orderNumber}</p><p className="text-small text-muted">{date(o.createdAt)} · {o.items.reduce((s, i) => s + i.qty, 0)} items · {formatMoney(o.totals.total)}</p></div>
          <Badge tone={o.status === 'cancelled' ? 'bad' : undefined}>{ORDER_LABEL[o.status]}</Badge>
          <Link to={o.id} className="link-u text-small">View</Link>
        </li>))}</ul>
      {data.pagination.pages > 1 && <div className="flex gap-4 mt-8 items-center"><button className="btn btn-line" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span className="text-small text-muted">Page {page} of {data.pagination.pages}</span><button className="btn btn-line" disabled={page >= data.pagination.pages} onClick={() => setPage(page + 1)}>Next</button></div>}
    </div>
  );
}

export function OrderDetail() {
  const { id } = useParams();
  const { data: o, error, loading, reload } = useAsync(() => ordersApi.get(id), [id]);
  const [confirm, setConfirm] = useState(false); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const [order, setOrder] = useState(null);
  const cur = order ?? o;
  if (loading) return <Spinner />;
  if (error) return error.status === 404 ? <EmptyState title="Order not found" action={<Link to="/account/orders" className="btn btn-line">All orders</Link>} /> : <ErrorState error={error} onRetry={reload} />;
  const a = cur.shippingAddress;
  const cancel = async () => { setBusy(true); setMsg(''); try { setOrder(await ordersApi.cancel(id)); setConfirm(false); } catch (e) { setMsg(e.message); } finally { setBusy(false); } };
  return (
    <div>
      <p className="eyebrow"><Link to="/account/orders">Orders</Link> / {cur.orderNumber}</p>
      <h2 className="text-[length:var(--text-h2)] mt-2">Order {cur.orderNumber}</h2>
      <p className="text-muted text-small mt-1">Placed {date(cur.createdAt)} · {ORDER_LABEL[cur.status]}</p>
      {msg && <p role="alert" className="mt-4 p-3 border border-oxblood text-oxblood text-small">{msg}</p>}
      {cur.refunds.map((r) => <p key={r.id} role="status" className="mt-4 p-3 bg-sand text-small">{REFUND_LABEL[r.status]} · {formatMoney(r.amount)}{r.status === 'pending' ? ' — we’ll refund this to your original payment method.' : ''}</p>)}
      <div className="grid md:grid-cols-2 gap-10 mt-8">
        <div><h3 className="text-[length:var(--text-h3)] mb-4">Progress</h3><OrderTracker status={cur.status} history={cur.statusHistory} /></div>
        <div><h3 className="text-[length:var(--text-h3)] mb-4">Delivering to</h3><p className="text-small">{a.fullName}<br />{a.line1}{a.line2 ? `, ${a.line2}` : ''}<br />{a.city}, {a.state} {a.pincode}<br />{a.phone}</p><p className="text-small text-muted mt-2">{cur.delivery.label}</p></div>
      </div>
      <ul className="mt-8 border-t rule">{cur.items.map((i) => (
        <li key={i.id} className="flex gap-4 py-4 border-b rule"><Link to={`/products/${i.slug}`} className="w-16 aspect-[4/5] bg-sand shrink-0">{i.image && <img src={i.image.url} alt={i.image.alt} className="w-full h-full object-cover" />}</Link>
          <div className="flex-1"><p className="font-semibold">{i.name}</p><p className="text-small text-muted">{i.color} · {i.size} · Qty {i.qty}</p></div><p>{formatMoney(i.lineTotal)}</p></li>))}</ul>
      <div className="max-w-sm ml-auto mt-6"><Totals totals={{ ...cur.totals, itemCount: cur.items.reduce((s, i) => s + i.qty, 0) }} coupon={cur.coupon} /></div>
      <div className="mt-8 flex flex-wrap gap-3 items-center">
        {cur.returns.eligible && <Link to="return" className="btn btn-solid">Return items</Link>}
        {!cur.returns.eligible && cur.status === 'delivered' && <p className="text-small text-muted">{cur.returns.reason}</p>}
        {cur.canCancel && !confirm && <button className="btn btn-line" onClick={() => setConfirm(true)}>Cancel order</button>}
        {confirm && <div role="alertdialog" aria-label="Confirm cancellation" className="border border-oxblood p-4 text-small"><p>Cancel this order? Your refund will be sent to your original payment method.</p>
          <div className="mt-3 flex gap-3"><button className="btn btn-solid" disabled={busy} onClick={cancel}>{busy ? 'Cancelling…' : 'Yes, cancel order'}</button><button className="btn btn-line" onClick={() => setConfirm(false)}>Keep order</button></div></div>}
      </div>
      {cur.returns.ids.length > 0 && <p className="mt-6 text-small">Returns: {cur.returns.ids.map((r) => <Link key={r.id} to={`/account/returns/${r.id}`} className="link-u mr-3">{r.returnNumber} ({RETURN_LABEL[r.status]})</Link>)}</p>}
    </div>
  );
}

export function NewReturn() {
  const { id } = useParams(); const nav = useNavigate();
  const { data: o, error, loading, reload } = useAsync(() => ordersApi.get(id), [id]);
  const [sel, setSel] = useState({}); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  if (loading) return <Spinner />; if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!o.returns.eligible) return <EmptyState title="This order can’t be returned" body={o.returns.reason || 'All eligible items already have a return.'} action={<Link to={`/account/orders/${id}`} className="btn btn-line">Back to order</Link>} />;
  const picked = Object.entries(sel).filter(([, v]) => v.on);
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    if (!picked.length) return setErr('Select at least one item to return.');
    if (picked.some(([, v]) => !v.reason)) return setErr('Choose a reason for each item.');
    setBusy(true);
    try { const r = await accountApi.createReturn({ orderId: id, items: picked.map(([itemId, v]) => ({ itemId, qty: Number(v.qty || 1), reason: v.reason, comment: v.comment || undefined })) }); nav(`/account/returns/${r.id}`, { replace: true }); }
    catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  const upd = (k, patch) => setSel((s) => ({ ...s, [k]: { ...s[k], ...patch } }));
  return (
    <form onSubmit={submit} noValidate>
      <p className="eyebrow"><Link to={`/account/orders/${id}`}>{o.orderNumber}</Link> / Return</p>
      <h2 className="text-[length:var(--text-h2)] mt-2">Return items</h2>
      <p className="text-small text-muted mt-1">Return window closes {date(o.returns.deadline)}. Items must be unworn with tags attached.</p>
      <ul className="mt-6 border-t rule">{o.items.filter((i) => i.returnableQty > 0).map((i) => { const v = sel[i.id] ?? {}; return (
        <li key={i.id} className="py-4 border-b rule">
          <label className="flex gap-4 items-center cursor-pointer"><input type="checkbox" checked={!!v.on} onChange={(e) => upd(i.id, { on: e.target.checked })} />
            <div className="w-12 aspect-[4/5] bg-sand">{i.image && <img src={i.image.url} alt="" className="w-full h-full object-cover" />}</div>
            <span className="flex-1"><strong>{i.name}</strong><span className="block text-small text-muted">{i.color} · {i.size} · {formatMoney(i.unitPrice)}</span></span></label>
          {v.on && <div className="mt-3 ml-10 grid sm:grid-cols-[6rem_1fr] gap-3">
            <label className="text-small">Qty<select className="field !h-10 mt-1" value={v.qty ?? 1} onChange={(e) => upd(i.id, { qty: e.target.value })}>{Array.from({ length: i.returnableQty }, (_, n) => <option key={n}>{n + 1}</option>)}</select></label>
            <label className="text-small">Reason<select className="field !h-10 mt-1" value={v.reason ?? ''} onChange={(e) => upd(i.id, { reason: e.target.value })}><option value="">Select…</option>{Object.entries(REASON_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="text-small sm:col-span-2">Comments (optional)<textarea className="field !h-20 py-2 mt-1" maxLength={500} value={v.comment ?? ''} onChange={(e) => upd(i.id, { comment: e.target.value })} /></label></div>}
        </li>); })}</ul>
      {err && <p role="alert" className="mt-4 text-small text-oxblood">{err}</p>}
      <button className="btn btn-solid mt-6" disabled={busy}>{busy ? 'Submitting…' : 'Submit return request'}</button>
    </form>
  );
}

export function Returns() {
  const { data, error, loading, reload } = useAsync(() => accountApi.returns(), []);
  if (loading) return <Spinner />; if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data.length) return <EmptyState title="No returns" body="Start a return from any delivered order within 14 days." action={<Link to="/account/orders" className="btn btn-line">View orders</Link>} />;
  return (<div><h2 className="text-[length:var(--text-h2)] mb-6">Returns</h2><ul className="border-t rule">{data.map((r) => (
    <li key={r.id} className="py-4 border-b rule flex gap-4 items-center"><div className="flex-1"><p className="font-semibold">{r.returnNumber}</p><p className="text-small text-muted">{date(r.createdAt)} · {r.items.length} item{r.items.length > 1 ? 's' : ''}</p></div><Badge tone={r.status === 'rejected' ? 'bad' : undefined}>{RETURN_LABEL[r.status]}</Badge><Link to={r.id} className="link-u text-small">View</Link></li>))}</ul></div>);
}

export function ReturnDetail() {
  const { id } = useParams(); const { data, error, loading, reload } = useAsync(() => accountApi.returnById(id), [id]);
  const [over, setOver] = useState(null); const [err, setErr] = useState('');
  if (loading) return <Spinner />; if (error) return <ErrorState error={error} onRetry={reload} />;
  const r = over ? { ...data, ...over } : data;
  return (
    <div><p className="eyebrow"><Link to="/account/returns">Returns</Link> / {r.returnNumber}</p>
      <h2 className="text-[length:var(--text-h2)] mt-2">Return {r.returnNumber}</h2>
      <p className="text-small text-muted mt-1">For order <Link className="link-u" to={`/account/orders/${r.orderId}`}>{r.orderNumber}</Link> · <Badge tone={r.status === 'rejected' ? 'bad' : undefined}>{RETURN_LABEL[r.status]}</Badge></p>
      {r.staffNote && <p role="status" className="mt-4 p-3 bg-sand text-small"><strong>From our team:</strong> {r.staffNote}</p>}
      <ul className="mt-6 border-t rule">{r.items.map((i, n) => (<li key={n} className="flex gap-4 py-4 border-b rule"><div className="w-14 aspect-[4/5] bg-sand">{i.image && <img src={i.image.url} alt="" className="w-full h-full object-cover" />}</div>
        <div className="flex-1"><p className="font-semibold">{i.name}</p><p className="text-small text-muted">{i.color} · {i.size} · Qty {i.qty} · {REASON_LABEL[i.reason]}</p>{i.comment && <p className="text-small mt-1">“{i.comment}”</p>}</div><p>{formatMoney(i.unitPrice * i.qty)}</p></li>))}</ul>
      <p className="mt-4 text-small text-muted">Estimated refund {formatMoney(r.estimatedRefund)} — the final amount is confirmed when we receive the items.</p>
      <ol className="mt-6 text-small space-y-1">{r.history.map((h, n) => <li key={n}><span className="text-muted">{date(h.at)}</span> — {RETURN_LABEL[h.status]}{h.note ? `: ${h.note}` : ''}</li>)}</ol>
      {err && <p role="alert" className="mt-4 text-small text-oxblood">{err}</p>}
      {r.status === 'requested' && <button className="btn btn-line mt-6" onClick={async () => { try { setOver(await accountApi.withdrawReturn(id)); } catch (e) { setErr(e.message); } }}>Withdraw request</button>}
    </div>
  );
}
