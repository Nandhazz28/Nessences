import { z } from 'zod';
import { SiteContent, CONTENT_KEYS } from '../../models/SiteContent.js';
import { Article } from '../../models/Article.js';
import { ApiError } from '../../utils/ApiError.js';
import { slugify, escapeRegex } from '../../utils/slug.js';
import { media } from '../mediaService.js';
import { isAllowedImageUrl, presentImage } from '../imageUrls.js';

export const contentUpdate = z.object({ title: z.string().trim().min(2).max(140), body: z.string().max(30000).default(''),
  data: z.object({ items: z.array(z.object({ q: z.string().trim().min(3).max(200), a: z.string().trim().min(3).max(2000) }).strict()).max(50) }).strict().optional() }).strict();

const host = (re) => z.string().trim().url().refine((u) => u.startsWith('https://') && re.test(new URL(u).hostname), 'Use a full https:// link on the platform’s own domain');
export const settingsBody = z.object({
  storeName: z.string().trim().min(2).max(60), supportEmail: z.string().trim().toLowerCase().email().optional().or(z.literal('')), supportPhone: z.string().trim().max(30).optional().or(z.literal('')),
  social: z.object({ instagram: host(/(^|\.)instagram\.com$/).optional().or(z.literal('')), facebook: host(/(^|\.)facebook\.com$/).optional().or(z.literal('')), youtube: host(/(^|\.)youtube\.com$/).optional().or(z.literal('')) }).strict().default({}),
}).strict();

export async function getPage(key) {
  if (!CONTENT_KEYS.includes(key)) throw ApiError.notFound('PAGE_NOT_FOUND', 'Page not found');
  const c = await SiteContent.findOne({ key }).lean();
  if (!c) throw ApiError.notFound('PAGE_NOT_FOUND', 'This page has not been published yet');
  return { key, title: c.title, body: c.body, data: c.data, updatedAt: c.updatedAt };
}
export const listPages = async () => (await SiteContent.find({ key: { $in: CONTENT_KEYS } }).sort({ key: 1 }).lean()).map((c) => ({ key: c.key, title: c.title, body: c.body, data: c.data, updatedAt: c.updatedAt }));
export async function updatePage(key, body, staff) {
  if (!CONTENT_KEYS.includes(key)) throw ApiError.notFound('PAGE_NOT_FOUND', 'Unknown page');
  return SiteContent.findOneAndUpdate({ key }, { $set: { ...body, updatedBy: staff._id } }, { new: true, upsert: true, runValidators: true });
}
const DEFAULT_SETTINGS = { storeName: 'Nessence', supportEmail: '', supportPhone: '', social: {} };
export async function getSettings() { const s = await SiteContent.findOne({ key: 'settings' }).lean(); return { ...DEFAULT_SETTINGS, ...(s?.data ?? {}) }; }
export async function publicSettings() {
  const s = await getSettings();
  return { storeName: s.storeName, supportEmail: s.supportEmail || null, supportPhone: s.supportPhone || null, social: Object.fromEntries(Object.entries(s.social ?? {}).filter(([, v]) => v)) }; // only configured links are exposed
}
export const saveSettings = (data, staff) => SiteContent.findOneAndUpdate({ key: 'settings' }, { $set: { title: 'Settings', data, updatedBy: staff._id } }, { new: true, upsert: true });

export const articleBody = z.object({
  title: z.string().trim().min(3).max(140), slug: z.string().regex(/^[a-z0-9-]{2,90}$/).optional(), excerpt: z.string().trim().min(10).max(300),
  coverImage: z.object({ url: z.string().refine(isAllowedImageUrl, 'Upload images through the image uploader'), alt: z.string().trim().min(3).max(140) }).strict().optional(),
  content: z.string().trim().min(20).max(30000), author: z.string().trim().min(2).max(80), tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  status: z.enum(['draft', 'published']).default('draft'), seo: z.object({ title: z.string().max(70).optional(), description: z.string().max(160).optional() }).optional(),
}).strict();
const pubView = (a, full) => ({ id: a._id, title: a.title, slug: a.slug, excerpt: a.excerpt, coverImage: a.coverImage?.url ? presentImage(a.coverImage, 'cover') : a.coverImage, author: a.author, tags: a.tags, publishedAt: a.publishedAt, ...(full ? { content: a.content, seo: a.seo } : {}) });
export async function listArticles({ page, limit, tag }) {
  const f = { status: 'published', ...(tag ? { tags: tag } : {}) };
  const [rows, total] = await Promise.all([Article.find(f).sort({ publishedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), Article.countDocuments(f)]);
  return { items: rows.map((a) => pubView(a)), pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } };
}
export async function getArticle(slug) { const a = await Article.findOne({ slug, status: 'published' }).lean(); if (!a) throw ApiError.notFound('ARTICLE_NOT_FOUND', 'Article not found'); return pubView(a, true); }
const uniq = async (base, ignore) => { let s = slugify(base) || 'article', n = 1; while (await Article.exists({ slug: s, ...(ignore ? { _id: { $ne: ignore } } : {}) })) s = `${slugify(base)}-${++n}`; return s; };
export async function adminArticles({ q, status, page, limit }) {
  const f = { ...(status ? { status } : {}), ...(q ? { title: { $regex: escapeRegex(q), $options: 'i' } } : {}) };
  const [rows, total] = await Promise.all([Article.find(f).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), Article.countDocuments(f)]);
  return { items: rows.map((a) => ({ ...pubView(a), status: a.status, updatedAt: a.updatedAt })), pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } };
}
export const adminArticle = async (id) => { const a = await Article.findById(id).lean(); if (!a) throw ApiError.notFound('ARTICLE_NOT_FOUND', 'Article not found'); return { ...a, id: a._id }; };
export async function createArticle(b) {
  const cover = b.coverImage ? (await media.resolveImages([b.coverImage]))[0] : undefined;
  const a = await Article.create({ ...b, ...(cover ? { coverImage: cover } : {}), slug: await uniq(b.slug ?? b.title) });
  if (cover) await media.markAttached([cover]);
  return a;
}
export async function updateArticle(id, b) {
  const a = await Article.findById(id); if (!a) throw ApiError.notFound('ARTICLE_NOT_FOUND', 'Article not found');
  if (b.slug && b.slug !== a.slug) a.slug = await uniq(b.slug, a._id);
  const { slug, ...rest } = b;
  const before = a.coverImage?.url ? a.coverImage.toObject() : null;
  const cover = rest.coverImage ? (await media.resolveImages([rest.coverImage], { existing: before ? [before] : [] }))[0] : undefined;
  a.set(cover ? { ...rest, coverImage: cover } : rest); await a.save();
  if (cover) await media.markAttached([cover]);
  if (before && cover) await media.release(media.removedBetween([before], [cover])); // old cover goes only after the save succeeded; omitting coverImage leaves it attached
  return a;
}
export async function deleteArticle(id) {
  const a = await Article.findByIdAndDelete(id); if (!a) throw ApiError.notFound('ARTICLE_NOT_FOUND', 'Article not found');
  if (a.coverImage?.url) await media.release([a.coverImage.toObject ? a.coverImage.toObject() : a.coverImage]);
  return a;
}
