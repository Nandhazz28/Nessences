import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAsync } from '../hooks/useAsync.js';
import { useSeo } from '../hooks/useSeo.js';
import { catalogApi } from '../services/catalog.js';
import { ProductCard } from '../components/product/ProductCard.jsx';
import { ErrorState, GridSkeleton, EmptyState } from '../components/common/States.jsx';

const CONFIG = {
  men: { title: 'Men', gender: 'men', blurb: 'Tailoring, knitwear and outerwear built to be worn hard.' },
  women: { title: 'Women', gender: 'women', blurb: 'Bias-cut, structured and soft — cut to move with you.' },
  'new-arrivals': { title: 'New arrivals', extra: { newArrivals: 'true' }, blurb: 'The latest pieces, just in.' },
  sale: { title: 'Sale', extra: { sale: 'true' }, blurb: 'Selected pieces at a reduced price.' },
  search: { title: 'Search', blurb: '' },
};
const csvOf = (v) => (v ? v.split(',').filter(Boolean) : []);

function Filters({ facets, sp, set }) {
  const sizes = csvOf(sp.get('size')), colors = csvOf(sp.get('color'));
  const toggle = (key, list, v) => set({ [key]: (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]).join(',') });
  const [price, setPrice] = useState({ min: sp.get('minPrice') ? String(Number(sp.get('minPrice')) / 100) : '', max: sp.get('maxPrice') ? String(Number(sp.get('maxPrice')) / 100) : '' });
  const applyPrice = (e) => { e.preventDefault(); const rs = (v) => (v !== '' && Number(v) >= 0 ? String(Math.round(Number(v) * 100)) : ''); set({ minPrice: rs(price.min), maxPrice: rs(price.max) }); };
  const active = sizes.length + colors.length + (sp.get('minPrice') ? 1 : 0) + (sp.get('maxPrice') ? 1 : 0) + (sp.get('availability') ? 1 : 0);
  return (
    <div className="space-y-8">
      {active > 0 && <button className="text-small link-u" onClick={() => { setPrice({ min: '', max: '' }); set({ size: '', color: '', minPrice: '', maxPrice: '', availability: '' }); }}>Clear all filters ({active})</button>}
      <fieldset><legend className="eyebrow !text-ink font-semibold">Availability</legend>
        <label className="mt-3 flex items-center gap-3 text-small"><input type="checkbox" checked={sp.get('availability') === 'in_stock'} onChange={(e) => set({ availability: e.target.checked ? 'in_stock' : '' })} />In stock only</label></fieldset>
      {facets?.sizes?.length > 0 && <fieldset><legend className="eyebrow !text-ink font-semibold">Size</legend>
        <div className="mt-3 flex flex-wrap gap-2">{facets.sizes.map((s) => <button key={s.size} type="button" aria-pressed={sizes.includes(s.size)} onClick={() => toggle('size', sizes, s.size)} className={`min-w-11 h-10 px-2 border text-small ${sizes.includes(s.size) ? 'bg-ink text-paper border-ink' : 'border-control hover:border-ink'}`}>{s.size}</button>)}</div></fieldset>}
      {facets?.colors?.length > 0 && <fieldset><legend className="eyebrow !text-ink font-semibold">Colour</legend>
        <ul className="mt-3 space-y-2">{facets.colors.map((c) => <li key={c.name}><label className="flex items-center gap-3 text-small"><input type="checkbox" checked={colors.includes(c.name)} onChange={() => toggle('color', colors, c.name)} /><span className="w-3 h-3 rounded-full border border-control" style={{ background: c.hex }} aria-hidden="true" />{c.name} <span className="text-muted">({c.count})</span></label></li>)}</ul></fieldset>}
      <form onSubmit={applyPrice}><fieldset><legend className="eyebrow !text-ink font-semibold">Price (₹)</legend>
        <div className="mt-3 flex items-center gap-2">
          <label className="sr-only" htmlFor="pmin">Minimum price</label><input id="pmin" inputMode="numeric" className="field !h-10" placeholder={facets?.price ? String(Math.floor(facets.price.min / 100)) : 'Min'} value={price.min} onChange={(e) => setPrice({ ...price, min: e.target.value.replace(/\D/g, '') })} />
          <span aria-hidden="true">–</span>
          <label className="sr-only" htmlFor="pmax">Maximum price</label><input id="pmax" inputMode="numeric" className="field !h-10" placeholder={facets?.price ? String(Math.ceil(facets.price.max / 100)) : 'Max'} value={price.max} onChange={(e) => setPrice({ ...price, max: e.target.value.replace(/\D/g, '') })} />
        </div><button className="btn btn-line !h-10 mt-3 w-full">Apply</button></fieldset></form>
    </div>
  );
}

