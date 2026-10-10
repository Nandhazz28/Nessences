import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { requireStaff, requirePermission as need } from '../middleware/auth.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { ok } from '../utils/respond.js';
import { audit } from '../services/auditService.js';
import { ROLES } from '../config/permissions.js';
import * as reviews from '../services/engage/reviewService.js';
import * as news from '../services/engage/newsletterService.js';
import * as contact from '../services/engage/contactService.js';
import * as content from '../services/engage/contentService.js';
import * as staff from '../services/engage/staffService.js';
import { analytics } from '../services/engage/analytics.js';
import { CONTENT_KEYS } from '../models/SiteContent.js';

const oid = z.string().regex(/^[a-f0-9]{24}$/, 'Invalid id');
const id = z.object({ id: oid });
const pg = { page: z.coerce.number().int().min(1).max(1000).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) };
const list = (res, r) => { const { items, pagination, ...extra } = r; ok(res, items, 200, { pagination, ...extra }); };
const staffPassword = z.string().min(10, 'Use at least 10 characters').max(128).regex(/[A-Za-z]/, 'Include a letter').regex(/[0-9]/, 'Include a number');

export const adminEngage = Router();
adminEngage.use(requireStaff);

// ---- reviews & reports ----
adminEngage.get('/reviews', need('reviews:moderate'), validate({ query: z.object({ ...pg, status: z.enum(['pending', 'approved', 'flagged', 'removed']).optional() }) }), h(async (req, res) => list(res, await reviews.adminList(req.query))));
adminEngage.post('/reviews/:id/moderate', need('reviews:moderate'), validate({ params: id, body: z.object({ action: z.enum(['approve', 'remove', 'flag']), note: z.string().trim().max(200).optional() }).strict() }), h(async (req, res) => {
  const r = await reviews.moderate(req.params.id, req.body.action, req.body.note);
  await audit(req, { action: `review.${req.body.action === 'approve' ? 'approved' : req.body.action === 'remove' ? 'removed' : 'flagged'}`, resource: 'Review', resourceId: r._id, metadata: { note: req.body.note } });
  ok(res, { id: r._id, status: r.status });
}));
adminEngage.get('/review-reports', need('reviews:moderate'), validate({ query: z.object({ ...pg, status: z.enum(['open', 'dismissed', 'actioned']).optional() }) }), h(async (req, res) => list(res, await reviews.listReports(req.query))));
adminEngage.post('/review-reports/:id/resolve', need('reviews:moderate'), validate({ params: id, body: z.object({ outcome: z.enum(['dismiss', 'remove_review']), note: z.string().trim().max(200).optional() }).strict() }), h(async (req, res) => {
  const r = await reviews.resolveReport(req.params.id, req.body.outcome, req.staff, req.body.note);
  await audit(req, { action: 'review_report.resolved', resource: 'ReviewReport', resourceId: r._id, metadata: { outcome: req.body.outcome } }); ok(res, { id: r._id, status: r.status });
}));

// ---- newsletter ----
adminEngage.get('/newsletter', need('newsletter:read'), validate({ query: z.object({ ...pg, status: z.enum(['pending', 'subscribed', 'unsubscribed']).optional() }) }), h(async (req, res) => list(res, await news.adminList(req.query))));
adminEngage.get('/newsletter/export.csv', need('newsletter:read'), h(async (req, res) => {
  const rows = await news.exportSubscribed(); await audit(req, { action: 'newsletter.exported', resource: 'NewsletterSubscriber', metadata: { rows: rows.length } });
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="nessence-subscribers.csv"' }).send(news.toCsv(rows));
}));

// ---- contact messages ----
adminEngage.get('/contact-messages', need('messages:read'), validate({ query: z.object({ ...pg, status: z.enum(['new', 'in_progress', 'resolved']).optional() }) }), h(async (req, res) => list(res, await contact.adminList(req.query))));
adminEngage.get('/contact-messages/:id', need('messages:read'), validate({ params: id }), h(async (req, res) => ok(res, await contact.get(req.params.id))));
adminEngage.patch('/contact-messages/:id', need('messages:read'), validate({ params: id, body: z.object({ status: z.enum(['new', 'in_progress', 'resolved']) }).strict() }), h(async (req, res) => {
  const m = await contact.setStatus(req.params.id, req.body.status); await audit(req, { action: 'contact.status_changed', resource: 'ContactMessage', resourceId: m._id, metadata: { status: m.status } }); ok(res, { id: m._id, status: m.status });
}));
adminEngage.post('/contact-messages/:id/reply', need('messages:read'), validate({ params: id, body: z.object({ message: z.string().trim().min(5).max(3000) }).strict() }), h(async (req, res) => {
  const m = await contact.reply(req.params.id, req.staff, req.body.message); await audit(req, { action: 'contact.replied', resource: 'ContactMessage', resourceId: m._id }); ok(res, await contact.get(m._id));
}));

