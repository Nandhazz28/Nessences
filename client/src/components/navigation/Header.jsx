import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { useCart } from "../../context/CartContext.jsx";
import { useFocusTrap } from "../../hooks/useFocusTrap.js";
import { DrawerGroup, MegaPanel } from "./MegaMenu.jsx";

const NAV = [
  ["Men", "/men", "men"],
  ["Women", "/women", "women"],
  ["New Arrivals", "/new-arrivals"],
  ["Collections", "/collections"],
  ["Sale", "/sale"],
];

const cls = ({ isActive }) =>
  `eyebrow !text-ink font-semibold py-2 border-b ${
    isActive ? "border-oxblood" : "border-transparent"
  } hover:border-ink transition-colors`;

export function Header() {
  const { user, logout } = useAuth();
  const { count, openDrawer, wish } = useCart();
  const nav = useNavigate();
  const loc = useLocation();

  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [menu, setMenu] = useState(null);
  const [visited, setVisited] = useState([]);

  const drawerRef = useRef(null);
  useFocusTrap(drawerRef, open);

  const show = (g) => {
    setMenu(g);
    if (g) {
      setVisited((v) => (v.includes(g) ? v : [...v, g]));
    }
  };

  useEffect(() => {
    setMenu(null);
  }, [loc.pathname, loc.search]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";

    const esc = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        setSearching(false);
        setMenu(null);
      }
    };

    window.addEventListener("keydown", esc);

    return () => {
      window.removeEventListener("keydown", esc);
      document.body.style.overflow = "";
    };
  }, [open]);

  const submitSearch = (e) => {
    e.preventDefault();

    const q = new FormData(e.currentTarget).get("q")?.toString().trim();

    if (q && q.length >= 2) {
      setSearching(false);
      setOpen(false);
      nav(`/search?q=${encodeURIComponent(q)}`);
    }
  };

  return (
    <header
      className="sticky top-0 z-30 bg-paper border-b rule"
      onMouseLeave={() => setMenu(null)}
    >
      {/* Skip link */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 bg-ink text-paper px-3 py-2"
      >
        Skip to content
      </a>

      {/* Top bar */}
      <div className="wrap grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center h-16 md:h-20">
        {/* Desktop navigation */}
        <nav
          aria-label="Primary"
          className="hidden md:flex min-w-0 items-center gap-4 lg:gap-8 whitespace-nowrap"
        >
          {NAV.map(([label, to, g]) => (
            <NavLink
              key={to}
              to={to}
              className={cls}
              onMouseEnter={() => show(g ?? null)}
              onFocus={() => show(g ?? null)}
              aria-controls={g && visited.includes(g) ? `mega-${g}` : undefined}
            >
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Mobile menu button */}
        <button
          type="button"
          className="md:hidden eyebrow !text-ink font-semibold justify-self-start py-3"
          aria-expanded={open}
          aria-controls="drawer"
          onClick={() => setOpen(true)}
        >
          Menu
        </button>

        {/* Logo */}
        <Link
          to="/"
          className="font-display text-2xl tracking-[0.04em] justify-self-center whitespace-nowrap"
          aria-label="Nessence home"
        >
          NESSENCE
        </Link>

        {/* Right side actions */}
        <div className="hidden md:flex min-w-0 items-center justify-end gap-3 lg:gap-6 whitespace-nowrap">
          <button
            type="button"
            className="eyebrow !text-ink font-semibold py-2"
            aria-expanded={searching}
            aria-controls="header-search"
            onClick={() => setSearching((s) => !s)}
          >
            Search
          </button>

          <Link
            to="/account/wishlist"
            className="eyebrow !text-ink font-semibold py-2"
          >
            Wishlist{wish.length > 0 && ` (${wish.length})`}
          </Link>

          {user ? (
            <Link
              to="/account"
              className="eyebrow !text-ink font-semibold py-2"
            >
              Account
            </Link>
          ) : (
            <Link to="/login" className="eyebrow !text-ink font-semibold py-2">
              Sign in
            </Link>
          )}

          <button
            type="button"
            className="eyebrow !text-ink font-semibold py-2"
            onClick={openDrawer}
            aria-label={`Open bag, ${count} items`}
          >
            Bag ({count})
          </button>
        </div>
      </div>

      {/* Mega menu panels */}
      <div
        className="hidden md:block"
        onBlur={(e) => {
          if (!e.currentTarget.parentElement.contains(e.relatedTarget)) {
            setMenu(null);
          }
        }}
      >
        {visited.map((g) => (
          <MegaPanel
            key={g}
            gender={g}
            active={menu === g}
            onNavigate={() => setMenu(null)}
          />
        ))}
      </div>

      {/* Search bar */}
      {searching && (
        <form
          id="header-search"
          role="search"
          onSubmit={submitSearch}
          className="border-t rule"
        >
          <div className="wrap flex gap-3 py-3">
            <label htmlFor="q" className="sr-only">
              Search products
            </label>

            <input
              id="q"
              name="q"
              autoFocus
              minLength={2}
              maxLength={80}
              placeholder="Search dresses, coats, boots…"
              className="field"
            />

            <button type="submit" className="btn btn-solid">
              Search
            </button>
          </div>
        </form>
      )}

      {/* Mobile drawer */}
      {open && (
        <div
          id="drawer"
          ref={drawerRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="fixed inset-0 z-40 bg-paper md:hidden flex flex-col"
        >
          <div className="wrap flex justify-between items-center h-16 border-b rule">
            <span className="font-display text-2xl">NESSENCE</span>

            <button
              type="button"
              className="eyebrow !text-ink font-semibold py-3"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>

          <nav aria-label="Mobile" className="wrap flex flex-col flex-1 pt-6">
            <DrawerGroup gender="men" onNavigate={() => setOpen(false)} />

            <DrawerGroup gender="women" onNavigate={() => setOpen(false)} />

            {NAV.filter(([, , g]) => !g).map(([label, to]) => (
              <Link
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className="font-display text-3xl py-3 border-b rule"
              >
                {label}
              </Link>
            ))}

            <div className="mt-auto pb-8 flex flex-wrap gap-6">
              <button
                type="button"
                className="eyebrow !text-ink"
                onClick={() => {
                  setOpen(false);
                  setSearching(true);
                }}
              >
                Search
              </button>

              <Link
                to="/account/wishlist"
                onClick={() => setOpen(false)}
                className="eyebrow !text-ink"
              >
                Wishlist{wish.length > 0 && ` (${wish.length})`}
              </Link>

              <button
                type="button"
                className="eyebrow !text-ink"
                onClick={() => {
                  setOpen(false);
                  openDrawer();
                }}
              >
                Bag ({count})
              </button>

              {user ? (
                <>
                  <Link
                    to="/account"
                    onClick={() => setOpen(false)}
                    className="eyebrow !text-ink"
                  >
                    Account
                  </Link>

                  <button
                    type="button"
                    className="eyebrow !text-ink"
                    onClick={async () => {
                      await logout();
                      setOpen(false);
                      nav("/");
                    }}
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/login"
                    onClick={() => setOpen(false)}
                    className="eyebrow !text-ink"
                  >
                    Sign in
                  </Link>

                  <Link
                    to="/register"
                    onClick={() => setOpen(false)}
                    className="eyebrow !text-ink"
                  >
                    Create account
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
