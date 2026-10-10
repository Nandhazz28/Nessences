import { useEffect } from 'react';
import { useAsync } from '../../hooks/useAsync.js';
import { catalogApi } from '../../services/catalog.js';
import { ProductCard } from './ProductCard.jsx';

const KEY = 'nessence.recent'; const MAX = 6;
const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; } };

// Per-device convenience only: the browser remembers slugs, the products themselves always come from the API.
export function RecentlyViewed({ currentSlug }) {
  const slugs = read().filter((s) => s !== currentSlug).slice(0, MAX);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify([currentSlug, ...read().filter((s) => s !== currentSlug)].slice(0, MAX + 1))); } catch { /* storage blocked: feature simply stays empty */ } }, [currentSlug]);
  const { data } = useAsync((s) => (slugs.length ? catalogApi.list({ slugs: slugs.join(','), limit: MAX }, s) : Promise.resolve({ items: [] })), [currentSlug]);
  const items = (data?.items ?? []).sort((a, b) => slugs.indexOf(a.slug) - slugs.indexOf(b.slug));
  if (!items.length) return null;
  return (
    <section className="lg:col-span-2 mt-10" aria-labelledby="rv">
      <h2 id="rv" className="text-[length:var(--text-h2)] mb-8">Recently viewed</h2>
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-x-4 gap-y-10">{items.map((p) => <ProductCard key={p.id} product={p} level={3} />)}</div>
    </section>
  );
}
