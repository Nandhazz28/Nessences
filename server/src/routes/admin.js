import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import {
  requireStaff,
  passwordGate,
  requirePermission as need,
  requireAnyPermission,
} from "../middleware/auth.js";
import { asyncHandler as h } from "../utils/asyncHandler.js";
import { ok } from "../utils/respond.js";
import { ApiError } from "../utils/ApiError.js";
import { slugify } from "../utils/slug.js";
import { permissionsFor, can } from "../config/permissions.js";
import { audit } from "../services/auditService.js";
import { storage } from "../services/storage.js";
import { media } from "../services/mediaService.js";
import { Category } from "../models/Category.js";
import { Collection } from "../models/Collection.js";
import { Product } from "../models/Product.js";
import { Coupon } from "../models/Coupon.js";
import { AdminAuditLog } from "../models/AdminAuditLog.js";
import * as products from "../services/admin/productAdmin.js";
import * as inv from "../services/admin/inventoryAdmin.js";
import * as orders from "../services/admin/orderAdmin.js";
import * as returns from "../services/admin/returnAdmin.js";
import * as refunds from "../services/admin/refundAdmin.js";
import * as customers from "../services/admin/customerAdmin.js";
import * as coupons from "../services/admin/couponAdmin.js";
import { dashboard } from "../services/admin/dashboard.js";

const oid = products.oid;
const id = z.object({ id: oid });
const pageQ = {
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};
const q = (extra = {}) =>
  z.object({ ...pageQ, q: z.string().trim().max(80).optional(), ...extra });
const list = (res, r) => ok(res, r.items, 200, { pagination: r.pagination });

export const admin = Router();
admin.use(requireStaff, passwordGate);
admin.get("/permissions", (req, res) =>
  ok(res, {
    role: req.staff.role,
    permissions: permissionsFor(req.staff.role),
    staff: req.staff.toPublic(),
  }),
);

admin.get(
  "/dashboard",
  need("dashboard:read"),
  validate({
    query: z.object({
      days: z.coerce
        .number()
        .int()
        .refine((n) => [7, 30, 90].includes(n))
        .default(30),
    }),
  }),
  h(async (req, res) => ok(res, await dashboard(req.query.days))),
);

admin.get(
  "/products",
  need("products:read"),
  validate({
    query: q({
      status: z.enum(["draft", "published", "archived"]).optional(),
      gender: z.enum(["men", "women"]).optional(),
      category: oid.optional(),
    }),
  }),
  h(async (req, res) => list(res, await products.listProducts(req.query))),
);
admin.get(
  "/products/:id",
  need("products:read"),
  validate({ params: id }),
  h(async (req, res) => ok(res, await products.getProduct(req.params.id))),
);
admin.post(
  "/products",
  need("products:write"),
  validate({ body: products.createBody }),
  h(async (req, res) => {
    const p = await products.createProduct(req.body);
    await audit(req, {
      action: "product.created",
      resource: "Product",
      resourceId: p._id,
      metadata: { name: p.name, status: p.status },
    });
    ok(res, await products.getProduct(p._id), 201);
  }),
);
admin.patch(
  "/products/:id",
  need("products:write"),
  validate({ params: id, body: products.updateBody }),
  h(async (req, res) => {
    const { product, before } = await products.updateProduct(
      req.params.id,
      req.body,
    );
    const changed = Object.keys(req.body);
    await audit(req, {
      action:
        req.body.status && req.body.status !== before.status
          ? `product.${req.body.status === "published" ? "published" : req.body.status}`
          : "product.updated",
      resource: "Product",
      resourceId: product._id,
      metadata: {
        fields: changed,
        ...(req.body.price !== undefined || req.body.salePrice !== undefined
          ? { priceBefore: before.price, saleBefore: before.salePrice }
          : {}),
        ...(req.body.status ? { statusBefore: before.status } : {}),
      },
    });
    ok(res, await products.getProduct(product._id));
  }),
);
admin.delete(
  "/products/:id",
  need("products:write"),
  validate({ params: id }),
  h(async (req, res) => {
    const { result, product } = await products.removeOrArchive(req.params.id);
    await audit(req, {
      action: `product.${result}`,
      resource: "Product",
      resourceId: product._id,
      metadata: { name: product.name },
    });
    ok(res, { result });
  }),
);
admin.post(
  "/products/:id/variants",
  need("products:write"),
  validate({ params: id, body: products.variantsSpec }),
  h(async (req, res) => {
    const made = await products.addProductVariants(req.params.id, req.body);
    await audit(req, {
      action: "variant.created",
      resource: "Product",
      resourceId: req.params.id,
      metadata: { skus: made },
    });
    ok(res, await products.getProduct(req.params.id), 201);
  }),
);
admin.patch(
  "/variants/:id",
  need("products:write"),
  validate({ params: id, body: z.object({ active: z.boolean() }).strict() }),
  h(async (req, res) => {
    const v = await products.setVariantActive(req.params.id, req.body.active);
    await audit(req, {
      action: req.body.active ? "variant.activated" : "variant.deactivated",
      resource: "ProductVariant",
      resourceId: v._id,
      metadata: { sku: v.sku },
    });
    ok(res, await products.getProduct(v.product));
  }),
);

