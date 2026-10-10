import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../../context/CartContext.jsx';
import { CartLine, Totals, CouponBox } from './CartLines.jsx';

import { useFocusTrap } from '../../hooks/useFocusTrap.js';

export function CartDrawer() {
  const { cart, drawerOpen, closeDrawer, notice } = useCart();
  const ref = useRef(null);
  useEffect(() => {
    if (!drawerOpen) return;
    document.body.style.overflow = 'hidden';
    const esc = (e) => e.key === 'Escape' && closeDrawer();
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('keydown', esc); document.body.style.overflow = ''; };
  }, [drawerOpen, closeDrawer]);
  useFocusTrap(ref, drawerOpen);
  if (!drawerOpen) return null;
  const empty = !cart || cart.items.length === 0;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-ink/40" onClick={closeDrawer} aria-hidden="true" />
      <aside ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Your bag" className="absolute right-0 top-0 h-full w-full max-w-md bg-paper flex flex-col animate-[slide_.28s_var(--ease-out-quint)]">
        <div className="flex justify-between items-center px-6 h-16 border-b rule">
          <h2 className="font-display text-2xl">Your bag{cart?.totals.itemCount ? ` (${cart.totals.itemCount})` : ''}</h2>
          <button className="eyebrow !text-ink font-semibold py-3" onClick={closeDrawer}>Close</button>
        </div>
        {notice && <p role="status" className="px-6 py-2 text-small bg-sand">{notice}</p>}
        {empty ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <p className="font-display text-2xl">Your bag is empty</p>
            <Link to="/new-arrivals" onClick={closeDrawer} className="btn btn-solid mt-6">Shop new arrivals</Link>
          </div>
        ) : (
          <>
            <ul className="flex-1 overflow-y-auto px-6">{cart.items.map((l) => <CartLine key={l.variantId} line={l} compact onNavigate={closeDrawer} />)}</ul>
            <div className="px-6 py-5 border-t rule">
              <Totals totals={cart.totals} coupon={cart.coupon} />
              <Link to="/cart" onClick={closeDrawer} className="btn btn-solid w-full mt-4">View bag</Link>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
