import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cartApi, wishlistApi } from "../services/cart.js";
import { useAuth } from "./AuthContext.jsx";

const Ctx = createContext(null);
export const useCart = () => useContext(Ctx);

export function CartProvider({ children }) {
  const { user, ready, revalidate } = useAuth();
  const [cart, setCart] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [wish, setWish] = useState([]);
  const [wishStatus, setWishStatus] = useState("idle"); // idle | loading | ready | error: an empty list is only ever shown when the server said it is empty
  const [wishError, setWishError] = useState(null);

  // Every request that changes what the bag shows takes a ticket; only the newest ticket may update the screen,
  // so a slow, older response can never overwrite a newer one.
  const ticket = useRef(0);
  const userId = user?.id ?? null;
  const prevUser = useRef(null);
  const revalidatedFor = useRef(null);

  const load = useCallback(() => {
    const mine = ++ticket.current;
    return cartApi.get().then(
      (c) => {
        if (mine === ticket.current) {
          setCart(c);
          setLoadError(null);
        }
      },
      (e) => {
        if (mine === ticket.current) setLoadError(e);
      },
    );
  }, []);

  // The bag follows the session. Signing in merges the guest bag on the server, so refetch; leaving an account (or switching to
  // another) clears the previous bag immediately instead of leaving someone else's items on screen.
  useEffect(() => {
    if (!ready) return;
    if (prevUser.current && prevUser.current !== userId) {
      ticket.current += 1;
      setCart(null);
    }
    prevUser.current = userId;
    load();
  }, [ready, userId, load]);

  // If we believe we are signed in but the server answered with a guest bag, the browser and server disagree about the session:
  // ask the server (this also refreshes an expiring session) once, rather than letting edits go to the wrong bag.
  useEffect(() => {
    if (
      userId &&
      cart?.owner === "guest" &&
      revalidatedFor.current !== userId
    ) {
      revalidatedFor.current = userId;
      revalidate?.();
    }
  }, [userId, cart?.owner, revalidate]);

  const loadWish = useCallback(() => {
    setWishStatus("loading");
    setWishError(null);
    return wishlistApi.list().then(
      (l) => {
        setWish(l);
        setWishStatus("ready");
      },
      (e) => {
        setWishStatus("error");
        setWishError(e);
      },
    ); // keeps the last known list on a failure
  }, []);
  useEffect(() => {
    if (!userId) {
      setWish([]);
      setWishStatus("idle");
      setWishError(null);
      return;
    }
    loadWish();
  }, [userId, loadWish]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  const run = useCallback(
    async (fn, msg) => {
      const mine = ++ticket.current;
      try {
        const c = await fn();
        if (mine === ticket.current) setCart(c);
        if (msg) setNotice(msg);
        return c;
      } catch (e) {
        load();
        throw e;
      }
    },
    [load],
  );

  const pendingWish = useRef(new Set());
  const toggleWish = useCallback(
    async (productId) => {
      if (pendingWish.current.has(productId)) return;
      pendingWish.current.add(productId);
      try {
        const list = wish.some((p) => p.id === productId)
          ? await wishlistApi.remove(productId)
          : await wishlistApi.add(productId);
        setWish(list);
        setWishStatus("ready");
      } finally {
        pendingWish.current.delete(productId);
      }
    },
    [wish],
  );

  const value = useMemo(
    () => ({
      cart,
      loadError,
      reload: load,
      drawerOpen,
      openDrawer: () => setDrawerOpen(true),
      closeDrawer: () => setDrawerOpen(false),
      count: cart?.totals.itemCount ?? 0,
      notice,
      setNotice,
      add: async (variantId, qty = 1) => {
        const c = await run(() => cartApi.add(variantId, qty));
        setDrawerOpen(true);
        return c;
      },
      setQty: (id, q) => run(() => cartApi.setQty(id, q)),
      remove: (id) => run(() => cartApi.remove(id), "Removed from your bag"),
      save: (id) => run(() => cartApi.save(id), "Saved for later"),
      move: (id) => run(() => cartApi.move(id), "Moved to your bag"),
      applyCoupon: (code) => run(() => cartApi.applyCoupon(code)),
      removeCoupon: () => run(() => cartApi.removeCoupon()),
      wish,
      wishStatus,
      wishError,
      reloadWish: loadWish,
      isWished: (productId) => wish.some((p) => p.id === productId),
      toggleWish,
    }),
    [
      cart,
      loadError,
      load,
      drawerOpen,
      notice,
      run,
      wish,
      wishStatus,
      wishError,
      loadWish,
      toggleWish,
    ],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
