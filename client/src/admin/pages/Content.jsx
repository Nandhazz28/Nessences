import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync.js';
import { api, get, send, fieldErrors } from '../api.js';
import { Badge, Btn, Card, Confirm, DataTable, ErrorBox, Field, ListCard, Loading, Modal, Note, PageHead, SearchBox, day, dt, useAction, useList, useToast } from '../ui.jsx';

export function Journal() {
  const nav = useNavigate(); const list = useList('/journal', { limit: 20 });
  return (<div><PageHead title="Journal" sub="Editorial articles shown on the storefront Journal."><Link className="a-btn primary" to="/admin/journal/new">New article</Link></PageHead>
    <ListCard list={list} onRow={(r) => nav(`/admin/journal/${r.id}`)} empty="No articles yet." columns={[{ header: 'Title', render: (r) => <div><b>{r.title}</b><div className="mono" style={{ color: 'var(--a-muted)', fontSize: 12 }}>{r.slug}</div></div> }, { header: 'Author', key: 'author' }, { header: 'Status', render: (r) => <Badge value={r.status} /> }, { header: 'Published', render: (r) => day(r.publishedAt) }, { header: 'Updated', render: (r) => dt(r.updatedAt) }]}
      filters={<><SearchBox onSearch={(q) => list.set({ q })} placeholder="Search title" /><select className="a-select" aria-label="Status" onChange={(e) => list.set({ status: e.target.value || undefined })}><option value="">All</option><option value="published">Published</option><option value="draft">Draft</option></select></>} /></div>);
}

export function ArticleForm() {
  const { id } = useParams(); const editing = Boolean(id); const nav = useNavigate(); const act = useAction();
  const art = useAsync(() => (editing ? get(`/journal/${id}`).then((r) => r.data) : Promise.resolve(null)), [id]);
  const [f, setF] = useState({ title: '', slug: '', excerpt: '', author: '', tags: '', status: 'draft', content: '', cover: null, seoTitle: '', seoDescription: '' }); const [errs, setErrs] = useState({}); const [top, setTop] = useState(''); const [busy, setBusy] = useState(false); const [up, setUp] = useState(false);
  useEffect(() => { const a = art.data; if (a) setF({ title: a.title, slug: a.slug, excerpt: a.excerpt, author: a.author, tags: (a.tags ?? []).join(', '), status: a.status, content: a.content, cover: a.coverImage ?? null, seoTitle: a.seo?.title ?? '', seoDescription: a.seo?.description ?? '' }); }, [art.data]);
  if (art.loading) return <Loading />; if (art.error) return <ErrorBox error={art.error} />;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const upload = async (file) => { setUp(true); const form = new FormData(); form.append('file', file); const r = await act(() => api('/uploads/product-image?purpose=article', { method: 'POST', form })); if (r?.data) setF((x) => ({ ...x, cover: { url: r.data.url, alt: x.cover?.alt || x.title || 'Cover image' } })); setUp(false); };
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErrs({}); setTop('');
    const body = { title: f.title, ...(f.slug ? { slug: f.slug } : {}), excerpt: f.excerpt, author: f.author, tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean), status: f.status, content: f.content, ...(f.cover ? { coverImage: f.cover } : {}), seo: { title: f.seoTitle || undefined, description: f.seoDescription || undefined } };
    try { const r = editing ? await send('PATCH', `/journal/${id}`, body) : await send('POST', '/journal', body); if (editing) { art.reload(); setBusy(false); } else nav(`/admin/journal/${r.data.id}`, { replace: true }); } catch (x) { setErrs(fieldErrors(x)); setTop(x.details?.length ? 'Please fix the highlighted fields.' : x.message); setBusy(false); }
  };
  return (<form onSubmit={save} noValidate>
    <PageHead title={editing ? f.title || 'Edit article' : 'New article'}><Link className="a-btn" to="/admin/journal">Back</Link>
      {editing && <Confirm danger trigger="Delete" title="Delete this article?" message="It will be removed from the Journal permanently." confirmLabel="Delete" onConfirm={async () => { await send('DELETE', `/journal/${id}`); nav('/admin/journal'); }} />}
      <Btn kind="primary" type="submit" disabled={busy}>{busy ? 'Saving…' : f.status === 'published' ? 'Save & publish' : 'Save draft'}</Btn></PageHead>
    <Note tone="bad">{top}</Note>
    <div className="a-grid a-g32"><div className="a-grid">
      <Card title="Article"><Field label="Title" value={f.title} onChange={set('title')} error={errs.title} /><Field as="textarea" label="Excerpt" value={f.excerpt} onChange={set('excerpt')} maxLength={300} error={errs.excerpt} style={{ minHeight: 70 }} />
        <Field as="textarea" label="Content" value={f.content} onChange={set('content')} error={errs.content} style={{ minHeight: 360, fontFamily: 'IBM Plex Mono, monospace' }} hint="Plain text. A blank line starts a new paragraph; a line beginning with “## ” is a heading. No HTML." /></Card></div>
      <div className="a-grid" style={{ alignContent: 'start' }}>
        <Card title="Publishing"><Field as="select" label="Status" value={f.status} onChange={set('status')}><option value="draft">Draft</option><option value="published">Published</option></Field><Field label="Author" value={f.author} onChange={set('author')} error={errs.author} /><Field label="Tags" value={f.tags} onChange={set('tags')} hint="Comma separated" /><Field label="URL slug" value={f.slug} onChange={set('slug')} hint="Optional — generated from the title" error={errs.slug} /></Card>
        <Card title="Cover image">{f.cover ? <><img src={f.cover.url} alt="" style={{ width: '100%', borderRadius: 6, background: '#E9EDF2' }} /><Field label="Alt text" value={f.cover.alt} onChange={(e) => setF({ ...f, cover: { ...f.cover, alt: e.target.value } })} /><Btn size="sm" kind="danger" onClick={() => setF({ ...f, cover: null })}>Remove</Btn></> : <p style={{ color: 'var(--a-muted)', marginTop: 0 }}>Optional.</p>}
          <label className="a-btn sm" style={{ cursor: 'pointer', marginTop: 8 }}>{up ? 'Uploading…' : f.cover ? 'Replace image' : 'Upload image'}<input type="file" hidden accept="image/jpeg,image/png,image/webp" disabled={up} onChange={(e) => { if (e.target.files[0]) upload(e.target.files[0]); e.target.value = ''; }} /></label></Card>
        <Card title="SEO"><Field label="Page title" value={f.seoTitle} onChange={set('seoTitle')} maxLength={70} /><Field as="textarea" label="Meta description" value={f.seoDescription} onChange={set('seoDescription')} maxLength={160} /></Card></div></div></form>);
}

