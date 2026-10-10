import { Order } from '../models/Order.js';
import { Payment } from '../models/Payment.js';
import { Inventory } from '../models/Inventory.js';
import { Address } from '../models/Address.js';
import { Cart } from '../models/Cart.js';
import { Coupon } from '../models/Coupon.js';
import { COMMERCE } from '../config/commerce.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { ApiError } from '../utils/ApiError.js';
import { getCart, buildView } from './cartService.js';
import { syncProductFacets } from './inventoryService.js';
import { sendEmail } from './emailService.js';
import { formatInr } from '../utils/money.js';
import { notify } from './notificationService.js';
import { getPaymentProvider, PaymentProviderError } from './payments/index.js';

// ---- stock reservation (atomic per SKU; compensating rollback across SKUs) ----
async function reserveAll(items) {
  const done = [];
  for (const it of items) {
    const r = await Inventory.updateOne(
      { variant: it.variant, $expr: { $gte: [{ $subtract: ['$stock', '$reserved'] }, it.qty] } },
      { $inc: { reserved: it.qty } });
    if (r.modifiedCount !== 1) { await releaseAll(done); return { ok: false, failed: it }; }
    done.push(it);
  }
  return { ok: true };
}
const releaseAll = (items) => Promise.all(items.map((it) =>
  Inventory.updateOne({ variant: it.variant, reserved: { $gte: it.qty } }, { $inc: { reserved: -it.qty } })));

async function commitStock(order) {
  for (const it of order.items) {
    const r = await Inventory.updateOne({ variant: it.variant, stock: { $gte: it.qty }, reserved: { $gte: it.qty } }, { $inc: { stock: -it.qty, reserved: -it.qty } });
    if (r.modifiedCount !== 1) logger.error({ order: order.orderNumber, sku: it.sku }, 'Stock commit mismatch — inventory needs review');
  }
  await Promise.all([...new Set(order.items.map((i) => String(i.product)))].map(syncProductFacets));
}

// ---- cancellation / expiry ----
export async function cancelPending(orderId, note) {
  const o = await Order.findOneAndUpdate({ _id: orderId, status: 'pending_payment' },
    { $set: { status: 'cancelled' }, $unset: { reservationExpiresAt: 1 }, $push: { statusHistory: { status: 'cancelled', note } } }, { new: true });
  if (o) { await releaseAll(o.items); await Promise.all([...new Set(o.items.map((i) => String(i.product)))].map(syncProductFacets)); }
  return o;
}
export async function expirePendingOrders() {
  const stale = await Order.find({ status: 'pending_payment', reservationExpiresAt: { $lt: new Date() } }).select('_id').limit(100).lean();
  for (const { _id } of stale) await cancelPending(_id, 'Payment window expired');
  return stale.length;
}

// ---- create order + provider order ----
export async function createCheckoutOrder(user, { addressId, delivery }) {
  const provider = getPaymentProvider();
  if (!provider.isConfigured()) throw new ApiError(503, 'PAYMENT_NOT_CONFIGURED', 'Online payments are not available right now');

  const stale = await Order.find({ user: user._id, status: 'pending_payment' }).select('_id').lean();
  for (const s of stale) await cancelPending(s._id, 'Superseded by a new checkout');

  const address = await Address.findOne({ _id: addressId, user: user._id }).lean();
  if (!address) throw ApiError.notFound('ADDRESS_NOT_FOUND', 'Please choose a delivery address');
  const cart = await getCart({ user: user._id });
  const view = await buildView(cart, { delivery });
  if (!view.items.length) throw ApiError.badRequest('EMPTY_CART', 'Your bag is empty');
  if (!view.canCheckout) throw ApiError.conflict('CART_HAS_ISSUES', 'Some items in your bag need attention before checkout');
  if (view.couponError) throw ApiError.conflict(view.couponError.code, view.couponError.message);

  const items = view.items.map((i) => ({ variant: i.variantId, product: i.productId, sku: i.sku, name: i.name, slug: i.slug, color: i.color, size: i.size, image: i.image ?? undefined, unitPrice: i.unitPrice, qty: i.qty, lineTotal: i.lineTotal }));
  const reserved = await reserveAll(items);
  if (!reserved.ok) throw ApiError.conflict('INSUFFICIENT_STOCK', `${reserved.failed.name} (${reserved.failed.size}) just sold out or has too few left`);

  const d = COMMERCE.delivery[delivery];
  let order;
  try {
    order = await Order.create({
      user: user._id, items, delivery: { method: delivery, label: d.label, eta: d.eta },
      shippingAddress: { fullName: address.fullName, phone: address.phone, line1: address.line1, line2: address.line2, city: address.city, state: address.state, pincode: address.pincode, country: address.country },
      totals: { subtotal: view.totals.subtotal, discount: view.totals.discount, shipping: view.totals.shipping, tax: view.totals.tax, total: view.totals.total },
      coupon: view.coupon ? { code: view.coupon.code, discount: view.coupon.discount } : undefined,
      statusHistory: [{ status: 'pending_payment', note: 'Order created' }],
      reservationExpiresAt: new Date(Date.now() + COMMERCE.reservationMinutes * 60000),
    });
    const po = await provider.createOrder({ amount: order.totals.total, receipt: order.orderNumber, notes: { orderId: String(order._id) } });
    await Payment.create({ order: order._id, user: user._id, provider: provider.name, providerOrderId: po.id, amount: po.amount, currency: po.currency });
    return { order, payment: paymentParams(provider, po.id, po.amount, po.currency) };
  } catch (err) {
    await releaseAll(items);
    if (order) await Order.updateOne({ _id: order._id }, { $set: { status: 'cancelled' }, $unset: { reservationExpiresAt: 1 }, $push: { statusHistory: { status: 'cancelled', note: 'Could not start payment' } } });
    if (err instanceof PaymentProviderError) { logger.error({ err: err.message }, 'Payment provider error'); throw new ApiError(502, 'PAYMENT_PROVIDER_ERROR', 'We could not start the payment. Please try again.'); }
    throw err;
  }
}

