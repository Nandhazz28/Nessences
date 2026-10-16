import { Cart } from "../models/Cart.js";
import { Product } from "../models/Product.js";
import { ProductVariant } from "../models/ProductVariant.js";
import { Inventory } from "../models/Inventory.js";
import { Coupon } from "../models/Coupon.js";
import { COMMERCE } from "../config/commerce.js";
import { ApiError } from "../utils/ApiError.js";
import { deliveryUrl } from "./imageUrls.js";
import { evaluateCoupon, computeTotals } from "./pricing.js";

export async function getCart(key, { create = false } = {}) {
  let cart = await Cart.findOne(key);

  if (!cart && create) {
    try {
      cart = await Cart.create({
        ...key,
        ...(key.guestId
          ? {
              expiresAt: new Date(
                Date.now() + COMMERCE.guestCartDays * 86400000,
              ),
            }
          : {}),
      });
    } catch (e) {
      if (e.code !== 11000) throw e;
      cart = await Cart.findOne(key);
    }
  }

  return cart;
}

const unit = (p) =>
  p.salePrice != null && p.salePrice < p.price ? p.salePrice : p.price;

const stockOf = (inv) => (inv ? Math.max(0, inv.stock - inv.reserved) : 0);

async function loadSellable(variantId) {
  const v = await ProductVariant.findById(variantId).lean();

  const p =
    v &&
    (await Product.findOne({
      _id: v.product,
      status: "published",
    })
      .select("_id")
      .lean());

  if (!v || !v.active || !p) {
    throw ApiError.notFound(
      "VARIANT_UNAVAILABLE",
      "This item is no longer available",
    );
  }

  const inv = await Inventory.findOne({
    variant: v._id,
  }).lean();

  return { v, available: stockOf(inv) };
}

function assertQty(qty, available) {
  if (available <= 0) {
    throw ApiError.conflict("OUT_OF_STOCK", "Sorry, this size is out of stock");
  }

  if (qty > COMMERCE.maxLineQty) {
    throw ApiError.conflict(
      "MAX_QTY",
      `You can buy up to ${COMMERCE.maxLineQty} of each item`,
    );
  }

  if (qty > available) {
    throw ApiError.conflict(
      "INSUFFICIENT_STOCK",
      `Only ${available} left in this size`,
    );
  }
}

export async function addItem(cart, variantId, qty) {
  const { v, available } = await loadSellable(variantId);

  const existing = cart.items.find((i) => String(i.variant) === String(v._id));

  assertQty((existing?.qty ?? 0) + qty, available);

  if (existing) {
    existing.qty += qty;
  } else {
    cart.items.push({
      variant: v._id,
      product: v.product,
      qty,
    });
  }

  cart.saved = cart.saved.filter((i) => String(i.variant) !== String(v._id));

  await cart.save();
}

export async function setQty(cart, variantId, qty) {
  const line = cart.items.find((i) => String(i.variant) === String(variantId));

  if (!line) {
    throw ApiError.notFound("LINE_NOT_FOUND", "That item is not in your bag");
  }

  const { available } = await loadSellable(variantId);

  assertQty(qty, available);

  line.qty = qty;

  await cart.save();
}

export async function removeItem(cart, variantId) {
  cart.items = cart.items.filter(
    (i) => String(i.variant) !== String(variantId),
  );

  await cart.save();
}

export async function saveForLater(cart, variantId) {
  const line = cart.items.find((i) => String(i.variant) === String(variantId));

  if (!line) {
    throw ApiError.notFound("LINE_NOT_FOUND", "That item is not in your bag");
  }

  cart.saved = [
    ...cart.saved.filter((i) => String(i.variant) !== String(variantId)),
    {
      variant: line.variant,
      product: line.product,
      qty: line.qty,
    },
  ];

  cart.items = cart.items.filter(
    (i) => String(i.variant) !== String(variantId),
  );

  await cart.save();
}

export async function moveToBag(cart, variantId) {
  const line = cart.saved.find((i) => String(i.variant) === String(variantId));

  if (!line) {
    throw ApiError.notFound("LINE_NOT_FOUND", "That item is not saved");
  }

  await addItem(cart, variantId, Math.min(line.qty, COMMERCE.maxLineQty));
}

export async function applyCoupon(cart, code) {
  const view = await buildView(cart);

  const coupon = await Coupon.findOne({
    code: String(code).toUpperCase(),
  });

  evaluateCoupon(coupon, view.totals.subtotal);

  cart.couponCode = coupon.code;

  await cart.save();
}

export async function removeCoupon(cart) {
  cart.couponCode = undefined;
  await cart.save();
}

