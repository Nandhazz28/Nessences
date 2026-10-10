import { Inventory } from '../../models/Inventory.js';
import { ApiError } from '../../utils/ApiError.js';
import { escapeRegex } from '../../utils/slug.js';
import { syncProductFacets } from '../inventoryService.js';

export async function listInventory({ q, low, page, limit }) {
  const f = {};
  if (q) f.sku = { $regex: escapeRegex(q.toUpperCase()) };
  if (low) f.$expr = { $lte: [{ $subtract: ['$stock', '$reserved'] }, '$lowStockThreshold'] };
  const [rows, total] = await Promise.all([
    Inventory.find(f).populate('product', 'name slug status').populate('variant', 'color size active').sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean({ virtuals: true }),
    Inventory.countDocuments(f)]);
  return { items: rows.map((i) => ({ variantId: i.variant?._id, sku: i.sku, product: i.product?.name, productId: i.product?._id, status: i.product?.status, color: i.variant?.color?.name, size: i.variant?.size, active: i.variant?.active, stock: i.stock, reserved: i.reserved, available: i.stock - i.reserved, lowStockThreshold: i.lowStockThreshold })), pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } };
}

// Atomic: never lets stock drop below what is already reserved by unpaid/paid-but-uncommitted orders.
export async function adjustStock(variantId, { stock, delta, lowStockThreshold }) {
  const set = {}; const filter = { variant: variantId };
  if (lowStockThreshold !== undefined) set.lowStockThreshold = lowStockThreshold;
  let update = { $set: set };
  if (stock !== undefined) { filter.reserved = { $lte: stock }; set.stock = stock; }
  else if (delta !== undefined) { filter.$expr = { $gte: [{ $add: ['$stock', delta] }, '$reserved'] }; update = { $set: set, $inc: { stock: delta } }; }
  const before = await Inventory.findOneAndUpdate(filter, update, { new: false });
  if (!before) {
    if (!(await Inventory.exists({ variant: variantId }))) throw ApiError.notFound('INVENTORY_NOT_FOUND', 'Inventory record not found');
    throw ApiError.conflict('BELOW_RESERVED', 'Stock cannot be set below the quantity already reserved for customers');
  }
  await syncProductFacets(before.product);
  const after = await Inventory.findOne({ variant: variantId });
  return { sku: after.sku, before: { stock: before.stock, lowStockThreshold: before.lowStockThreshold }, after: { stock: after.stock, lowStockThreshold: after.lowStockThreshold, reserved: after.reserved, available: after.stock - after.reserved } };
}