// ---------- images (storage boundary; bytes are sniffed, not trusted) ----------
// Upload is server-side only: the file passes through this process, credentials never reach a browser.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: storage.maxBytes, files: 1, fields: 4 },
});
const PURPOSE_PERMISSION = {
  product: "products:write",
  article: "content:write",
};
const uploadQuery = z
  .object({ purpose: z.enum(["product", "article"]).optional() })
  .strict(); // folder is chosen from an allowlist, never a client path
admin.post(
  "/uploads/product-image",
  requireAnyPermission("products:write", "content:write"),
  validate({ query: uploadQuery }),
  (req, _res, next) =>
    req.query.purpose &&
    !can(req.staff.role, PURPOSE_PERMISSION[req.query.purpose])
      ? next(ApiError.forbidden("INSUFFICIENT_PERMISSIONS"))
      : next(), // an explicit purpose needs that purpose's permission
  (req, res, next) =>
    upload.single("file")(req, res, (err) => {
      if (err?.code === "LIMIT_FILE_SIZE")
        return next(
          new ApiError(
            413,
            "FILE_TOO_LARGE",
            `Images must be ${Math.round((storage.maxBytes / 1024 / 1024) * 10) / 10} MB or smaller`,
          ),
        );
      if (err?.name === "MulterError")
        return next(
          ApiError.badRequest(
            "BAD_UPLOAD",
            'Send exactly one image in the "file" field',
          ),
        );
      next(err);
    }),
  h(async (req, res) => {
    if (!req.file)
      throw ApiError.badRequest("NO_FILE", "Choose an image to upload");
    const purpose = req.query.purpose ?? "product";
    const saved = await media.uploadImage(req.file.buffer, {
      purpose,
      staffId: req.staff._id,
    });
    await audit(req, {
      action: "image.uploaded",
      resource: "Image",
      resourceId: saved.assetId ?? saved.url,
      metadata: { bytes: saved.bytes, purpose },
    });
    ok(
      res,
      {
        url: saved.url,
        assetId: saved.assetId,
        width: saved.width,
        height: saved.height,
        bytes: saved.bytes,
      },
      201,
    );
  }),
);
admin.delete(
  "/uploads/:assetId",
  requireAnyPermission("products:write", "content:write"),
  validate({ params: z.object({ assetId: products.oid }) }),
  h(async (req, res) => {
    await media.discardUpload(req.params.assetId, req.staff._id);
    await audit(req, {
      action: "image.discarded",
      resource: "Image",
      resourceId: req.params.assetId,
    });
    ok(res, { discarded: true });
  }),
);

admin.get(
  "/inventory",
  need("inventory:read"),
  validate({
    query: q({
      low: z
        .enum(["true", "false"])
        .optional()
        .transform((v) => v === "true"),
    }),
  }),
  h(async (req, res) => list(res, await inv.listInventory(req.query))),
);
admin.patch(
  "/inventory/:id",
  need("inventory:write"),
  validate({
    params: id,
    body: z
      .object({
        stock: z.number().int().min(0).max(100000).optional(),
        delta: z.number().int().min(-100000).max(100000).optional(),
        lowStockThreshold: z.number().int().min(0).max(1000).optional(),
        reason: z.string().trim().max(140).optional(),
      })
      .strict()
      .refine((b) => (b.stock !== undefined) + (b.delta !== undefined) <= 1, {
        message: "Send either stock or delta, not both",
      })
      .refine(
        (b) =>
          b.stock !== undefined ||
          b.delta !== undefined ||
          b.lowStockThreshold !== undefined,
        { message: "Nothing to change" },
      ),
  }),
  h(async (req, res) => {
    const { reason, ...change } = req.body;
    const r = await inv.adjustStock(req.params.id, change);
    await audit(req, {
      action: "inventory.adjusted",
      resource: "Inventory",
      resourceId: req.params.id,
      metadata: { sku: r.sku, before: r.before, after: r.after, reason },
    });
    ok(res, r);
  }),
);

const catBody = z
  .object({
    name: z.string().trim().min(2).max(60),
    description: z.string().trim().max(300).optional(),
    genders: z
      .array(z.enum(["men", "women"]))
      .min(1)
      .default(["men", "women"]),
    sortOrder: z.number().int().min(0).max(999).default(0),
    active: z.boolean().default(true),
  })
  .strict();
