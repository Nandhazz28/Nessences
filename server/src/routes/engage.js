import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { optionalAuth } from '../middleware/cartContext.js';
import { newsletterLimiter, trackOrderLimiter, contactLimiter, reviewLimiter } from '../middleware/security.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { ok } from '../utils/respond.js';
import * as reviews from '../services/engage/reviewService.js';
import * as news from '../services/engage/newsletterService.js';
import * as contact from '../services/engage/contactService.js';
import * as content from '../services/engage/contentService.js';
import { track } from '../services/engage/trackOrder.js';

const oid = z.string().regex(/^[a-f0-9]{24}$/, 'Invalid id');
const slug = z.object({ slug: z.string().regex(/^[a-z0-9-]{1,100}$/) });
const email = z.string().trim().toLowerCase().email().max(254);
const token = z.string().regex(/^[a-f0-9]{48,64}$/, 'Invalid link');
const page = { page: z.coerce.number().int().min(1).max(500).default(1) };

export const engage = Router();

// ---- reviews ----
const reviewBody = z.object({ rating: z.coerce.number().int().min(1).max(5), title: z.string().trim().max(80).optional(), body: z.string().trim().min(10, 'Tell us a little more (10+ characters)').max(2000) }).strict();
engage.get('/products/:slug/reviews', optionalAuth, validate({ params: slug, query: z.object({ ...page, limit: z.coerce.number().int().min(1).max(20).default(6), sort: z.enum(['newest', 'highest', 'lowest']).default('newest') }) }),
  h(async (req, res) => { const r = await reviews.listForProduct(req.params.slug, req.query, req.user); res.set('Cache-Control', 'private, no-store'); ok(res, { items: r.items, summary: r.summary, viewer: r.viewer }, 200, { pagination: r.pagination }); }));
engage.post('/products/:slug/reviews', requireAuth, reviewLimiter, validate({ params: slug, body: reviewBody }), h(async (req, res) => ok(res, await reviews.createReview(req.user, req.params.slug, req.body), 201)));
engage.patch('/reviews/:id', requireAuth, reviewLimiter, validate({ params: z.object({ id: oid }), body: reviewBody }), h(async (req, res) => ok(res, await reviews.updateReview(req.user, req.params.id, req.body))));
engage.delete('/reviews/:id', requireAuth, validate({ params: z.object({ id: oid }) }), h(async (req, res) => { await reviews.deleteOwn(req.user, req.params.id); ok(res, { deleted: true }); }));
engage.post('/reviews/:id/report', requireAuth, reviewLimiter, validate({ params: z.object({ id: oid }), body: z.object({ reason: z.enum(['spam', 'offensive', 'irrelevant', 'personal_info', 'other']), note: z.string().trim().max(300).optional() }).strict() }), h(async (req, res) => ok(res, await reviews.report(req.user, req.params.id, req.body), 201)));
engage.get('/account/reviews', requireAuth, h(async (req, res) => ok(res, await reviews.listOwn(req.user))));

// ---- newsletter (double opt-in) ----
engage.post('/newsletter', newsletterLimiter, validate({ body: z.object({ email, source: z.enum(['footer', 'home', 'checkout']).default('footer') }).strict() }),
  h(async (req, res) => { await news.subscribe(req.body.email, req.body.source); ok(res, { message: 'Almost there — check your inbox to confirm your subscription.' }, 202); }));
engage.post('/newsletter/confirm', newsletterLimiter, validate({ body: z.object({ token }).strict() }), h(async (req, res) => { await news.confirm(req.body.token); ok(res, { subscribed: true }); }));
engage.post('/newsletter/unsubscribe', newsletterLimiter, validate({ body: z.object({ token: z.string().regex(/^[a-f0-9]{48}$/) }).strict() }), h(async (req, res) => { await news.unsubscribe(req.body.token); ok(res, { unsubscribed: true }); }));

// ---- contact / tracking ----
engage.post('/contact', contactLimiter, optionalAuth, validate({ body: z.object({
  name: z.string().trim().min(2).max(80), email, category: z.enum(['order', 'product', 'returns', 'press', 'other']).default('other'),
  subject: z.string().trim().min(3).max(120), message: z.string().trim().min(10, 'Please write at least 10 characters').max(3000),
  orderNumber: z.string().trim().toUpperCase().regex(/^NS-\d{4}-[A-F0-9]{6}$/, 'Order numbers look like NS-2610-A1B2C3').optional().or(z.literal('').transform(() => undefined)),
  website: z.string().max(200).optional() }).strict() }), h(async (req, res) => ok(res, await contact.submit(req.body, { user: req.user, ip: req.ip }), 201)));
engage.post('/track-order', trackOrderLimiter, validate({ body: z.object({ orderNumber: z.string().trim().toUpperCase().regex(/^NS-\d{4}-[A-F0-9]{6}$/, 'Order numbers look like NS-2610-A1B2C3'), email }).strict() }),
  h(async (req, res) => ok(res, await track(req.body.orderNumber, req.body.email))));

// ---- journal / pages / settings ----
engage.get('/journal', validate({ query: z.object({ ...page, limit: z.coerce.number().int().min(1).max(24).default(9), tag: z.string().max(30).optional() }) }), h(async (req, res) => { const r = await content.listArticles(req.query); res.set('Cache-Control', 'public, max-age=60'); ok(res, r.items, 200, { pagination: r.pagination }); }));
engage.get('/journal/:slug', validate({ params: slug }), h(async (req, res) => { res.set('Cache-Control', 'public, max-age=60'); ok(res, await content.getArticle(req.params.slug)); }));
engage.get('/content/:key', validate({ params: z.object({ key: z.string().regex(/^[a-z-]{2,30}$/) }) }), h(async (req, res) => { res.set('Cache-Control', 'public, max-age=60'); ok(res, await content.getPage(req.params.key)); }));
engage.get('/settings/public', h(async (_req, res) => { res.set('Cache-Control', 'public, max-age=60'); ok(res, await content.publicSettings()); }));
