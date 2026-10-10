import { ReturnRequest } from '../../models/ReturnRequest.js';
import { Order } from '../../models/Order.js';
import { Refund } from '../../models/Refund.js';
import { Inventory } from '../../models/Inventory.js';
import { ApiError } from '../../utils/ApiError.js';
import { syncProductFacets } from '../inventoryService.js';
import { notify } from '../notificationService.js';

export const RETURN_TRANSITIONS = { requested: ['approved', 'rejected'], approved: ['received'] };
const view = (r, extra = {}) => ({ id: r._id, returnNumber: r.returnNumber, status: r.status, items: r.items, estimatedRefund: r.estimatedRefund, staffNote: r.staffNote, history: r.history, createdAt: r.createdAt, ...extra });

export async function listReturns({ status, page, limit }) {
  const f = status ? { status } : {};
  const [rows, total] = await Promise.all([ReturnRequest.find(f).populate('order', 'orderNumber').populate('user', 'name email').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), ReturnRequest.countDocuments(f)]);
  return { items: rows.map((r) => view(r, { orderNumber: r.order?.orderNumber, orderId: r.order?._id, customer: r.user && { name: r.user.name, email: r.user.email } })), pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } };
}
export async function getReturn(id) {
  const r = await ReturnRequest.findById(id).populate('order', 'orderNumber totals').populate('user', 'name email').lean();
  if (!r) throw ApiError.notFound('RETURN_NOT_FOUND', 'Return not found');
  return view(r, { orderNumber: r.order?.orderNumber, orderId: r.order?._id, customer: r.user && { name: r.user.name, email: r.user.email }, allowed: RETURN_TRANSITIONS[r.status] ?? [] });
}

export async function decide(id, action, staff, { note, refundAmount, restock = true } = {}) {
  const to = { approve: 'approved', reject: 'rejected', receive: 'received' }[action];
  const cur = await ReturnRequest.findById(id);
  if (!cur) throw ApiError.notFound('RETURN_NOT_FOUND', 'Return not found');
  if (!(RETURN_TRANSITIONS[cur.status] ?? []).includes(to)) throw ApiError.conflict('INVALID_TRANSITION', `A return that is “${cur.status}” cannot be ${to}`);
  if (to === 'rejected' && !note) throw ApiError.badRequest('NOTE_REQUIRED', 'Please give the customer a reason for rejecting');
  const r = await ReturnRequest.findOneAndUpdate({ _id: id, status: cur.status },
    { $set: { status: to, ...(note ? { staffNote: note } : {}) }, $push: { history: { status: to, note: [note, `by ${staff.name}`].filter(Boolean).join(' — ') } } }, { new: true });
  if (!r) throw ApiError.conflict('STALE_STATUS', 'This return was just updated by someone else');
  if (to === 'received') {
    if (restock) {
      await Promise.all(r.items.map(async (l) => { const o = await Order.findOne({ 'items._id': l.orderItem }, { 'items.$': 1 }).lean(); const it = o?.items?.[0]; if (it) { await Inventory.updateOne({ variant: it.variant }, { $inc: { stock: l.qty } }); await syncProductFacets(it.product); } }));
    }
    const amount = Math.min(refundAmount ?? r.estimatedRefund, r.estimatedRefund);
    await Refund.create({ order: r.order, user: r.user, returnRequest: r._id, amount, reason: 'return' }); // staff then process it through the gateway
  }
  notify(r.user, { type: 'return', title: `Return ${r.returnNumber}: ${to === 'received' ? 'items received' : to}`, body: note, link: `/account/returns/${r._id}` });
  return r;
}
