import { Link } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync.js';
import { catalogApi } from '../../services/catalog.js';
import { formatMoney } from '../../utils/format.js';

const LABEL = { men: 'Men', women: 'Women' };

// Real data only: categories, collections and the newest piece all come from the catalogue API.
export function useMegaData(gender) {
  return useAsync(async (signal) => {
    const [categories, collections, fresh] = await Promise.all([
      catalogApi.categories(gender, signal), catalogApi.collections(signal),
      catalogApi.list({ gender, newArrivals: 'true', sort: 'newest', limit: 1 }, signal),
    ]);
    return { categories, collections: collections.filter((c) => !c.genders?.length || c.genders.includes(gender)).slice(0, 4), piece: fresh.items[0] ?? null };
  }, [gender]);
}

export function MegaPanel({ gender, active, onNavigate }) {
  const { data, error } = useMegaData(gender); const label = LABEL[gender];
  return (
    <div id={`mega-${gender}`} hidden={!active} className="absolute inset-x-0 top-full bg-paper border-b rule">
      <div className="wrap grid grid-cols-[1fr_1fr_1.2fr] gap-12 py-10">
        <nav aria-label={`${label} categories`}>
          <p className="eyebrow">Shop {label.toLowerCase()}</p>
          <ul className="mt-4 space-y-2">
            <li><Link onClick={onNavigate} to={`/${gender}`} className="font-semibold">All {label.toLowerCase()}wear</Link></li>
            {data?.categories.map((c) => <li key={c.slug}><Link onClick={onNavigate} to={`/${gender}?category=${c.slug}`} className="hover:text-oxblood">{c.name}</Link></li>)}
            <li><Link onClick={onNavigate} to="/new-arrivals" className="link-u">New arrivals</Link></li>
          </ul>
          {error && <p role="alert" className="mt-4 text-small text-muted">Categories couldn’t be loaded.</p>}
        </nav>
        <nav aria-label={`${label} collections`}>
          <p className="eyebrow">Collections</p>
          {data?.collections.length > 0
            ? <ul className="mt-4 space-y-3">{data.collections.map((c) => <li key={c.slug}><Link onClick={onNavigate} to={`/collections/${c.slug}`} className="block hover:text-oxblood"><span className="font-display text-xl">{c.name}</span>{c.season && <span className="block text-small text-muted">{c.season}</span>}</Link></li>)}</ul>
            : data && <p className="mt-4 text-small text-muted">New collections are on their way.</p>}
          <Link onClick={onNavigate} to="/collections" className="inline-block mt-5 text-small link-u">All collections</Link>
        </nav>
        {data?.piece?.images[0] && (
          <Link onClick={onNavigate} to={`/products/${data.piece.slug}`} className="group grid grid-cols-[8rem_1fr] gap-5 items-end" aria-label={`New in: ${data.piece.name}`}>
            <span className="aspect-[4/5] bg-sand block overflow-hidden"><img src={data.piece.images[0].url} alt="" className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-[var(--duration-slow)]" loading="lazy" /></span>
            <span><span className="eyebrow block">New in</span><span className="font-display text-xl block mt-1">{data.piece.name}</span><span className="text-small text-muted">{formatMoney(data.piece.salePrice ?? data.piece.price)}</span></span>
          </Link>)}
      </div>
    </div>
  );
}

export function DrawerGroup({ gender, onNavigate }) {
  const { data, error } = useAsync((s) => catalogApi.categories(gender, s), [gender]); const label = LABEL[gender];
  return (
    <div className="pb-4 border-b rule">
      <Link to={`/${gender}`} onClick={onNavigate} className="font-display text-3xl block py-3">{label}</Link>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-small pb-2" aria-label={`${label} categories`}>
        {data?.map((c) => <li key={c.slug}><Link to={`/${gender}?category=${c.slug}`} onClick={onNavigate} className="py-2 inline-block text-muted hover:text-ink">{c.name}</Link></li>)}
        {error && <li className="text-muted">Categories unavailable</li>}
      </ul>
    </div>
  );
}
