import { ApiError } from "../utils/ApiError.js";
import { logger } from "../config/logger.js";
import { storage as defaultStorage } from "./storage.js";
import {
  isCloudinaryAssetUrl,
  LEGACY_URL,
  LEGACY_UPLOAD_URL,
} from "./imageUrls.js";
import { MediaAsset } from "../models/MediaAsset.js";
import { Product } from "../models/Product.js";
import { Article } from "../models/Article.js";
import { Order } from "../models/Order.js";
import { ReturnRequest } from "../models/ReturnRequest.js";

const MIN = 60_000;
export const UPLOAD_GRACE_MS = 15 * MIN;
export const PENDING_GRACE_MS = 24 * 60 * MIN;

const META = ["publicId", "width", "height", "bytes", "format"];
const meta = (a) =>
  a?.publicId
    ? Object.fromEntries(META.filter((k) => a[k] != null).map((k) => [k, a[k]]))
    : {};
const keyOf = (i) => i?.publicId ?? i?.url;

export function createMediaService({
  storage = defaultStorage,
  models = { MediaAsset, Product, Article, Order, ReturnRequest },
  log = logger,
  now = () => new Date(),
} = {}) {
  const {
    MediaAsset: Assets,
    Product: P,
    Article: A,
    Order: O,
    ReturnRequest: R,
  } = models;

  async function isReferenced(ref) {
    const by = (path) =>
      ref.publicId
        ? { [`${path}.publicId`]: ref.publicId }
        : { [`${path}.url`]: ref.url };
    for (const [Model, filter] of [
      [P, by("images")],
      [A, by("coverImage")],
      [O, by("items.image")],
      [R, by("items.image")],
    ]) {
      if (await Model.exists(filter)) return true;
    }
    return false;
  }

  async function purgeIfUnreferenced(publicId) {
    if (await isReferenced({ publicId })) {
      await Assets.updateOne(
        { publicId },
        { $set: { status: "active" }, $unset: { lastError: 1 } },
      );
      return "kept";
    }
    try {
      await storage.destroy(publicId);
    } catch (err) {
      await Assets.updateOne(
        { publicId },
        {
          $set: { lastError: String(err.code ?? "DELETE_FAILED") },
          $inc: { deleteAttempts: 1 },
        },
      ).catch(() => {});
      throw err;
    }
    await Assets.deleteOne({ publicId });
    return "deleted";
  }

  async function uploadImage(buffer, { purpose = "product", staffId } = {}) {
    storage.validate(buffer);
    if (!storage.supportsRegistry) {
      const s = await storage.save(buffer, { purpose });
      return { url: s.url, bytes: s.bytes, assetId: null };
    }

    const publicId = storage.newPublicId(purpose);
    let row;
    try {
      row = await Assets.create({
        publicId,
        purpose,
        status: "pending",
        uploadedBy: staffId,
      });
    } catch (err) {
      log.error(
        { code: err?.code },
        "Media registry write failed before upload",
      );
      throw new ApiError(
        503,
        "STORAGE_REGISTRY_UNAVAILABLE",
        "Could not record the upload. Please try again.",
      );
    }

    let saved;
    try {
      saved = await storage.save(buffer, { purpose, publicId });
    } catch (err) {
      await Assets.updateOne(
        { publicId },
        { $set: { lastError: String(err.code ?? "UPLOAD_FAILED") } },
      ).catch(() => {});
      throw err;
    } // row stays; the sweep removes it if the asset did land (e.g. after a timeout)

    try {
      await Assets.updateOne(
        { publicId },
        {
          $set: {
            url: saved.url,
            format: saved.format,
            bytes: saved.bytes,
            width: saved.width,
            height: saved.height,
            version: saved.version,
          },
        },
      );
    } catch (err) {
      log.error(
        { publicId, code: err?.code },
        "Media registry update failed after upload; removing asset",
      );
      await purgeIfUnreferenced(publicId).catch(() =>
        log.error({ publicId }, "Cleanup failed; sweep will retry"),
      ); // on failure the pending row lets the sweep finish the job
      throw new ApiError(
        503,
        "STORAGE_REGISTRY_UNAVAILABLE",
        "Could not record the upload. Please try again.",
      );
    }
    return {
      url: saved.url,
      bytes: saved.bytes,
      width: saved.width,
      height: saved.height,
      format: saved.format,
      assetId: String(row._id),
    };
  }

  async function resolveImages(images, { existing = [] } = {}) {
    const known = new Map(existing.map((e) => [e.url, e]));
    const out = [];
    for (const im of images) {
      const base = {
        url: im.url,
        alt: im.alt,
        ...(im.color ? { color: im.color } : {}),
      };
      if (LEGACY_URL.test(im.url)) {
        out.push({ ...base, ...meta(known.get(im.url)) });
        continue;
      }
      const prev = known.get(im.url);
      if (prev?.publicId) {
        out.push({ ...base, ...meta(prev) });
        continue;
      }
      if (!isCloudinaryAssetUrl(im.url))
        throw ApiError.badRequest(
          "INVALID_IMAGE",
          "Upload images through the image uploader",
        );
      const asset = await Assets.findOne({ url: im.url }).lean();
      if (!asset)
        throw ApiError.badRequest(
          "INVALID_IMAGE",
          "Upload images through the image uploader",
        );
      if (asset.status === "delete_pending")
        throw ApiError.conflict(
          "IMAGE_REMOVED",
          "This image was removed. Please upload it again.",
        );
      out.push({ ...base, ...meta(asset) });
    }
    return out;
  }

  async function markAttached(images) {
    const ids = (images ?? []).map((i) => i?.publicId).filter(Boolean);
    if (!ids.length) return;
    try {
      await Assets.updateMany(
        { publicId: { $in: ids }, status: "pending" },
        { $set: { status: "active" } },
      );
    } catch (err) {
      log.error(
        { code: err?.code },
        "Could not mark assets active; reconciler will repair",
      );
    }
  }

  async function releaseOne(img) {
    if (!img.publicId) {
      if (!LEGACY_UPLOAD_URL.test(img.url ?? "")) return "skipped";
      if (await isReferenced({ url: img.url })) return "kept";
      await storage.removeLegacy(img.url);
      return "deleted";
    }
    await Assets.updateOne(
      { publicId: img.publicId, status: { $ne: "delete_pending" } },
      { $set: { status: "delete_pending" } },
    ); // blocks new attachments before the check
    return purgeIfUnreferenced(img.publicId);
  }
  async function release(images) {
    const results = [];
    for (const img of images ?? []) {
      if (!img) continue;
      try {
        results.push(await releaseOne(img));
      } catch (err) {
        results.push("failed");
        log.error(
          { publicId: img.publicId, code: err?.code },
          "Asset release failed; reconciler will retry",
        );
      }
    }
    return results;
  }
  const removedBetween = (before, after) => {
    const keep = new Set((after ?? []).map(keyOf));
    return (before ?? []).filter((i) => !keep.has(keyOf(i)));
  };

  async function discardUpload(assetId, staffId) {
    const asset = await Assets.findById(assetId).lean();
    if (!asset) throw ApiError.notFound("IMAGE_NOT_FOUND", "Image not found");
    if (String(asset.uploadedBy) !== String(staffId))
      throw ApiError.forbidden(
        "NOT_YOUR_UPLOAD",
        "Only the person who uploaded an image can discard it",
      );
    if (
      asset.status !== "pending" ||
      (await isReferenced({ publicId: asset.publicId }))
    )
      throw ApiError.conflict(
        "IMAGE_IN_USE",
        "This image is attached to content and cannot be discarded here",
      );
    await purgeIfUnreferenced(asset.publicId);
  }

  async function reconcile({ limit = 100 } = {}) {
    const t = now().getTime();
    const summary = { checked: 0, deleted: 0, repaired: 0, failed: 0 };
    const batches = await Promise.all([
      Assets.find({ status: "delete_pending" }).limit(limit).lean(),
      Assets.find({
        status: "pending",
        updatedAt: { $lt: new Date(t - PENDING_GRACE_MS) },
      })
        .limit(limit)
        .lean(),
      Assets.find({
        status: "pending",
        url: null,
        updatedAt: { $lt: new Date(t - UPLOAD_GRACE_MS) },
      })
        .limit(limit)
        .lean(),
    ]);
    const seen = new Set();
    for (const row of batches.flat()) {
      if (seen.has(row.publicId)) continue;
      seen.add(row.publicId);
      summary.checked++;
      try {
        const r = await purgeIfUnreferenced(row.publicId); // referenced -> marked active (repair); otherwise deleted at the provider
        if (r === "kept") summary.repaired++;
        else summary.deleted++;
      } catch (err) {
        summary.failed++;
        log.error(
          { publicId: row.publicId, code: err?.code },
          "Reconcile could not delete asset",
        );
      }
    }
    return summary;
  }

  async function migrateLegacy({
    apply = false,
    readFile,
    purposeFor = { product: "product", article: "article" },
  } = {}) {
    const report = { candidates: 0, migrated: 0, failed: 0, dryRun: !apply };
    const jobs = [];
    for (const p of await P.find({
      "images.url": { $regex: "^/media/products/" },
    }))
      for (const img of p.images)
        if (!img.publicId && LEGACY_UPLOAD_URL.test(img.url))
          jobs.push({ doc: p, target: img, purpose: purposeFor.product });
    for (const a of await A.find({
      "coverImage.url": { $regex: "^/media/products/" },
    }))
      if (
        a.coverImage &&
        !a.coverImage.publicId &&
        LEGACY_UPLOAD_URL.test(a.coverImage.url)
      )
        jobs.push({
          doc: a,
          target: a.coverImage,
          purpose: purposeFor.article,
        });
    report.candidates = jobs.length;
    if (!apply) return report;
    for (const { doc, target, purpose } of jobs) {
      try {
        const buf = await readFile(target.url);
        const up = await uploadImage(buf, { purpose });
        const saved = await Assets.findOne({ url: up.url }).lean();
        Object.assign(target, { url: up.url, ...meta(saved) });
        await doc.save();
        await markAttached([saved]);
        report.migrated++;
      } catch (err) {
        report.failed++;
        log.error(
          { code: err?.code },
          "Legacy image migration failed for one image",
        );
      }
    }
    return report;
  }

  return {
    isReferenced,
    uploadImage,
    resolveImages,
    markAttached,
    release,
    removedBetween,
    discardUpload,
    reconcile,
    migrateLegacy,
  };
}

export const media = createMediaService();
