import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useSeo } from '../hooks/useSeo.js';
import { ProductCard } from '../components/product/ProductCard.jsx';
import { EmptyState, Spinner } from '../components/common/States.jsx';

export default function Wishlist() {
  useSeo({ title: 'Wishlist', noindex: true });
  const { user, ready } = useAuth(); const { wish } = useCart(); const loc = useLocation();
  if (!ready) return <Spinner />;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  return (
    <div>
      <h1 className="text-[length:var(--text-h2)]">Wishlist</h1>
      {wish.length === 0
        ? <EmptyState title="Nothing saved yet" body="Tap the heart on any piece to keep it here." action={<Link to="/new-arrivals" className="btn btn-solid">Browse new arrivals</Link>} />
        : <div className="mt-10 grid grid-cols-2 xl:grid-cols-3 gap-x-4 gap-y-12">{wish.map((p) => <ProductCard key={p.id} product={p} />)}</div>}
    </div>
  );
}
