import { Review } from "../../models/Review.js";
import { ReviewReport } from "../../models/ReviewReport.js";
import { Product } from "../../models/Product.js";
import { Order } from "../../models/Order.js";
import { ApiError } from "../../utils/ApiError.js";
import { notify } from "../notificationService.js";

export const AUTO_FLAG_AT = 3;
const displayName = (u) => {
  const [f, ...rest] = String(u?.name ?? "Customer")
    .trim()
    .split(/\s+/);
  return rest.length ? `${f} ${rest[rest.length - 1][0].toUpperCase()}.` : f;
};
const view = (r, own) => ({
  id: r._id,
  rating: r.rating,
  title: r.title,
  body: r.body,
  author: displayName(r.user),
  verified: true,
  createdAt: r.createdAt,
  ...(own ? { status: r.status, moderationNote: r.moderationNote } : {}),
});

export async function recomputeRating(productId) {
  const [a] = await Review.aggregate([
    { $match: { product: productId, status: "approved" } },
    { $group: { _id: null, avg: { $avg: "$rating" }, n: { $sum: 1 } } },
  ]);
  await Product.updateOne(
    { _id: productId },
    {
      $set: {
        ratingAvg: a ? Math.round(a.avg * 10) / 10 : 0,
        ratingCount: a?.n ?? 0,
      },
    },
  );
}

async function productBySlug(slug) {
  const p = await Product.findOne({ slug, status: "published" })
    .select("_id name")
    .lean();
  if (!p) throw ApiError.notFound("PRODUCT_NOT_FOUND", "Product not found");
  return p;
}
const deliveredOrderFor = (userId, productId) =>
  Order.findOne({
    user: userId,
    status: "delivered",
    "items.product": productId,
  })
    .select("_id")
    .lean();

export async function listForProduct(slug, { page, limit, sort }, user) {
  const p = await productBySlug(slug);
  const f = { product: p._id, status: "approved" };
  const order = {
    newest: { createdAt: -1 },
    highest: { rating: -1, createdAt: -1 },
    lowest: { rating: 1, createdAt: -1 },
  }[sort];
  const [rows, total, dist, mine, eligible] = await Promise.all([
    Review.find(f)
      .populate("user", "name")
      .sort(order)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Review.countDocuments(f),
    Review.aggregate([
      { $match: f },
      { $group: { _id: "$rating", n: { $sum: 1 } } },
    ]),
    user
      ? Review.findOne({ product: p._id, user: user._id })
          .populate("user", "name")
          .lean()
      : null,
    user ? deliveredOrderFor(user._id, p._id) : null,
  ]);
  const counts = Object.fromEntries(
    [1, 2, 3, 4, 5].map((n) => [n, dist.find((d) => d._id === n)?.n ?? 0]),
  );
  const sum = Object.entries(counts).reduce(
    (s, [k, v]) => s + Number(k) * v,
    0,
  );
  return {
    items: rows.map((r) => view(r)),
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
    summary: {
      average: total ? Math.round((sum / total) * 10) / 10 : 0,
      count: total,
      distribution: counts,
    },
    viewer: user
      ? {
          review: mine ? view(mine, true) : null,
          canReview: Boolean(eligible) && !mine,
          reason: !eligible
            ? "Only customers who have received this product can review it."
            : undefined,
        }
      : null,
  };
}

export async function createReview(user, slug, body) {
  const p = await productBySlug(slug);
  const order = await deliveredOrderFor(user._id, p._id);
  if (!order)
    throw ApiError.forbidden(
      "NOT_A_BUYER",
      "Only customers who have received this product can review it",
    );
  if (await Review.exists({ product: p._id, user: user._id }))
    throw ApiError.conflict(
      "ALREADY_REVIEWED",
      "You have already reviewed this product",
    );
  const r = await Review.create({
    product: p._id,
    user: user._id,
    order: order._id,
    ...body,
  });
  return view(await r.populate("user", "name"), true);
}
export async function updateReview(user, id, body) {
  const r = await Review.findOne({ _id: id, user: user._id });
  if (!r || r.status === "removed")
    throw ApiError.notFound("REVIEW_NOT_FOUND", "Review not found");
  r.set({ ...body, status: "pending", moderationNote: undefined });
  await r.save(); // edits are re-moderated
  await recomputeRating(r.product);
  return view(await r.populate("user", "name"), true);
}
export async function deleteOwn(user, id) {
  const r = await Review.findOneAndDelete({ _id: id, user: user._id });
  if (!r) throw ApiError.notFound("REVIEW_NOT_FOUND", "Review not found");
  await ReviewReport.deleteMany({ review: id });
  await recomputeRating(r.product);
}
export const listOwn = async (user) =>
  (
    await Review.find({ user: user._id })
      .populate("product", "name slug")
      .sort({ createdAt: -1 })
      .lean()
  ).map((r) => ({
    ...view({ ...r, user }, true),
    product: r.product && { name: r.product.name, slug: r.product.slug },
  }));

