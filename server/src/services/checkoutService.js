import { Order } from "../models/Order.js";
import { Payment } from "../models/Payment.js";
import { Inventory } from "../models/Inventory.js";
import { Address } from "../models/Address.js";
import { Cart } from "../models/Cart.js";
import { User } from "../models/User.js";
import { WebhookEvent } from "../models/WebhookEvent.js";
import { Coupon } from "../models/Coupon.js";
import { COMMERCE } from "../config/commerce.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { ApiError } from "../utils/ApiError.js";
import { getCart, buildView } from "./cartService.js";
import { syncProductFacets } from "./inventoryService.js";
import { sendEmail } from "./emailService.js";
import { notify } from "./notificationService.js";
import { getPaymentProvider, PaymentProviderError } from "./payments/index.js";

async function reserveAll(items) {
  const done = [];
  for (const it of items) {
    const r = await Inventory.updateOne(
      {
        variant: it.variant,
        $expr: { $gte: [{ $subtract: ["$stock", "$reserved"] }, it.qty] },
      },
      { $inc: { reserved: it.qty } },
    );
    if (r.modifiedCount !== 1) {
      await releaseAll(done);
      return { ok: false, failed: it };
    }
    done.push(it);
  }
  return { ok: true };
}
const releaseAll = (items) =>
  Promise.all(
    items.map((it) =>
      Inventory.updateOne(
        { variant: it.variant, reserved: { $gte: it.qty } },
        { $inc: { reserved: -it.qty } },
      ),
    ),
  );

async function commitStock(order) {
  for (const it of order.items) {
    const r = await Inventory.updateOne(
      {
        variant: it.variant,
        stock: { $gte: it.qty },
        reserved: { $gte: it.qty },
      },
      { $inc: { stock: -it.qty, reserved: -it.qty } },
    );
    if (r.modifiedCount !== 1)
      logger.error(
        { order: order.orderNumber, sku: it.sku },
        "Stock commit mismatch — inventory needs review",
      );
  }
  await Promise.all(
    [...new Set(order.items.map((i) => String(i.product)))].map(
      syncProductFacets,
    ),
  );
}

export async function cancelPending(orderId, note) {
  const o = await Order.findOneAndUpdate(
    { _id: orderId, status: "pending_payment" },
    {
      $set: { status: "cancelled" },
      $unset: { reservationExpiresAt: 1 },
      $push: { statusHistory: { status: "cancelled", note } },
    },
    { new: true },
  );
  if (o) {
    await releaseAll(o.items);
    await Promise.all(
      [...new Set(o.items.map((i) => String(i.product)))].map(
        syncProductFacets,
      ),
    );
  }
  return o;
}
export async function expirePendingOrders() {
  const stale = await Order.find({
    status: "pending_payment",
    reservationExpiresAt: { $lt: new Date() },
  })
    .select("_id")
    .limit(100)
    .lean();
  for (const { _id } of stale)
    await cancelPending(_id, "Payment window expired");
  return stale.length;
}