const PAGES = [['about', 'About Nessence'], ['shipping', 'Shipping'], ['returns-policy', 'Returns policy'], ['refund-policy', 'Refund policy'], ['size-guide', 'Size guide'], ['faq', 'FAQ'], ['privacy', 'Privacy policy'], ['terms', 'Terms & conditions'], ['cookie-policy', 'Cookie policy'], ['careers', 'Careers']];
function PageEditor({ pageKey, current, onClose, onSaved }) {
  const isFaq = pageKey === 'faq'; const [title, setTitle] = useState(current?.title ?? PAGES.find(([k]) => k === pageKey)[1]); const [body, setBody] = useState(current?.body ?? ''); const [items, setItems] = useState(current?.data?.items ?? []);
  const [err, setErr] = useState(null); const [busy, setBusy] = useState(false); const fe = fieldErrors(err);
  const save = async () => { setBusy(true); setErr(null); try { await send('PUT', `/content/${pageKey}`, { title, body, ...(isFaq ? { data: { items: items.filter((i) => i.q.trim() || i.a.trim()) } } : {}) }); onSaved(); } catch (e) { setErr(e); setBusy(false); } };
  return (<Modal title={`Edit: ${PAGES.find(([k]) => k === pageKey)[1]}`} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Publish changes'}</Btn></>}>
    <Note tone="bad">{err && !err.details?.length ? err.message : err ? 'Please fix the highlighted fields.' : ''}</Note>
    <Field label="Title" value={title} onChange={(e) => setTitle(e.target.value)} error={fe.title} />
    {isFaq ? <>{items.map((it, i) => <div key={i} style={{ borderBottom: '1px solid var(--a-line)', marginBottom: 12 }}><Field label={`Question ${i + 1}`} value={it.q} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))} /><Field as="textarea" label="Answer" value={it.a} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} style={{ minHeight: 70 }} /><Btn size="sm" kind="danger" onClick={() => setItems(items.filter((_, j) => j !== i))}>Remove</Btn></div>)}<Btn size="sm" onClick={() => setItems([...items, { q: '', a: '' }])}>+ Add question</Btn></>
      : <Field as="textarea" label="Content" value={body} onChange={(e) => setBody(e.target.value)} style={{ minHeight: 320, fontFamily: 'IBM Plex Mono, monospace' }} hint="Plain text. Blank line = new paragraph; “## ” = heading; lines like “S | 84 | 66” become table rows; lines starting “1. ” form a list." />}
  </Modal>);
}
export function Pages() {
  const { data, error, loading, reload } = useAsync(() => get('/content').then((r) => r.data), []); const [edit, setEdit] = useState(null); const toast = useToast();
  if (loading) return <Loading />; if (error) return <ErrorBox error={error} onRetry={reload} />;
  const by = Object.fromEntries(data.map((p) => [p.key, p]));
  return (<div><PageHead title="Pages" sub="Editable pages linked from the storefront footer. Changes go live when saved." />
    <Card flush><DataTable columns={[{ header: 'Page', render: (r) => <b>{r.name}</b> }, { header: 'Key', render: (r) => <span className="mono">{r.key}</span> }, { header: 'Status', render: (r) => (by[r.key] ? <Badge value="published" /> : <Badge value="not created" tone="warn" />) }, { header: 'Last updated', render: (r) => dt(by[r.key]?.updatedAt) }, { header: '', right: true, render: (r) => <Btn size="sm" onClick={() => setEdit(r.key)}>{by[r.key] ? 'Edit' : 'Create'}</Btn> }]} rows={PAGES.map(([key, name]) => ({ id: key, key, name }))} /></Card>
    {edit && <PageEditor pageKey={edit} current={by[edit]} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); toast('Page saved'); }} />}</div>);
}

