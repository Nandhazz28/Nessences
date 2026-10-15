import { z } from 'zod';
import { Product } from '../../models/Product.js';
import { ProductVariant } from '../../models/ProductVariant.js';
import { Inventory } from '../../models/Inventory.js';
import { Category } from '../../models/Category.js';
import { Collection } from '../../models/Collection.js';
import { Order } from '../../models/Order.js';
import { ApiError } from '../../utils/ApiError.js';
import { slugify, escapeRegex } from '../../utils/slug.js';
import { syncProductFacets } from '../inventoryService.js';
import { media } from '../mediaService.js';
import { isAllowedImageUrl, deliveryUrl } from '../imageUrls.js';

const oid = z.string().regex(/^[a-f0-9]{24}$/, 'Invalid id');
export const colorSpec = z.object({ name: z.string().trim().min(1).max(30), hex: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a #RRGGBB colour') });
const image = z.object({ url: z.string().refine(isAllowedImageUrl, 'Upload images through the image uploader'), alt: z.string().trim().min(3).max(140), color: z.string().max(30).optional() });
export const variantsSpec = z.object({ colors: z.array(colorSpec).min(1).max(12), sizes: z.array(z.string().trim().min(1).max(10)).min(1).max(15), stock: z.number().int().min(0).max(100000).default(0), lowStockThreshold: z.number().int().min(0).max(1000).default(5) });

export const productBody = z.object({
  name: z.string().trim().min(2).max(140), slug: z.string().regex(/^[a-z0-9-]{2,90}$/).optional(),
  description: z.string().trim().min(10).max(4000), gender: z.enum(['men', 'women']), categoryId: oid, collectionIds: z.array(oid).max(10).default([]),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).default([]),
  price: z.number().int().min(100), salePrice: z.number().int().min(100).nullable().optional(),
  materials: z.string().trim().max(300).optional(), care: z.array(z.string().trim().max(120)).max(10).default([]), details: z.array(z.string().trim().max(120)).max(10).default([]),
  status: z.enum(['draft', 'published', 'archived']).default('draft'), featured: z.boolean().default(false), newArrival: z.boolean().default(false),
  seo: z.object({ title: z.string().trim().max(70).optional(), description: z.string().trim().max(160).optional() }).optional(),
  images: z.array(image).max(20).default([]),
}).strict();
export const createBody = productBody.extend({ variants: variantsSpec.optional() }).strict();
export const updateBody = productBody.partial().strict();

const uniqueSlug = async (base, ignoreId) => {
  let slug = slugify(base) || 'product'; let n = 1;
  while (await Product.exists({ slug, ...(ignoreId ? { _id: { $ne: ignoreId } } : {}) })) slug = `${slugify(base)}-${++n}`;
  return slug;
};
async function assertRefs(categoryId, collectionIds = []) {
  if (categoryId && !(await Category.exists({ _id: categoryId }))) throw ApiError.badRequest('CATEGORY_NOT_FOUND', 'Choose a valid category');
  if (collectionIds.length && (await Collection.countDocuments({ _id: { $in: collectionIds } })) !== collectionIds.length) throw ApiError.badRequest('COLLECTION_NOT_FOUND', 'One of the collections does not exist');
}
async function assertPublishable(product) {
  if (!product.images.length) throw ApiError.badRequest('NOT_PUBLISHABLE', 'Add at least one image before publishing');
  if (!(await ProductVariant.exists({ product: product._id, active: true }))) throw ApiError.badRequest('NOT_PUBLISHABLE', 'Add at least one colour/size variant before publishing');
}
const toDoc = (b) => ({
  ...(b.name !== undefined && { name: b.name }), ...(b.description !== undefined && { description: b.description }), ...(b.gender && { gender: b.gender }),
  ...(b.categoryId && { category: b.categoryId }), ...(b.collectionIds && { collections: b.collectionIds }), ...(b.tags && { tags: b.tags }),
  ...(b.price !== undefined && { price: b.price }), ...(b.salePrice !== undefined && { salePrice: b.salePrice }),
  ...(b.materials !== undefined && { materials: b.materials }), ...(b.care && { care: b.care }), ...(b.details && { details: b.details }),
  ...(b.status && { status: b.status }), ...(b.featured !== undefined && { featured: b.featured }), ...(b.seo && { seo: b.seo }),
  ...(b.images && { images: b.images.map((im, order) => ({ ...im, order })) }),
  ...(b.newArrival !== undefined && { newArrivalUntil: b.newArrival ? new Date(Date.now() + 60 * 86400000) : null }),
});

async function addVariants(product, spec) {
  const made = [];
  for (const c of spec.colors) for (const size of spec.sizes) {
    if (await ProductVariant.exists({ product: product._id, 'color.name': c.name, size })) continue;
    let sku = `NS-${slugify(product.name).toUpperCase().replace(/-/g, '').slice(0, 8)}-${c.name.slice(0, 3).toUpperCase()}-${size.replace(/\s/g, '').toUpperCase()}`;
    if (await ProductVariant.exists({ sku })) sku += `-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    const v = await ProductVariant.create({ product: product._id, sku, color: c, size });
    await Inventory.create({ variant: v._id, product: product._id, sku, stock: spec.stock, reserved: 0, lowStockThreshold: spec.lowStockThreshold });
    made.push(v.sku);
  }
  await syncProductFacets(product._id);
  return made;
}

export async function createProduct(body) {
  await assertRefs(body.categoryId, body.collectionIds);
  const { variants, ...rest } = body;
  const slug = await uniqueSlug(body.slug ?? body.name);
  const images = await media.resolveImages(rest.images ?? []); 
  const product = new Product({ ...toDoc({ ...rest, images, status: 'draft' }), slug });
  await product.save();
  await media.markAttached(images);
  if (variants) await addVariants(product, variants);
  if (body.status === 'published') { await assertPublishable(product); product.status = 'published'; await product.save(); }
  return Product.findById(product._id);
}

export async function updateProduct(id, body) {
  const product = await Product.findById(id);
  if (!product) throw ApiError.notFound('PRODUCT_NOT_FOUND', 'Product not found');
  await assertRefs(body.categoryId, body.collectionIds);
  const before = { price: product.price, salePrice: product.salePrice, status: product.status };
  const oldImages = product.images.map((i) => i.toObject());
  const images = body.images ? await media.resolveImages(body.images, { existing: oldImages }) : undefined;
  if (images) body = { ...body, images };
  if (body.slug && body.slug !== product.slug) product.slug = await uniqueSlug(body.slug, product._id);
  product.set(toDoc(body));
  if (body.status === 'published') await assertPublishable(product);
  await product.save();
  if (images) { await media.markAttached(images); await media.release(media.removedBetween(oldImages, images)); } // DB first; old assets only after the save succeeded
  return { product, before };
}

export async function removeOrArchive(id) {
  const product = await Product.findById(id);
  if (!product) throw ApiError.notFound('PRODUCT_NOT_FOUND', 'Product not found');
  const ordered = await Order.exists({ 'items.product': product._id });
  if (ordered || product.status === 'published') { product.status = 'archived'; await product.save(); return { result: 'archived', product }; }
  const images = product.images.map((i) => i.toObject());
  await Promise.all([ProductVariant.deleteMany({ product: product._id }), Inventory.deleteMany({ product: product._id })]);
  await product.deleteOne();
  await media.release(images);
  return { result: 'deleted', product };
}

export async function listProducts({ q, status, gender, category, page, limit }) {
  const f = {};
  if (status) f.status = status; if (gender) f.gender = gender; if (category) f.category = category;
  if (q) f.$or = [{ name: { $regex: escapeRegex(q), $options: 'i' } }, { slug: { $regex: escapeRegex(slugify(q)) } }];
  const [rows, total] = await Promise.all([Product.find(f).populate('category', 'name').sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), Product.countDocuments(f)]);
  const stock = await Inventory.aggregate([{ $match: { product: { $in: rows.map((r) => r._id) } } }, { $group: { _id: '$product', available: { $sum: { $subtract: ['$stock', '$reserved'] } } } }]);
  const sm = new Map(stock.map((s) => [String(s._id), s.available]));
  return { items: rows.map((p) => ({ id: p._id, name: p.name, slug: p.slug, status: p.status, gender: p.gender, category: p.category?.name, price: p.price, salePrice: p.salePrice, image: deliveryUrl(p.images?.[0], 'thumb'), available: sm.get(String(p._id)) ?? 0, updatedAt: p.updatedAt })), pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } };
}

export async function getProduct(id) {
  const p = await Product.findById(id).lean();
  if (!p) throw ApiError.notFound('PRODUCT_NOT_FOUND', 'Product not found');
  const [variants, inv] = await Promise.all([ProductVariant.find({ product: id }).lean(), Inventory.find({ product: id }).lean()]);
  const im = new Map(inv.map((i) => [String(i.variant), i]));
  return { ...p, id: p._id, variants: variants.map((v) => ({ id: v._id, sku: v.sku, color: v.color, size: v.size, active: v.active, stock: im.get(String(v._id))?.stock ?? 0, reserved: im.get(String(v._id))?.reserved ?? 0, lowStockThreshold: im.get(String(v._id))?.lowStockThreshold ?? 5 })) };
}

export const addProductVariants = async (id, spec) => {
  const p = await Product.findById(id); if (!p) throw ApiError.notFound('PRODUCT_NOT_FOUND', 'Product not found');
  return addVariants(p, spec);
};
export async function setVariantActive(variantId, active) {
  const v = await ProductVariant.findByIdAndUpdate(variantId, { $set: { active } }, { new: true });
  if (!v) throw ApiError.notFound('VARIANT_NOT_FOUND', 'Variant not found');
  if (!active) {
    const p = await Product.findById(v.product);
    if (p?.status === 'published' && !(await ProductVariant.exists({ product: v.product, active: true }))) { await ProductVariant.updateOne({ _id: v._id }, { $set: { active: true } }); throw ApiError.badRequest('LAST_VARIANT', 'A published product needs at least one active variant. Archive the product instead.'); }
  }
  await syncProductFacets(v.product);
  return v;
}
export { oid };