export async function report(user, id, { reason, note }) {
  const r = await Review.findById(id);
  if (!r || r.status !== "approved")
    throw ApiError.notFound("REVIEW_NOT_FOUND", "Review not found");
  if (String(r.user) === String(user._id))
    throw ApiError.badRequest(
      "OWN_REVIEW",
      "You cannot report your own review",
    );
  try {
    await ReportInsert(r._id, user._id, reason, note);
  } catch (e) {
    if (e.code === 11000) return { reported: true };
    throw e;
  }
  const updated = await Review.findOneAndUpdate(
    { _id: id },
    { $inc: { reportCount: 1 } },
    { new: true },
  );
  if (updated.reportCount >= AUTO_FLAG_AT && updated.status === "approved") {
    await Review.updateOne(
      { _id: id, status: "approved" },
      { $set: { status: "flagged" } },
    );
    await recomputeRating(updated.product);
  }
  return { reported: true };
}
const ReportInsert = (review, reporter, reason, note) =>
  ReviewReport.create({ review, reporter, reason, note });

export async function adminList({ status, page, limit }) {
  const f = status ? { status } : {};
  const [rows, total] = await Promise.all([
    Review.find(f)
      .populate("user", "name email")
      .populate("product", "name slug")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Review.countDocuments(f),
  ]);
  return {
    items: rows.map((r) => ({
      id: r._id,
      rating: r.rating,
      title: r.title,
      body: r.body,
      status: r.status,
      reportCount: r.reportCount,
      moderationNote: r.moderationNote,
      createdAt: r.createdAt,
      product: r.product && {
        id: r.product._id,
        name: r.product.name,
        slug: r.product.slug,
      },
      customer: r.user && { name: r.user.name, email: r.user.email },
    })),
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}
export async function moderate(id, action, note) {
  const status = { approve: "approved", remove: "removed", flag: "flagged" }[
    action
  ];
  if (action === "remove" && !note)
    throw ApiError.badRequest(
      "NOTE_REQUIRED",
      "Add a short reason when removing a review",
    );
  const r = await Review.findByIdAndUpdate(
    id,
    { $set: { status, moderationNote: note } },
    { new: true },
  );
  if (!r) throw ApiError.notFound("REVIEW_NOT_FOUND", "Review not found");
  await recomputeRating(r.product);
  if (status === "removed")
    notify(r.user, {
      type: "account",
      title: "Your review was removed",
      body: note,
    });
  return r;
}
export async function listReports({ status, page, limit }) {
  const f = { status: status ?? "open" };
  const [rows, total] = await Promise.all([
    ReviewReport.find(f)
      .populate({
        path: "review",
        populate: { path: "product", select: "name" },
      })
      .populate("reporter", "name")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    ReviewReport.countDocuments(f),
  ]);
  return {
    items: rows.map((x) => ({
      id: x._id,
      reason: x.reason,
      note: x.note,
      status: x.status,
      createdAt: x.createdAt,
      reporter: x.reporter?.name,
      review: x.review && {
        id: x.review._id,
        rating: x.review.rating,
        body: x.review.body,
        status: x.review.status,
        product: x.review.product?.name,
      },
    })),
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}
export async function resolveReport(id, outcome, staff, note) {
  const rep = await ReviewReport.findOneAndUpdate(
    { _id: id, status: "open" },
    {
      $set: {
        status: outcome === "dismiss" ? "dismissed" : "actioned",
        resolvedBy: staff._id,
      },
    },
    { new: true },
  );
  if (!rep)
    throw ApiError.conflict(
      "REPORT_NOT_OPEN",
      "This report was already resolved",
    );
  if (outcome === "remove_review")
    await moderate(
      rep.review,
      "remove",
      note || "Removed after a customer report",
    );
  else {
    const open = await ReviewReport.countDocuments({
      review: rep.review,
      status: "open",
    });
    const r = await Review.findById(rep.review);
    if (r?.status === "flagged" && open < AUTO_FLAG_AT) {
      r.status = "approved";
      await r.save();
      await recomputeRating(r.product);
    }
  }
  return rep;
}