export function Settings() {
  const { data, error, loading, reload } = useAsync(() => get('/settings').then((r) => r.data), []); const [f, setF] = useState(null); const [err, setErr] = useState(null); const [busy, setBusy] = useState(false); const toast = useToast();
  useEffect(() => { if (data) setF({ storeName: data.storeName, supportEmail: data.supportEmail ?? '', supportPhone: data.supportPhone ?? '', instagram: data.social?.instagram ?? '', facebook: data.social?.facebook ?? '', youtube: data.social?.youtube ?? '' }); }, [data]);
  if (loading || !f) return <Loading />; if (error) return <ErrorBox error={error} onRetry={reload} />;
  const fe = fieldErrors(err); const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => { e.preventDefault(); setBusy(true); setErr(null); try { await send('PUT', '/settings', { storeName: f.storeName, supportEmail: f.supportEmail, supportPhone: f.supportPhone, social: { instagram: f.instagram, facebook: f.facebook, youtube: f.youtube } }); toast('Settings saved'); reload(); } catch (x) { setErr(x); } finally { setBusy(false); } };
  return (<form onSubmit={save} noValidate style={{ maxWidth: 640 }}><PageHead title="Settings" sub="Store details shown to customers."><Btn kind="primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Btn></PageHead>
    <Note tone="bad">{err && !err.details?.length ? err.message : ''}</Note>
    <Card title="Store"><Field label="Store name" value={f.storeName} onChange={set('storeName')} error={fe.storeName} /><div className="a-row"><Field label="Support email" type="email" value={f.supportEmail} onChange={set('supportEmail')} error={fe.supportEmail} /><Field label="Support phone" value={f.supportPhone} onChange={set('supportPhone')} /></div></Card>
    <div style={{ height: 16 }} /><Card title="Social links"><p style={{ marginTop: 0, color: 'var(--a-muted)' }}>Only links you fill in appear on the storefront. Use the full https address.</p>
      <Field label="Instagram" value={f.instagram} onChange={set('instagram')} placeholder="https://www.instagram.com/…" error={fe['social.instagram']} /><Field label="Facebook" value={f.facebook} onChange={set('facebook')} placeholder="https://www.facebook.com/…" error={fe['social.facebook']} /><Field label="YouTube" value={f.youtube} onChange={set('youtube')} placeholder="https://www.youtube.com/…" error={fe['social.youtube']} /></Card></form>);
}
