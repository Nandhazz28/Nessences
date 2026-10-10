import { useId, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { reviewsApi } from '../../services/engage.js';
import { ErrorState } from '../common/States.jsx';
import { Stars } from './Stars.jsx';

const fmt = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const STATUS = { pending: 'Awaiting moderation — only you can see this until it is approved.', flagged: 'Held for review by our team.', rejected: 'Not published.' };
const REASONS = [['spam', 'Spam'], ['offensive', 'Offensive'], ['irrelevant', 'Not about this product'], ['personal_info', 'Contains personal information'], ['other', 'Other']];

export function ReviewForm({ slug, existing, onDone, onCancel }) {
  const uid = useId(); const [rating, setRating] = useState(existing?.rating ?? 0); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault(); if (!rating) { setErr('Please choose a rating.'); return; }
    const f = Object.fromEntries(new FormData(e.currentTarget)); setBusy(true); setErr('');
    const body = { rating, title: f.title || undefined, body: f.body };
    try { await (existing ? reviewsApi.update(existing.id, body) : reviewsApi.create(slug, body)); onDone(); }
    catch (er) { setErr(er.details?.[0]?.message ?? er.message); setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="border border-stone p-6 space-y-5" aria-label={existing ? 'Edit your review' : 'Write a review'}>
      <fieldset><legend className="eyebrow !text-ink font-semibold">Your rating</legend>
        <div className="flex gap-2 mt-2">{[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className={`w-11 h-11 grid place-items-center border cursor-pointer text-small ${rating === n ? 'bg-ink text-paper border-ink' : 'border-control'}`}>
            <input type="radio" name="rating" value={n} aria-label={`${n} out of 5`} checked={rating === n} onChange={() => setRating(n)} className="sr-only" /><span aria-hidden="true">{n}</span>
          </label>))}</div></fieldset>
      <div><label htmlFor={`${uid}t`} className="eyebrow block mb-2">Title <span className="normal-case tracking-normal">(optional)</span></label><input id={`${uid}t`} name="title" className="field" maxLength={80} defaultValue={existing?.title ?? ''} /></div>
      <div><label htmlFor={`${uid}b`} className="eyebrow block mb-2">Your review</label><textarea id={`${uid}b`} name="body" className="field !h-32 py-3" required minLength={10} maxLength={2000} defaultValue={existing?.body ?? ''} /></div>
      {err && <p role="alert" className="text-small text-oxblood">{err}</p>}
      <div className="flex gap-3"><button className="btn btn-solid" disabled={busy}>{busy ? 'Saving…' : existing ? 'Save changes' : 'Submit review'}</button>{onCancel && <button type="button" className="btn btn-line" onClick={onCancel}>Cancel</button>}</div>
      <p className="text-small text-muted">Reviews are checked before they appear on the page.</p>
    </form>
  );
}

