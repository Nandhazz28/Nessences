import { z } from "zod";
import { Product } from "../models/Product.js";
import { Category } from "../models/Category.js";
import { Collection } from "../models/Collection.js";
import { ProductVariant } from "../models/ProductVariant.js";
import { Inventory } from "../models/Inventory.js";
import { ApiError } from "../utils/ApiError.js";
import { deliveryUrl, deliverySrcSet } from "./imageUrls.js";

const csv = z
  .string()
  .max(300)
  .optional()
  .transform((s) =>
    s
      ? s
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
          .slice(0, 20)
      : undefined,
  );
const bool = z
  .enum(["true", "false"])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === "true"));

export const listQuerySchema = z.object({
  gender: z.enum(["men", "women"]).optional(),
  category: csv,
  collection: csv,
  size: csv,
  color: csv,
  slugs: csv,
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  availability: z.enum(["in_stock"]).optional(),
  sale: bool,
  newArrivals: bool,
  q: z.string().trim().min(2).max(80).optional(),
  sort: z
    .enum(["featured", "newest", "price_asc", "price_desc", "relevance"])
    .default("featured"),
  page: z.coerce.number().int().min(1).max(500).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(12),
});

const SORTS = {
  featured: { featured: -1, publishedAt: -1, _id: 1 },
  newest: { publishedAt: -1, _id: 1 },
  price_asc: { effectivePrice: 1, _id: 1 },
  price_desc: { effectivePrice: -1, _id: 1 },
};

export function toListItem(p) {
  const images = [...(p.images ?? [])].sort((a, b) => a.order - b.order);
  return {
    id: p._id,
    slug: p.slug,
    name: p.name,
    gender: p.gender,
    category:
      p.category && p.category.name
        ? { name: p.category.name, slug: p.category.slug }
        : undefined,
    price: p.price,
    salePrice: p.salePrice ?? null,
    effectivePrice: p.effectivePrice,
    images: images
      .slice(0, 4)
      .map((i, n) => ({
        url: deliveryUrl(i, "card"),
        ...(n < 2 && deliverySrcSet(i, "card")
          ? { srcSet: deliverySrcSet(i, "card") }
          : {}),
        alt: i.alt,
        color: i.color,
      })),
    colors: p.colorOptions ?? [],
    sizes: p.facets?.sizes ?? [],
    inStock: Boolean(p.facets?.inStock),
    isNew: Boolean(p.newArrivalUntil && p.newArrivalUntil > new Date()),
    ratingAvg: p.ratingAvg,
    ratingCount: p.ratingCount,
  };
}

async function buildFilter(q) {
  const f = { status: "published" };
  if (q.gender) f.gender = q.gender;
  if (q.slugs) f.slug = { $in: q.slugs.map((x) => x.toLowerCase()) };
  if (q.category) {
    const cats = await Category.find({
      slug: { $in: q.category },
      active: true,
    })
      .select("_id")
      .lean();
    f.category = { $in: cats.map((c) => c._id) };
  }
  if (q.collection) {
    const cols = await Collection.find({
      slug: { $in: q.collection },
      active: true,
    })
      .select("_id")
      .lean();
    f.collections = { $in: cols.map((c) => c._id) };
  }
  if (q.size) f["facets.sizes"] = { $in: q.size };
  if (q.color) f["facets.colors"] = { $in: q.color };
  if (q.minPrice != null || q.maxPrice != null) {
    f.effectivePrice = {};
    if (q.minPrice != null) f.effectivePrice.$gte = q.minPrice;
    if (q.maxPrice != null) f.effectivePrice.$lte = q.maxPrice;
  }
  if (q.availability === "in_stock") f["facets.inStock"] = true;
  if (q.sale) f.salePrice = { $gt: 0 };
  if (q.newArrivals) f.newArrivalUntil = { $gte: new Date() };
  if (q.q) f.$text = { $search: q.q };
  return f;
}

