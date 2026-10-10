import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync.js';
import { get, send, fieldErrors } from '../api.js';
import { Badge, Btn, Card, Confirm, DataTable, ErrorBox, Field, ListCard, Loading, Modal, Note, PageHead, SearchBox, Tabs, useAction, useList } from '../ui.jsx';

function TaxoForm({ kind, item, onClose, onSaved }) {
  const isCol = kind === 'collections'; const [f, setF] = useState({ name: item?.name ?? '', description: item?.description ?? '', genders: item?.genders ?? ['men', 'women'], sortOrder: item?.sortOrder ?? 0, active: item?.active ?? true, season: item?.season ?? '', featured: item?.featured ?? false });
  const [err, setErr] = useState(null); const [busy, setBusy] = useState(false); const fe = fieldErrors(err);
  const save = async () => {
    setBusy(true); setErr(null);
    const body = { name: f.name, description: f.description || undefined, genders: f.genders, sortOrder: Number(f.sortOrder) || 0, active: f.active, ...(isCol ? { season: f.season || undefined, featured: f.featured } : {}) };
    try { await send(item ? 'PATCH' : 'POST', `/${kind}${item ? `/${item._id}` : ''}`, body); onSaved(); } catch (e) { setErr(e); setBusy(false); }
  };
  const label = isCol ? 'collection' : 'category';
  return (<Modal title={item ? `Edit ${label}` : `New ${label}`} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</Btn></>}>
    <Note tone="bad">{err && !err.details?.length ? err.message : ''}</Note>
    <Field label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={fe.name} />
    <Field as="textarea" label="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} error={fe.description} />
    {isCol && <Field label="Season" value={f.season} onChange={(e) => setF({ ...f, season: e.target.value })} placeholder="e.g. AW26" />}
    <fieldset style={{ border: 0, padding: 0 }}><legend style={{ fontWeight: 500, fontSize: 13 }}>Shown for</legend>
      {['men', 'women'].map((g) => <label key={g} className="a-check"><input type="checkbox" checked={f.genders.includes(g)} onChange={(e) => setF({ ...f, genders: e.target.checked ? [...f.genders, g] : f.genders.filter((x) => x !== g) })} />{g === 'men' ? 'Men' : 'Women'}</label>)}</fieldset>
    <Field label="Sort order" type="number" min="0" value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: e.target.value })} />
    <label className="a-check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Active (visible on the storefront)</label>
    {isCol && <label className="a-check"><input type="checkbox" checked={f.featured} onChange={(e) => setF({ ...f, featured: e.target.checked })} />Featured</label>}
  </Modal>);
}

export function Taxonomy({ kind }) {
  const { data, error, loading, reload } = useAsync(() => get(`/${kind}`).then((r) => r.data), [kind]); const [edit, setEdit] = useState(null); const act = useAction(); const nav = useNavigate();
  if (loading) return <Loading />; if (error) return <ErrorBox error={error} onRetry={reload} />;
  const label = kind === 'collections' ? 'Collection' : 'Category';
  return (<div><PageHead title={`${label === 'Category' ? 'Categories' : 'Collections'}`} sub={kind === 'collections' ? 'Seasonal and editorial groupings.' : 'How products are organised in the shop.'}>
    <Btn kind="primary" onClick={() => setEdit({})}>New {label.toLowerCase()}</Btn></PageHead>
    <Tabs tabs={[['categories', 'Categories'], ['collections', 'Collections']]} value={kind} onChange={(k) => nav(`/admin/${k}`)} />
    <Card flush><DataTable columns={[{ header: 'Name', render: (r) => <b>{r.name}</b> }, { header: 'Slug', render: (r) => <span className="mono">{r.slug}</span> }, { header: 'For', render: (r) => r.genders.join(' + ') }, ...(kind === 'collections' ? [{ header: 'Season', key: 'season' }] : []), { header: 'Order', num: true, key: 'sortOrder' }, { header: 'Status', render: (r) => <Badge value={r.active ? 'active' : 'draft'} tone={r.active ? 'ok' : 'warn'} /> },
      { header: '', right: true, render: (r) => <span className="a-actions" style={{ justifyContent: 'flex-end' }}><Btn size="sm" onClick={() => setEdit(r)}>Edit</Btn>
        <Confirm danger trigger="Delete" title={`Delete “${r.name}”?`} message="This can’t be undone. If products still use it, deletion is blocked — deactivate it instead." confirmLabel="Delete" onConfirm={async () => { await send('DELETE', `/${kind}/${r._id}`); reload(); }} /></span> }]} rows={data.map((d) => ({ ...d, id: d._id }))} empty={`No ${kind} yet.`} /></Card>
    {edit && <TaxoForm kind={kind} item={edit._id ? edit : null} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); act(async () => {}, `${label} saved`); }} />}
  </div>);
}

