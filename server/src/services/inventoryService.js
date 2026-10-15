import { Product } from "../models/Product.js";
import { ProductVariant } from "../models/ProductVariant.js";
import { Inventory } from "../models/Inventory.js";

export const SIZE_ORDER = [
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "28",
  "30",
  "32",
  "34",
  "36",
  "38",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "One Size",
];
const sizeRank = (s) => {
  const i = SIZE_ORDER.indexOf(s);
  return i === -1 ? 99 : i;
};

export async function syncProductFacets(productId) {
  const [variants, inv] = await Promise.all([
    ProductVariant.find({ product: productId, active: true }).lean(),
    Inventory.find({ product: productId }).lean(),
  ]);
  const avail = new Map(
    inv.map((i) => [String(i.variant), i.stock - i.reserved]),
  );
  const colorMap = new Map();
  const sizes = new Set();
  let inStock = false;
  for (const v of variants) {
    colorMap.set(v.color.name, v.color.hex);
    sizes.add(v.size);
    if ((avail.get(String(v._id)) ?? 0) > 0) inStock = true;
  }
  await Product.updateOne(
    { _id: productId },
    {
      $set: {
        "facets.colors": [...colorMap.keys()],
        "facets.sizes": [...sizes].sort((a, b) => sizeRank(a) - sizeRank(b)),
        "facets.inStock": inStock,
        colorOptions: [...colorMap].map(([name, hex]) => ({ name, hex })),
      },
    },
  );
}

export async function reserveStock(variantId, qty) {
  const res = await Inventory.updateOne(
    {
      variant: variantId,
      $expr: { $gte: [{ $subtract: ["$stock", "$reserved"] }, qty] },
    },
    { $inc: { reserved: qty } },
  );
  return res.modifiedCount === 1;
}
