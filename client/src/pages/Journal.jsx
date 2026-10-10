import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAsync } from '../hooks/useAsync.js';
import { useSeo } from '../hooks/useSeo.js';
import { useJsonLd } from '../hooks/useJsonLd.js';
import { journalApi } from '../services/engage.js';
import { excerptOf } from '../utils/richText.js';
import { RichText } from '../components/common/RichText.jsx';
import { EmptyState, ErrorState, Spinner } from '../components/common/States.jsx';

const fmt = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
const cover = (a) => a.coverImage?.url && <img src={a.coverImage.url} alt={a.coverImage.alt ?? ''} className="w-full aspect-[4/3] object-cover bg-sand" loading="lazy" />;

export function Journal() {
  useSeo({ title: 'Journal', description: 'Stories on cloth, cut and the people behind Nessence.' });
  const [sp, setSp] = useSearchParams(); const page = Number(sp.get('page')) || 1; const tag = sp.get('tag') || '';
  const { data, error, loading, reload } = useAsync((s) => journalApi.list({ page, tag: tag || undefined, limit: 9 }, s), [page, tag]);
  const go = (patch) => { const n = new URLSearchParams(sp); Object.entries(patch).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k))); setSp(n); window.scrollTo({ top: 0 }); };
  const pg = data?.pagination;
  return (
    <div className="wrap py-14 md:py-20">
      <p className="eyebrow">Nessence</p>
      <h1 className="text-[length:var(--text-h1)] mt-3">Journal</h1>
      <p className="mt-4 text-muted max-w-lg">Notes on materials, making and getting dressed.</p>
      {tag && <p className="mt-6 text-small">Filtered by <strong>{tag}</strong> <button className="link-u ml-2" onClick={() => go({ tag: '', page: '' })}>Clear</button></p>}
      <div className="mt-12">
        {loading && <Spinner />}
        {error && <ErrorState error={error} onRetry={reload} />}
        {data && data.items.length === 0 && <EmptyState title={tag ? `No articles tagged “${tag}”` : 'No articles published yet'} body="Check back soon, or browse the collection in the meantime." action={<Link to="/new-arrivals" className="btn btn-line">Shop new arrivals</Link>} />}
        {data && data.items.length > 0 && (
          <ul className="grid gap-x-8 gap-y-14 md:grid-cols-2 lg:grid-cols-3">
            {data.items.map((a) => (
              <li key={a.id}><article>
                <Link to={`/journal/${a.slug}`} className="block group">{cover(a)}
                  <p className="eyebrow mt-4">{fmt(a.publishedAt)}</p>
                  <h2 className="text-[length:var(--text-h3)] mt-2 group-hover:text-oxblood">{a.title}</h2>
                  <p className="mt-2 text-muted">{a.excerpt}</p>
                </Link>
                {a.tags?.length > 0 && <ul className="mt-3 flex gap-3 flex-wrap" aria-label="Tags">{a.tags.map((t) => <li key={t}><button className="eyebrow !text-ink" onClick={() => go({ tag: t, page: '' })}>#{t}</button></li>)}</ul>}
              </article></li>))}
          </ul>)}
      </div>
      {pg && pg.pages > 1 && (
        <nav aria-label="Pagination" className="mt-16 flex items-center justify-center gap-6">
          <button className="btn btn-line" disabled={page <= 1} onClick={() => go({ page: String(page - 1) })}>Previous</button>
          <span className="text-small text-muted">Page {pg.page} of {pg.pages}</span>
          <button className="btn btn-line" disabled={page >= pg.pages} onClick={() => go({ page: String(page + 1) })}>Next</button>
        </nav>)}
    </div>
  );
}

function ArticleSeo({ a }) {
  useSeo({ title: a.seo?.title || a.title, description: a.seo?.description || a.excerpt || excerptOf(a.content), image: a.coverImage?.url, type: 'article' });
  useJsonLd('ld-article', { '@context': 'https://schema.org', '@type': 'Article', headline: a.title, description: a.excerpt, author: { '@type': 'Person', name: a.author }, datePublished: a.publishedAt, ...(a.coverImage?.url ? { image: a.coverImage.url } : {}) });
  return null;
}

export function JournalArticle() {
  const { slug } = useParams();
  const { data: a, error, loading, reload } = useAsync((s) => journalApi.get(slug, s), [slug]);
  if (loading) return <Spinner />;
  if (error?.status === 404) return <div className="wrap py-32 text-center"><h1 className="text-[length:var(--text-h2)]">This article isn’t available</h1><p className="mt-3 text-muted">It may have been moved or unpublished.</p><Link to="/journal" className="btn btn-line mt-8">Back to the journal</Link></div>;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  return (
    <article className="wrap py-14 md:py-20">
      <ArticleSeo a={a} />
      <p className="eyebrow"><Link to="/journal">Journal</Link> / {fmt(a.publishedAt)}</p>
      <h1 className="text-[length:var(--text-h1)] mt-3 max-w-3xl">{a.title}</h1>
      <p className="mt-4 text-muted">By {a.author}</p>
      {a.coverImage?.url && <img src={a.coverImage.url} alt={a.coverImage.alt ?? ''} className="mt-10 w-full max-h-[70vh] object-cover bg-sand" />}
      <div className="mt-12"><RichText text={a.content} /></div>
      {a.tags?.length > 0 && <ul className="mt-12 flex gap-4 flex-wrap" aria-label="Tags">{a.tags.map((t) => <li key={t}><Link className="eyebrow !text-ink" to={`/journal?tag=${encodeURIComponent(t)}`}>#{t}</Link></li>)}</ul>}
    </article>
  );
}
