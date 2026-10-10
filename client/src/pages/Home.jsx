import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '../hooks/useAsync.js';
import { siteOrigin, useSeo } from '../hooks/useSeo.js';
import { useJsonLd } from '../hooks/useJsonLd.js';
import { useSettings } from '../context/SettingsContext.jsx';
import { useParallax } from '../hooks/useParallax.js';
import { catalogApi } from '../services/catalog.js';
import { contentApi, journalApi } from '../services/engage.js';
import { excerptOf } from '../utils/richText.js';
import { ProductCard } from '../components/product/ProductCard.jsx';
import { NewsletterForm } from '../components/newsletter/NewsletterForm.jsx';
import { ArrowIcon } from '../components/common/Icon.jsx';
import { Reveal } from '../components/common/Reveal.jsx';
import { ErrorState, GridSkeleton, EmptyState } from '../components/common/States.jsx';

const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
const Head = ({ id, eyebrow, title, to, cta }) => (
  <div className="flex items-end justify-between gap-6 mb-8">
    <div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2 id={id} className="text-[length:var(--text-h2)] mt-1">{title}</h2></div>
    {to && <Link to={to} className="eyebrow !text-ink link-u font-semibold shrink-0">{cta}</Link>}
  </div>
);

function Hero({ piece }) {
  const art = useRef(null); useParallax(art, 0.06); const img = piece?.images?.[0];
  return (
    <section className="grid md:grid-cols-2 border-b rule min-h-[calc(100svh-5rem)] overflow-hidden" aria-label="Autumn/Winter 2026">
      <div className="hero-rise wrap md:!px-0 md:pl-[var(--gutter)] md:pr-12 flex flex-col justify-center py-16 md:py-24">
        <p className="eyebrow">Autumn/Winter 2026</p>
        <h1 className="text-[length:var(--text-h1)] mt-5">Dressed for the <em className="text-oxblood">in-between</em> hours.</h1>
        <p className="mt-6 max-w-md text-muted">A season of unfussy tailoring, weighted knits and coats built to outlast the trend cycle.</p>
        <div className="mt-10 flex gap-3 flex-wrap"><Link to="/women" className="btn btn-solid">Shop women</Link><Link to="/men" className="btn btn-line">Shop men</Link></div>
      </div>
      <div className="bg-sand relative min-h-[50svh] overflow-hidden">
        {img && <Link to={`/products/${piece.slug}`} aria-label={`${piece.name}, new this season`} className="absolute inset-0 block"><img ref={art} src={img.url} alt={img.alt} fetchpriority="high" className="absolute inset-0 w-full h-full object-contain p-10" /></Link>}
        {piece && <p className="absolute left-6 bottom-5 eyebrow">New · {piece.name}</p>}
      </div>
    </section>
  );
}

function Departments() {
  return (
    <section className="grid md:grid-cols-2 border-b rule" aria-label="Shop by department">
      {[['Menswear', '/men', 'bg-paper', 'Shirts, tailoring, outerwear and the quiet basics between.'], ['Womenswear', '/women', 'bg-sand', 'Dresses, knitwear and coats cut for movement.']].map(([t, to, bg, blurb]) => (
        <Link key={to} to={to} className={`${bg} group px-[var(--gutter)] py-16 md:py-28 flex items-end justify-between border-b md:border-b-0 md:border-r rule last:border-r-0`}>
          <span><span className="font-display text-4xl block">{t}</span><span className="mt-2 block text-muted max-w-xs">{blurb}</span></span>
          <ArrowIcon width={28} height={28} className="transition-transform duration-[var(--duration-base)] group-hover:translate-x-2" />
        </Link>))}
    </section>
  );
}

