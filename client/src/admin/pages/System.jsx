import { useState } from 'react';
import { useAsync } from '../../hooks/useAsync.js';
import { get } from '../api.js';
import { BarList, Btn, Card, DataTable, ErrorBox, Field, LineChart, ListCard, Loading, Note, PageHead, SearchBox, day, dt, label, money, useList } from '../ui.jsx';

const ymd = (d) => d.toISOString().slice(0, 10);
export function Analytics() {
  const [from, setFrom] = useState(ymd(new Date(Date.now() - 29 * 86400000))); const [to, setTo] = useState(ymd(new Date())); const [unit, setUnit] = useState('day');
  const { data, error, loading, reload } = useAsync((s) => get('/analytics', { from: new Date(`${from}T00:00:00`).toISOString(), to: new Date(`${to}T23:59:59`).toISOString(), unit }, s).then((r) => r.data), [from, to, unit]);
  const s = data?.summary;
  return (<div><PageHead title="Analytics" sub="Computed from orders, customers and payments in the database.">
    <input className="a-input" type="date" aria-label="From" value={from} max={to} onChange={(e) => setFrom(e.target.value)} style={{ width: 'auto' }} /><input className="a-input" type="date" aria-label="To" value={to} min={from} max={ymd(new Date())} onChange={(e) => setTo(e.target.value)} style={{ width: 'auto' }} />
    <select className="a-select" aria-label="Group by" value={unit} onChange={(e) => setUnit(e.target.value)} style={{ width: 'auto' }}><option value="day">By day</option><option value="week">By week</option><option value="month">By month</option></select></PageHead>
    {loading && !data ? <Loading /> : error ? <ErrorBox error={error} onRetry={reload} /> : (<>
      <div className="a-grid a-g4">{[['Revenue', money(s.revenue)], ['Orders', s.orders], ['Avg. order value', money(s.averageOrderValue)], ['Refunded', `${money(s.refunded)} (${s.refundCount})`]].map(([l, v]) => <div key={l} className="a-card a-kpi"><div className="l">{l}</div><div className="v num">{v}</div></div>)}</div>
      <div className="a-grid a-g2" style={{ marginTop: 16 }}><Card title="Revenue"><LineChart points={data.sales} valueKey="revenue" labelKey="period" /></Card><Card title="Orders"><LineChart points={data.sales} valueKey="orders" labelKey="period" format={(v) => String(Math.round(v))} /></Card></div>
      <div className="a-grid a-g2" style={{ marginTop: 16 }}><Card title="Sales by category"><BarList items={data.categories} nameKey="category" valueKey="revenue" format={money} /></Card><Card title="Top products (units)"><BarList items={data.topProducts} nameKey="name" valueKey="units" format={(v) => `${v} sold`} /></Card></div>
      <div className="a-grid a-g2" style={{ marginTop: 16 }}><Card title="New customers"><LineChart points={data.customerAcquisition} valueKey="customers" labelKey="period" format={(v) => String(Math.round(v))} /></Card>
        <Card title="Payment methods"><BarList items={data.paymentMethods.map((p) => ({ ...p, name: label(p.method) }))} nameKey="name" valueKey="amount" format={money} /></Card></div>
      <div className="a-grid a-g2" style={{ marginTop: 16 }}><Card flush title="Coupon usage"><DataTable columns={[{ header: 'Code', render: (c) => <b className="mono">{c.code}</b> }, { header: 'Uses', right: true, num: true, key: 'uses' }, { header: 'Discount given', right: true, num: true, render: (c) => money(c.discount) }]} rows={data.coupons.map((c) => ({ ...c, id: c.code }))} empty="No coupons used in this period." /></Card>
        <Card title="Traffic sources"><Note tone="warn">{data.traffic.message}</Note><p style={{ color: 'var(--a-muted)', margin: 0 }}>Connect a web analytics service to see visitors, sources and conversion here.</p></Card></div></>)}</div>);
}

export function AuditLogs() {
  const list = useList('/audit-logs', { limit: 30 });
  return (<div><PageHead title="Audit log" sub="Every sensitive staff action, with who, what and when. Entries can’t be edited." />
    <ListCard list={list} empty="No entries match." columns={[{ header: 'When', render: (r) => dt(r.at) }, { header: 'Staff', key: 'actor' }, { header: 'Action', render: (r) => <span className="mono">{r.action}</span> }, { header: 'Resource', render: (r) => <span>{r.resource}{r.resourceId && <div className="mono" style={{ color: 'var(--a-muted)', fontSize: 11 }}>{String(r.resourceId).slice(-12)}</div>}</span> },
      { header: 'Details', render: (r) => (r.metadata ? <details><summary style={{ cursor: 'pointer', color: 'var(--a-accent)' }}>View</summary><pre className="mono" style={{ margin: 4, fontSize: 11, whiteSpace: 'pre-wrap', maxWidth: 360 }}>{JSON.stringify(r.metadata, null, 1)}</pre></details> : '—') }, { header: 'IP', render: (r) => <span className="mono" style={{ fontSize: 12 }}>{r.ip}</span> }]}
      filters={<><SearchBox onSearch={(q) => list.set({ q })} placeholder="Filter by staff email" /><SearchBox onSearch={(a) => list.set({ action: a })} placeholder="Action prefix, e.g. order." /></>} /></div>);
}
