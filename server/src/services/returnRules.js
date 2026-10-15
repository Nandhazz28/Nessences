import { RETURN_REASONS } from "../models/ReturnRequest.js";
import { ApiError } from "../utils/ApiError.js";

export const RETURN_WINDOW_DAYS = 14;
const ACTIVE = ["requested", "approved", "received", "refunded"];

export const deliveredAt = (order) => {
  const h = [...(order.statusHistory ?? [])]
    .reverse()
    .find((x) => x.status === "delivered");
  return h ? new Date(h.at) : null;
};

export function checkEligibility(order, now = new Date()) {
  if (order.status !== "delivered")
    return {
      eligible: false,
      reason: "Returns open once your order has been delivered.",
    };
  const d = deliveredAt(order);
  if (!d)
    return {
      eligible: false,
      reason: "Delivery date unavailable — please contact support.",
    };
  const deadline = new Date(d.getTime() + RETURN_WINDOW_DAYS * 86400000);
  if (now > deadline)
    return {
      eligible: false,
      reason: `The ${RETURN_WINDOW_DAYS}-day return window ended on ${deadline.toLocaleDateString("en-IN")}.`,
      deadline,
    };
  return { eligible: true, deadline };
}

export function remainingQuantities(order, priorReturns) {
  const used = new Map();
  for (const r of priorReturns)
    if (ACTIVE.includes(r.status))
      for (const l of r.items)
        used.set(
          String(l.orderItem),
          (used.get(String(l.orderItem)) ?? 0) + l.qty,
        );
  return new Map(
    order.items.map((i) => [
      String(i._id),
      Math.max(0, i.qty - (used.get(String(i._id)) ?? 0)),
    ]),
  );
}

export function validateReturnLines(order, lines, priorReturns) {
  const left = remainingQuantities(order, priorReturns);
  const seen = new Set();
  return lines.map((l) => {
    const item = order.items.find((i) => String(i._id) === l.itemId);
    if (!item)
      throw ApiError.badRequest(
        "ITEM_NOT_IN_ORDER",
        "One of the items is not part of this order",
      );
    if (seen.has(l.itemId))
      throw ApiError.badRequest(
        "DUPLICATE_ITEM",
        "Each item can only be listed once",
      );
    seen.add(l.itemId);
    if (l.qty > (left.get(l.itemId) ?? 0))
      throw ApiError.conflict(
        "RETURN_QTY_EXCEEDED",
        `You can return at most ${left.get(l.itemId)} of “${item.name}”`,
      );
    return {
      orderItem: item._id,
      name: item.name,
      color: item.color,
      size: item.size,
      image: item.image,
      unitPrice: item.unitPrice,
      qty: l.qty,
      reason: l.reason,
      comment: l.comment,
    };
  });
}

export const canCustomerCancel = (order) => order.status === "confirmed";
