import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync.js';
import { api, get, send, fieldErrors } from '../api.js';
import { Badge, Btn, Card, Confirm, ErrorBox, Field, ListCard, Loading, Modal, Note, PageHead, SearchBox, money, useAction, useList } from '../ui.jsx';

export function Products() {
  const nav = useNavigate(); const list = useList('/products', { limit: 20 });
  const cols = [
    { header: '', render: (r) => (r.image ? <img className="a-thumb" src={r.image} alt="" /> : <div className="a-thumb" />) },
    { header: 'Product', render: (r) => <div><b>{r.name}</b><div className="mono" style={{ color: 'var(--a-muted)', fontSize: 12 }}>{r.slug}</div></div> },
    { header: 'Status', render: (r) => <Badge value={r.status} /> }, { header: 'Category', render: (r) => `${r.gender === 'men' ? 'Men' : 'Women'} · ${r.category ?? '—'}` },
    { header: 'Stock', right: true, num: true, render: (r) => (r.available <= 0 ? <span style={{ color: 'var(--a-danger)' }}>0</span> : r.available) },
    { header: 'Price', right: true, num: true, render: (r) => (r.salePrice ? <>{money(r.salePrice)} <s style={{ color: 'var(--a-muted)' }}>{money(r.price)}</s></> : money(r.price)) },
  ];
  return (<div><PageHead title="Products" sub="Everything on the storefront comes from here."><Link className="a-btn primary" to="/admin/products/new">New product</Link></PageHead>
    <ListCard list={list} columns={cols} onRow={(r) => nav(`/admin/products/${r.id}/edit`)} empty="No products match." filters={<>
      <SearchBox onSearch={(q) => list.set({ q })} placeholder="Search name or slug" />
      <select className="a-select" aria-label="Status" onChange={(e) => list.set({ status: e.target.value || undefined })}><option value="">All statuses</option><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select>
      <select className="a-select" aria-label="Department" onChange={(e) => list.set({ gender: e.target.value || undefined })}><option value="">Men & women</option><option value="men">Men</option><option value="women">Women</option></select></>} /></div>);
}

const rupees = (p) => (p == null ? '' : String(p / 100));
const toPaise = (v) => (v === '' || v == null ? null : Math.round(parseFloat(v) * 100));
const lines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);
const blank = { name: '', description: '', gender: 'women', categoryId: '', collectionIds: [], price: '', salePrice: '', tags: '', materials: '', care: '', details: '', status: 'draft', featured: false, newArrival: false, seoTitle: '', seoDescription: '', images: [] };

