import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAsync } from '../hooks/useAsync.js';
import { useSeo } from '../hooks/useSeo.js';
import { catalogApi } from '../services/catalog.js';
import { ProductCard } from '../components/product/ProductCard.jsx';
import { EmptyState, ErrorState, GridSkeleton, Spinner } from '../components/common/States.jsx';

export function Collections() {
  useSeo({ title: 'Collections', description: 'Seasonal Nessence collections for men and women.' });
  const { data, error, loading, reload } = useAsync((s) => catalogApi.collections(s), []);
  return (
    <div className="wrap py-14 md:py-20">
      <p className="eyebrow">Nessence</p>
      <h1 className="text-[length:var(--text-h1)] mt-3">Collections</h1>
      <p className="mt-4 text-muted max-w-lg">Edited groups of pieces, designed to be worn together.</p>
      <div className="mt-12">
        {loading && <Spinner />}
        {error && <ErrorState error={error} onRetry={reload} />}
        {data?.length === 0 && <EmptyState title="No collections yet" body="Browse everything we have in the meantime." action={<Link to="/new-arrivals" className="btn btn-line">Shop new arrivals</Link>} />}
        {data?.length > 0 && (
          <ul className="grid md:grid-cols-2 border-t border-l rule">
            {data.map((c) => (
              <li key={c.slug} className="border-r border-b rule">
                <Link to={`/collections/${c.slug}`} className="block p-8 md:p-12 min-h-64 group hover:bg-sand transition-colors">
                  <p className="eyebrow">{[c.season, c.genders?.length === 1 ? (c.genders[0] === 'men' ? 'Men' : 'Women') : 'Men & Women'].filter(Boolean).join(' · ')}</p>
                  <h2 className="text-[length:var(--text-h2)] mt-4 group-hover:text-oxblood">{c.name}</h2>
                  {c.description && <p className="mt-3 text-muted max-w-sm">{c.description}</p>}
                  <p className="eyebrow !text-ink mt-8">Explore →</p>
                </Link>
              </li>))}
          </ul>)}
      </div>
    </div>
  );
}

export function CollectionDetail() {
  const { slug } = useParams(); const [sp, setSp] = useSearchParams(); const page = Number(sp.get('page')) || 1;
  const col = useAsync((s) => catalogApi.collection(slug, s), [slug]);
  const list = useAsync((s) => catalogApi.list({ collection: slug, page, limit: 12 }, s), [slug, page]);
  useSeo({ title: col.data?.name ?? 'Collection', description: col.data?.description });
  if (col.loading) return <Spinner />;
  if (col.error?.status === 404) return <div className="wrap py-32 text-center"><h1 className="text-[length:var(--text-h2)]">This collection isn’t available</h1><Link to="/collections" className="btn btn-line mt-8">All collections</Link></div>;
  if (col.error) return <ErrorState error={col.error} onRetry={col.reload} />;
  const pg = list.data?.pagination; const go = (n) => { setSp(n > 1 ? { page: String(n) } : {}); window.scrollTo({ top: 0 }); };
  return (
    <div className="wrap pt-10">
      <p className="eyebrow"><Link to="/">Home</Link> / <Link to="/collections">Collections</Link> / {col.data.name}</p>
      <h1 className="text-[length:var(--text-h1)] mt-3">{col.data.name}</h1>
      {col.data.season && <p className="eyebrow mt-3">{col.data.season}</p>}
      {col.data.description && <p className="mt-3 text-muted max-w-lg">{col.data.description}</p>}
      <div className="mt-10 border-t rule pt-10">
        {list.loading && <GridSkeleton count={8} />}
        {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
        {list.data?.items.length === 0 && <EmptyState title="No pieces in this collection yet" action={<Link to="/collections" className="btn btn-line">All collections</Link>} />}
        {list.data?.items.length > 0 && <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-12">{list.data.items.map((p) => <ProductCard key={p.id} product={p} />)}</div>}
      </div>
      {pg && pg.pages > 1 && (
        <nav aria-label="Pagination" className="mt-16 flex items-center justify-center gap-6">
          <button className="btn btn-line" disabled={page <= 1} onClick={() => go(page - 1)}>Previous</button>
          <span className="text-small text-muted">Page {pg.page} of {pg.pages}</span>
          <button className="btn btn-line" disabled={page >= pg.pages} onClick={() => go(page + 1)}>Next</button>
        </nav>)}
    </div>
  );
}
