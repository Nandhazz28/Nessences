import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useSeo } from '../hooks/useSeo.js';
import { CartLine, Totals, CouponBox } from '../components/cart/CartLines.jsx';
import { ErrorState, EmptyState, Spinner } from '../components/common/States.jsx';
import { formatMoney } from '../utils/format.js';

export default function Cart() {
  useSeo({ title: 'Your bag', noindex: true });
  const { user } = useAuth();
  const { cart, loadError, reload, move, remove, notice, setNotice } = useCart();
  if (loadError) return <ErrorState error={loadError} onRetry={reload} />;
  if (!cart) return <Spinner />;
  const empty = cart.items.length === 0;
  const act = (fn) => fn().catch((e) => setNotice(e.message));
  return (
    <div className="wrap pt-10">
      <h1 className="text-[length:var(--text-h1)]">Your bag{!empty && ` (${cart.totals.itemCount})`}</h1>
      {notice && <p role="status" className="mt-4 p-3 bg-sand text-small">{notice}</p>}
      {empty ? (
        <EmptyState title="Your bag is empty" body="Pieces you add will wait here for you." action={<Link to="/new-arrivals" className="btn btn-solid">Shop new arrivals</Link>} />
      ) : (
        <div className="mt-8 grid lg:grid-cols-[1fr_24rem] gap-12 items-start">
          <ul className="border-t rule">{cart.items.map((l) => <CartLine key={l.variantId} line={l} />)}</ul>
          <aside className="border border-stone p-6 lg:sticky lg:top-28" aria-label="Order summary">
            <h2 className="text-[length:var(--text-h3)] mb-3">Order summary</h2>
            <Totals totals={cart.totals} coupon={cart.coupon} />
            <CouponBox />
            {cart.canCheckout
              ? <Link to={user ? '/checkout' : '/login'} state={user ? undefined : { from: '/checkout' }} className="btn btn-solid w-full mt-3">{user ? 'Proceed to checkout' : 'Sign in to check out'}</Link>
              : null}
            {!cart.canCheckout && <p role="alert" className="text-small text-oxblood mt-2">Resolve the items marked above before continuing.</p>}
            <p className="text-small text-muted mt-3">Shipping is free over ₹5,000. Final amounts are calculated securely at checkout.</p>
          </aside>
        </div>
      )}
      {cart.saved.length > 0 && (
        <section className="mt-16" aria-labelledby="sv">
          <h2 id="sv" className="text-[length:var(--text-h3)]">Saved for later ({cart.saved.length})</h2>
          <ul className="mt-4 border-t rule">
            {cart.saved.map((l) => (
              <li key={l.variantId} className="flex gap-4 py-4 border-b rule items-center">
                <div className="w-16 aspect-[4/5] bg-sand">{l.image && <img src={l.image.url} alt={l.image.alt} className="w-full h-full object-cover" />}</div>
                <div className="flex-1"><p className="font-semibold">{l.name}</p><p className="text-small text-muted">{l.color} · Size {l.size} · {l.status === 'out_of_stock' ? 'Out of stock' : formatMoney(l.unitPrice)}</p></div>
                <button className="text-small link-u" disabled={l.status === 'out_of_stock' || l.status === 'unavailable'} onClick={() => act(() => move(l.variantId))}>Move to bag</button>
                <button className="text-small link-u" onClick={() => act(() => remove(l.variantId))}>Remove</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
