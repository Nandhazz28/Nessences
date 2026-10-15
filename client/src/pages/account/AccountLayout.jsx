import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useCart } from '../../context/CartContext.jsx';
import { useSeo } from '../../hooks/useSeo.js';
import { Spinner } from '../../components/common/States.jsx';
import { SessionGate } from '../../components/common/SessionGate.jsx';

const LINKS = [['Profile', 'profile'], ['Orders', 'orders'], ['Returns', 'returns'], ['Wishlist', 'wishlist'], ['Reviews', 'reviews'], ['Addresses', 'addresses'], ['Notifications', 'notifications'], ['Settings', 'settings'], ['Security', 'security']];

export default function AccountLayout() {
  useSeo({ title: 'My account', noindex: true });
  const { user, ready, logout } = useAuth(); const { setNotice } = useCart(); const loc = useLocation(); const nav = useNavigate();
  if (!ready) return <Spinner />;
  if (!user) return <SessionGate from={loc.pathname} />;
  if (loc.pathname.replace(/\/$/, '') === '/account') return <Navigate to="/account/profile" replace />;
  return (
    <div className="wrap pt-10">
      <h1 className="text-[length:var(--text-h1)]">My account</h1>
      <p className="text-muted mt-2">Welcome back, {user.name.split(' ')[0]}.</p>
      <div className="mt-10 grid md:grid-cols-[13rem_1fr] gap-10 items-start">
        <nav aria-label="Account" className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible border-b md:border-b-0 rule pb-2 md:pb-0">
          {LINKS.map(([l, to]) => (
            <NavLink key={to} to={to} className={({ isActive }) => `whitespace-nowrap px-3 py-2 text-small md:border-l-2 ${isActive ? 'font-semibold md:border-ink border-transparent' : 'text-muted md:border-transparent hover:text-ink'}`}>{l}</NavLink>
          ))}
          <button className="text-left px-3 py-2 text-small text-oxblood md:mt-4 md:border-t rule" onClick={async () => { try { await logout(); nav('/'); } catch (e) { setNotice(e.message || 'We could not sign you out. Please try again.'); } }}>Sign out</button>
        </nav>
        <section className="min-w-0 pb-8"><Outlet /></section>
      </div>
    </div>
  );
}