export const paymentParams = (provider, providerOrderId, amount, currency) =>
  ({ provider: provider.name, ...provider.publicConfig(), providerOrderId, amount, currency });

export async function getPendingPaymentParams(order) {
  if (order.status !== 'pending_payment') return null;
  const p = await Payment.findOne({ order: order._id });
  return p ? paymentParams(getPaymentProvider(), p.providerOrderId, p.amount, p.currency) : null;
}

// ---- payment outcome (idempotent: safe to call from both the browser return and the webhook) ----
export async function finalizePaid({ orderId, providerPaymentId, method }) {
  await Payment.updateOne({ order: orderId, status: { $ne: 'captured' } }, { $set: { status: 'captured', providerPaymentId, method } });
  let order = await Order.findOneAndUpdate({ _id: orderId, status: 'pending_payment' },
    { $set: { status: 'confirmed', paymentStatus: 'captured', paidAt: new Date() }, $unset: { reservationExpiresAt: 1 },
      $push: { statusHistory: { $each: [{ status: 'paid', note: 'Payment captured' }, { status: 'confirmed' }] } } }, { new: true });

  if (!order) {
    const current = await Order.findById(orderId);
    if (current?.status !== 'cancelled') return current; // already processed
    // Money arrived after the reservation lapsed: try to re-take the stock, else flag for refund.
    const again = await reserveAll(current.items);
    if (!again.ok) {
      await Order.updateOne({ _id: orderId }, { $set: { paymentStatus: 'captured', attention: 'PAID_AFTER_EXPIRY_REFUND_REQUIRED' } });
      logger.error({ order: current.orderNumber }, 'Payment captured for an expired order and stock is gone — refund required');
      return Order.findById(orderId);
    }
    order = await Order.findOneAndUpdate({ _id: orderId, status: 'cancelled' },
      { $set: { status: 'confirmed', paymentStatus: 'captured', paidAt: new Date() }, $push: { statusHistory: { status: 'confirmed', note: 'Payment received after expiry; stock re-reserved' } } }, { new: true });
    if (!order) { await releaseAll(current.items); return Order.findById(orderId); }
  }

  await commitStock(order);
  if (order.coupon?.code) await Coupon.updateOne({ code: order.coupon.code }, { $inc: { usedCount: 1 } });
  await Cart.updateOne({ user: order.user }, { $pull: { items: { variant: { $in: order.items.map((i) => i.variant) } } }, $unset: { couponCode: 1 } });
  notify(order.user, { type: 'order', title: `Order ${order.orderNumber} confirmed`, body: 'We’re getting it ready.', link: `/account/orders/${order._id}` });
  const user = await (await import('../models/User.js')).User.findById(order.user).select('email preferences').lean();
  if (user && user.preferences?.orderUpdates !== false) sendEmail({ to: user.email, template: 'orderConfirmation', data: { orderNumber: order.orderNumber, total: formatInr(order.totals.total), link: `${env.CLIENT_URL}/checkout/success?order=${order._id}` } }).catch(() => {});
  return order;
}

export async function recordFailure(providerOrderId, reason) {
  await Payment.updateOne({ providerOrderId, status: { $ne: 'captured' } }, { $set: { status: 'failed', failureReason: reason?.slice(0, 200) } });
}

export async function verifyBrowserPayment(user, orderId, { razorpay_order_id: oid, razorpay_payment_id: pid, razorpay_signature: sig }) {
  const provider = getPaymentProvider();
  const payment = await Payment.findOne({ order: orderId, user: user._id, providerOrderId: oid });
  if (!payment) throw ApiError.notFound('PAYMENT_NOT_FOUND', 'Payment not found for this order');
  if (!provider.verifyCheckoutSignature({ orderId: oid, paymentId: pid, signature: sig })) {
    logger.warn({ orderId }, 'Invalid payment signature from browser');
    throw ApiError.badRequest('PAYMENT_SIGNATURE_INVALID', 'We could not verify this payment');
  }
  return finalizePaid({ orderId, providerPaymentId: pid });
}

// Webhook events from the gateway. Returns a short string for logging.
export async function handleGatewayEvent(eventId, event) {
  const entity = event?.payload?.payment?.entity;
  const providerOrderId = entity?.order_id ?? event?.payload?.order?.entity?.id;
  if (!providerOrderId) return 'ignored:no-order';
  const payment = await Payment.findOne({ providerOrderId }).select('+processedEvents');
  if (!payment) return 'ignored:unknown-order';
  if (eventId) {
    const claimed = await Payment.updateOne({ _id: payment._id, processedEvents: { $ne: eventId } }, { $addToSet: { processedEvents: eventId } });
    if (claimed.modifiedCount !== 1) return 'ignored:duplicate';
  }
  if (event.event === 'payment.captured' || event.event === 'order.paid') {
    if (entity?.amount != null && entity.amount !== payment.amount) { logger.error({ providerOrderId }, 'Webhook amount mismatch — ignored'); return 'ignored:amount-mismatch'; }
    await finalizePaid({ orderId: payment.order, providerPaymentId: entity?.id, method: entity?.method });
    return 'paid';
  }
  if (event.event === 'payment.failed') { await recordFailure(providerOrderId, entity?.error_description); return 'failed'; }
  return 'ignored:event';
}
