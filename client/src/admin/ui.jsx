import { createContext, Fragment, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { useAsync } from '../hooks/useAsync.js';
import { get } from './api.js';
import { formatMoney } from '../utils/format.js';

export const money = formatMoney;
export const dt = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
export const day = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const label = (s) => String(s ?? '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

const TONE = { confirmed: 'info', processing: 'info', packed: 'info', shipped: 'info', out_for_delivery: 'info', delivered: 'ok', cancelled: 'bad', refunded: 'warn', pending_payment: 'warn',
  published: 'ok', draft: 'warn', archived: '', active: 'ok', suspended: 'bad', requested: 'warn', approved: 'ok', rejected: 'bad', received: 'info', withdrawn: '', pending: 'warn', processed: 'ok', failed: 'bad',
  new: 'warn', in_progress: 'info', resolved: 'ok', subscribed: 'ok', unsubscribed: '', flagged: 'bad', removed: 'bad', open: 'warn', dismissed: '', actioned: 'ok', captured: 'ok', created: 'warn' };
export const Badge = ({ value, tone }) => <span className={`a-badge ${tone ?? TONE[value] ?? ''}`}>{label(value)}</span>;

export const Btn = ({ kind = '', size = '', ...p }) => <button type="button" {...p} className={`a-btn ${kind} ${size} ${p.className ?? ''}`} />;
export const Note = ({ tone = '', children }) => children ? <div role={tone === 'bad' ? 'alert' : 'status'} className={`a-note ${tone}`}>{children}</div> : null;

export function Field({ label: text, hint, error, as = 'input', children, style, ...props }) {
  const id = useId(); const Tag = as === 'select' ? 'select' : as === 'textarea' ? 'textarea' : 'input';
  const described = [hint && `${id}h`, error && `${id}e`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="a-field">
      {text ? <label htmlFor={id}>{text}</label> : null}
      <Tag id={id} className={`a-${as === 'select' ? 'select' : as === 'textarea' ? 'textarea' : 'input'}`} style={style} aria-invalid={Boolean(error)} aria-describedby={described} aria-label={text ? undefined : props['aria-label'] ?? props.placeholder ?? 'Value'} {...props}>{children}</Tag>
      {hint && <small id={`${id}h`}>{hint}</small>}{error && <div id={`${id}e`} role="alert" className="a-err">{error}</div>}
    </div>
  );
}

export const Card = ({ title, actions, children, flush }) => (
  <section className="a-card">{(title || actions) && <header><h2>{title}</h2><div className="a-actions">{actions}</div></header>}{flush ? children : <div className="a-body">{children}</div>}</section>
);
export const PageHead = ({ title, sub, children }) => <div className="a-head"><div><h1>{title}</h1>{sub && <p>{sub}</p>}</div><div className="a-actions">{children}</div></div>;
export const Loading = ({ text = 'Loading…' }) => <div role="status" className="a-empty">{text}</div>;
export const ErrorBox = ({ error, onRetry }) => <div role="alert" className="a-empty"><p style={{ color: 'var(--a-danger)' }}>{error?.message ?? 'Something went wrong.'}</p>{onRetry && <Btn onClick={onRetry}>Retry</Btn>}</div>;

export function DataTable({ columns, rows, onRow, empty = 'Nothing to show yet.' }) {
  if (!rows.length) return <div className="a-empty">{empty}</div>;
  return (
    <div className="a-tablewrap"><table className="a-table"><thead><tr>{columns.map((c) => <th key={c.header} className={c.right ? 'r' : ''}>{c.header}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => (
        <tr key={r.id ?? i} className={onRow ? 'click' : ''} onClick={onRow ? () => onRow(r) : undefined} onKeyDown={onRow ? (e) => e.key === 'Enter' && onRow(r) : undefined} tabIndex={onRow ? 0 : undefined}>
          {columns.map((c) => <td key={c.header} className={`${c.right ? 'r' : ''} ${c.num ? 'num' : ''}`}>{c.render ? c.render(r) : r[c.key]}</td>)}</tr>))}</tbody></table></div>
  );
}
export function Pager({ pagination, onPage }) {
  if (!pagination) return null;
  return (<div className="a-pager"><span>{pagination.total} result{pagination.total === 1 ? '' : 's'}</span>
    <span className="a-actions"><Btn size="sm" disabled={pagination.page <= 1} onClick={() => onPage(pagination.page - 1)}>Previous</Btn><span>Page {pagination.page} of {pagination.pages}</span><Btn size="sm" disabled={pagination.page >= pagination.pages} onClick={() => onPage(pagination.page + 1)}>Next</Btn></span></div>);
}

// Server-paginated list with filters: returns {rows, pagination, meta, loading, error, params, set, reload}
export function useList(path, initial = {}) {
  const [params, setParams] = useState({ page: 1, ...initial });
  const r = useAsync((s) => get(path, params, s), [path, JSON.stringify(params)]);
  const set = useCallback((patch) => setParams((p) => ({ ...p, page: 1, ...patch })), []);
  const page = useCallback((n) => setParams((p) => ({ ...p, page: n })), []);
  return { rows: r.data?.data ?? [], pagination: r.data?.meta?.pagination, meta: r.data?.meta, loading: r.loading, error: r.error, params, set, page, reload: r.reload };
}
export function ListCard({ list, columns, onRow, filters, title, empty, actions }) {
  return (
    <Card flush title={title} actions={actions}>
      {filters && <div className="a-filters">{filters}</div>}
      {list.loading && !list.rows.length ? <Loading /> : list.error ? <ErrorBox error={list.error} onRetry={list.reload} /> : <DataTable columns={columns} rows={list.rows} onRow={onRow} empty={empty} />}
      <Pager pagination={list.pagination} onPage={list.page} />
    </Card>
  );
}
export function useDebounced(value, ms = 350) { const [v, setV] = useState(value); useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]); return v; }
export function SearchBox({ onSearch, placeholder = 'Search…' }) {
  const [v, setV] = useState(''); const d = useDebounced(v); const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } onSearch(d || undefined); }, [d]); // eslint-disable-line
  return <input className="a-input" type="search" aria-label={placeholder} placeholder={placeholder} value={v} onChange={(e) => setV(e.target.value)} />;
}

