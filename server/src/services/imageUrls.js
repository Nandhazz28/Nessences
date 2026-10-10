import { v2 as cloudinary } from 'cloudinary';
import { parseEnv } from '../config/envSchema.js';

// Legacy images: files served by this API from /media (local provider and the dev seed). They have no publicId.
export const LEGACY_URL = /^\/media\/(products|seed)\/[\w.-]+$/;
// Only files this app itself wrote (uuid names) may be removed from local disk.
export const LEGACY_UPLOAD_URL = /^\/media\/products\/([a-f0-9-]{36}\.(?:jpg|png|webp))$/;

// Delivery presets. "limit" only ever shrinks and never crops, so existing layouts keep their own framing.
// f_auto/q_auto let Cloudinary negotiate WebP/AVIF and a sensible quality per browser.
const auto = { fetch_format: 'auto', quality: 'auto' };
export const PRESETS = {
  thumb: [{ width: 240, crop: 'limit' }, auto], //  cart lines, order history, admin tables
  card: [{ width: 720, crop: 'limit' }, auto], //   product grid
  detail: [{ width: 1600, crop: 'limit' }, auto], // product gallery
  cover: [{ width: 1400, crop: 'limit' }, auto], //  journal cover
};

// Read lazily and without exiting the process, so pure helpers (and tests that only import catalog code) never need a full environment.
let cached;
const settings = () => {
  if (!cached) {
    const r = parseEnv(process.env);
    const d = r.ok ? r.data : {};
    cached = { cloudName: d.CLOUDINARY_CLOUD_NAME, folder: d.CLOUDINARY_FOLDER, active: d.STORAGE_PROVIDER === 'cloudinary' && Boolean(d.CLOUDINARY_CLOUD_NAME) };
  }
  return cached;
};

// True only for an https Cloudinary delivery URL of THIS account's image/upload namespace under OUR folder.
export function isCloudinaryAssetUrl(url, cfg = settings()) {
  if (!cfg.active || typeof url !== 'string' || url.length > 600) return false;
  let u; try { u = new URL(url); } catch { return false; }
  return u.protocol === 'https:' && u.hostname === 'res.cloudinary.com' && !u.search && !u.hash
    && u.pathname.startsWith(`/${cfg.cloudName}/image/upload/`) && u.pathname.includes(`/${cfg.folder}/`);
}

export const isAllowedImageUrl = (url) => LEGACY_URL.test(url) || isCloudinaryAssetUrl(url);

// URL to send to browsers. Assets with a publicId get an optimised transformation; everything else is returned as stored.
export function deliveryUrl(img, preset = 'card', cfg = settings()) {
  if (!img) return undefined;
  if (!img.publicId || !cfg.active) return img.url;
  return cloudinary.url(img.publicId, { cloud_name: cfg.cloudName, secure: true, urlAnalytics: false, transformation: PRESETS[preset] ?? PRESETS.card });
}

// { url, alt, ... } -> same shape with a delivery url. publicId is intentionally kept off public payloads
// unless asked for: callers that snapshot an image (orders) pass keepPublicId.
export function presentImage(img, preset, { keepPublicId = false } = {}) {
  if (!img) return img;
  const { publicId, width, height, bytes, format, ...rest } = typeof img.toObject === 'function' ? img.toObject() : img;
  return { ...rest, url: deliveryUrl({ url: rest.url, publicId }, preset), ...(keepPublicId && publicId ? { publicId } : {}) };
}