const SORTS = [['featured', 'Featured'], ['newest', 'Newest'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low']];

export default function Shop({ mode }) {
  const cfg = CONFIG[mode];
  const [sp, setSp] = useSearchParams();
  const page = Number(sp.get('page')) || 1; const sort = sp.get('sort') || 'featured';
  const category = sp.get('category') || ''; const q = sp.get('q') || '';
  const [showFilters, setShowFilters] = useState(false);
  const f = { size: sp.get('size') || undefined, color: sp.get('color') || undefined, minPrice: sp.get('minPrice') || undefined, maxPrice: sp.get('maxPrice') || undefined, availability: sp.get('availability') || undefined };
  const set = (patch) => { const n = new URLSearchParams(sp); Object.entries(patch).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k))); if (!('page' in patch)) n.delete('page'); setSp(n); if ('page' in patch) window.scrollTo({ top: 0 }); };   // only pagination jumps to the top; toggling a filter keeps the shopper's place

  useSeo({ title: mode === 'search' && q ? `Search: ${q}` : cfg.title, description: cfg.blurb, noindex: mode === 'search' });
  const cats = useAsync((s) => catalogApi.categories(cfg.gender, s), [cfg.gender]);
  const list = useAsync((s) => catalogApi.list({ ...cfg.extra, gender: cfg.gender, category, ...f, q: q || undefined, sort: q && sort === 'featured' ? 'relevance' : sort, page, limit: 12 }, s), [mode, page, sort, category, q, f.size, f.color, f.minPrice, f.maxPrice, f.availability]);
  const pg = list.data?.pagination;

  return (
    <div className="wrap pt-10">
      <p className="eyebrow"><Link to="/">Home</Link> / {cfg.title}</p>
      <h1 className="text-[length:var(--text-h1)] mt-3">{mode === 'search' ? (q ? `“${q}”` : 'Search') : cfg.title}</h1>
      {cfg.blurb && <p className="mt-3 text-muted max-w-lg">{cfg.blurb}</p>}

      <div className="mt-8 border-y rule py-3 flex flex-wrap items-center justify-between gap-4">
        <ul className="flex gap-5 overflow-x-auto" aria-label="Categories">
          <li><button onClick={() => set({ category: '' })} aria-pressed={!category} className={`eyebrow !text-ink py-2 border-b ${!category ? 'border-oxblood' : 'border-transparent'}`}>All</button></li>
          {(cats.data ?? []).map((c) => (
            <li key={c.slug}><button onClick={() => set({ category: c.slug })} aria-pressed={category === c.slug} className={`eyebrow !text-ink py-2 border-b whitespace-nowrap ${category === c.slug ? 'border-oxblood' : 'border-transparent'}`}>{c.name}</button></li>
          ))}
        </ul>
        <div className="flex items-center gap-4 text-small">
          <button type="button" className="lg:hidden eyebrow !text-ink py-2" aria-expanded={showFilters} aria-controls="filters" onClick={() => setShowFilters((v) => !v)}>{showFilters ? 'Hide filters' : 'Filters'}</button>
          {pg && <span className="text-muted" aria-live="polite">{pg.total} {pg.total === 1 ? 'result' : 'results'}</span>}
          <label className="flex items-center gap-2">Sort
            <select value={sort} onChange={(e) => set({ sort: e.target.value })} className="field !h-10 !w-auto">{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </label>
        </div>
      </div>

      <div className="mt-10 lg:grid lg:grid-cols-[14rem_1fr] lg:gap-12">
        <aside id="filters" aria-label="Filters" className={`${showFilters ? 'block mb-10' : 'hidden'} lg:block`}><Filters facets={list.data?.facets} sp={sp} set={set} /></aside>
        <div>
        {list.loading && <GridSkeleton count={8} />}
        {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
        {list.data && list.data.items.length === 0 && (
          <EmptyState title={q ? `No results for “${q}”` : 'Nothing here yet'} body={q ? 'Check the spelling or try a broader term such as “dress” or “coat”.' : 'Try another category.'}
            action={(category || f.size || f.color || f.minPrice || f.maxPrice || f.availability) && <button className="btn btn-line" onClick={() => set({ category: '', size: '', color: '', minPrice: '', maxPrice: '', availability: '' })}>Clear filters</button>} />
        )}
        {list.data && list.data.items.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-12">{list.data.items.map((p) => <ProductCard key={p.id} product={p} />)}</div>
        )}
              </div>
      </div>

      {pg && pg.pages > 1 && (
        <nav aria-label="Pagination" className="mt-16 flex items-center justify-center gap-6">
          <button className="btn btn-line" disabled={page <= 1} onClick={() => set({ page: String(page - 1) })}>Previous</button>
          <span className="text-small text-muted">Page {pg.page} of {pg.pages}</span>
          <button className="btn btn-line" disabled={page >= pg.pages} onClick={() => set({ page: String(page + 1) })}>Next</button>
        </nav>
      )}
    </div>
  );
}
