import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSeo } from '../hooks/useSeo.js';
import { contactApi } from '../services/engage.js';
import { OrderTracker } from '../components/checkout/OrderTracker.jsx';

const label = (s) => s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export default function TrackOrder() {
  useSeo({ title: 'Track your order', description: 'Check the status of your Nessence order with your order number and email address.', noindex: true });
  const uid = useId();
  const [state, setState] = useState({ status: 'idle', order: null, message: '' });
  const submit = async (e) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget));
    setState({ status: 'loading', order: null, message: '' });
    try { setState({ status: 'done', order: await contactApi.track(f.orderNumber.trim(), f.email.trim()), message: '' }); }
    catch (err) { setState({ status: 'error', order: null, message: err.status === 404 ? 'We could not find an order matching those details. Check the order number and the email address used at checkout.' : (err.details?.[0]?.message ?? err.message) }); }
  };
  const o = state.order;
  return (
    <div className="wrap py-14 md:py-20 max-w-3xl">
      <p className="eyebrow">Customer care</p>
      <h1 className="text-[length:var(--text-h1)] mt-3">Track your order</h1>
      <p className="mt-4 text-muted max-w-lg">Enter your order number and the email address you used at checkout. Signed in? <Link to="/account/orders" className="link-u">Open your orders</Link>.</p>
      <form onSubmit={submit} className="mt-10 grid gap-5 sm:grid-cols-[1fr_1fr_auto] items-end" aria-label="Track order">
        <div><label htmlFor={`${uid}o`} className="eyebrow block mb-2">Order number</label><input id={`${uid}o`} name="orderNumber" className="field uppercase" required placeholder="NS-2610-A1B2C3" maxLength={20} autoComplete="off" /></div>
        <div><label htmlFor={`${uid}e`} className="eyebrow block mb-2">Email</label><input id={`${uid}e`} name="email" type="email" className="field" required autoComplete="email" /></div>
        <button className="btn btn-solid" disabled={state.status === 'loading'}>{state.status === 'loading' ? 'Looking…' : 'Track'}</button>
      </form>
      {state.status === 'error' && <p role="alert" className="mt-6 p-4 border border-oxblood text-oxblood text-small">{state.message}</p>}
      {o && (
        <section aria-label={`Order ${o.orderNumber}`} className="mt-14 border-t rule pt-10">
          <div className="flex flex-wrap justify-between gap-4">
            <div><p className="eyebrow">Order</p><h2 className="text-[length:var(--text-h3)]">{o.orderNumber}</h2></div>
            <div className="text-small text-muted sm:text-right"><p>Placed {new Date(o.placedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p><p>Status: <strong className="text-ink">{label(o.status)}</strong></p>{o.delivery?.label && <p>{o.delivery.label}{o.delivery.eta ? ` · ${o.delivery.eta}` : ''}{o.city ? ` · to ${o.city}` : ''}</p>}</div>
          </div>
          <div className="mt-8"><OrderTracker status={o.status} history={o.statusHistory} /></div>
          <ul className="mt-10 border-t rule">{o.items.map((i, k) => (
            <li key={k} className="py-4 border-b rule flex gap-4 items-center">
              {i.image && <img src={typeof i.image === 'string' ? i.image : i.image.url} alt="" width="56" height="70" className="w-14 aspect-[4/5] object-cover bg-sand" loading="lazy" />}
              <div className="text-small"><p className="font-semibold">{i.name}</p><p className="text-muted">{[i.color, i.size].filter(Boolean).join(' · ')} · Qty {i.qty}</p></div>
            </li>))}</ul>
        </section>
      )}
    </div>
  );
}
