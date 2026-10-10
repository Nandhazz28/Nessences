import { Order } from '../../models/Order.js';
import { User } from '../../models/User.js';
import { Product } from '../../models/Product.js';
import { Inventory } from '../../models/Inventory.js';
import { Refund } from '../../models/Refund.js';
import { ReturnRequest } from '../../models/ReturnRequest.js';

export const PAID = ['confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered'];
const TZ = 'Asia/Kolkata';
const pct = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null); // null = no baseline; never invent a number

export async function dashboard(days = 30) {
  const now = new Date(); const since = new Date(now - days * 86400000); const prevSince = new Date(since - days * 86400000);
  const sum = (from, to) => Order.aggregate([{ $match: { status: { $in: PAID }, paidAt: { $gte: from, $lt: to } } }, { $group: { _id: null, revenue: { $sum: '$totals.total' }, orders: { $sum: 1 } } }]);
  const trendFrom = new Date(now - 14 * 86400000);
  const [cur, prev, newCust, prevCust, totalCust, products, trend, low, recent, best, pending, refundsPending, returnsOpen] = await Promise.all([
    sum(since, now), sum(prevSince, since),
    User.countDocuments({ createdAt: { $gte: since }, status: { $ne: 'deleted' } }), User.countDocuments({ createdAt: { $gte: prevSince, $lt: since }, status: { $ne: 'deleted' } }),
    User.countDocuments({ status: { $ne: 'deleted' } }), Product.countDocuments({ status: 'published' }),
    Order.aggregate([{ $match: { status: { $in: PAID }, paidAt: { $gte: trendFrom } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$paidAt', timezone: TZ } }, revenue: { $sum: '$totals.total' }, orders: { $sum: 1 } } }]),
    Inventory.aggregate([{ $match: { $expr: { $lte: [{ $subtract: ['$stock', '$reserved'] }, '$lowStockThreshold'] } } }, { $lookup: { from: 'products', localField: 'product', foreignField: '_id', as: 'p' } }, { $unwind: '$p' }, { $match: { 'p.status': 'published' } }, { $sort: { stock: 1 } }, { $limit: 8 }, { $project: { sku: 1, product: '$p.name', available: { $subtract: ['$stock', '$reserved'] } } }]),
    Order.find({ status: { $ne: 'pending_payment' } }).sort({ createdAt: -1 }).limit(6).populate('user', 'name').lean(),
    Order.aggregate([{ $match: { status: { $in: PAID }, paidAt: { $gte: since } } }, { $unwind: '$items' }, { $group: { _id: '$items.product', name: { $first: '$items.name' }, units: { $sum: '$items.qty' }, revenue: { $sum: '$items.lineTotal' } } }, { $sort: { units: -1 } }, { $limit: 5 }]),
    Order.countDocuments({ status: { $in: ['confirmed', 'processing'] } }), Refund.countDocuments({ status: { $in: ['pending', 'failed'] } }), ReturnRequest.countDocuments({ status: 'requested' }),
  ]);
  const c = cur[0] ?? { revenue: 0, orders: 0 }; const p = prev[0] ?? { revenue: 0, orders: 0 };
  const byDay = new Map(trend.map((t) => [t._id, t]));
  const series = Array.from({ length: 14 }, (_, i) => { const d = new Date(now - (13 - i) * 86400000); const key = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d); return { date: key, revenue: byDay.get(key)?.revenue ?? 0, orders: byDay.get(key)?.orders ?? 0 }; });
  const aov = c.orders ? Math.round(c.revenue / c.orders) : 0; const paov = p.orders ? Math.round(p.revenue / p.orders) : 0;
  return {
    periodDays: days,
    kpis: { revenue: { value: c.revenue, change: pct(c.revenue, p.revenue) }, orders: { value: c.orders, change: pct(c.orders, p.orders) }, newCustomers: { value: newCust, change: pct(newCust, prevCust) }, averageOrderValue: { value: aov, change: pct(aov, paov) } },
    totals: { customers: totalCust, publishedProducts: products, pendingOrders: pending, refundsAwaiting: refundsPending, returnsAwaitingReview: returnsOpen },
    trend: series, lowStock: low, bestSellers: best.map((b) => ({ productId: b._id, name: b.name, units: b.units, revenue: b.revenue })),
    recentOrders: recent.map((o) => ({ id: o._id, orderNumber: o.orderNumber, customer: o.user?.name, status: o.status, total: o.totals.total, createdAt: o.createdAt })),
  };
}
