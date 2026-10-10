import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync.js';
import { useCart } from '../../context/CartContext.jsx';
import { catalogApi } from '../../services/catalog.js';
import { formatMoney } from '../../utils/format.js';
import { Modal } from '../common/Modal.jsx';
import { VariantPicker } from './VariantPicker.jsx';

function Body({ p, onClose }) {
  const { add } = useCart(); const [color, setColor] = useState(p.colors[0]?.name); const [size, setSize] = useState(null);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const sel = p.variants.find((v) => v.color.name === color && v.size === size);
  const img = p.images.find((i) => !i.color || i.color === color) ?? p.images[0];
  const submit = async () => {
    if (!sel) { setMsg('Please select a size.'); return; }
    setBusy(true); setMsg('');
    try { await add(sel.id, 1); onClose(); } catch (e) { setMsg(e.message); setBusy(false); }
  };
  return (
    <div className="grid md:grid-cols-2 gap-8">
      <div className="aspect-[4/5] bg-sand">{img && <img src={img.url} alt={img.alt} className="w-full h-full object-cover" />}</div>
      <div>
        <p className="text-xl">{p.salePrice ? <><span className="text-oxblood font-semibold">{formatMoney(p.salePrice)}</span> <s className="text-muted text-base ml-2">{formatMoney(p.price)}</s></> : formatMoney(p.price)}</p>
        <VariantPicker p={p} color={color} size={size} onColor={(c) => { setColor(c); setSize(null); setMsg(''); }} onSize={(s) => { setSize(s); setMsg(''); }} />
        <button className="btn btn-solid w-full mt-6" disabled={busy || !p.inStock} onClick={submit}>{!p.inStock ? 'Out of stock' : busy ? 'Adding…' : 'Add to bag'}</button>
        {msg && <p role="alert" className="mt-2 text-small text-oxblood">{msg}</p>}
        <Link to={`/products/${p.slug}`} onClick={onClose} className="inline-block mt-6 text-small link-u">View full details</Link>
      </div>
    </div>
  );
}

export function QuickView({ slug, name, onClose }) {
  const { data, error, loading, reload } = useAsync((s) => catalogApi.get(slug, s), [slug]);
  return (
    <Modal title={name} onClose={onClose} wide>
      {loading && <p role="status" className="eyebrow">Loading…</p>}
      {error && <div role="alert"><p className="text-oxblood">{error.message}</p><button className="btn btn-line mt-4" onClick={reload}>Try again</button></div>}
      {data && <Body p={data} onClose={onClose} />}
    </Modal>
  );
}