function Adjust({ row, onClose, onDone }) {
  const [mode, setMode] = useState('delta'); const [val, setVal] = useState(''); const [thr, setThr] = useState(row.lowStockThreshold); const [reason, setReason] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setErr(''); const body = { lowStockThreshold: Number(thr), reason: reason || undefined };
    if (val !== '') body[mode === 'set' ? 'stock' : 'delta'] = parseInt(val, 10);
    try { await send('PATCH', `/inventory/${row.variantId}`, body); onDone(); } catch (e) { setErr(e.message); setBusy(false); }
  };
  const preview = val === '' ? row.stock : mode === 'set' ? parseInt(val, 10) : row.stock + parseInt(val, 10);
  return (<Modal title={`Adjust stock — ${row.sku}`} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy || Number.isNaN(preview)} onClick={save}>{busy ? 'Saving…' : 'Save'}</Btn></>}>
    <p style={{ marginTop: 0 }}>{row.product} · {row.color} · {row.size}<br /><span style={{ color: 'var(--a-muted)' }}>Stock <b className="num">{row.stock}</b> · Reserved <b className="num">{row.reserved}</b> · Available <b className="num">{row.available}</b></span></p>
    <Note tone="bad">{err}</Note>
    <div className="a-actions" style={{ marginBottom: 12 }}><label className="a-check"><input type="radio" checked={mode === 'delta'} onChange={() => setMode('delta')} />Add / remove</label><label className="a-check"><input type="radio" checked={mode === 'set'} onChange={() => setMode('set')} />Set exact count</label></div>
    <Field label={mode === 'set' ? 'New stock count' : 'Change (use a negative number to remove)'} type="number" value={val} onChange={(e) => setVal(e.target.value)} hint={`New stock will be ${Number.isNaN(preview) ? '—' : preview}. It can’t go below what’s reserved (${row.reserved}).`} />
    <Field label="Low-stock threshold" type="number" min="0" value={thr} onChange={(e) => setThr(e.target.value)} />
    <Field label="Reason (recorded in the audit log)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Delivery received, stock-take correction" maxLength={140} />
  </Modal>);
}

export function Inventory() {
  const list = useList('/inventory', { limit: 25 }); const [row, setRow] = useState(null);
  const cols = [{ header: 'SKU', render: (r) => <span className="mono">{r.sku}</span> }, { header: 'Product', render: (r) => <Link to={`/admin/products/${r.productId}/edit`}>{r.product}</Link> }, { header: 'Variant', render: (r) => `${r.color} · ${r.size}` },
    { header: 'Stock', right: true, num: true, key: 'stock' }, { header: 'Reserved', right: true, num: true, key: 'reserved' },
    { header: 'Available', right: true, num: true, render: (r) => <b style={{ color: r.available <= r.lowStockThreshold ? 'var(--a-danger)' : undefined }}>{r.available}</b> }, { header: 'Alert at', right: true, num: true, key: 'lowStockThreshold' },
    { header: '', right: true, render: (r) => <Btn size="sm" onClick={() => setRow(r)}>Adjust</Btn> }];
  return (<div><PageHead title="Inventory" sub="Available = stock − reserved. Reserved stock is held for customers who are paying." />
    <ListCard list={list} columns={cols} empty="No inventory records match." filters={<><SearchBox onSearch={(q) => list.set({ q })} placeholder="Search SKU" />
      <label className="a-check" style={{ margin: 0 }}><input type="checkbox" onChange={(e) => list.set({ low: e.target.checked ? 'true' : undefined })} />Low stock only</label></>} />
    {row && <Adjust row={row} onClose={() => setRow(null)} onDone={() => { setRow(null); list.reload(); }} />}</div>);
}
