import { Order } from '../models/Order.js';
import { ApiError } from '../utils/ApiError.js';
import { Refund } from '../models/Refund.js';
import { ReturnRequest } from '../models/ReturnRequest.js';
import { Inventory } from '../models/Inventory.js';
import { Coupon } from '../models/Coupon.js';
import { getPendingPaymentParams } from './checkoutService.js';
import { syncProductFacets } from './inventoryService.js';
import { canCustomerCancel, checkEligibility, remainingQuantities } from './returnRules.js';
import { notify } from './notificationService.js';
import { presentImage } from './imageUrls.js';

export const toOrderView = (o, payment) => ({
  id: o._id, orderNumber: o.orderNumber, status: o.status, paymentStatus: o.paymentStatus,
  statusHistory: o.statusHistory, items: o.items.map((i) => ({ id: i._id, productId: i.product, slug: i.slug, name: i.name, color: i.color, size: i.size, image: presentImage(i.image, 'thumb'), unitPrice: i.unitPrice, qty: i.qty, lineTotal: i.lineTotal })),
  shippingAddress: o.shippingAddress, delivery: o.delivery, totals: o.totals, coupon: o.coupon,
  createdAt: o.createdAt, paidAt: o.paidAt, reservationExpiresAt: o.reservationExpiresAt, ...(payment ? { payment } : {}),
});

export async function getOwnOrder(userId, id) {
  const o = await Order.findOne({ _id: id, user: userId });
  if (!o) throw ApiError.notFound('ORDER_NOT_FOUND', 'Order not found');
  const [refunds, returns] = await Promise.all([Refund.find({ order: o._id }).lean(), ReturnRequest.find({ order: o._id }).lean()]);
  const elig = checkEligibility(o); const left = remainingQuantities(o, returns);
  const view = toOrderView(o, await getPendingPaymentParams(o));
  view.items = view.items.map((i) => ({ ...i, returnableQty: elig.eligible ? left.get(String(i.id)) ?? 0 : 0 }));
  return { ...view, canCancel: canCustomerCancel(o),
    returns: { eligible: elig.eligible && view.items.some((i) => i.returnableQty > 0), reason: elig.reason, deadline: elig.deadline, ids: returns.map((r) => ({ id: r._id, returnNumber: r.returnNumber, status: r.status })) },
    refunds: refunds.map((r) => ({ id: r._id, amount: r.amount, status: r.status, reason: r.reason })) };
}

// Side-effects of any cancellation of a paid order: restock, free the coupon use, record the refund owed.
export async function afterCancellation(o, refundReason = 'customer_cancelled') {
  await Promise.all(o.items.map((i) => Inventory.updateOne({ variant: i.variant }, { $inc: { stock: i.qty } })));
  await Promise.all([...new Set(o.items.map((i) => String(i.product)))].map(syncProductFacets));
  if (o.coupon?.code) await Coupon.updateOne({ code: o.coupon.code, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
  if (o.paymentStatus === 'captured') await Refund.create({ order: o._id, user: o.user, amount: o.totals.total, reason: refundReason });
}

// Customer cancellation before packing.
export async function cancelOwnOrder(user, id) {
  const o = await Order.findOneAndUpdate({ _id: id, user: user._id, status: 'confirmed' },
    { $set: { status: 'cancelled', attention: 'REFUND_PENDING' }, $push: { statusHistory: { status: 'cancelled', note: 'Cancelled by customer' } } }, { new: true });
  if (!o) throw ApiError.conflict('CANNOT_CANCEL', 'This order can no longer be cancelled online. Please contact support.');
  await afterCancellation(o, 'customer_cancelled');
  notify(user._id, { type: 'order', title: `Order ${o.orderNumber} cancelled`, body: 'Your refund is being processed.', link: `/account/orders/${o._id}` });
  return getOwnOrder(user._id, id);
}