export async function createCheckoutOrder(user, { addressId, delivery }) {
  const provider = getPaymentProvider();
  if (!provider.isConfigured())
    throw new ApiError(
      503,
      "PAYMENT_NOT_CONFIGURED",
      "Online payments are not available right now",
    );

  const stale = await Order.find({ user: user._id, status: "pending_payment" })
    .select("_id")
    .lean();
  for (const s of stale)
    await cancelPending(s._id, "Superseded by a new checkout");

  const address = await Address.findOne({
    _id: addressId,
    user: user._id,
  }).lean();
  if (!address)
    throw ApiError.notFound(
      "ADDRESS_NOT_FOUND",
      "Please choose a delivery address",
    );
  const cart = await getCart({ user: user._id });
  const view = await buildView(cart, { delivery });
  if (!view.items.length)
    throw ApiError.badRequest("EMPTY_CART", "Your bag is empty");
  if (!view.canCheckout)
    throw ApiError.conflict(
      "CART_HAS_ISSUES",
      "Some items in your bag need attention before checkout",
    );
  if (view.couponError)
    throw ApiError.conflict(view.couponError.code, view.couponError.message);

  const items = view.items.map((i) => ({
    variant: i.variantId,
    product: i.productId,
    sku: i.sku,
    name: i.name,
    slug: i.slug,
    color: i.color,
    size: i.size,
    image: i.image ?? undefined,
    unitPrice: i.unitPrice,
    qty: i.qty,
    lineTotal: i.lineTotal,
  }));
  const reserved = await reserveAll(items);
  if (!reserved.ok)
    throw ApiError.conflict(
      "INSUFFICIENT_STOCK",
      `${reserved.failed.name} (${reserved.failed.size}) just sold out or has too few left`,
    );

  const d = COMMERCE.delivery[delivery];
  let order;
  try {
    order = await Order.create({
      user: user._id,
      items,
      delivery: { method: delivery, label: d.label, eta: d.eta },
      shippingAddress: {
        fullName: address.fullName,
        phone: address.phone,
        line1: address.line1,
        line2: address.line2,
        city: address.city,
        state: address.state,
        pincode: address.pincode,
        country: address.country,
      },
      totals: {
        subtotal: view.totals.subtotal,
        discount: view.totals.discount,
        shipping: view.totals.shipping,
        tax: view.totals.tax,
        total: view.totals.total,
      },
      coupon: view.coupon
        ? { code: view.coupon.code, discount: view.coupon.discount }
        : undefined,
      statusHistory: [{ status: "pending_payment", note: "Order created" }],
      reservationExpiresAt: new Date(
        Date.now() + COMMERCE.reservationMinutes * 60000,
      ),
    });
    const po = await provider.createOrder({
      amount: order.totals.total,
      receipt: order.orderNumber,
      notes: { orderId: String(order._id) },
    });
    await Payment.create({
      order: order._id,
      user: user._id,
      provider: provider.name,
      providerOrderId: po.id,
      amount: po.amount,
      currency: po.currency,
    });
    return {
      order,
      payment: paymentParams(provider, po.id, po.amount, po.currency),
    };
  } catch (err) {
    await releaseAll(items);
    if (
      err?.code === 11000 &&
      /one_pending_order_per_user|user/.test(
        `${err.message} ${JSON.stringify(err.keyPattern ?? {})}`,
      )
    ) {
      throw ApiError.conflict(
        "CHECKOUT_IN_PROGRESS",
        "Your checkout is already being prepared. Please wait a moment and try again.",
      );
    }
    if (order)
      await Order.updateOne(
        { _id: order._id },
        {
          $set: { status: "cancelled" },
          $unset: { reservationExpiresAt: 1 },
          $push: {
            statusHistory: {
              status: "cancelled",
              note: "Could not start payment",
            },
          },
        },
      );
    if (err instanceof PaymentProviderError) {
      logger.error({ err: err.message }, "Payment provider error");
      throw new ApiError(
        502,
        "PAYMENT_PROVIDER_ERROR",
        "We could not start the payment. Please try again.",
      );
    }
    throw err;
  }
}

export const paymentParams = (provider, providerOrderId, amount, currency) => ({
  provider: provider.name,
  ...provider.publicConfig(),
  providerOrderId,
  amount,
  currency,
});

export async function getPendingPaymentParams(order) {
  if (order.status !== "pending_payment") return null;
  const p = await Payment.findOne({ order: order._id });
  return p
    ? paymentParams(
        getPaymentProvider(),
        p.providerOrderId,
        p.amount,
        p.currency,
      )
    : null;
}

async function once(orderId, key, fn) {
  const now = new Date();
  const claimed = await Order.findOneAndUpdate(
    {
      _id: orderId,
      [`effects.${key}.doneAt`]: { $exists: false },
      $or: [
        { [`effects.${key}.leaseUntil`]: { $exists: false } },
        { [`effects.${key}.leaseUntil`]: { $lt: now } },
      ],
    },
    {
      $set: { [`effects.${key}.leaseUntil`]: new Date(now.getTime() + 60_000) },
    },
  );
  if (!claimed) return false;
  try {
    await fn();
    await Order.updateOne(
      { _id: orderId },
      {
        $set: { [`effects.${key}.doneAt`]: new Date() },
        $unset: { [`effects.${key}.leaseUntil`]: 1 },
      },
    );
    return true;
  } catch (err) {
    await Order.updateOne(
      { _id: orderId },
      { $unset: { [`effects.${key}.leaseUntil`]: 1 } },
    ).catch(() => {});
    throw err;
  }
}

