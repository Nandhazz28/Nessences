import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { cartApi, wishlistApi } from '../services/cart.js';
import { useAuth } from './AuthContext.jsx';

const Ctx = createContext(null);
export const useCart = () => useContext(Ctx);

export function CartProvider({ children }) {
  const { user, ready } = useAuth();
  const [cart, setCart] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [wish, setWish] = useState([]);

  const load = useCallback(() => cartApi.get().then((c) => { setCart(c); setLoadError(null); }, setLoadError), []);
  // Cart follows the session: on login the server merges the guest cart, so refetch.
  useEffect(() => { if (ready) load(); }, [ready, user?.id, load]);
  useEffect(() => {
    if (!user) { setWish([]); return; }
    wishlistApi.list().then(setWish, () => setWish([]));
  }, [user]);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(''), 4000); return () => clearTimeout(t); }, [notice]);

  // Mutations return the fresh server view; failures are rethrown for the caller to display.
  const run = useCallback(async (fn, msg) => {
    const c = await fn(); setCart(c); if (msg) setNotice(msg); return c;
  }, []);

  const value = useMemo(() => ({
    cart, loadError, reload: load, drawerOpen, openDrawer: () => setDrawerOpen(true), closeDrawer: () => setDrawerOpen(false),
    count: cart?.totals.itemCount ?? 0, notice, setNotice,
    add: async (variantId, qty = 1) => { const c = await run(() => cartApi.add(variantId, qty)); setDrawerOpen(true); return c; },
    setQty: (id, q) => run(() => cartApi.setQty(id, q)),
    remove: (id) => run(() => cartApi.remove(id), 'Removed from your bag'),
    save: (id) => run(() => cartApi.save(id), 'Saved for later'),
    move: (id) => run(() => cartApi.move(id), 'Moved to your bag'),
    applyCoupon: (code) => run(() => cartApi.applyCoupon(code)),
    removeCoupon: () => run(() => cartApi.removeCoupon()),
    wish, isWished: (productId) => wish.some((p) => p.id === productId),
    toggleWish: async (productId) => {
      const list = wish.some((p) => p.id === productId) ? await wishlistApi.remove(productId) : await wishlistApi.add(productId);
      setWish(list);
    },
  }), [cart, loadError, load, drawerOpen, notice, run, wish]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