// ---- journal ----
adminEngage.get('/journal', need('content:write'), validate({ query: z.object({ ...pg, q: z.string().max(80).optional(), status: z.enum(['draft', 'published']).optional() }) }), h(async (req, res) => list(res, await content.adminArticles(req.query))));
adminEngage.get('/journal/:id', need('content:write'), validate({ params: id }), h(async (req, res) => ok(res, await content.adminArticle(req.params.id))));
adminEngage.post('/journal', need('content:write'), validate({ body: content.articleBody }), h(async (req, res) => { const a = await content.createArticle(req.body); await audit(req, { action: 'article.created', resource: 'Article', resourceId: a._id, metadata: { title: a.title, status: a.status } }); ok(res, await content.adminArticle(a._id), 201); }));
adminEngage.patch('/journal/:id', need('content:write'), validate({ params: id, body: content.articleBody.partial() }), h(async (req, res) => { const a = await content.updateArticle(req.params.id, req.body); await audit(req, { action: req.body.status ? `article.${req.body.status}` : 'article.updated', resource: 'Article', resourceId: a._id, metadata: { fields: Object.keys(req.body) } }); ok(res, await content.adminArticle(a._id)); }));
adminEngage.delete('/journal/:id', need('content:write'), validate({ params: id }), h(async (req, res) => { const a = await content.deleteArticle(req.params.id); await audit(req, { action: 'article.deleted', resource: 'Article', resourceId: a._id, metadata: { title: a.title } }); ok(res, { deleted: true }); }));

// ---- site pages & settings ----
adminEngage.get('/content', need('content:write'), h(async (_req, res) => ok(res, await content.listPages())));
adminEngage.put('/content/:key', need('content:write'), validate({ params: z.object({ key: z.enum(CONTENT_KEYS) }), body: content.contentUpdate }), h(async (req, res) => {
  const c = await content.updatePage(req.params.key, req.body, req.staff); await audit(req, { action: 'content.updated', resource: 'SiteContent', resourceId: req.params.key, metadata: { title: c.title } }); ok(res, { key: c.key, title: c.title });
}));
adminEngage.get('/settings', need('settings:manage'), h(async (_req, res) => ok(res, await content.getSettings())));
adminEngage.put('/settings', need('settings:manage'), validate({ body: content.settingsBody }), h(async (req, res) => { await content.saveSettings(req.body, req.staff); await audit(req, { action: 'settings.updated', resource: 'Settings', metadata: { storeName: req.body.storeName, social: Object.keys(req.body.social).filter((k) => req.body.social[k]) } }); ok(res, await content.getSettings()); }));

// ---- analytics ----
adminEngage.get('/analytics', need('analytics:read'), validate({ query: z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional(), unit: z.enum(['day', 'week', 'month']).default('day') })
  .transform((q) => ({ unit: q.unit, to: q.to ?? new Date(), from: q.from ?? new Date(Date.now() - 30 * 86400000) })).refine((q) => q.from < q.to && q.to - q.from <= 366 * 86400000, { message: 'Choose a range of up to one year' }) }),
h(async (req, res) => ok(res, await analytics(req.query))));

// ---- staff management (super admin only via staff:manage) ----
adminEngage.get('/staff', need('staff:manage'), h(async (_req, res) => ok(res, await staff.list())));
adminEngage.post('/staff', need('staff:manage'), validate({ body: z.object({ name: z.string().trim().min(2).max(80), email: z.string().trim().toLowerCase().email().max(254), role: z.enum(ROLES), password: staffPassword }).strict() }), h(async (req, res) => {
  const s = await staff.create(req.body); await audit(req, { action: 'staff.created', resource: 'StaffUser', resourceId: s._id, metadata: { email: s.email, role: s.role } }); ok(res, s.toPublic(), 201);
}));
adminEngage.patch('/staff/:id', need('staff:manage'), validate({ params: id, body: z.object({ name: z.string().trim().min(2).max(80).optional(), role: z.enum(ROLES).optional(), active: z.boolean().optional() }).strict().refine((b) => Object.keys(b).length > 0, 'Nothing to change') }), h(async (req, res) => {
  const { staff: s, before } = await staff.update(req.params.id, req.staff, req.body);
  await audit(req, { action: req.body.role && req.body.role !== before.role ? 'staff.role_changed' : req.body.active === false ? 'staff.deactivated' : req.body.active === true && !before.active ? 'staff.reactivated' : 'staff.updated', resource: 'StaffUser', resourceId: s._id, metadata: { email: s.email, before, after: { role: s.role, active: s.active } } });
  ok(res, s.toPublic());
}));
adminEngage.post('/staff/:id/reset-password', need('staff:manage'), validate({ params: id, body: z.object({ password: staffPassword }).strict() }), h(async (req, res) => {
  const s = await staff.resetPassword(req.params.id, req.body.password); await audit(req, { action: 'staff.password_reset', resource: 'StaffUser', resourceId: s._id, metadata: { email: s.email } }); ok(res, { reset: true });
}));
