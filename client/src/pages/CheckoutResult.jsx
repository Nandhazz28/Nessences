import { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useSeo } from '../hooks/useSeo.js';
import { checkoutApi } from '../services/checkout.js';
import { OrderTracker } from '../components/checkout/OrderTracker.jsx';
import { Totals } from '../components/cart/CartLines.jsx';
import { ErrorState, Spinner } from '../components/common/States.jsx';
import { formatMoney } from '../utils/format.js';

export function CheckoutSuccess() {
  useSeo({ title: 'Order confirmation', noindex: true });
  const id = useSearchParams()[0].get('order'); const { user, ready } = useAuth();
  const [order, setOrder] = useState(null); const [err, setErr] = useState(null); const [tries, setTries] = useState(0);

  useEffect(() => {
    if (!user || !id) return;
    const ctrl = new AbortController(); let timer;
    checkoutApi.order(id, ctrl.signal).then((o) => {
      setOrder(o);
      // The webhook may land a moment after the browser returns: keep checking for ~45s.
      if (o.status === 'pending_payment' && tries < 15) timer = setTimeout(() => setTries((t) => t + 1), 3000);
    }, (e) => e.name !== 'AbortError' && setErr(e));
    return () => { ctrl.abort(); clearTimeout(timer); };
  }, [user, id, tries]);

  if (!ready) return <Spinner />;
  if (!user) return <Navigate to="/login" state={{ from: `/checkout/success?order=${id}` }} replace />;
  if (!id) return <Navigate to="/" replace />;
  if (err) return <ErrorState error={err} onRetry={() => { setErr(null); setTries((t) => t + 1); }} />;
  if (!order) return <Spinner label="Loading your order" />;

  if (order.status === 'pending_payment') return (
    <div className="wrap py-24 text-center"><h1 className="text-[length:var(--text-h2)]">Confirming your payment…</h1>
      <p className="mt-3 text-muted">{tries < 15 ? 'This usually takes a few seconds. Please don’t close this page.' : 'We haven’t received confirmation yet. If money left your account it will be matched automatically — check your orders shortly.'}</p></div>
  );
  if (order.status === 'cancelled') return <Navigate to={`/checkout/failed?order=${order.id}`} replace />;

  const a = order.shippingAddress;
  return (
    <div className="wrap py-14 max-w-4xl">
      <p className="eyebrow">Thank you</p>
      <h1 className="text-[length:var(--text-h1)] mt-2">Order placed.</h1>
      <p className="mt-3 text-muted">Order <strong className="text-ink">{order.orderNumber}</strong> · a confirmation has been emailed to {user.email}.</p>
      {order.attention && <p role="alert" className="mt-4 p-3 border border-oxblood text-oxblood text-small">Your payment arrived after your reserved items were released. Our team will contact you or refund you in full.</p>}
      <div className="grid md:grid-cols-2 gap-12 mt-10">
        <section aria-labelledby="tr"><h2 id="tr" className="text-[length:var(--text-h3)] mb-4">Order status</h2><OrderTracker status={order.status} history={order.statusHistory} /></section>
        <section aria-labelledby="dl"><h2 id="dl" className="text-[length:var(--text-h3)] mb-4">Delivering to</h2>
          <p className="text-small">{a.fullName}<br />{a.line1}{a.line2 ? `, ${a.line2}` : ''}<br />{a.city}, {a.state} {a.pincode}<br />{a.phone}</p>
          <p className="text-small text-muted mt-3">{order.delivery.label} · {order.delivery.eta}</p></section>
      </div>
      <ul className="mt-10 border-t rule">{order.items.map((i) => (
        <li key={i.id} className="flex gap-4 py-4 border-b rule"><div className="w-16 aspect-[4/5] bg-sand">{i.image && <img src={i.image.url} alt={i.image.alt} className="w-full h-full object-cover" />}</div>
          <div className="flex-1"><p className="font-semibold">{i.name}</p><p className="text-small text-muted">{i.color} · {i.size} · Qty {i.qty}</p></div><p>{formatMoney(i.lineTotal)}</p></li>))}</ul>
      <div className="max-w-sm ml-auto mt-6"><Totals totals={{ ...order.totals, itemCount: order.items.reduce((s, i) => s + i.qty, 0) }} coupon={order.coupon} /></div>
      <Link to="/new-arrivals" className="btn btn-line mt-10">Continue shopping</Link>
    </div>
  );
}

export function CheckoutFailed() {
  useSeo({ title: 'Payment not completed', noindex: true });
  return (
    <div className="wrap py-28 text-center max-w-xl">
      <h1 className="text-[length:var(--text-h2)]">Payment not completed</h1>
      <p className="mt-4 text-muted">No order was placed and you haven’t been charged for it. If money was debited, your bank will reverse it automatically — it can take a few working days.</p>
      <div className="mt-10 flex justify-center gap-3"><Link to="/checkout" className="btn btn-solid">Try again</Link><Link to="/cart" className="btn btn-line">Back to bag</Link></div>
    </div>
  );
}