function ReportButton({ id }) {
  const [state, setState] = useState('idle'); const [reason, setReason] = useState('spam'); const [err, setErr] = useState('');
  if (state === 'done') return <span className="text-small text-muted" role="status">Thanks — reported.</span>;
  if (state === 'idle') return <button className="text-small link-u text-muted" onClick={() => setState('open')}>Report</button>;
  return (
    <span className="inline-flex items-center gap-2 flex-wrap">
      <label className="sr-only" htmlFor={`rr-${id}`}>Reason for report</label>
      <select id={`rr-${id}`} className="field !h-9 !w-auto text-small" value={reason} onChange={(e) => setReason(e.target.value)}>{REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <button className="text-small link-u" onClick={async () => { try { await reviewsApi.report(id, { reason }); setState('done'); } catch (e) { setErr(e.message); } }}>Send report</button>
      <button className="text-small text-muted" onClick={() => setState('idle')}>Cancel</button>
      {err && <span role="alert" className="text-small text-oxblood">{err}</span>}
    </span>
  );
}

export function Reviews({ slug }) {
  const { user } = useAuth(); const loc = useLocation();
  const [sort, setSort] = useState('newest'); const [page, setPage] = useState(1); const [editing, setEditing] = useState(false); const [confirmDel, setConfirmDel] = useState(false); const [err, setErr] = useState('');
  const { data, error, loading, reload } = useAsync((s) => reviewsApi.list(slug, { sort, page, limit: 6 }, s), [slug, sort, page, user?.id ?? user?._id ?? 'guest']);
  const done = () => { setEditing(false); reload(); };
  const remove = async () => { try { await reviewsApi.remove(data.viewer.review.id); setConfirmDel(false); reload(); } catch (e) { setErr(e.message); } };
  const sum = data?.summary; const v = data?.viewer;

  return (
    <section className="lg:col-span-2 mt-10 border-t rule pt-10" aria-labelledby="rev-h">
      <h2 id="rev-h" className="text-[length:var(--text-h2)]">Reviews</h2>
      {loading && !data && <p role="status" className="mt-6 eyebrow">Loading reviews…</p>}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && (
        <div className="mt-8 grid lg:grid-cols-[18rem_1fr] gap-12">
          <div>
            {sum.count > 0 ? (
              <>
                <p className="font-display text-5xl">{sum.average.toFixed(1)}</p>
                <p className="mt-1"><Stars value={sum.average} label={`${sum.average} out of 5 from ${sum.count} reviews`} /> <span className="text-small text-muted ml-2">{sum.count} {sum.count === 1 ? 'review' : 'reviews'}</span></p>
                <ul className="mt-6 space-y-2" aria-label="Rating breakdown">{[5, 4, 3, 2, 1].map((n) => (
                  <li key={n} className="flex items-center gap-3 text-small"><span className="w-8">{n} ★</span><span className="flex-1 h-1.5 bg-sand" aria-hidden="true"><span className="block h-full bg-ink" style={{ width: `${(sum.distribution[n] / sum.count) * 100}%` }} /></span><span className="w-6 text-muted text-right">{sum.distribution[n]}</span></li>))}</ul>
              </>
            ) : <p className="text-muted">No reviews yet.</p>}
            <div className="mt-8">
              {!user && <p className="text-small"><Link to="/login" state={{ from: loc.pathname }} className="link-u">Sign in</Link> to review a piece you’ve received.</p>}
              {v && !v.review && v.canReview && !editing && <button className="btn btn-line" onClick={() => setEditing(true)}>Write a review</button>}
              {v && !v.review && !v.canReview && <p className="text-small text-muted">{v.reason}</p>}
            </div>
          </div>
          <div>
            {editing && !v?.review && <div className="mb-10"><ReviewForm slug={slug} onDone={done} onCancel={() => setEditing(false)} /></div>}
            {v?.review && (
              <div className="mb-10 border border-stone p-6">
                <p className="eyebrow">Your review</p>
                {editing ? <div className="mt-4"><ReviewForm slug={slug} existing={v.review} onDone={done} onCancel={() => setEditing(false)} /></div> : (
                  <>
                    <p className="mt-2"><Stars value={v.review.rating} /> {v.review.title && <strong className="ml-2">{v.review.title}</strong>}</p>
                    <p className="mt-2">{v.review.body}</p>
                    {STATUS[v.review.status] && <p role="status" className="mt-3 text-small text-oxblood">{STATUS[v.review.status]}{v.review.moderationNote ? ` ${v.review.moderationNote}` : ''}</p>}
                    <div className="mt-4 flex gap-4 text-small">
                      <button className="link-u" onClick={() => setEditing(true)}>Edit</button>
                      {!confirmDel ? <button className="link-u" onClick={() => setConfirmDel(true)}>Delete</button>
                        : <span>Delete this review? <button className="link-u text-oxblood ml-2" onClick={remove}>Yes, delete</button> <button className="link-u ml-2" onClick={() => setConfirmDel(false)}>Keep it</button></span>}
                    </div>
                    {err && <p role="alert" className="mt-2 text-small text-oxblood">{err}</p>}
                  </>)}
              </div>)}
            {sum.count > 0 && (
              <>
                <label className="text-small flex items-center gap-2 justify-end mb-4">Sort
                  <select className="field !h-10 !w-auto" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}><option value="newest">Newest</option><option value="highest">Highest rated</option><option value="lowest">Lowest rated</option></select></label>
                <ul className="border-t rule">{data.items.map((r) => (
                  <li key={r.id} className="py-6 border-b rule">
                    <p><Stars value={r.rating} /> {r.title && <strong className="ml-2">{r.title}</strong>}</p>
                    <p className="mt-2">{r.body}</p>
                    <p className="mt-3 text-small text-muted flex flex-wrap gap-x-4 gap-y-1 items-center">{r.author} · {fmt(r.createdAt)} · Verified purchase {user && <ReportButton id={r.id} />}</p>
                  </li>))}</ul>
                {data.pagination.pages > 1 && (
                  <nav aria-label="Review pages" className="mt-8 flex items-center gap-6">
                    <button className="btn btn-line" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
                    <span className="text-small text-muted">Page {data.pagination.page} of {data.pagination.pages}</span>
                    <button className="btn btn-line" disabled={page >= data.pagination.pages} onClick={() => setPage(page + 1)}>Next</button>
                  </nav>)}
              </>)}
          </div>
        </div>)}
    </section>
  );
}