const colBody = catBody
  .extend({
    season: z.string().trim().max(30).optional(),
    featured: z.boolean().default(false),
  })
  .strict();
for (const [path, Model, body, label] of [
  ["categories", Category, catBody, "category"],
  ["collections", Collection, colBody, "collection"],
]) {
  admin.get(
    `/${path}`,
    need("products:read"),
    h(async (_req, res) =>
      ok(res, await Model.find().sort({ sortOrder: 1, name: 1 }).lean()),
    ),
  );
  admin.post(
    `/${path}`,
    need("products:write"),
    validate({ body }),
    h(async (req, res) => {
      const doc = await Model.create({
        ...req.body,
        slug: slugify(req.body.name),
      });
      await audit(req, {
        action: `${label}.created`,
        resource: label,
        resourceId: doc._id,
        metadata: { name: doc.name },
      });
      ok(res, doc, 201);
    }),
  );
  admin.patch(
    `/${path}/:id`,
    need("products:write"),
    validate({ params: id, body: body.partial() }),
    h(async (req, res) => {
      const doc = await Model.findByIdAndUpdate(
        req.params.id,
        { $set: req.body },
        { new: true, runValidators: true },
      );
      if (!doc) throw ApiError.notFound("NOT_FOUND", `${label} not found`);
      await audit(req, {
        action: `${label}.updated`,
        resource: label,
        resourceId: doc._id,
        metadata: { fields: Object.keys(req.body) },
      });
      ok(res, doc);
    }),
  );
  admin.delete(
    `/${path}/:id`,
    need("products:write"),
    validate({ params: id }),
    h(async (req, res) => {
      const used = await Product.exists(
        path === "categories"
          ? { category: req.params.id }
          : { collections: req.params.id },
      );
      if (used)
        throw ApiError.conflict(
          "IN_USE",
          `This ${label} still has products. Deactivate it instead.`,
        );
      const doc = await Model.findByIdAndDelete(req.params.id);
      if (!doc) throw ApiError.notFound("NOT_FOUND", `${label} not found`);
      await audit(req, {
        action: `${label}.deleted`,
        resource: label,
        resourceId: doc._id,
        metadata: { name: doc.name },
      });
      ok(res, { deleted: true });
    }),
  );
}

admin.get(
  "/orders",
  need("orders:read"),
  validate({
    query: q({
      status: z
        .enum([
          "confirmed",
          "processing",
          "packed",
          "shipped",
          "out_for_delivery",
          "delivered",
          "cancelled",
          "refunded",
          "pending_payment",
        ])
        .optional(),
      attention: z
        .enum(["true", "false"])
        .optional()
        .transform((v) => v === "true"),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
    }),
  }),
  h(async (req, res) => list(res, await orders.listOrders(req.query))),
);
admin.get(
  "/orders/:id",
  need("orders:read"),
  validate({ params: id }),
  h(async (req, res) => ok(res, await orders.getOrder(req.params.id))),
);
admin.post(
  "/orders/:id/status",
  need("orders:write"),
  validate({
    params: id,
    body: z
      .object({
        status: z.enum([
          "processing",
          "packed",
          "shipped",
          "out_for_delivery",
          "delivered",
          "cancelled",
        ]),
        note: z.string().trim().max(200).optional(),
      })
      .strict(),
  }),
  h(async (req, res) => {
    const { before, order } = await orders.updateStatus(
      req.params.id,
      req.body.status,
      req.staff,
      req.body.note,
    );
    await audit(req, {
      action: "order.status_changed",
      resource: "Order",
      resourceId: order._id,
      metadata: {
        orderNumber: order.orderNumber,
        from: before,
        to: order.status,
        note: req.body.note,
      },
    });
    ok(res, await orders.getOrder(order._id));
  }),
);