export async function listProducts(q) {
  const filter = await buildFilter(q);
  const skip = (q.page - 1) * q.limit;
  const useScore = q.q && (q.sort === "relevance" || q.sort === "featured");
  const sort = useScore
    ? { score: { $meta: "textScore" }, _id: 1 }
    : (SORTS[q.sort] ?? SORTS.featured);
  const query = Product.find(
    filter,
    useScore ? { score: { $meta: "textScore" } } : undefined,
  )
    .populate("category", "name slug")
    .sort(sort)
    .skip(skip)
    .limit(q.limit)
    .lean();

  const [items, total, facetAgg] = await Promise.all([
    query,
    Product.countDocuments(filter),
    Product.aggregate([
      { $match: filter },
      {
        $facet: {
          colors: [
            { $unwind: "$colorOptions" },
            {
              $group: {
                _id: { name: "$colorOptions.name", hex: "$colorOptions.hex" },
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1 } },
          ],
          sizes: [
            { $unwind: "$facets.sizes" },
            { $group: { _id: "$facets.sizes", count: { $sum: 1 } } },
          ],
          price: [
            {
              $group: {
                _id: null,
                min: { $min: "$effectivePrice" },
                max: { $max: "$effectivePrice" },
              },
            },
          ],
        },
      },
    ]),
  ]);
  const fa = facetAgg[0] ?? {};
  return {
    items: items.map(toListItem),
    pagination: {
      page: q.page,
      limit: q.limit,
      total,
      pages: Math.max(1, Math.ceil(total / q.limit)),
    },
    facets: {
      colors: (fa.colors ?? []).map((c) => ({ ...c._id, count: c.count })),
      sizes: (fa.sizes ?? []).map((s) => ({ size: s._id, count: s.count })),
      price: fa.price?.[0]
        ? { min: fa.price[0].min, max: fa.price[0].max }
        : null,
    },
  };
}

export async function getProductBySlug(slug) {
  const p = await Product.findOne({ slug, status: "published" })
    .populate("category", "name slug")
    .populate("collections", "name slug")
    .lean();
  if (!p)
    throw ApiError.notFound(
      "PRODUCT_NOT_FOUND",
      "This product could not be found",
    );
  const variants = await ProductVariant.find({
    product: p._id,
    active: true,
  }).lean();
  const inv = await Inventory.find({ product: p._id }).lean();
  const invBy = new Map(inv.map((i) => [String(i.variant), i]));
  // A product whose category was deleted or deactivated must still render (category is null after populate), just without category-based suggestions.
  const relatedBy = [
    ...(p.category?._id
      ? [{ category: p.category._id, gender: p.gender }]
      : []),
    ...(p.collections?.length
      ? [{ collections: { $in: p.collections.map((c) => c._id) } }]
      : []),
  ];
  const related =
    relatedBy.length === 0
      ? []
      : await Product.find({
          status: "published",
          _id: { $ne: p._id },
          $or: relatedBy,
        })
          .populate("category", "name slug")
          .sort({ featured: -1, publishedAt: -1 })
          .limit(5)
          .lean();
  return {
    ...toListItem(p),
    description: p.description,
    materials: p.materials,
    care: p.care,
    details: p.details,
    collections: p.collections ?? [],
    seo: p.seo,
    images: [...p.images]
      .sort((a, b) => a.order - b.order)
      .map((i) => ({
        id: i._id,
        url: deliveryUrl(i, "detail"),
        alt: i.alt,
        color: i.color,
      })),
    variants: variants.map((v) => {
      const i = invBy.get(String(v._id));
      const available = i ? Math.max(0, i.stock - i.reserved) : 0;
      return {
        id: v._id,
        sku: v.sku,
        color: v.color,
        size: v.size,
        available: Math.min(available, 10),
        status:
          available <= 0
            ? "out_of_stock"
            : available <= (i?.lowStockThreshold ?? 5)
              ? "low_stock"
              : "in_stock",
      };
    }),
    related: related.map(toListItem),
  };
}

export const listCategories = (gender) =>
  Category.find({ active: true, ...(gender ? { genders: gender } : {}) })
    .sort({ sortOrder: 1 })
    .select("name slug genders description")
    .lean();
export const listCollections = () =>
  Collection.find({ active: true })
    .sort({ featured: -1, sortOrder: 1 })
    .select("name slug description season genders featured")
    .lean();
export async function getCollection(slug) {
  const c = await Collection.findOne({ slug, active: true }).lean();
  if (!c)
    throw ApiError.notFound("COLLECTION_NOT_FOUND", "Collection not found");
  return c;
}
