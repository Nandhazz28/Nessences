import { Wishlist } from "../models/Wishlist.js";
import { Product } from "../models/Product.js";
import { ApiError } from "../utils/ApiError.js";
import { toListItem } from "./catalogService.js";

export async function listWishlist(userId) {
  const w = await Wishlist.findOne({ user: userId }).lean();
  if (!w?.products.length) return [];
  const products = await Product.find({
    _id: { $in: w.products.map((p) => p.product) },
    status: "published",
  })
    .populate("category", "name slug")
    .lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));
  return w.products
    .map((x) => byId.get(String(x.product)))
    .filter(Boolean)
    .reverse()
    .map(toListItem);
}
export async function addToWishlist(userId, productId) {
  if (!(await Product.exists({ _id: productId, status: "published" })))
    throw ApiError.notFound(
      "PRODUCT_NOT_FOUND",
      "This product is no longer available",
    );
  try {
    await Wishlist.updateOne(
      { user: userId },
      { $setOnInsert: { user: userId } },
      { upsert: true },
    );
  } catch (e) {
    if (e.code !== 11000) throw e;
  } // concurrent first-insert: the document already exists
  await Wishlist.updateOne(
    { user: userId, "products.product": { $ne: productId } },
    { $push: { products: { product: productId } } },
  );
}
export const removeFromWishlist = (userId, productId) =>
  Wishlist.updateOne(
    { user: userId },
    { $pull: { products: { product: productId } } },
  );
