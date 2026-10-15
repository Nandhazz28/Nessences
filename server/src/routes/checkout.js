import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ok } from "../utils/respond.js";
import { ApiError } from "../utils/ApiError.js";
import { COMMERCE } from "../config/commerce.js";
import { Address } from "../models/Address.js";
import { Order } from "../models/Order.js";
import { getPaymentProvider } from "../services/payments/index.js";
import * as checkout from "../services/checkoutService.js";
import * as orders from "../services/orderService.js";

const oid = z.string().regex(/^[a-f0-9]{24}$/, "Invalid id");
const idParam = z.object({ id: oid });

export const checkoutRoutes = Router();
checkoutRoutes.get("/config", (_req, res) => {
  const p = getPaymentProvider();
  ok(res, {
    paymentsEnabled: p.isConfigured(),
    provider: p.name,
    webhookConfigured: p.webhookConfigured(),
    delivery: Object.entries(COMMERCE.delivery).map(([id, d]) => ({
      id,
      label: d.label,
      eta: d.eta,
      fee: d.fee ?? null,
    })),
    freeShippingThreshold: COMMERCE.freeShippingThreshold,
  });
});
checkoutRoutes.post(
  "/orders",
  requireAuth,
  validate({
    body: z
      .object({ addressId: oid, delivery: z.enum(["standard", "express"]) })
      .strict(),
  }),
  asyncHandler(async (req, res) => {
    const { order, payment } = await checkout.createCheckoutOrder(
      req.user,
      req.body,
    );
    ok(res, { order: orders.toOrderView(order), payment }, 201);
  }),
);

export const orderRoutes = Router();
orderRoutes.use(requireAuth);
orderRoutes.get(
  "/",
  validate({
    query: z.object({ page: z.coerce.number().int().min(1).default(1) }),
  }),
  asyncHandler(async (req, res) =>
    ok(res, await orders.listOwnOrders(req.user._id, req.query.page)),
  ),
);
orderRoutes.get(
  "/:id",
  validate({ params: idParam }),
  asyncHandler(async (req, res) =>
    ok(res, await orders.getOwnOrder(req.user._id, req.params.id)),
  ),
);
orderRoutes.post(
  "/:id/verify-payment",
  validate({
    params: idParam,
    body: z
      .object({
        razorpay_order_id: z.string().max(60),
        razorpay_payment_id: z.string().max(60),
        razorpay_signature: z.string().max(200),
      })
      .strict(),
  }),
  asyncHandler(async (req, res) => {
    await checkout.verifyBrowserPayment(req.user, req.params.id, req.body);
    ok(res, await orders.getOwnOrder(req.user._id, req.params.id));
  }),
);
orderRoutes.post(
  "/:id/cancel",
  validate({ params: idParam }),
  asyncHandler(async (req, res) =>
    ok(res, await orders.cancelOwnOrder(req.user, req.params.id)),
  ),
);
orderRoutes.post(
  "/:id/payment-failed",
  validate({
    params: idParam,
    body: z.object({ reason: z.string().max(200).optional() }).strict(),
  }),
  asyncHandler(async (req, res) => {
    const o = await Order.findOne({ _id: req.params.id, user: req.user._id });
    if (!o) throw ApiError.notFound("ORDER_NOT_FOUND", "Order not found");
    const p = await (
      await import("../models/Payment.js")
    ).Payment.findOne({ order: o._id });
    if (p) await checkout.recordFailure(p.providerOrderId, req.body.reason);
    ok(res, { recorded: true });
  }),
);

const addr = z
  .object({
    label: z.enum(["Home", "Work", "Other"]).default("Home"),
    fullName: z.string().trim().min(2).max(80),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ]{8,15}$/, "Enter a valid phone number"),
    line1: z.string().trim().min(3).max(120),
    line2: z.string().trim().max(120).optional(),
    city: z.string().trim().min(2).max(60),
    state: z.string().trim().min(2).max(60),
    pincode: z
      .string()
      .trim()
      .regex(/^[1-9][0-9]{5}$/, "Enter a valid 6-digit PIN code"),
    isDefault: z.boolean().optional(),
  })
  .strict();

export const addressRoutes = Router();
addressRoutes.use(requireAuth);
const MAX_ADDRESSES = 10;
const list = (userId) =>
  Address.find({ user: userId }).sort({ isDefault: -1, createdAt: -1 });
addressRoutes.get(
  "/",
  asyncHandler(async (req, res) => ok(res, await list(req.user._id))),
);
addressRoutes.post(
  "/",
  validate({ body: addr }),
  asyncHandler(async (req, res) => {
    const count = await Address.countDocuments({ user: req.user._id });
    if (count >= MAX_ADDRESSES)
      throw ApiError.badRequest(
        "ADDRESS_LIMIT",
        `You can save up to ${MAX_ADDRESSES} addresses`,
      );
    const makeDefault = req.body.isDefault || count === 0;
    if (makeDefault)
      await Address.updateMany(
        { user: req.user._id },
        { $set: { isDefault: false } },
      );
    await Address.create({
      ...req.body,
      user: req.user._id,
      isDefault: makeDefault,
    });
    ok(res, await list(req.user._id), 201);
  }),
);
addressRoutes.patch(
  "/:id",
  validate({ params: idParam, body: addr.partial() }),
  asyncHandler(async (req, res) => {
    const a = await Address.findOne({ _id: req.params.id, user: req.user._id });
    if (!a) throw ApiError.notFound("ADDRESS_NOT_FOUND", "Address not found");
    if (req.body.isDefault)
      await Address.updateMany(
        { user: req.user._id },
        { $set: { isDefault: false } },
      );
    a.set(req.body);
    await a.save();
    ok(res, await list(req.user._id));
  }),
);
addressRoutes.delete(
  "/:id",
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const a = await Address.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });
    if (!a) throw ApiError.notFound("ADDRESS_NOT_FOUND", "Address not found");
    if (a.isDefault)
      await Address.findOneAndUpdate(
        { user: req.user._id },
        { $set: { isDefault: true } },
        { sort: { createdAt: -1 } },
      );
    ok(res, await list(req.user._id));
  }),
);