export function Modal({ title, onClose, children, footer }) {
  const ref = useRef(null);
  useEffect(() => { const prev = document.activeElement; ref.current?.focus(); const esc = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', esc); return () => { window.removeEventListener('keydown', esc); prev?.focus?.(); }; }, [onClose]);
  return (<div className="a-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="a-modal"><header><h2>{title}</h2><Btn kind="link" onClick={onClose} aria-label="Close">✕</Btn></header><div className="a-body">{children}</div>{footer && <footer>{footer}</footer>}</div></div>);
}
// Destructive action: opens a confirmation dialog, runs the real request only after "Confirm".
export function Confirm({ trigger, title, message, confirmLabel = 'Confirm', danger, onConfirm, children }) {
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const run = async () => { setBusy(true); setErr(''); try { await onConfirm(); setOpen(false); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  return (<>
    <Btn kind={danger ? 'danger' : ''} size="sm" onClick={() => setOpen(true)}>{trigger}</Btn>
    {open && <Modal title={title} onClose={() => setOpen(false)} footer={<><Btn onClick={() => setOpen(false)}>Cancel</Btn><Btn kind={danger ? 'danger' : 'primary'} disabled={busy} onClick={run}>{busy ? 'Working…' : confirmLabel}</Btn></>}>
      <p style={{ marginTop: 0 }}>{message}</p>{children}<Note tone="bad">{err}</Note></Modal>}
  </>);
}

const ToastCtx = createContext(null); export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, tone = '') => { const id = Math.random(); setItems((x) => [...x, { id, message, tone }]); setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4500); }, []);
  return (<ToastCtx.Provider value={push}>{children}<div className="a-toasts" role="status" aria-live="polite">{items.map((t) => <div key={t.id} className={`a-toast ${t.tone}`}>{t.message}</div>)}</div></ToastCtx.Provider>);
}
// Wrap an API action: toast on success/failure, return result (or undefined on failure).
export function useAction() { const toast = useToast(); return useCallback(async (fn, ok) => { try { const r = await fn(); if (ok) toast(ok); return r ?? true; } catch (e) { toast(e.message, 'bad'); return undefined; } }, [toast]); }

export function Tabs({ tabs, value, onChange }) {
  return <div role="tablist" className="a-tabs">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={value === k} className="a-tab" onClick={() => onChange(k)}>{l}</button>)}</div>;
}

// Minimal accessible SVG line chart (no chart library, no fake data).
export function LineChart({ points, valueKey = 'revenue', labelKey = 'date', format = money, height = 180 }) {
  if (!points.length) return <div className="a-empty">No data for this period.</div>;
  const W = 640, H = height, P = 28; const vals = points.map((p) => p[valueKey]); const max = Math.max(...vals, 1);
  const x = (i) => P + (i * (W - P * 2)) / Math.max(points.length - 1, 1); const y = (v) => H - P - (v / max) * (H - P * 2);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[valueKey]).toFixed(1)}`).join(' ');
  const total = vals.reduce((a, b) => a + b, 0);
  return (<figure style={{ margin: 0 }}><svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Chart, total ${format(total)}`}>
    {[0, 0.5, 1].map((t) => <g key={t}><line x1={P} x2={W - P} y1={y(max * t)} y2={y(max * t)} stroke="#E3E7ED" /><text x={P - 6} y={y(max * t) + 4} fontSize="10" textAnchor="end" fill="#5B6578">{format(max * t).replace('₹', '')}</text></g>)}
    <path d={d} fill="none" stroke="#1E3A8A" strokeWidth="2" />
    {points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p[valueKey])} r="3" fill="#1E3A8A"><title>{`${p[labelKey]}: ${format(p[valueKey])}`}</title></circle>)}
    {points.map((p, i) => (i % Math.ceil(points.length / 7) === 0) && <text key={i} x={x(i)} y={H - 8} fontSize="10" textAnchor="middle" fill="#5B6578">{String(p[labelKey]).slice(5)}</text>)}
  </svg></figure>);
}
export function BarList({ items, nameKey, valueKey, format = (v) => v }) {
  const max = Math.max(...items.map((i) => i[valueKey]), 1);
  if (!items.length) return <div className="a-empty">No data for this period.</div>;
  return <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>{items.map((i) => (
    <li key={i[nameKey]}><div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{i[nameKey]}</span><span className="num">{format(i[valueKey])}</span></div><div className="a-bar"><i style={{ width: `${(i[valueKey] / max) * 100}%` }} /></div></li>))}</ul>;
}
export const Dl = ({ items }) => <dl className="a-dl">{items.filter(Boolean).map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v ?? '—'}</dd></Fragment>)}</dl>;