function VariantAdder({ onAdd, onChange, busy }) {
  const [colors, setColors] = useState([{ name: '', hex: '#181510' }]); const [sizes, setSizes] = useState('XS, S, M, L, XL'); const [stock, setStock] = useState(0);
  const spec = () => ({ colors: colors.filter((c) => c.name.trim()).map((c) => ({ name: c.name.trim(), hex: c.hex })), sizes: sizes.split(',').map((s) => s.trim()).filter(Boolean), stock: Number(stock) || 0, lowStockThreshold: 5 });
  useEffect(() => { onChange?.(spec()); }, [colors, sizes, stock]); // eslint-disable-line
  return (<div>
    {colors.map((c, i) => <div key={i} className="a-row" style={{ gridTemplateColumns: '1fr 80px auto', alignItems: 'end' }}>
      <Field label={i === 0 ? 'Colour name' : ''} value={c.name} onChange={(e) => setColors(colors.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="e.g. Oxblood" />
      <Field label={i === 0 ? 'Swatch' : ''} type="color" value={c.hex} onChange={(e) => setColors(colors.map((x, j) => (j === i ? { ...x, hex: e.target.value } : x)))} />
      <div style={{ marginBottom: 14 }}>{colors.length > 1 && <Btn size="sm" onClick={() => setColors(colors.filter((_, j) => j !== i))}>Remove</Btn>}</div></div>)}
    <Btn size="sm" onClick={() => setColors([...colors, { name: '', hex: '#555555' }])}>+ Add colour</Btn>
    <div className="a-row" style={{ marginTop: 14 }}><Field label="Sizes (comma separated)" value={sizes} onChange={(e) => setSizes(e.target.value)} hint="Apparel XS–XL, trousers 30–36, footwear 6–10, or One Size" />
      <Field label="Starting stock per variant" type="number" min="0" value={stock} onChange={(e) => setStock(e.target.value)} /></div>
    {onAdd && <Btn kind="accent" disabled={busy} onClick={() => onAdd(spec())}>{busy ? 'Adding…' : 'Add variants'}</Btn>}
  </div>);
}

export function ProductForm() {
  const { id } = useParams(); const editing = Boolean(id); const nav = useNavigate(); const act = useAction();
  const taxo = useAsync(async () => { const [c, o] = await Promise.all([get('/categories'), get('/collections')]); return { cats: c.data, cols: o.data }; }, []);
  const prod = useAsync(() => (editing ? get(`/products/${id}`).then((r) => r.data) : Promise.resolve(null)), [id]);
  const [f, setF] = useState(blank); const [errs, setErrs] = useState({}); const [top, setTop] = useState(''); const [busy, setBusy] = useState(false); const [uploading, setUploading] = useState(false);
  const [newVariants, setNewVariants] = useState(null); const [addOpen, setAddOpen] = useState(false); const [addBusy, setAddBusy] = useState(false);
  const p = prod.data;
  useEffect(() => { if (p) setF({ name: p.name, description: p.description, gender: p.gender, categoryId: p.category, collectionIds: (p.collections ?? []).map(String), price: rupees(p.price), salePrice: rupees(p.salePrice), tags: (p.tags ?? []).join(', '), materials: p.materials ?? '', care: (p.care ?? []).join('\n'), details: (p.details ?? []).join('\n'),
    status: p.status, featured: p.featured, newArrival: Boolean(p.newArrivalUntil && new Date(p.newArrivalUntil) > new Date()), seoTitle: p.seo?.title ?? '', seoDescription: p.seo?.description ?? '', images: [...(p.images ?? [])].sort((a, b) => a.order - b.order).map((i) => ({ url: i.url, alt: i.alt, color: i.color ?? '' })) }); }, [p]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const colorsAvail = useMemo(() => [...new Set((p?.variants ?? []).map((v) => v.color.name))], [p]);
  if (taxo.loading || prod.loading) return <Loading />; if (taxo.error || prod.error) return <ErrorBox error={taxo.error ?? prod.error} />;

  const upload = async (files) => {
    setUploading(true);
    for (const file of files) { const form = new FormData(); form.append('file', file); const r = await act(() => api('/uploads/product-image', { method: 'POST', form })); if (r?.data) setF((x) => ({ ...x, images: [...x.images, { url: r.data.url, alt: f.name ? `${f.name}` : '', color: '' }] })); }
    setUploading(false);
  };
  const move = (i, d) => setF((x) => { const a = [...x.images]; const j = i + d; if (j < 0 || j >= a.length) return x; [a[i], a[j]] = [a[j], a[i]]; return { ...x, images: a }; });
  const body = () => ({ name: f.name, description: f.description, gender: f.gender, categoryId: f.categoryId, collectionIds: f.collectionIds, tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean),
    price: toPaise(f.price), salePrice: f.salePrice === '' ? null : toPaise(f.salePrice), materials: f.materials || undefined, care: lines(f.care), details: lines(f.details), status: f.status, featured: f.featured, newArrival: f.newArrival,
    seo: { title: f.seoTitle || undefined, description: f.seoDescription || undefined }, images: f.images.map((i) => ({ url: i.url, alt: i.alt, ...(i.color ? { color: i.color } : {}) })) });
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErrs({}); setTop('');
    try {
      let payload = body();
      if (!editing && newVariants?.colors.length && newVariants?.sizes.length) payload.variants = newVariants; // optional on create
      const r = editing ? await send('PATCH', `/products/${id}`, payload) : await send('POST', '/products', payload);
      if (editing) { prod.reload(); setBusy(false); } else nav(`/admin/products/${r.data.id ?? r.data._id}/edit`, { replace: true });
    } catch (x) { setErrs(fieldErrors(x)); setTop(x.details?.length ? 'Please fix the highlighted fields.' : x.message); setBusy(false); }
  };
  const fe = (k) => errs[k];
  return (
    <form onSubmit={save} noValidate>
      <PageHead title={editing ? f.name || 'Edit product' : 'New product'} sub={editing ? `Status: ${p.status}` : 'Create it as a draft, add images and variants, then publish.'}>
        <Link className="a-btn" to="/admin/products">Back</Link>
        {editing && <Confirm danger trigger={p.status === 'published' ? 'Archive' : 'Delete'} title={p.status === 'published' ? 'Archive this product?' : 'Delete this product?'} message={p.status === 'published' ? 'It will disappear from the storefront. Existing orders are unaffected.' : 'Drafts that were never ordered are deleted permanently, along with their variants and images.'} confirmLabel="Confirm" onConfirm={async () => { await send('DELETE', `/products/${id}`); nav('/admin/products'); }} />}
        <Btn kind="primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Btn></PageHead>
      <Note tone="bad">{top}</Note>
      <div className="a-grid a-g32">
        <div className="a-grid">
          <Card title="Details">
            <Field label="Name" value={f.name} onChange={set('name')} error={fe('name')} required />
            <Field as="textarea" label="Description" value={f.description} onChange={set('description')} error={fe('description')} required />
            <div className="a-row"><Field as="select" label="Department" value={f.gender} onChange={set('gender')}><option value="women">Women</option><option value="men">Men</option></Field>
              <Field as="select" label="Category" value={f.categoryId} onChange={set('categoryId')} error={fe('categoryId')}><option value="">Select…</option>{taxo.data.cats.filter((c) => c.genders.includes(f.gender)).map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</Field></div>
            <fieldset style={{ border: 0, padding: 0, margin: '0 0 14px' }}><legend style={{ fontWeight: 500, fontSize: 13, marginBottom: 4 }}>Collections</legend>
              {taxo.data.cols.map((c) => <label key={c._id} className="a-check"><input type="checkbox" checked={f.collectionIds.includes(String(c._id))} onChange={(e) => setF((x) => ({ ...x, collectionIds: e.target.checked ? [...x.collectionIds, String(c._id)] : x.collectionIds.filter((i) => i !== String(c._id)) }))} />{c.name}</label>)}</fieldset>
            <Field label="Tags" value={f.tags} onChange={set('tags')} hint="Comma separated — used by search" />
          </Card>
          <Card title="Pricing">
            <div className="a-row"><Field label="Price (₹)" type="number" min="1" step="0.01" value={f.price} onChange={set('price')} error={fe('price')} required />
              <Field label="Sale price (₹)" type="number" min="1" step="0.01" value={f.salePrice} onChange={set('salePrice')} error={fe('salePrice')} hint="Leave empty for no sale. Must be lower than price." /></div>
          </Card>
          <Card title="Images" actions={<label className="a-btn sm" style={{ cursor: 'pointer' }}>{uploading ? 'Uploading…' : 'Upload images'}<input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden disabled={uploading} onChange={(e) => { upload([...e.target.files]); e.target.value = ''; }} /></label>}>
            {fe('images') && <div className="a-err">{fe('images')}</div>}
            {f.images.length === 0 ? <div className="a-empty">No images yet. JPEG, PNG or WebP up to 5 MB. The first image is the primary one.</div> : (
              <div className="a-imgs">{f.images.map((im, i) => (
                <div key={im.url} className="a-img"><img src={im.url} alt="" />
                  <input className="a-input" style={{ marginTop: 6 }} aria-label={`Alt text for image ${i + 1}`} placeholder="Alt text" value={im.alt} onChange={(e) => setF((x) => ({ ...x, images: x.images.map((m, j) => (j === i ? { ...m, alt: e.target.value } : m)) }))} />
                  <input className="a-input" style={{ marginTop: 6 }} aria-label={`Colour for image ${i + 1}`} list="colors" placeholder="Colour (optional)" value={im.color} onChange={(e) => setF((x) => ({ ...x, images: x.images.map((m, j) => (j === i ? { ...m, color: e.target.value } : m)) }))} />
                  <div className="a-actions" style={{ marginTop: 6 }}><Btn size="sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move earlier">←</Btn><Btn size="sm" disabled={i === f.images.length - 1} onClick={() => move(i, 1)} aria-label="Move later">→</Btn><Btn size="sm" kind="danger" onClick={() => setF((x) => ({ ...x, images: x.images.filter((_, j) => j !== i) }))}>Remove</Btn></div></div>))}</div>)}
            <datalist id="colors">{colorsAvail.map((c) => <option key={c} value={c} />)}</datalist>
          </Card>
          <Card title="Materials, care & details">
            <Field label="Materials" value={f.materials} onChange={set('materials')} />
            <div className="a-row"><Field as="textarea" label="Care instructions (one per line)" value={f.care} onChange={set('care')} /><Field as="textarea" label="Details (one per line)" value={f.details} onChange={set('details')} /></div>
          </Card>
          <Card title="Variants & stock">
            {editing ? (<>
              <div className="a-tablewrap"><table className="a-table"><thead><tr><th>SKU</th><th>Colour</th><th>Size</th><th className="r">Stock</th><th className="r">Reserved</th><th>Active</th></tr></thead>
                <tbody>{p.variants.map((v) => <tr key={v.id}><td className="mono">{v.sku}</td><td><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: v.color.hex, marginRight: 6, border: '1px solid var(--a-line-strong)' }} />{v.color.name}</td><td>{v.size}</td><td className="r num">{v.stock}</td><td className="r num">{v.reserved}</td>
                  <td>{v.active ? <Btn size="sm" onClick={() => act(async () => { await send('PATCH', `/variants/${v.id}`, { active: false }); prod.reload(); }, 'Variant deactivated')}>Deactivate</Btn> : <Btn size="sm" onClick={() => act(async () => { await send('PATCH', `/variants/${v.id}`, { active: true }); prod.reload(); }, 'Variant activated')}>Activate</Btn>}</td></tr>)}</tbody></table></div>
              <p style={{ color: 'var(--a-muted)' }}>Adjust stock levels on the <Link to="/admin/inventory">Inventory</Link> page.</p>
              <Btn onClick={() => setAddOpen(true)}>Add colours / sizes</Btn>
              {addOpen && <Modal title="Add variants" onClose={() => setAddOpen(false)}><VariantAdder busy={addBusy} onAdd={async (spec) => { setAddBusy(true); const ok = await act(async () => { await send('POST', `/products/${id}/variants`, spec); prod.reload(); }, 'Variants added'); setAddBusy(false); if (ok) setAddOpen(false); }} /></Modal>}
            </>) : (<VariantAdder onChange={setNewVariants} />)}
          </Card>
        </div>
        <div className="a-grid" style={{ alignContent: 'start' }}>
          <Card title="Publishing">
            <Field as="select" label="Status" value={f.status} onChange={set('status')}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></Field>
            <label className="a-check"><input type="checkbox" checked={f.featured} onChange={set('featured')} />Featured</label>
            <label className="a-check"><input type="checkbox" checked={f.newArrival} onChange={set('newArrival')} />New arrival (for 60 days)</label>
            <p style={{ color: 'var(--a-muted)', fontSize: 12 }}>Publishing requires at least one image and one variant.</p>
          </Card>
          <Card title="SEO"><Field label="Page title" value={f.seoTitle} onChange={set('seoTitle')} maxLength={70} /><Field as="textarea" label="Meta description" value={f.seoDescription} onChange={set('seoDescription')} maxLength={160} /></Card>
        </div>
      </div>
    </form>
  );
}