function FeaturedCollection({ collection, items }) {
  return (
    <Reveal as="section" className="mt-24 border-y rule" aria-labelledby="fc">
      <div className="grid lg:grid-cols-[1fr_2fr]">
        <div className="wrap lg:!px-0 lg:pl-[var(--gutter)] lg:pr-12 py-12 lg:py-20 flex flex-col justify-center lg:border-r rule">
          <p className="eyebrow">Featured collection{collection.season ? ` · ${collection.season}` : ''}</p>
          <h2 id="fc" className="text-[length:var(--text-h2)] mt-3">{collection.name}</h2>
          {collection.description && <p className="mt-4 text-muted max-w-sm">{collection.description}</p>}
          <Link to={`/collections/${collection.slug}`} className="btn btn-line mt-8 self-start">Explore the collection</Link>
        </div>
        <ul className="grid grid-cols-3 gap-x-4 p-6 lg:p-10 items-start">{items.map((p) => <li key={p.id}><ProductCard product={p} level={3} /></li>)}</ul>
      </div>
    </Reveal>
  );
}

function JournalStrip({ articles }) {
  const [lead, ...rest] = articles;
  return (
    <Reveal as="section" className="wrap mt-24" aria-labelledby="jr">
      <Head id="jr" eyebrow="Editorial" title="From the journal" to="/journal" cta="Read the journal" />
      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-10">
        <article><Link to={`/journal/${lead.slug}`} className="group block">
          {lead.coverImage?.url && <img src={lead.coverImage.url} alt={lead.coverImage.alt ?? ''} loading="lazy" className="w-full aspect-[16/10] object-cover bg-sand mb-5" />}
          <p className="eyebrow">{fmtDate(lead.publishedAt)}</p><h3 className="font-display text-3xl mt-2 group-hover:text-oxblood">{lead.title}</h3><p className="mt-3 text-muted max-w-xl">{lead.excerpt}</p>
        </Link></article>
        {rest.length > 0 && <ul className="border-t rule">{rest.map((a) => <li key={a.id} className="border-b rule"><Link to={`/journal/${a.slug}`} className="block py-6 group"><p className="eyebrow">{fmtDate(a.publishedAt)}</p><h3 className="font-display text-xl mt-1 group-hover:text-oxblood">{a.title}</h3></Link></li>)}</ul>}
      </div>
    </Reveal>
  );
}

function Lookbook({ products }) {
  const shots = products.filter((p) => p.images?.[0]).slice(0, 5);
  if (shots.length < 3) return null;
  return (
    <Reveal as="section" className="wrap mt-24" aria-labelledby="lb">
      <Head id="lb" eyebrow="Lookbook" title="Worn together" />
      <ul className="grid grid-cols-2 md:grid-cols-4 gap-3 md:grid-rows-2">
        {shots.map((p, i) => (
          <li key={p.id} className={i === 0 ? 'col-span-2 md:row-span-2' : ''}>
            <Link to={`/products/${p.slug}`} className="group block h-full relative bg-sand overflow-hidden">
              <img src={p.images[0].url} alt="" loading="lazy" className={`w-full object-contain p-6 transition-transform duration-[var(--duration-slow)] group-hover:scale-[1.03] ${i === 0 ? 'aspect-square md:aspect-auto md:h-full' : 'aspect-[4/5]'}`} />
              <span className="absolute left-3 bottom-3 eyebrow !text-ink">{p.name}</span>
            </Link>
          </li>))}
      </ul>
    </Reveal>
  );
}

