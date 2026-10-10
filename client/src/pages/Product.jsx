import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAsync } from '../hooks/useAsync.js';
import { siteOrigin, useSeo } from '../hooks/useSeo.js';
import { excerptOf } from '../utils/richText.js';
import { useJsonLd } from '../hooks/useJsonLd.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { catalogApi } from '../services/catalog.js';
import { formatMoney } from '../utils/format.js';
import { ProductCard } from '../components/product/ProductCard.jsx';
import { ErrorState, Spinner } from '../components/common/States.jsx';
import { VariantPicker } from '../components/product/VariantPicker.jsx';
import { ImageZoom } from '../components/product/ImageZoom.jsx';
import { SizeGuide } from '../components/product/SizeGuide.jsx';
import { RecentlyViewed } from '../components/product/RecentlyViewed.jsx';
import { Reviews } from '../components/reviews/Reviews.jsx';
import { HeartIcon } from '../components/common/Icon.jsx';
import { Stars } from '../components/reviews/Stars.jsx';

function Detail({ p }) {
  const [color, setColor] = useState(p.colors[0]?.name);
  const [size, setSize] = useState(null);
  const [shot, setShot] = useState(0);
  const { add, isWished, toggleWish, setNotice } = useCart(); const { user } = useAuth(); const nav = useNavigate(); const loc = useLocation();
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(''); const [needSize, setNeedSize] = useState(false); const [guide, setGuide] = useState(false);
  const addToBag = async (buyNow = false) => {
    if (!sel) { setNeedSize(true); return; }
    setBusy(true); setMsg('');
    try { await add(sel.id, 1); if (buyNow) nav('/checkout'); } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };
  const wished = isWished(p.id);
  const onHeart = async () => {
    if (!user) return nav('/login', { state: { from: loc.pathname } });
    try { await toggleWish(p.id); } catch (e) { setNotice(e.message); }
  };
  useEffect(() => { setShot(0); }, [color]);
  useSeo({ title: p.seo?.title || p.name, description: p.seo?.description || excerptOf(p.description), image: p.images[0]?.url, type: 'product' });

  const shots = useMemo(() => p.images.filter((i) => !i.color || i.color === color), [p.images, color]);
  const sel = p.variants.find((v) => v.color.name === color && v.size === size);
  useJsonLd('ld-breadcrumb', { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    ['Home', '/'], [p.gender === 'men' ? 'Men' : 'Women', `/${p.gender}`], ...(p.category ? [[p.category.name, `/${p.gender}?category=${p.category.slug}`]] : []), [p.name, `/products/${p.slug}`],
  ].map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: siteOrigin() + path })) });
  useJsonLd('ld-product', {
    '@context': 'https://schema.org', '@type': 'Product', name: p.name, description: p.description, sku: p.variants[0]?.sku, image: p.images.map((i) => i.url),
    category: p.category?.name,
    offers: { '@type': 'Offer', priceCurrency: 'INR', price: ((p.salePrice ?? p.price) / 100).toFixed(2), availability: p.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock' },
    ...(p.ratingCount > 0 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: p.ratingAvg, reviewCount: p.ratingCount } } : {}),
  });

  return (
    <div className="wrap pt-10 grid lg:grid-cols-[1.4fr_1fr] gap-10 lg:gap-20">
      <div className="grid md:grid-cols-[5rem_1fr] gap-3 md:gap-4 content-start">
        <div className="order-2 md:order-1 flex md:flex-col gap-2">
          {shots.map((s, i) => (
            <button key={s.id} onClick={() => setShot(i)} aria-label={`View image ${i + 1}`} aria-current={i === shot} className={`w-16 md:w-full aspect-[4/5] bg-sand border ${i === shot ? 'border-ink' : 'border-transparent'}`}>
              <img src={s.url} alt="" loading="lazy" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
        <div className="order-1 md:order-2"><ImageZoom image={shots[shot]} /></div>
      </div>

      <div className="lg:pt-4">
        <p className="eyebrow"><Link to={`/${p.gender}`}>{p.gender === 'men' ? 'Men' : 'Women'}</Link> — {p.category?.name}</p>
        <h1 className="text-[length:var(--text-h2)] mt-2">{p.name}</h1>
        <p className="mt-3 text-xl">
          {p.salePrice ? <><span className="text-oxblood font-semibold">{formatMoney(p.salePrice)}</span> <s className="text-muted text-base ml-2">{formatMoney(p.price)}</s></> : formatMoney(p.price)}
        </p>
        {p.ratingCount > 0 && <p className="mt-2 text-small"><Stars value={p.ratingAvg} label={`${p.ratingAvg} out of 5 from ${p.ratingCount} reviews`} /> <a href="#rev-h" className="link-u text-muted ml-2">{p.ratingCount} {p.ratingCount === 1 ? 'review' : 'reviews'}</a></p>}

        <VariantPicker p={p} color={color} size={size} onColor={(c) => { setColor(c); setSize(null); }} onSize={(sz) => { setSize(sz); setNeedSize(false); }} onSizeGuide={() => setGuide(true)} />

        <div className="mt-8 grid gap-3">
          <button className="btn btn-solid w-full" disabled={busy || !p.inStock || sel?.status === 'out_of_stock'} onClick={() => addToBag(false)}>{!p.inStock ? 'Out of stock' : busy ? 'Adding…' : 'Add to bag'}</button>
          {p.inStock && <button className="btn btn-line w-full" disabled={busy || sel?.status === 'out_of_stock'} onClick={() => addToBag(true)}>Buy now</button>}
          <button className="btn btn-line w-full" aria-pressed={wished} onClick={onHeart}><HeartIcon filled={wished} />{wished ? 'Saved to wishlist' : 'Add to wishlist'}</button>
          {needSize && !sel && <p role="alert" className="text-small text-oxblood">Please select a size.</p>}
          {msg && <p role="alert" className="text-small text-oxblood">{msg}</p>}
        </div>
        <p className="mt-4 text-small text-muted">Free standard delivery on orders above ₹5,000. <Link to="/shipping" className="link-u">Delivery</Link> · <Link to="/returns-policy" className="link-u">Returns</Link></p>

        <section className="mt-10 border-t rule">
          {[['Description', <p key="d">{p.description}</p>], ['Materials & care', <div key="m"><p>{p.materials}</p><ul className="list-disc pl-5 mt-2">{p.care?.map((c) => <li key={c}>{c}</li>)}</ul></div>], ['Details', <ul key="x" className="list-disc pl-5">{p.details?.map((c) => <li key={c}>{c}</li>)}</ul>]].map(([t, body]) => (
            <details key={t} className="border-b rule py-4 group" open={t === 'Description'}>
              <summary className="cursor-pointer flex justify-between font-semibold list-none">{t}<span aria-hidden="true" className="group-open:rotate-45 transition-transform">+</span></summary>
              <div className="mt-3 text-muted">{body}</div>
            </details>
          ))}
        </section>
      </div>

      {p.related.length > 0 && (
        <section className="lg:col-span-2 mt-10" aria-labelledby="rel">
          <h2 id="rel" className="text-[length:var(--text-h2)] mb-8">Complete the look</h2>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-x-4 gap-y-10">{p.related.map((r) => <ProductCard key={r.id} product={r} level={3} />)}</div>
        </section>
      )}
      <Reviews slug={p.slug} />
      <RecentlyViewed currentSlug={p.slug} />
      {guide && <SizeGuide onClose={() => setGuide(false)} />}
    </div>
  );
}

export default function Product() {
  const { slug } = useParams();
  const { data, error, loading, reload } = useAsync((s) => catalogApi.get(slug, s), [slug]);
  if (loading) return <Spinner />;
  if (error?.status === 404) return <div className="wrap py-32 text-center"><h1 className="text-[length:var(--text-h2)]">This piece is no longer available</h1><Link to="/women" className="btn btn-line mt-8">Keep browsing</Link></div>;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  return <Detail key={data.id} p={data} />;
}
