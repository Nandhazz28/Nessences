import { Order } from '../../models/Order.js';
import { User } from '../../models/User.js';
import { Payment } from '../../models/Payment.js';
import { Refund } from '../../models/Refund.js';
import { ReturnRequest } from '../../models/ReturnRequest.js';
import { ApiError } from '../../utils/ApiError.js';
import { escapeRegex } from '../../utils/slug.js';
import { afterCancellation } from '../orderService.js';
import { notify } from '../notificationService.js';
import { sendEmail } from '../emailService.js';
import { env } from '../../config/env.js';

// Allowed staff transitions. Anything else is rejected, so statuses can't skip or move backwards.
export const TRANSITIONS = {
  confirmed: ['processing', 'cancelled'], processing: ['packed', 'cancelled'], packed: ['shipped', 'cancelled'],
  shipped: ['out_for_delivery', 'delivered'], out_for_delivery: ['delivered'],
};
export const canTransition = (from, to) => (TRANSITIONS[from] ?? []).includes(to);
const LABEL = { processing: 'is being prepared', packed: 'has been packed', shipped: 'has shipped', out_for_delivery: 'is out for delivery', delivered: 'has been delivered', cancelled: 'was cancelled by our team' };

const brief = (o, u) => ({ id: o._id, orderNumber: o.orderNumber, status: o.status, paymentStatus: o.paymentStatus, attention: o.attention, total: o.totals.total, itemCount: o.items.reduce((s, i) => s + i.qty, 0), customer: u ? { id: u._id, name: u.name, email: u.email } : undefined, createdAt: o.createdAt });

export async function listOrders({ q, status, attention, from, to, page, limit }) {
  const f = { status: status ?? { $ne: 'pending_payment' } };
  if (attention) f.attention = { $exists: true, $ne: null };
  if (from || to) f.createdAt = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  if (q) {
    const users = await User.find({ email: { $regex: escapeRegex(q.toLowerCase()), $options: 'i' } }).select('_id').limit(50).lean();
    f.$or = [{ orderNumber: { $regex: `^${escapeRegex(q.toUpperCase())}` } }, { user: { $in: users.map((u) => u._id) } }];
  }
  const [rows, total] = await Promise.all([Order.find(f).populate('user', 'name email').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), Order.countDocuments(f)]);
  return { items: rows.map((o) => brief(o, o.user)), pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } };
}

export async function getOrder(id) {
  const o = await Order.findById(id).populate('user', 'name email phone status').lean();
  if (!o) throw ApiError.notFound('ORDER_NOT_FOUND', 'Order not found');
  const [payments, refunds, returns] = await Promise.all([Payment.find({ order: id }).lean(), Refund.find({ order: id }).lean(), ReturnRequest.find({ order: id }).lean()]);
  return { ...brief(o, o.user), customer: { id: o.user._id, name: o.user.name, email: o.user.email, phone: o.user.phone }, items: o.items, shippingAddress: o.shippingAddress, delivery: o.delivery, totals: o.totals, coupon: o.coupon, statusHistory: o.statusHistory, paidAt: o.paidAt,
    payments: payments.map((p) => ({ id: p._id, provider: p.provider, providerOrderId: p.providerOrderId, providerPaymentId: p.providerPaymentId, amount: p.amount, status: p.status, method: p.method, failureReason: p.failureReason })),
    refunds: refunds.map((r) => ({ id: r._id, amount: r.amount, status: r.status, reason: r.reason, providerRefundId: r.providerRefundId, failureReason: r.failureReason })),
    returns: returns.map((r) => ({ id: r._id, returnNumber: r.returnNumber, status: r.status })), allowedTransitions: TRANSITIONS[o.status] ?? [] };
}

export async function updateStatus(id, to, staff, note) {
  const cur = await Order.findById(id);
  if (!cur) throw ApiError.notFound('ORDER_NOT_FOUND', 'Order not found');
  if (!canTransition(cur.status, to)) throw ApiError.conflict('INVALID_TRANSITION', `An order that is “${cur.status.replace(/_/g, ' ')}” cannot move to “${to.replace(/_/g, ' ')}”`);
  const entry = { status: to, note: [note, `by ${staff.name}`].filter(Boolean).join(' — ') };
  const o = await Order.findOneAndUpdate({ _id: id, status: cur.status }, { $set: { status: to, ...(to === 'cancelled' && cur.paymentStatus === 'captured' ? { attention: 'REFUND_PENDING' } : {}) }, $push: { statusHistory: entry } }, { new: true });
  if (!o) throw ApiError.conflict('STALE_STATUS', 'This order was just updated by someone else. Refresh and try again.');
  if (to === 'cancelled') await afterCancellation(o, 'other');
  notify(o.user, { type: 'order', title: `Order ${o.orderNumber} ${LABEL[to]}`, link: `/account/orders/${o._id}` });
  if (to === 'shipped' || to === 'delivered') {
    const u = await User.findById(o.user).select('email preferences').lean();
    if (u && u.preferences?.orderUpdates !== false) sendEmail({ to: u.email, template: 'orderStatus', data: { orderNumber: o.orderNumber, phrase: LABEL[to], link: `${env.CLIENT_URL}/account/orders/${o._id}` } }).catch(() => {});
  }
  return { before: cur.status, order: o };
}
