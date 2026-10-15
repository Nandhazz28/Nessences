import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { useCart } from "../../context/CartContext.jsx";
import { formatMoney } from "../../utils/format.js";
import { QuickView } from "./QuickView.jsx";
import { HeartIcon } from "../common/Icon.jsx";
import { Stars } from "../reviews/Stars.jsx";

export function ProductCard({ product: p, level = 2 }) {
  const Heading = `h${level}`;
  const [hover, setHover] = useState(false);
  const [quick, setQuick] = useState(false);
  const { user } = useAuth();
  const { isWished, toggleWish, setNotice } = useCart();
  const nav = useNavigate();
  const loc = useLocation();
  const wished = isWished(p.id);
  const onHeart = async () => {
    if (!user)
      return nav("/login", { state: { from: loc.pathname + loc.search } });
    try {
      await toggleWish(p.id);
    } catch (e) {
      setNotice(e.message);
    }
  };
  const front = p.images[0];
  const alt = p.images[1];
  return (
    <article className="group relative">
      <button
        onClick={onHeart}
        aria-pressed={wished}
        aria-label={
          wished
            ? `Remove ${p.name} from wishlist`
            : `Add ${p.name} to wishlist`
        }
        className="absolute right-2 top-2 z-10 w-9 h-9 bg-paper/90 border border-control grid place-items-center text-lg hover:border-ink"
      >
        <HeartIcon filled={wished} />
      </button>
      <Link
        to={`/products/${p.slug}`}
        className="block"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <div className="relative aspect-[4/5] bg-sand overflow-hidden">
          {front && (
            <img
              src={front.url}
              srcSet={front.srcSet}
              sizes={
                front.srcSet ? "(min-width: 1024px) 30vw, 50vw" : undefined
              }
              alt={front.alt}
              loading="lazy"
              decoding="async"
              width="800"
              height="1000"
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-[var(--duration-base)] ${p.inStock ? "" : "opacity-50"}`}
            />
          )}
          {alt && (
            <img
              src={alt.url}
              srcSet={alt.srcSet}
              sizes={alt.srcSet ? "(min-width: 1024px) 30vw, 50vw" : undefined}
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-[var(--duration-base)] ${hover && p.inStock ? "opacity-100" : "opacity-0"}`}
            />
          )}
          {p.isNew && p.inStock && (
            <span className="absolute left-3 bottom-3 bg-oxblood text-paper eyebrow !text-paper px-2 py-1">
              New
            </span>
          )}
          {p.salePrice && p.inStock && (
            <span className="absolute left-3 bottom-3 bg-oxblood text-paper eyebrow !text-paper px-2 py-1">
              Sale
            </span>
          )}
          {!p.inStock && (
            <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 bg-paper/90 text-center py-2 eyebrow !text-ink">
              Out of stock
            </span>
          )}
        </div>
        <p className="eyebrow mt-3 !normal-case !tracking-normal">
          {p.gender === "men" ? "Men" : "Women"} — {p.category?.name}
        </p>
        <Heading className="font-sans font-semibold text-body mt-0.5 tracking-normal">
          {p.name}
        </Heading>
        <p className="mt-1">
          {p.salePrice ? (
            <>
              <span className="text-oxblood font-semibold">
                {formatMoney(p.salePrice)}
              </span>{" "}
              <s className="text-muted ml-1">{formatMoney(p.price)}</s>
            </>
          ) : (
            formatMoney(p.price)
          )}
        </p>
      </Link>
      {p.ratingCount > 0 && (
        <p className="mt-1 text-small">
          <Stars
            value={p.ratingAvg}
            label={`${p.ratingAvg} out of 5 from ${p.ratingCount} reviews`}
          />{" "}
          <span className="text-muted">({p.ratingCount})</span>
        </p>
      )}
      {p.inStock && (
        <button
          type="button"
          onClick={() => setQuick(true)}
          aria-label={`Quick add ${p.name}`}
          className="mt-3 w-full h-10 border border-control eyebrow !text-ink hover:border-ink md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 transition-opacity"
        >
          Quick add
        </button>
      )}
      {quick && (
        <QuickView
          slug={p.slug}
          name={p.name}
          onClose={() => setQuick(false)}
        />
      )}
      {p.colors.length > 0 && (
        <ul className="flex gap-1.5 mt-2" aria-label="Available colours">
          {p.colors.map((c) => (
            <li
              key={c.name}
              title={c.name}
              className="w-3 h-3 rounded-full border border-control"
              style={{ background: c.hex }}
            >
              <span className="sr-only">{c.name}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
