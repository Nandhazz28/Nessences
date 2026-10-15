import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useSeo } from '../hooks/useSeo.js';
import { LockIcon } from '../components/common/Icon.jsx';
import { addressApi, checkoutApi, loadRazorpay } from '../services/checkout.js';
import { AddressForm } from '../components/checkout/AddressForm.jsx';
import { Totals } from '../components/cart/CartLines.jsx';
import { ErrorState, EmptyState, Spinner } from '../components/common/States.jsx';
import { formatMoney } from '../utils/format.js';
import { SessionGate } from '../components/common/SessionGate.jsx';

const STEPS = ['Address', 'Delivery', 'Payment'];

export default function Checkout() {
  useSeo({ title: 'Checkout', noindex: true });
  const { user, ready } = useAuth(); const { reload: reloadCart } = useCart(); const nav = useNavigate(); const loc = useLocation();
  const [step, setStep] = useState(0);
  const [addresses, setAddresses] = useState(null); const [addrId, setAddrId] = useState(null); const [adding, setAdding] = useState(false);
  const [cfg, setCfg] = useState(null); const [delivery, setDelivery] = useState('standard');
  const [view, setView] = useState(null); const [loadErr, setLoadErr] = useState(null);
  const [paying, setPaying] = useState(false); const [payErr, setPayErr] = useState('');
  const submitting = useRef(false); 

  const boot = useCallback(() => {
    setLoadErr(null);
    Promise.all([addressApi.list(), checkoutApi.config()]).then(([a, c]) => {
      setAddresses(a); setCfg(c); setAddrId((id) => id ?? (a.find((x) => x.isDefault) ?? a[0])?.id ?? null); setAdding(a.length === 0);
    }).catch(setLoadErr);
  }, []);
  useEffect(() => { if (user) boot(); }, [user, boot]);
  useEffect(() => { if (user) checkoutApi.preview(delivery).then(setView, setLoadErr); }, [user, delivery]);

  if (!ready) return <Spinner />;
  if (!user) return <SessionGate from={loc.pathname} />;
  if (loadErr) return <ErrorState error={loadErr} onRetry={() => { boot(); checkoutApi.preview(delivery).then(setView, setLoadErr); }} />;
  if (!addresses || !cfg || !view) return <Spinner />;
  if (view.items.length === 0) return <EmptyState title="Your bag is empty" action={<Link to="/new-arrivals" className="btn btn-solid">Shop new arrivals</Link>} />;
  if (!view.canCheckout) return <EmptyState title="Your bag needs attention" body="Some items are out of stock or have changed. Please review your bag." action={<Link to="/cart" className="btn btn-solid">Review bag</Link>} />;

  const pay = async () => {
    if (submitting.current) return;
    submitting.current = true; setPaying(true); setPayErr('');
    let order;
    try {
      const created = await checkoutApi.createOrder({ addressId: addrId, delivery });
      order = created.order;
      const Razorpay = await loadRazorpay();
      const rzp = new Razorpay({
        key: created.payment.keyId, order_id: created.payment.providerOrderId, amount: created.payment.amount, currency: created.payment.currency,
        name: 'Nessence', description: `Order ${order.orderNumber}`, prefill: { name: user.name, email: user.email, contact: user.phone }, theme: { color: '#181510' },
        handler: async (resp) => {
          try { await checkoutApi.verify(order.id, resp); } catch { /* the webhook will confirm; the success page polls */ }
          reloadCart(); nav(`/checkout/success?order=${order.id}`, { replace: true });
        },
        modal: { ondismiss: () => { submitting.current = false; setPaying(false); setPayErr('Payment was not completed. Your items are held for a short time — you can try again.'); } },
      });
      rzp.on('payment.failed', (r) => { checkoutApi.paymentFailed(order.id, r.error?.description).catch(() => {}); // best-effort note for support; the webhook is the source of truth
        setPayErr(r.error?.description || 'The payment failed. You can try again or use another method.'); });
      rzp.open();
    } catch (e) { submitting.current = false; setPaying(false); setPayErr(e.message); if (e.code === 'INSUFFICIENT_STOCK' || e.code === 'CART_HAS_ISSUES') reloadCart(); }
  };

  const addr = addresses.find((a) => a.id === addrId);
  return (
    <div className="wrap pt-8 pb-8">
      <ol className="flex justify-center gap-4 sm:gap-10 mb-10" aria-label="Checkout steps">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? 'step' : undefined} className="flex items-center gap-2 eyebrow !text-ink">
            <span className={`w-6 h-6 rounded-full grid place-items-center text-[0.7rem] border ${i <= step ? 'bg-ink text-paper border-ink' : 'border-stone text-muted'}`}>{i + 1}</span>
            <span className={i === step ? 'font-semibold' : 'text-muted hidden sm:inline'}>{s}</span>
          </li>
        ))}
      </ol>

      <div className="grid lg:grid-cols-[1fr_24rem] gap-12 items-start max-w-5xl mx-auto">
        <div>
          {step === 0 && (
            <section aria-labelledby="h0">
              <h1 id="h0" className="text-[length:var(--text-h2)] mb-5">Delivery address</h1>
              <ul className="space-y-3">
                {addresses.map((a) => (
                  <li key={a.id}><label className={`block border p-4 cursor-pointer ${a.id === addrId ? 'border-ink' : 'border-control'}`}>
                    <input type="radio" name="addr" className="mr-3" checked={a.id === addrId} onChange={() => setAddrId(a.id)} />
                    <strong>{a.fullName}</strong> <span className="eyebrow border border-stone px-1.5 ml-1">{a.label}</span>
                    <span className="block text-small text-muted ml-6">{a.line1}{a.line2 ? `, ${a.line2}` : ''}, {a.city}, {a.state} {a.pincode}<br />{a.phone}</span>
                  </label></li>
                ))}
              </ul>
              {adding
                ? <AddressForm defaultName={user.name} onCancel={addresses.length ? () => setAdding(false) : undefined} onSaved={(list) => { setAddresses(list); setAddrId(list[0].id); setAdding(false); }} />
                : <button className="link-u text-small mt-4" onClick={() => setAdding(true)}>+ Add a new address</button>}
              <button className="btn btn-solid w-full mt-8" disabled={!addrId || adding} onClick={() => setStep(1)}>Continue to delivery</button>
            </section>
          )}

          {step === 1 && (
            <section aria-labelledby="h1">
              <h1 id="h1" className="text-[length:var(--text-h2)] mb-5">Delivery method</h1>
              <fieldset className="space-y-3"><legend className="sr-only">Delivery method</legend>
                {cfg.delivery.map((d) => {
                  const fee = d.id === 'express' ? formatMoney(d.fee) : view.totals.shipping === 0 && delivery === 'standard' ? 'Free' : `Free over ${formatMoney(cfg.freeShippingThreshold)}`;
                  return (
                    <label key={d.id} className={`flex justify-between border p-4 cursor-pointer ${delivery === d.id ? 'border-ink' : 'border-control'}`}>
                      <span><input type="radio" name="delivery" className="mr-3" checked={delivery === d.id} onChange={() => setDelivery(d.id)} /><strong>{d.label}</strong><span className="block text-small text-muted ml-6">{d.eta}</span></span>
                      <span className="text-small">{fee}</span>
                    </label>
                  );
                })}
              </fieldset>
              <div className="flex gap-3 mt-8"><button className="btn btn-line" onClick={() => setStep(0)}>Back</button><button className="btn btn-solid flex-1" onClick={() => setStep(2)}>Continue to payment</button></div>
            </section>
          )}

          {step === 2 && (
            <section aria-labelledby="h2">
              <h1 id="h2" className="text-[length:var(--text-h2)] mb-5">Review and pay</h1>
              <div className="border border-stone p-4 text-small mb-3"><p className="eyebrow mb-1">Ship to</p>{addr.fullName}, {addr.line1}, {addr.city}, {addr.state} {addr.pincode}<button className="link-u ml-3" onClick={() => setStep(0)}>Change</button></div>
              <div className="border border-stone p-4 text-small mb-6"><p className="eyebrow mb-1">Delivery</p>{cfg.delivery.find((d) => d.id === delivery).label}<button className="link-u ml-3" onClick={() => setStep(1)}>Change</button></div>
              {!cfg.paymentsEnabled ? (
                <p role="alert" className="p-4 border border-oxblood text-oxblood text-small">Online payments are not configured on this server (no payment gateway keys). Orders cannot be placed until the store owner adds them.</p>
              ) : (
                <>
                  <p className="text-small text-muted mb-4">You’ll pay in a secure Razorpay window — cards, UPI, netbanking and wallets. Nessence never sees or stores your payment details.</p>
                  <button className="btn btn-solid w-full" disabled={paying} onClick={pay}>{paying ? 'Opening secure payment…' : `Pay ${formatMoney(view.totals.total)}`}</button>
                  <p className="text-center text-small text-muted mt-3 flex items-center justify-center gap-2"><LockIcon width={14} height={14} />Secure checkout</p>
                </>
              )}
              {payErr && <p role="alert" className="mt-4 p-3 border border-oxblood text-oxblood text-small">{payErr}</p>}
              <button className="btn btn-line mt-6" onClick={() => setStep(1)} disabled={paying}>Back</button>
            </section>
          )}
        </div>

        <aside className="border border-stone p-6 lg:sticky lg:top-8" aria-label="Order summary">
          <h2 className="text-[length:var(--text-h3)] mb-4">Order summary</h2>
          <ul className="mb-4">{view.items.map((l) => (
            <li key={l.variantId} className="flex gap-3 py-2 border-b rule"><div className="w-12 aspect-[4/5] bg-sand shrink-0">{l.image && <img src={l.image.url} alt="" className="w-full h-full object-cover" />}</div>
              <div className="flex-1 text-small"><p className="font-semibold">{l.name}</p><p className="text-muted">{l.color} · {l.size} · Qty {l.qty}</p></div><p className="text-small">{formatMoney(l.lineTotal)}</p></li>))}</ul>
          <Totals totals={view.totals} coupon={view.coupon} />
          <p className="text-small text-muted mt-3"><Link to="/cart" className="link-u">Edit bag</Link></p>
        </aside>
      </div>
    </div>
  );
}
