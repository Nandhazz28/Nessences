import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Heart, Search, ShoppingBag, UserRound, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import { useCart } from "../../context/CartContext.jsx";
import { useFocusTrap } from "../../hooks/useFocusTrap.js";
import { DrawerGroup, MegaPanel } from "./MegaMenu.jsx";
import "../../index.css";

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

  const closeDrawer = () => setOpen(false);

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

      {/* Main navbar */}

      {/* Main navbar */}
      <div className="wrap relative flex items-center justify-between h-16 md:h-20">
        {/* Left: Navigation */}
        <nav
          aria-label="Primary"
          className="hidden md:flex items-center gap-4 lg:gap-6 xl:gap-8 whitespace-nowrap"
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

        {/* Mobile menu */}

        <button
          type="button"
          className="mobile-menu-button eyebrow !text-ink font-semibold py-3"
          aria-expanded={open}
          aria-controls="drawer"
          onClick={() => setOpen((current) => !current)}
        >
          {open ? "Close" : "Menu"}
        </button>

        <Link
          to="/"
          className="absolute left-1/2 -translate-x-1/2 font-display text-2xl tracking-[0.04em] whitespace-nowrap"
          aria-label="Nessence home"
        >
          NESSENCE
        </Link>

        {/* Right: Icons */}
        <div className="hidden md:flex items-center gap-4 lg:gap-6 ml-auto">
          <button
            type="button"
            aria-label="Search products"
            aria-expanded={searching}
            aria-controls="header-search"
            onClick={() => setSearching((s) => !s)}
            className="p-1 text-ink hover:opacity-60 transition-opacity"
          >
            <Search size={18} strokeWidth={1.5} />
          </button>

          <Link
            to={user ? "/account" : "/login"}
            aria-label={user ? "Account" : "Sign in"}
            className="p-1 text-ink hover:opacity-60 transition-opacity"
          >
            <UserRound size={18} strokeWidth={1.5} />
          </Link>

          <Link
            to="/account/wishlist"
            aria-label={`Wishlist, ${wish.length} items`}
            className="relative p-1 text-ink hover:opacity-60 transition-opacity"
          >
            <Heart size={18} strokeWidth={1.5} />
            {wish.length > 0 && (
              <span className="absolute -top-1 -right-1 text-[9px]">
                {wish.length}
              </span>
            )}
          </Link>

          <button
            type="button"
            aria-label={`Open bag, ${count} items`}
            onClick={openDrawer}
            className="relative p-1 text-ink hover:opacity-60 transition-opacity"
          >
            <ShoppingBag size={18} strokeWidth={1.5} />
            {count > 0 && (
              <span className="absolute -top-1 -right-1 min-w-3.5 h-3.5 rounded-full bg-ink text-paper text-[9px] flex items-center justify-center">
                {count}
              </span>
            )}
          </button>
        </div>
      </div>

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
              className="field min-w-0 flex-1"
            />

            <button type="submit" className="btn btn-solid">
              Search
            </button>
          </div>
        </form>
      )}

      {open && (
        <div
          id="drawer"
          ref={drawerRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="fixed inset-x-0 top-16 bottom-0 z-40 bg-paper md:hidden flex flex-col"
        >
          <nav aria-label="Mobile" className="wrap flex flex-col flex-1 pt-6">
            <DrawerGroup gender="men" onNavigate={closeDrawer} />

            <DrawerGroup gender="women" onNavigate={closeDrawer} />

            {NAV.filter(([, , g]) => !g).map(([label, to]) => (
              <Link
                key={to}
                to={to}
                onClick={closeDrawer}
                className="font-display text-3xl py-3 border-b rule"
              >
                {label}
              </Link>
            ))}

            <div className="mt-auto pb-8">
              <div className="flex items-center gap-7 py-5 border-b rule">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 eyebrow !text-ink"
                  onClick={() => {
                    setOpen(false);
                    setSearching(true);
                  }}
                >
                  <Search size={17} strokeWidth={1.6} aria-hidden="true" />
                  Search
                </button>

                <Link
                  to="/account/wishlist"
                  onClick={closeDrawer}
                  className="inline-flex items-center gap-2 eyebrow !text-ink"
                >
                  <Heart size={17} strokeWidth={1.6} aria-hidden="true" />
                  Wishlist
                  {wish.length > 0 && ` (${wish.length})`}
                </Link>

                <button
                  type="button"
                  className="inline-flex items-center gap-2 eyebrow !text-ink"
                  onClick={() => {
                    setOpen(false);
                    openDrawer();
                  }}
                >
                  <ShoppingBag size={17} strokeWidth={1.6} aria-hidden="true" />
                  Bag ({count})
                </button>
              </div>

              <div className="flex flex-wrap gap-6 pt-5">
                {user ? (
                  <>
                    <Link
                      to="/account"
                      onClick={closeDrawer}
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
                      onClick={closeDrawer}
                      className="eyebrow !text-ink"
                    >
                      Sign in
                    </Link>

                    <Link
                      to="/register"
                      onClick={closeDrawer}
                      className="eyebrow !text-ink"
                    >
                      Create account
                    </Link>
                  </>
                )}
              </div>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