admin.get(
  "/returns",
  need("returns:manage"),
  validate({
    query: z.object({
      ...pageQ,
      status: z
        .enum([
          "requested",
          "approved",
          "rejected",
          "received",
          "refunded",
          "withdrawn",
        ])
        .optional(),
    }),
  }),
  h(async (req, res) => list(res, await returns.listReturns(req.query))),
);
admin.get(
  "/returns/:id",
  need("returns:manage"),
  validate({ params: id }),
  h(async (req, res) => ok(res, await returns.getReturn(req.params.id))),
);
admin.post(
  "/returns/:id/decision",
  need("returns:manage"),
  validate({
    params: id,
    body: z
      .object({
        action: z.enum(["approve", "reject", "receive"]),
        note: z.string().trim().max(300).optional(),
        refundAmount: z.number().int().min(100).optional(),
        restock: z.boolean().optional(),
      })
      .strict(),
  }),
  h(async (req, res) => {
    const r = await returns.decide(
      req.params.id,
      req.body.action,
      req.staff,
      req.body,
    );
    await audit(req, {
      action: `return.${req.body.action}`,
      resource: "ReturnRequest",
      resourceId: r._id,
      metadata: {
        returnNumber: r.returnNumber,
        note: req.body.note,
        refundAmount: req.body.refundAmount,
        restock: req.body.restock,
      },
    });
    ok(res, await returns.getReturn(r._id));
  }),
);
admin.get(
  "/refunds",
  need("refunds:process"),
  validate({
    query: z.object({
      ...pageQ,
      status: z
        .enum(["pending", "processing", "processed", "failed"])
        .optional(),
    }),
  }),
  h(async (req, res) => list(res, await refunds.listRefunds(req.query))),
);
admin.post(
  "/refunds/:id/process",
  need("refunds:process"),
  validate({ params: id }),
  h(async (req, res) => {
    const r = await refunds.processRefund(req.params.id, req.staff);
    await audit(req, {
      action: "refund.processed",
      resource: "Refund",
      resourceId: r._id,
      metadata: { amount: r.amount, providerRefundId: r.providerRefundId },
    });
    ok(res, {
      id: r._id,
      status: r.status,
      providerRefundId: r.providerRefundId,
    });
  }),
);

admin.get(
  "/customers",
  need("customers:read"),
  validate({
    query: q({ status: z.enum(["active", "suspended"]).optional() }),
  }),
  h(async (req, res) => list(res, await customers.listCustomers(req.query))),
);
admin.get(
  "/customers/:id",
  need("customers:read"),
  validate({ params: id }),
  h(async (req, res) => ok(res, await customers.getCustomer(req.params.id))),
);
admin.patch(
  "/customers/:id/status",
  need("customers:manage"),
  validate({
    params: id,
    body: z.object({ status: z.enum(["active", "suspended"]) }).strict(),
  }),
  h(async (req, res) => {
    const u = await customers.setStatus(req.params.id, req.body.status);
    await audit(req, {
      action: `customer.${req.body.status === "suspended" ? "suspended" : "reactivated"}`,
      resource: "User",
      resourceId: u._id,
      metadata: { email: u.email },
    });
    ok(res, { id: u._id, status: u.status });
  }),
);

admin.get(
  "/coupons",
  need("coupons:write"),
  h(async (_req, res) => ok(res, await coupons.listCoupons())),
);
admin.post(
  "/coupons",
  need("coupons:write"),
  validate({ body: coupons.couponBody }),
  h(async (req, res) => {
    const c = await coupons.createCoupon(req.body);
    await audit(req, {
      action: "coupon.created",
      resource: "Coupon",
      resourceId: c._id,
      metadata: { code: c.code, type: c.type, value: c.value },
    });
    ok(res, c, 201);
  }),
);
admin.patch(
  "/coupons/:id",
  need("coupons:write"),
  validate({ params: id, body: coupons.couponUpdate }),
  h(async (req, res) => {
    const { coupon, before } = await coupons.updateCoupon(
      req.params.id,
      req.body,
    );
    await audit(req, {
      action:
        req.body.active !== undefined && req.body.active !== before.active
          ? req.body.active
            ? "coupon.enabled"
            : "coupon.disabled"
          : "coupon.updated",
      resource: "Coupon",
      resourceId: coupon._id,
      metadata: { code: coupon.code, fields: Object.keys(req.body), before },
    });
    ok(res, coupon);
  }),
);

admin.get(
  "/audit-logs",
  need("audit:read"),
  validate({ query: q({ action: z.string().max(60).optional() }) }),
  h(async (req, res) => {
    const f = {};
    if (req.query.action)
      f.action = { $regex: `^${req.query.action.replace(/[^a-z._]/gi, "")}` };
    if (req.query.q)
      f.actorEmail = {
        $regex: req.query.q.replace(/[^a-z0-9@._-]/gi, ""),
        $options: "i",
      };
    const [rows, total] = await Promise.all([
      AdminAuditLog.find(f)
        .sort({ createdAt: -1 })
        .skip((req.query.page - 1) * req.query.limit)
        .limit(req.query.limit)
        .lean(),
      AdminAuditLog.countDocuments(f),
    ]);
    ok(
      res,
      rows.map((l) => ({
        id: l._id,
        actor: l.actorEmail,
        action: l.action,
        resource: l.resource,
        resourceId: l.resourceId,
        metadata: l.metadata,
        ip: l.ip,
        at: l.createdAt,
      })),
      200,
      {
        pagination: {
          page: req.query.page,
          limit: req.query.limit,
          total,
          pages: Math.max(1, Math.ceil(total / req.query.limit)),
        },
      },
    );
  }),
);
