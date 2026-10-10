import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync.js';
import { reviewsApi } from '../../services/engage.js';
import { EmptyState, ErrorState, Spinner } from '../../components/common/States.jsx';
import { ReviewForm } from '../../components/reviews/Reviews.jsx';
import { Stars } from '../../components/reviews/Stars.jsx';

const STATUS = { approved: 'Published', pending: 'Awaiting moderation', flagged: 'Held for review', rejected: 'Not published' };

export default function AccountReviews() {
  const { data, error, loading, reload } = useAsync(() => reviewsApi.mine(), []);
  const [editing, setEditing] = useState(null); const [confirm, setConfirm] = useState(null); const [err, setErr] = useState('');
  if (loading) return <Spinner />; if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data.length) return <EmptyState title="No reviews yet" body="Once an order has been delivered you can review the pieces you bought, from the product page." action={<Link to="/account/orders" className="btn btn-line">View my orders</Link>} />;
  const remove = async (id) => { try { await reviewsApi.remove(id); setConfirm(null); setErr(''); reload(); } catch (e) { setErr(e.message); } };
  return (
    <div>
      <h2 className="text-[length:var(--text-h2)] mb-6">My reviews</h2>
      {err && <p role="alert" className="mb-4 text-small text-oxblood">{err}</p>}
      <ul className="border-t rule">{data.map((r) => (
        <li key={r.id} className="py-6 border-b rule">
          <p className="eyebrow">{r.product ? <Link to={`/products/${r.product.slug}`} className="!text-ink link-u">{r.product.name}</Link> : 'Product no longer available'}</p>
          {editing === r.id ? <div className="mt-4"><ReviewForm slug={r.product?.slug} existing={r} onDone={() => { setEditing(null); reload(); }} onCancel={() => setEditing(null)} /></div> : (
            <>
              <p className="mt-2"><Stars value={r.rating} /> {r.title && <strong className="ml-2">{r.title}</strong>}</p>
              <p className="mt-2">{r.body}</p>
              <p className="mt-3 text-small text-muted">{STATUS[r.status] ?? r.status}{r.moderationNote ? ` — ${r.moderationNote}` : ''} · {new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              <div className="mt-3 flex gap-4 text-small">
                <button className="link-u" onClick={() => setEditing(r.id)}>Edit</button>
                {confirm !== r.id ? <button className="link-u" onClick={() => setConfirm(r.id)}>Delete</button>
                  : <span>Delete this review? <button className="link-u text-oxblood ml-2" onClick={() => remove(r.id)}>Yes, delete</button> <button className="link-u ml-2" onClick={() => setConfirm(null)}>Keep it</button></span>}
              </div>
            </>)}
        </li>))}</ul>
    </div>
  );
}