export async function mergeGuestCart(user, guestId) {
  if (!guestId) return;

  const guest = await Cart.findOneAndDelete({ guestId });

  if (!guest) return;

  try {
    const mine = await getCart({ user: user._id }, { create: true });

    for (const l of guest.items) {
      try {
        const { available } = await loadSellable(l.variant);

        const have =
          mine.items.find((i) => String(i.variant) === String(l.variant))
            ?.qty ?? 0;

        const add = Math.min(
          l.qty,
          available - have,
          COMMERCE.maxLineQty - have,
        );

        if (add > 0) {
          await addItem(mine, l.variant, add);
        }
      } catch (e) {
        if (!(e instanceof ApiError)) throw e;
        // Item is no longer sellable; skip it.
      }
    }

    for (const l of guest.saved) {
      const v = String(l.variant);

      if (
        mine.items.some((i) => String(i.variant) === v) ||
        mine.saved.some((i) => String(i.variant) === v)
      ) {
        continue;
      }

      mine.saved.push({
        variant: l.variant,
        product: l.product,
        qty: l.qty,
      });
    }

    if (!mine.couponCode && guest.couponCode) {
      mine.couponCode = guest.couponCode;
    }

    await mine.save();
  } catch (err) {
    // Restore the guest cart if merging fails.
    await Cart.create({
      guestId,
      items: guest.items,
      saved: guest.saved,
      couponCode: guest.couponCode,
      expiresAt: guest.expiresAt,
    }).catch(() => {});

    throw err;
  }
}

async function hydrate(lines = []) {
  const vIds = lines.map((l) => l.variant);

  const [variants, inv] = await Promise.all([
    ProductVariant.find({
      _id: { $in: vIds },
    }).lean(),

    Inventory.find({
      variant: { $in: vIds },
    }).lean(),
  ]);

  const products = await Product.find({
    _id: { $in: variants.map((v) => v.product) },
  })
    .select("name slug status images price salePrice effectivePrice")
    .lean();

  const vMap = new Map(variants.map((v) => [String(v._id), v]));

  const pMap = new Map(products.map((p) => [String(p._id), p]));

  const iMap = new Map(inv.map((i) => [String(i.variant), i]));

  return lines.map((l) => {
    const v = vMap.get(String(l.variant));
    const p = v && pMap.get(String(v.product));

    const base = {
      variantId: l.variant,
      qty: l.qty,
    };

    if (!v || !v.active || !p || p.status !== "published") {
      return {
        ...base,
        status: "unavailable",
        name: p?.name ?? "Unavailable item",
        unitPrice: 0,
        lineTotal: 0,
        available: 0,
      };
    }

    const available = stockOf(iMap.get(String(v._id)));

    // FIX: Product images may be missing or stored in an invalid format.
    const productImages = Array.isArray(p.images) ? p.images : [];

    const matchingImage = productImages
      .filter((i) => i && i.color === v.color?.name)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0];

    const img = matchingImage ?? productImages[0] ?? null;

    const status =
      available <= 0
        ? "out_of_stock"
        : l.qty > available
          ? "insufficient"
          : available <= 5
            ? "low_stock"
            : "ok";

    return {
      ...base,
      productId: p._id,
      slug: p.slug,
      name: p.name,
      color: v.color?.name,
      size: v.size,
      sku: v.sku,

      image: img
        ? {
            url: deliveryUrl(img, "thumb"),
            alt: img.alt,
            ...(img.publicId ? { publicId: img.publicId } : {}),
          }
        : null,

      price: p.price,
      unitPrice: unit(p),
      lineTotal: unit(p) * l.qty,

      available: Math.min(available, COMMERCE.maxLineQty),

      status,
    };
  });
}

export async function buildView(cart, { delivery = "standard" } = {}) {
  if (!cart) {
    cart = {
      items: [],
      saved: [],
    };
  }

  const [items, saved] = await Promise.all([
    hydrate(cart.items ?? []),
    hydrate(cart.saved ?? []),
  ]);

  const buyable = items.filter(
    (i) => i.status !== "unavailable" && i.status !== "out_of_stock",
  );

  const subtotal = buyable.reduce((s, i) => s + i.lineTotal, 0);

  const itemCount = buyable.reduce((s, i) => s + i.qty, 0);

  let discount = 0;
  let coupon = null;
  let couponError = null;

  if (cart.couponCode) {
    try {
      const c = await Coupon.findOne({
        code: cart.couponCode,
      });

      discount = evaluateCoupon(c, subtotal);

      coupon = {
        code: c.code,
        description: c.description,
        discount,
      };
    } catch (e) {
      couponError = {
        code: e.code,
        message: e.message,
      };
    }
  }

  const issues = items.some(
    (i) => i.status !== "ok" && i.status !== "low_stock",
  );

  return {
    items,
    saved,
    coupon,
    couponError,

    totals: computeTotals(subtotal, discount, itemCount, delivery),

    canCheckout: items.length > 0 && !issues,
  };
}
