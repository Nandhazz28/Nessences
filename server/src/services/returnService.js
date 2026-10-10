import { Order } from '../models/Order.js';
import { ReturnRequest } from '../models/ReturnRequest.js';
import { ApiError } from '../utils/ApiError.js';
import { checkEligibility, validateReturnLines } from './returnRules.js';
import { notify } from './notificationService.js';

const view = (r) => ({ id: r._id, returnNumber: r.returnNumber, orderId: r.order, status: r.status, items: r.items, estimatedRefund: r.estimatedRefund, staffNote: r.staffNote, history: r.history, createdAt: r.createdAt });

export async function createReturn(user, { orderId, items }) {
  const order = await Order.findOne({ _id: orderId, user: user._id });
  if (!order) throw ApiError.notFound('ORDER_NOT_FOUND', 'Order not found');
  const elig = checkEligibility(order);
  if (!elig.eligible) throw ApiError.badRequest('NOT_RETURNABLE', elig.reason);
  const prior = await ReturnRequest.find({ order: order._id });
  const lines = validateReturnLines(order, items, prior);
  const r = await ReturnRequest.create({
    order: order._id, user: user._id, items: lines,
    estimatedRefund: lines.reduce((s, l) => s + l.unitPrice * l.qty, 0),
    history: [{ status: 'requested', note: 'Return requested by customer' }],
  });
  notify(user._id, { type: 'return', title: `Return ${r.returnNumber} requested`, body: 'We’ll review it within 2 working days.', link: `/account/returns/${r._id}` });
  return view(r);
}
export async function listReturns(userId) {
  return (await ReturnRequest.find({ user: userId }).sort({ createdAt: -1 }).limit(50)).map(view);
}
export async function getReturn(userId, id) {
  const r = await ReturnRequest.findOne({ _id: id, user: userId });
  if (!r) throw ApiError.notFound('RETURN_NOT_FOUND', 'Return not found');
  const order = await Order.findById(r.order).select('orderNumber').lean();
  return { ...view(r), orderNumber: order?.orderNumber };
}
export async function withdrawReturn(userId, id) {
  const r = await ReturnRequest.findOneAndUpdate({ _id: id, user: userId, status: 'requested' },
    { $set: { status: 'withdrawn' }, $push: { history: { status: 'withdrawn', note: 'Withdrawn by customer' } } }, { new: true });
  if (!r) throw ApiError.conflict('CANNOT_WITHDRAW', 'This return can no longer be withdrawn');
  return view(r);
}
