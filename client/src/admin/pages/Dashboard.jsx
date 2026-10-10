import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAsync } from '../../hooks/useAsync.js';
import { get } from '../api.js';
import { Badge, BarList, Card, DataTable, ErrorBox, LineChart, Loading, PageHead, day, money } from '../ui.jsx';

const Delta = ({ v }) => (v == null ? <span className="d">No prior period to compare</span> : <span className={`d ${v >= 0 ? 'up' : 'down'}`}>{v >= 0 ? '▲' : '▼'} {Math.abs(v)}% vs previous period</span>);
const Kpi = ({ l, v, d }) => <div className="a-card a-kpi"><div className="l">{l}</div><div className="v num">{v}</div><Delta v={d} /></div>;

export function Dashboard() {
  const [days, setDays] = useState(30); const nav = useNavigate();
  const { data, error, loading, reload } = useAsync((s) => get('/dashboard', { days }, s).then((r) => r.data), [days]);
  if (loading && !data) return <Loading />; if (error) return <ErrorBox error={error} onRetry={reload} />;
  const k = data.kpis, t = data.totals;
  return (
    <div>
      <PageHead title="Dashboard" sub={`Last ${days} days · ${t.customers} customers · ${t.publishedProducts} published products`}>
        <select className="a-select" aria-label="Period" value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: 'auto' }}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select>
      </PageHead>
      {(t.returnsAwaitingReview > 0 || t.refundsAwaiting > 0 || t.pendingOrders > 0) && (
        <div className="a-note warn">Needs attention: {t.pendingOrders > 0 && <Link to="/admin/orders">{t.pendingOrders} orders to fulfil</Link>}{t.returnsAwaitingReview > 0 && <> · <Link to="/admin/returns">{t.returnsAwaitingReview} returns to review</Link></>}{t.refundsAwaiting > 0 && <> · <Link to="/admin/refunds">{t.refundsAwaiting} refunds to process</Link></>}</div>)}
      <div className="a-grid a-g4">
        <Kpi l="Revenue" v={money(k.revenue.value)} d={k.revenue.change} /><Kpi l="Orders" v={k.orders.value} d={k.orders.change} />
        <Kpi l="New customers" v={k.newCustomers.value} d={k.newCustomers.change} /><Kpi l="Avg. order value" v={money(k.averageOrderValue.value)} d={k.averageOrderValue.change} />
      </div>
      <div className="a-grid a-g32" style={{ marginTop: 16 }}>
        <Card title="Sales trend — last 14 days"><LineChart points={data.trend} /></Card>
        <Card title="Low stock" actions={<Link to="/admin/inventory">View inventory</Link>}>
          {data.lowStock.length === 0 ? <div className="a-empty">Nothing is running low.</div> : <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{data.lowStock.map((i) => <li key={i.sku} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--a-line)' }}><span>{i.product}<br /><span className="mono" style={{ color: 'var(--a-muted)', fontSize: 12 }}>{i.sku}</span></span><b className="num" style={{ color: 'var(--a-danger)' }}>{i.available} left</b></li>)}</ul>}
        </Card>
      </div>
      <div className="a-grid a-g32" style={{ marginTop: 16 }}>
        <Card flush title="Recent orders" actions={<Link to="/admin/orders">View all</Link>}>
          <DataTable columns={[{ header: 'Order', render: (r) => <span className="mono">{r.orderNumber}</span> }, { header: 'Customer', key: 'customer' }, { header: 'Placed', render: (r) => day(r.createdAt) }, { header: 'Status', render: (r) => <Badge value={r.status} /> }, { header: 'Total', right: true, num: true, render: (r) => money(r.total) }]} rows={data.recentOrders} onRow={(r) => nav(`/admin/orders/${r.id}`)} empty="No orders yet." />
        </Card>
        <Card title="Best sellers"><BarList items={data.bestSellers} nameKey="name" valueKey="units" format={(v) => `${v} sold`} /></Card>
      </div>
    </div>
  );
}