export const emailDataForOrder = (order, user) => ({
  name: user?.name,
  orderNumber: order.orderNumber,
  placedAt: order.paidAt ?? order.createdAt,
  items: order.items.map((i) => ({
    name: i.name,
    color: i.color,
    size: i.size,
    qty: i.qty,
    unitPrice: i.unitPrice,
    lineTotal: i.lineTotal,
  })),
  totals: order.totals,
  coupon: order.coupon,
  shippingAddress: order.shippingAddress,
  delivery: order.delivery,
  link: `${env.CLIENT_URL}/account/orders/${order._id}`,
});

async function runPaidEffects(order) {
  await once(order._id, "stock", () => commitStock(order));
  await once(order._id, "coupon", async () => {
    if (order.coupon?.code)
      await Coupon.updateOne(
        { code: order.coupon.code },
        { $inc: { usedCount: 1 } },
      );
  });
  await once(order._id, "cart", async () => {
    await Cart.updateOne(
      { user: order.user },
      {
        $pull: {
          items: { variant: { $in: order.items.map((i) => i.variant) } },
        },
        $unset: { couponCode: 1 },
      },
    );
    notify(order.user, {
      type: "order",
      title: `Order ${order.orderNumber} confirmed`,
      body: "We’re getting it ready.",
      link: `/account/orders/${order._id}`,
    });
  });
  try {
    await once(order._id, "email", async () => {
      const user = await User.findById(order.user).select("email name").lean();
      if (!user) return;
      const r = await sendEmail({
        to: user.email,
        template: "orderConfirmation",
        data: emailDataForOrder(order, user),
      });
      if (
        !r.accepted &&
        r.reason !== "EMAIL_NOT_CONFIGURED" &&
        r.reason !== "INVALID_RECIPIENT"
      )
        throw new Error(`confirmation email not accepted: ${r.reason}`); // released: the sweeper retries
    });
  } catch (err) {
    logger.warn(
      { order: order.orderNumber, err: err.message },
      "order confirmation email will be retried",
    );
  }
}

export async function finalizePaid({ orderId, providerPaymentId, method }) {
  await Payment.updateOne(
    { order: orderId, status: { $ne: "captured" } },
    { $set: { status: "captured", providerPaymentId, method } },
  );
  let order = await Order.findOneAndUpdate(
    { _id: orderId, status: "pending_payment" },
    {
      $set: {
        status: "confirmed",
        paymentStatus: "captured",
        paidAt: new Date(),
        "effects.v": 1,
      },
      $unset: { reservationExpiresAt: 1 },
      $push: {
        statusHistory: {
          $each: [
            { status: "paid", note: "Payment captured" },
            { status: "confirmed" },
          ],
        },
      },
    },
    { new: true },
  );

  if (!order) {
    const current = await Order.findById(orderId);
    if (!current) return null;
    if (current.status !== "cancelled") {
      if (current.effects?.v === 1) await runPaidEffects(current);
      return current;
    }
    const again = await reserveAll(current.items);
    if (!again.ok) {
      await Order.updateOne(
        { _id: orderId },
        {
          $set: {
            paymentStatus: "captured",
            attention: "PAID_AFTER_EXPIRY_REFUND_REQUIRED",
          },
        },
      );
      logger.error(
        { order: current.orderNumber },
        "Payment captured for an expired order and stock is gone — refund required",
      );
      return Order.findById(orderId);
    }
    order = await Order.findOneAndUpdate(
      { _id: orderId, status: "cancelled" },
      {
        $set: {
          status: "confirmed",
          paymentStatus: "captured",
          paidAt: new Date(),
          "effects.v": 1,
        },
        $push: {
          statusHistory: {
            status: "confirmed",
            note: "Payment received after expiry; stock re-reserved",
          },
        },
      },
      { new: true },
    );
    if (!order) {
      await releaseAll(current.items);
      return Order.findById(orderId);
    }
  }
  await runPaidEffects(order);
  return order;
}