export default function Home() {
  useSeo({ title: null, description: 'Premium contemporary fashion for men and women. Considered cloth, clean cut, quiet detail.' });
  const { settings } = useSettings(); const origin = siteOrigin();
  // Site-level structured data: the brand, its configured social profiles only, and the search box.
  useJsonLd('ld-site', { '@context': 'https://schema.org', '@graph': [
    { '@type': 'Organization', name: settings.storeName ?? 'Nessence', url: origin, ...(Object.values(settings.social ?? {}).length ? { sameAs: Object.values(settings.social) } : {}) },
    { '@type': 'WebSite', name: settings.storeName ?? 'Nessence', url: origin, potentialAction: { '@type': 'SearchAction', target: `${origin}/search?q={search_term_string}`, 'query-input': 'required name=search_term_string' } },
  ] });
  const fresh = useAsync((s) => catalogApi.list({ newArrivals: 'true', sort: 'newest', limit: 8 }, s), []);
  const featured = useAsync((s) => catalogApi.list({ sort: 'featured', limit: 4 }, s), []);
  const cats = useAsync((s) => catalogApi.categories(undefined, s), []);
  const col = useAsync(async (s) => {
    const all = await catalogApi.collections(s); const c = all.find((x) => x.featured) ?? all[0];
    return c ? { collection: c, items: (await catalogApi.list({ collection: c.slug, limit: 3 }, s)).items } : null;
  }, []);
  const journal = useAsync((s) => journalApi.list({ limit: 3 }, s), []);
  const about = useAsync((s) => contentApi.page('about', s), []);
  const lookProducts = [...(fresh.data?.items ?? []), ...(featured.data?.items ?? [])].filter((p, i, a) => a.findIndex((q) => q.id === p.id) === i);

  return (
    <>
      <Hero piece={fresh.data?.items?.[0]} />
      <Departments />

      <Reveal as="section" className="wrap pt-20" aria-labelledby="na">
        <Head id="na" title="New arrivals" to="/new-arrivals" cta="View all" />
        {fresh.loading && !fresh.data && <GridSkeleton count={4} />}
        {fresh.error && <ErrorState error={fresh.error} onRetry={fresh.reload} />}
        {fresh.data?.items.length === 0 && <EmptyState title="New pieces arrive soon" body="Browse the full catalogue in the meantime." action={<Link className="btn btn-line" to="/women">Shop women</Link>} />}
        {fresh.data?.items.length > 0 && <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-10">{fresh.data.items.slice(0, 8).map((p) => <ProductCard key={p.id} product={p} level={3} />)}</div>}
      </Reveal>

      {col.data && col.data.items.length > 0 && <FeaturedCollection {...col.data} />}

      {featured.data?.items.length > 0 && (
        <Reveal as="section" className="wrap mt-24" aria-labelledby="ft">
          <Head id="ft" eyebrow="Our edit" title="Featured pieces" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-10">{featured.data.items.map((p) => <ProductCard key={p.id} product={p} level={3} />)}</div>
        </Reveal>)}

      {journal.data?.items.length > 0 && <JournalStrip articles={journal.data.items} />}

      {cats.data?.length > 0 && (
        <Reveal as="section" className="wrap mt-24" aria-labelledby="cd">
          <Head id="cd" eyebrow="Browse" title="Shop by category" />
          <ul className="grid sm:grid-cols-2 lg:grid-cols-4 border-t border-l rule">
            {cats.data.map((c) => (
              <li key={c.slug} className="border-r border-b rule">
                <Link to={`/${c.genders?.length === 1 ? c.genders[0] : 'women'}?category=${c.slug}`} className="group flex items-center justify-between px-6 py-8 hover:bg-sand transition-colors">
                  <span className="font-display text-2xl group-hover:text-oxblood">{c.name}</span><ArrowIcon width={18} height={18} />
                </Link>
              </li>))}
          </ul>
        </Reveal>)}

      <Lookbook products={lookProducts} />

      {about.data && (
        <Reveal as="section" className="wrap mt-24 py-20 border-t rule" aria-labelledby="bs">
          <p className="eyebrow">Our story</p>
          <h2 id="bs" className="sr-only">About Nessence</h2>
          <p className="font-display text-[length:var(--text-h2)] leading-snug max-w-3xl mt-4">{excerptOf(about.data.body, 260)}</p>
          <Link to="/about" className="btn btn-line mt-8">Read our story</Link>
        </Reveal>)}

      <section className="bg-sand border-t rule mt-8" aria-labelledby="nl">
        <div className="wrap py-20 grid lg:grid-cols-2 gap-10 items-center">
          <div><p className="eyebrow">Newsletter</p><h2 id="nl" className="text-[length:var(--text-h2)] mt-2">First sight of every release.</h2><p className="mt-3 text-muted max-w-sm">New arrivals, journal stories and the occasional private sale. No noise.</p></div>
          <NewsletterForm source="home" compact />
        </div>
      </section>
    </>
  );
}
