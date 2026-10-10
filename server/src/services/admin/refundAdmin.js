import { Refund } from '../../models/Refund.js';
import { Payment } from '../../models/Payment.js';
import { Order } from '../../models/Order.js';
import { ReturnRequest } from '../../models/ReturnRequest.js';
import { ApiError } from '../../utils/ApiError.js';
import { logger } from '../../config/logger.js';
import { getPaymentProvider, PaymentProviderError } from '../payments/index.js';
import { notify } from '../notificationService.js';

export async function listRefunds({ status, page, limit }) {
  const f = status ? { status } : {};
  const [rows, total] = await Promise.all([Refund.find(f).populate('order', 'orderNumber totals').populate('user', 'name email').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), Refund.countDocuments(f)]);
  return { items: rows.map((r) => ({ id: r._id, orderId: r.order?._id, orderNumber: r.order?.orderNumber, customer: r.user && { name: r.user.name, email: r.user.email }, amount: r.amount, reason: r.reason, status: r.status, providerRefundId: r.providerRefundId, failureReason: r.failureReason, createdAt: r.createdAt })), pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } };
}

// Real gateway refund. Atomically claims the refund (pending|failed -> processing) so it can never be sent twice.
export async function processRefund(id, staff) {
  const provider = getPaymentProvider();
  if (!provider.isConfigured()) throw new ApiError(503, 'PAYMENT_NOT_CONFIGURED', 'Payment gateway keys are not configured, so refunds cannot be sent');
  const refund = await Refund.findOneAndUpdate({ _id: id, status: { $in: ['pending', 'failed'] } }, { $set: { status: 'processing', failureReason: undefined } }, { new: true });
  if (!refund) throw ApiError.conflict('REFUND_NOT_PROCESSABLE', 'This refund is already processing or completed');
  const release = (patch) => Refund.updateOne({ _id: id }, { $set: patch });
  const payment = await Payment.findOne({ order: refund.order, status: 'captured' });
  if (!payment?.providerPaymentId) { await release({ status: 'failed', failureReason: 'No captured payment found for this order' }); throw ApiError.conflict('NO_CAPTURED_PAYMENT', 'No captured payment found for this order'); }
  // Never refund more than was captured across all processed refunds.
  const prior = await Refund.aggregate([{ $match: { order: refund.order, status: 'processed' } }, { $group: { _id: null, sum: { $sum: '$amount' } } }]);
  if ((prior[0]?.sum ?? 0) + refund.amount > payment.amount) { await release({ status: 'failed', failureReason: 'Exceeds captured amount' }); throw ApiError.conflict('REFUND_EXCEEDS_PAYMENT', 'Total refunds would exceed the amount paid'); }
  try {
    const r = await provider.refund({ paymentId: payment.providerPaymentId, amount: refund.amount, notes: { refundId: String(refund._id) } });
    await release({ status: 'processed', providerRefundId: r.id, processedAt: new Date(), processedBy: staff._id });
  } catch (err) {
    await release({ status: 'failed', failureReason: String(err.message).slice(0, 200) });
    logger.error({ err: err.message, refund: String(id) }, 'Refund failed at provider');
    if (err instanceof PaymentProviderError) throw new ApiError(502, 'REFUND_PROVIDER_ERROR', err.message);
    throw err;
  }
  const total = (await Refund.aggregate([{ $match: { order: refund.order, status: 'processed' } }, { $group: { _id: null, sum: { $sum: '$amount' } } }]))[0]?.sum ?? 0;
  const order = await Order.findById(refund.order);
  if (total >= payment.amount) {
    order.paymentStatus = 'refunded'; order.attention = undefined;
    if (order.status === 'cancelled') { order.status = 'refunded'; order.statusHistory.push({ status: 'refunded', note: `Refund processed by ${staff.name}` }); }
    await Payment.updateOne({ _id: payment._id }, { $set: { status: 'refunded' } });
  } else order.statusHistory.push({ status: order.status, note: `Partial refund processed by ${staff.name}` });
  await order.save();
  if (refund.returnRequest) await ReturnRequest.updateOne({ _id: refund.returnRequest }, { $set: { status: 'refunded' }, $push: { history: { status: 'refunded', note: 'Refund processed' } } });
  notify(refund.user, { type: 'refund', title: 'Your refund has been sent', body: 'It can take 5–7 working days to reach your account.', link: `/account/orders/${refund.order}` });
  return Refund.findById(id);
}