export async function reconcilePaidOrders() {
  const stuck = await Order.find({
    "effects.v": 1,
    paymentStatus: "captured",
    paidAt: {
      $gt: new Date(Date.now() - 24 * 3600_000),
      $lt: new Date(Date.now() - 90_000),
    },
    $or: [
      { "effects.stock.doneAt": { $exists: false } },
      { "effects.coupon.doneAt": { $exists: false } },
      { "effects.cart.doneAt": { $exists: false } },
      { "effects.email.doneAt": { $exists: false } },
    ],
  }).limit(50);
  for (const o of stuck)
    await runPaidEffects(o).catch((err) =>
      logger.error(
        { err: err.message, order: o.orderNumber },
        "reconcile of paid order failed",
      ),
    );
  return stuck.length;
}

export async function recordFailure(providerOrderId, reason) {
  await Payment.updateOne(
    { providerOrderId, status: { $ne: "captured" } },
    { $set: { status: "failed", failureReason: reason?.slice(0, 200) } },
  );
}

export async function verifyBrowserPayment(
  user,
  orderId,
  { razorpay_order_id: oid, razorpay_payment_id: pid, razorpay_signature: sig },
) {
  const provider = getPaymentProvider();
  const payment = await Payment.findOne({
    order: orderId,
    user: user._id,
    providerOrderId: oid,
  });
  if (!payment)
    throw ApiError.notFound(
      "PAYMENT_NOT_FOUND",
      "Payment not found for this order",
    );
  if (
    !provider.verifyCheckoutSignature({
      orderId: oid,
      paymentId: pid,
      signature: sig,
    })
  ) {
    logger.warn({ orderId }, "Invalid payment signature from browser");
    throw ApiError.badRequest(
      "PAYMENT_SIGNATURE_INVALID",
      "We could not verify this payment",
    );
  }
  return finalizePaid({ orderId, providerPaymentId: pid });
}

const LOCK_MS = 60_000;
export async function handleGatewayEvent(eventId, event) {
  if (!eventId) return processGatewayEvent(event);
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + LOCK_MS);
  try {
    await WebhookEvent.create({
      eventId,
      provider: getPaymentProvider().name,
      type: event?.event,
      status: "processing",
      lockedUntil,
      expiresAt: new Date(now.getTime() + 90 * 86400_000),
    });
  } catch (e) {
    if (e?.code !== 11000) throw e;
    const retaken = await WebhookEvent.findOneAndUpdate(
      {
        eventId,
        $or: [
          { status: "failed" },
          { status: "processing", lockedUntil: { $lt: now } },
        ],
      },
      { $set: { status: "processing", lockedUntil }, $inc: { attempts: 1 } },
      { new: true },
    );
    if (!retaken)
      return (await WebhookEvent.findOne({ eventId }).lean())?.status === "done"
        ? "ignored:duplicate"
        : "in-progress";
  }
  try {
    const outcome = await processGatewayEvent(event);
    await WebhookEvent.updateOne(
      { eventId },
      {
        $set: { status: "done", outcome, doneAt: new Date() },
        $unset: { lockedUntil: 1, lastError: 1 },
      },
    );
    return outcome;
  } catch (err) {
    await WebhookEvent.updateOne(
      { eventId },
      {
        $set: {
          status: "failed",
          lastError: String(err?.message).slice(0, 200),
        },
        $unset: { lockedUntil: 1 },
      },
    ).catch(() => {});
    throw err;
  }
}

async function processGatewayEvent(event) {
  const entity = event?.payload?.payment?.entity;
  const providerOrderId = entity?.order_id ?? event?.payload?.order?.entity?.id;
  if (!providerOrderId) return "ignored:no-order";
  const payment = await Payment.findOne({ providerOrderId });
  if (!payment) return "ignored:unknown-order";
  if (event.event === "payment.captured" || event.event === "order.paid") {
    if (
      entity?.amount !== payment.amount ||
      (entity?.currency ?? payment.currency) !== payment.currency
    ) {
      logger.error(
        { providerOrderId },
        "Webhook amount/currency mismatch — ignored",
      );
      return "ignored:amount-mismatch";
    }
    await finalizePaid({
      orderId: payment.order,
      providerPaymentId: entity?.id,
      method: entity?.method,
    });
    return "paid";
  }
  if (event.event === "payment.failed") {
    await recordFailure(providerOrderId, entity?.error_description);
    return "failed";
  }
  return "ignored:event";
}
