import { User } from '../../models/User.js';
import { Order } from '../../models/Order.js';
import { Address } from '../../models/Address.js';
import { ApiError } from '../../utils/ApiError.js';
import { escapeRegex } from '../../utils/slug.js';
import { revokeAllSessions } from '../sessionService.js';

const PAID = ['confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered'];
const stats = async (ids) => {
  const rows = await Order.aggregate([{ $match: { user: { $in: ids }, status: { $in: PAID } } }, { $group: { _id: '$user', orders: { $sum: 1 }, spend: { $sum: '$totals.total' }, lastOrder: { $max: '$createdAt' } } }]);
  return new Map(rows.map((r) => [String(r._id), r]));
};

export async function listCustomers({ q, status, page, limit }) {
  const f = {}; if (status) f.status = status; else f.status = { $ne: 'deleted' };
  if (q) f.$or = [{ email: { $regex: escapeRegex(q.toLowerCase()) } }, { name: { $regex: escapeRegex(q), $options: 'i' } }];
  const [rows, total] = await Promise.all([User.find(f).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), User.countDocuments(f)]);
  const sm = await stats(rows.map((r) => r._id));
  return { items: rows.map((u) => ({ id: u._id, name: u.name, email: u.email, status: u.status, emailVerified: u.emailVerified, registeredAt: u.createdAt, orders: sm.get(String(u._id))?.orders ?? 0, totalSpend: sm.get(String(u._id))?.spend ?? 0, lastOrder: sm.get(String(u._id))?.lastOrder ?? null })), pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } };
}
export async function getCustomer(id) {
  const u = await User.findById(id).lean();
  if (!u) throw ApiError.notFound('CUSTOMER_NOT_FOUND', 'Customer not found');
  const [sm, orders, addrs] = await Promise.all([stats([u._id]), Order.find({ user: id, status: { $ne: 'pending_payment' } }).sort({ createdAt: -1 }).limit(20).select('orderNumber status totals createdAt').lean(), Address.find({ user: id }).select('city state').lean()]);
  const s = sm.get(String(id));
  return { id: u._id, name: u.name, email: u.email, phone: u.phone, status: u.status, emailVerified: u.emailVerified, registeredAt: u.createdAt, lastLoginAt: u.lastLoginAt, orders: s?.orders ?? 0, totalSpend: s?.spend ?? 0, lastOrder: s?.lastOrder ?? null, locations: addrs.map((a) => `${a.city}, ${a.state}`), recentOrders: orders.map((o) => ({ id: o._id, orderNumber: o.orderNumber, status: o.status, total: o.totals.total, createdAt: o.createdAt })) };
}
export async function setStatus(id, status) {
  const u = await User.findOneAndUpdate({ _id: id, status: { $ne: 'deleted' } }, { $set: { status } }, { new: true });
  if (!u) throw ApiError.notFound('CUSTOMER_NOT_FOUND', 'Customer not found');
  if (status === 'suspended') await revokeAllSessions(u._id, 'customer');
  return u;
}
