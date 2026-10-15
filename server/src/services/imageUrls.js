import { v2 as cloudinary } from "cloudinary";
import { parseEnv } from "../config/envSchema.js";

export const LEGACY_URL = /^\/media\/(products|seed)\/[\w.-]+$/;
export const LEGACY_UPLOAD_URL =
  /^\/media\/products\/([a-f0-9-]{36}\.(?:jpg|png|webp))$/;

const auto = { fetch_format: "auto", quality: "auto" };
export const PRESETS = {
  thumb: [{ width: 240, crop: "limit" }, auto],
  card: [{ width: 720, crop: "limit" }, auto],
  detail: [{ width: 1600, crop: "limit" }, auto],
  cover: [{ width: 1400, crop: "limit" }, auto],
};
export const RESPONSIVE_WIDTHS = { card: [360, 720], detail: [800, 1600] };

let cached;
const settings = () => {
  if (!cached) {
    const r = parseEnv(process.env);
    const d = r.ok ? r.data : {};
    cached = {
      cloudName: d.CLOUDINARY_CLOUD_NAME,
      folder: d.CLOUDINARY_FOLDER,
      active:
        d.STORAGE_PROVIDER === "cloudinary" && Boolean(d.CLOUDINARY_CLOUD_NAME),
    };
  }
  return cached;
};

export function isCloudinaryAssetUrl(url, cfg = settings()) {
  if (!cfg.active || typeof url !== "string" || url.length > 600) return false;
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  return (
    u.protocol === "https:" &&
    u.hostname === "res.cloudinary.com" &&
    !u.search &&
    !u.hash &&
    u.pathname.startsWith(`/${cfg.cloudName}/image/upload/`) &&
    u.pathname.includes(`/${cfg.folder}/`)
  );
}

export const isAllowedImageUrl = (url) =>
  LEGACY_URL.test(url) || isCloudinaryAssetUrl(url);

export function deliveryUrl(img, preset = "card", cfg = settings()) {
  if (!img) return undefined;
  if (!img.publicId || !cfg.active) return img.url;
  return cloudinary.url(img.publicId, {
    cloud_name: cfg.cloudName,
    secure: true,
    urlAnalytics: false,
    transformation: PRESETS[preset] ?? PRESETS.card,
  });
}

export function deliverySrcSet(img, preset = "card", cfg = settings()) {
  const widths = RESPONSIVE_WIDTHS[preset];
  if (!img?.publicId || !cfg.active || !widths) return undefined;
  return widths
    .map(
      (w) =>
        `${cloudinary.url(img.publicId, { cloud_name: cfg.cloudName, secure: true, urlAnalytics: false, transformation: [{ width: w, crop: "limit" }, auto] })} ${w}w`,
    )
    .join(", ");
}

export function presentImage(img, preset, { keepPublicId = false } = {}) {
  if (!img) return img;
  const { publicId, width, height, bytes, format, ...rest } =
    typeof img.toObject === "function" ? img.toObject() : img;
  return {
    ...rest,
    url: deliveryUrl({ url: rest.url, publicId }, preset),
    ...(keepPublicId && publicId ? { publicId } : {}),
  };
}
