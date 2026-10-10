import { Link } from 'react-router-dom';
import { useAsync } from '../hooks/useAsync.js';
import { useSeo } from '../hooks/useSeo.js';
import { contentApi } from '../services/engage.js';
import { excerptOf } from '../utils/richText.js';
import { RichText } from '../components/common/RichText.jsx';
import { ErrorState, Spinner } from '../components/common/States.jsx';
import { useAuth } from '../context/AuthContext.jsx';

function Seo({ page }) { useSeo({ title: page.title, description: page.data?.items ? 'Answers to common questions about delivery, returns, sizing and payments.' : excerptOf(page.body) }); return null; }

function Faq({ items }) {
  if (!items?.length) return <p className="text-muted">No questions have been published yet.</p>;
  return (
    <div className="max-w-2xl border-t rule">
      {items.map((it, i) => (
        <details key={i} className="border-b rule py-4 group">
          <summary className="cursor-pointer flex justify-between gap-6 font-semibold list-none">{it.q}<span aria-hidden="true" className="group-open:rotate-45 transition-transform">+</span></summary>
          <p className="mt-3 text-muted">{it.a}</p>
        </details>
      ))}
    </div>
  );
}

// Returns page gets a call to action for starting a return.
function ReturnsAction() {
  const { user } = useAuth();
  return (
    <div className="mt-12 flex gap-3 flex-wrap">
      <Link to={user ? '/account/orders' : '/login'} state={user ? undefined : { from: '/account/orders' }} className="btn btn-solid">{user ? 'Go to my orders' : 'Sign in to start a return'}</Link>
      {user && <Link to="/account/returns" className="btn btn-line">My returns</Link>}
    </div>
  );
}

export default function ContentPage({ contentKey }) {
  const { data: page, error, loading, reload } = useAsync((s) => contentApi.page(contentKey, s), [contentKey]);
  if (loading) return <Spinner />;
  if (error?.status === 404) return (
    <div className="wrap py-32 text-center"><h1 className="text-[length:var(--text-h2)]">This page isn’t available</h1><p className="mt-3 text-muted">It may have been moved or unpublished.</p><Link to="/" className="btn btn-line mt-8">Back to home</Link></div>
  );
  if (error) return <ErrorState error={error} onRetry={reload} />;
  return (
    <article className="wrap py-14 md:py-20">
      <Seo page={page} />
      <p className="eyebrow">Nessence</p>
      <h1 className="text-[length:var(--text-h1)] mt-3 mb-10 max-w-3xl">{page.title}</h1>
      {contentKey === 'faq' ? <Faq items={page.data?.items} /> : <RichText text={page.body} />}
      {contentKey === 'returns-policy' && <ReturnsAction />}
      <p className="mt-14 text-small text-muted">Last updated {new Date(page.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
    </article>
  );
}
