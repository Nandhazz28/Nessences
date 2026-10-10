import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../../context/CartContext.jsx';
import { formatMoney } from '../../utils/format.js';

const STATUS_NOTE = {
  out_of_stock: 'Out of stock — remove or save for later',
  unavailable: 'No longer available',
  insufficient: (l) => `Only ${l.available} left — reduce the quantity`,
  low_stock: (l) => `Only ${l.available} left`,
};

export function CartLine({ line, compact, onNavigate }) {
  const { setQty, remove, save, setNotice } = useCart();
  const [busy, setBusy] = useState(false);
  const act = async (fn) => { setBusy(true); try { await fn(); } catch (e) { setNotice(e.message); } finally { setBusy(false); } };
  const note = STATUS_NOTE[line.status]; const noteText = typeof note === 'function' ? note(line) : note;
  const blocked = line.status === 'out_of_stock' || line.status === 'unavailable';
  return (
    <li className="flex gap-4 py-5 border-b rule">
      <Link to={line.slug ? `/products/${line.slug}` : '/'} onClick={onNavigate} className={`shrink-0 bg-sand ${compact ? 'w-20' : 'w-24 md:w-32'} aspect-[4/5]`}>
        {line.image && <img src={line.image.url} alt={line.image.alt} loading="lazy" className={`w-full h-full object-cover ${blocked ? 'opacity-50' : ''}`} />}
      </Link>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between gap-3">
          <div>
            <p className="font-semibold">{line.name}</p>
            {line.color && <p className="text-small text-muted">{line.color} · Size {line.size}</p>}
          </div>
          <p className="font-semibold whitespace-nowrap">{blocked ? '—' : formatMoney(line.lineTotal)}</p>
        </div>
        {noteText && <p role="status" className="text-small text-oxblood mt-1">{noteText}</p>}
        <div className="mt-3 flex items-center gap-5 flex-wrap">
          {!blocked && (
            <div className="inline-flex items-center border border-control" role="group" aria-label={`Quantity for ${line.name}`}>
              <button className="w-9 h-9" disabled={busy || line.qty <= 1} aria-label="Decrease quantity" onClick={() => act(() => setQty(line.variantId, line.qty - 1))}>−</button>
              <span className="w-8 text-center" aria-live="polite">{line.qty}</span>
              <button className="w-9 h-9" disabled={busy || line.qty >= line.available} aria-label="Increase quantity" onClick={() => act(() => setQty(line.variantId, line.qty + 1))}>+</button>
            </div>
          )}
          <button className="text-small link-u" disabled={busy} onClick={() => act(() => save(line.variantId))}>Save for later</button>
          <button className="text-small link-u" disabled={busy} onClick={() => act(() => remove(line.variantId))}>Remove</button>
        </div>
      </div>
    </li>
  );
}

export function Totals({ totals, coupon }) {
  const row = (l, v, strong) => <div className={`flex justify-between py-1.5 ${strong ? 'font-semibold text-lg border-t rule mt-2 pt-3' : 'text-muted'}`}><dt>{l}</dt><dd className={strong ? '' : 'text-ink'}>{v}</dd></div>;
  return (
    <dl>
      {row(`Subtotal (${totals.itemCount} ${totals.itemCount === 1 ? 'item' : 'items'})`, formatMoney(totals.subtotal))}
      {totals.discount > 0 && row(`Discount${coupon ? ` (${coupon.code})` : ''}`, `−${formatMoney(totals.discount)}`)}
      {row('Shipping', totals.shipping === 0 ? 'Free' : formatMoney(totals.shipping))}
      {row('Estimated tax (GST 5%)', formatMoney(totals.tax))}
      {row('Total', formatMoney(totals.total), true)}
    </dl>
  );
}

export function CouponBox() {
  const { cart, applyCoupon, removeCoupon } = useCart();
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); const code = new FormData(e.currentTarget).get('code').toString().trim();
    if (!code) return; setBusy(true); setErr('');
    try { await applyCoupon(code); e.currentTarget.reset(); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  if (cart.coupon) return (
    <p className="py-3 text-small flex justify-between"><span>Code <strong>{cart.coupon.code}</strong> applied</span>
      <button className="link-u" onClick={() => removeCoupon().catch((x) => setErr(x.message))}>Remove</button></p>
  );
  return (
    <form onSubmit={submit} className="py-3">
      <label htmlFor="coupon" className="sr-only">Discount code</label>
      <div className="flex"><input id="coupon" name="code" maxLength={24} placeholder="Discount code" autoComplete="off" className="field" aria-invalid={Boolean(err)} /><button className="btn btn-solid" disabled={busy}>Apply</button></div>
      {err && <p role="alert" className="mt-2 text-small text-oxblood">{err}</p>}
      {cart.couponError && <p role="status" className="mt-2 text-small text-oxblood">{cart.couponError.message}</p>}
    </form>
  );
}
