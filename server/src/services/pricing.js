import { COMMERCE } from "../config/commerce.js";
import { ApiError } from "../utils/ApiError.js";

export function evaluateCoupon(coupon, subtotal, now = new Date()) {
  if (!coupon || !coupon.active)
    throw ApiError.badRequest("COUPON_INVALID", "That code is not valid");
  if (coupon.startsAt && coupon.startsAt > now)
    throw ApiError.badRequest(
      "COUPON_NOT_STARTED",
      "That code is not active yet",
    );
  if (coupon.expiresAt && coupon.expiresAt < now)
    throw ApiError.badRequest("COUPON_EXPIRED", "That code has expired");
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit)
    throw ApiError.badRequest(
      "COUPON_EXHAUSTED",
      "That code has been fully redeemed",
    );
  if (subtotal < coupon.minOrder) {
    throw ApiError.badRequest(
      "COUPON_MIN_ORDER",
      `Spend ₹${Math.ceil(coupon.minOrder / 100).toLocaleString("en-IN")} or more to use this code`,
    );
  }
  let discount =
    coupon.type === "percent"
      ? Math.floor((subtotal * coupon.value) / 100)
      : coupon.value;
  if (coupon.maxDiscount != null)
    discount = Math.min(discount, coupon.maxDiscount);
  return Math.min(discount, subtotal);
}

export function computeTotals(
  subtotal,
  discount = 0,
  itemCount = 0,
  method = "standard",
) {
  const taxable = Math.max(0, subtotal - discount);
  const shipping =
    itemCount === 0
      ? 0
      : method === "express"
        ? COMMERCE.delivery.express.fee
        : taxable >= COMMERCE.freeShippingThreshold
          ? 0
          : COMMERCE.shippingFee;
  const tax = Math.round(taxable * COMMERCE.taxRate);
  return {
    subtotal,
    discount,
    shipping,
    tax,
    total: taxable + shipping + tax,
    itemCount,
  };
}
