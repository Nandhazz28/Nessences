import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { optionalAuth, cartIdentity } from "../middleware/cartContext.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ok } from "../utils/respond.js";
import { COMMERCE } from "../config/commerce.js";
import * as cartSvc from "../services/cartService.js";
import * as wishSvc from "../services/wishlistService.js";

const oid = z.string().regex(/^[a-f0-9]{24}$/, "Invalid id");
const qty = z.coerce.number().int().min(1).max(COMMERCE.maxLineQty);
const vparam = z.object({ variantId: oid });

export const cart = Router();
cart.use(optionalAuth, cartIdentity);
const owner = (req) => (req.user ? "user" : "guest");
const respond = (req, res, c, opts) =>
  cartSvc.buildView(c, opts).then((v) => {
    res.set("Cache-Control", "no-store");
    ok(res, { ...v, owner: owner(req) });
  });
const write = (fn) =>
  asyncHandler(async (req, res) => {
    for (let attempt = 1; ; attempt += 1) {
      const c = await cartSvc.getCart(req.cartKey, { create: true });
      try {
        await fn(c, req);
        return await respond(req, res, c);
      } catch (e) {
        if (e?.name !== "VersionError" || attempt >= 5) throw e;
      }
    }
  });

cart.get(
  "/",
  validate({
    query: z.object({
      delivery: z.enum(["standard", "express"]).default("standard"),
    }),
  }),
  asyncHandler(async (req, res) =>
    respond(req, res, await cartSvc.getCart(req.cartKey), {
      delivery: req.query.delivery,
    }),
  ),
);
cart.post(
  "/items",
  validate({ body: z.object({ variantId: oid, qty }).strict() }),
  write((c, r) => cartSvc.addItem(c, r.body.variantId, r.body.qty)),
);
cart.patch(
  "/items/:variantId",
  validate({ params: vparam, body: z.object({ qty }).strict() }),
  write((c, r) => cartSvc.setQty(c, r.params.variantId, r.body.qty)),
);
cart.delete(
  "/items/:variantId",
  validate({ params: vparam }),
  write((c, r) => cartSvc.removeItem(c, r.params.variantId)),
);
cart.post(
  "/items/:variantId/save",
  validate({ params: vparam }),
  write((c, r) => cartSvc.saveForLater(c, r.params.variantId)),
);
cart.post(
  "/saved/:variantId/move",
  validate({ params: vparam }),
  write((c, r) => cartSvc.moveToBag(c, r.params.variantId)),
);
cart.post(
  "/coupon",
  validate({
    body: z.object({ code: z.string().trim().min(3).max(24) }).strict(),
  }),
  write((c, r) => cartSvc.applyCoupon(c, r.body.code)),
);
cart.delete(
  "/coupon",
  write((c) => cartSvc.removeCoupon(c)),
);

export const wishlist = Router();
wishlist.use(requireAuth);
wishlist.get(
  "/",
  asyncHandler(async (req, res) =>
    ok(res, await wishSvc.listWishlist(req.user._id)),
  ),
);
wishlist.post(
  "/",
  validate({ body: z.object({ productId: oid }).strict() }),
  asyncHandler(async (req, res) => {
    await wishSvc.addToWishlist(req.user._id, req.body.productId);
    ok(res, await wishSvc.listWishlist(req.user._id), 201);
  }),
);
wishlist.delete(
  "/:productId",
  validate({ params: z.object({ productId: oid }) }),
  asyncHandler(async (req, res) => {
    await wishSvc.removeFromWishlist(req.user._id, req.params.productId);
    ok(res, await wishSvc.listWishlist(req.user._id));
  }),
);
