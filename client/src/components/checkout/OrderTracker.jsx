const STAGES = [['Order placed', ['pending_payment', 'paid', 'confirmed']], ['Confirmed', ['confirmed']], ['Packed', ['packed']], ['Shipped', ['shipped', 'out_for_delivery']], ['Delivered', ['delivered']]];
const REACHED = { pending_payment: 0, paid: 1, confirmed: 1, processing: 1, packed: 2, shipped: 3, out_for_delivery: 3, delivered: 4 };

export function OrderTracker({ status, history = [] }) {
  if (status === 'cancelled' || status === 'refunded') return <p role="status" className="p-4 border border-oxblood text-oxblood">This order was {status}.</p>;
  const reached = REACHED[status] ?? 0;
  const when = (idx) => { const h = [...history].reverse().find((x) => STAGES[idx][1].includes(x.status)); return h ? new Date(h.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''; };
  return (
    <ol aria-label="Order progress" className="space-y-0">
      {STAGES.map(([label], i) => {
        const done = i <= reached && status !== 'pending_payment';
        return (
          <li key={label} className="flex gap-4" aria-current={i === reached && status !== 'pending_payment' ? 'step' : undefined}>
            <div className="flex flex-col items-center">
              <span className={`w-4 h-4 rounded-full border ${done ? 'bg-ink border-ink' : 'border-stone'}`} />
              {i < STAGES.length - 1 && <span className={`w-px flex-1 min-h-8 ${i < reached && status !== 'pending_payment' ? 'bg-ink' : 'bg-stone'}`} />}
            </div>
            <div className="pb-5 -mt-1"><p className={done ? 'font-semibold' : 'text-muted'}>{label}</p>{done && <p className="text-small text-muted">{when(i)}</p>}</div>
          </li>
        );
      })}
    </ol>
  );
}
