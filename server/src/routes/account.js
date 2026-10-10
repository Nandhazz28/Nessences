import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/respond.js';
import { Notification } from '../models/Notification.js';
import { RETURN_REASONS } from '../services/returnRules.js';
import { clearAuthCookies } from '../services/sessionService.js';
import * as acct from '../services/accountService.js';
import * as returns from '../services/returnService.js';

const oid = z.string().regex(/^[a-f0-9]{24}$/, 'Invalid id');
export const accountRoutes = Router();
accountRoutes.use(requireAuth);

accountRoutes.get('/profile', (req, res) => ok(res, { user: req.user.toPublic() }));
accountRoutes.patch('/profile', validate({ body: z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().regex(/^\+?[0-9 ]{8,15}$/, 'Enter a valid phone number').or(z.literal('')).optional(),
  dateOfBirth: z.coerce.date().min(new Date('1900-01-01')).max(new Date()).or(z.literal('').transform(() => undefined)).optional(),
}).strict() }), asyncHandler(async (req, res) => {
  const body = { ...req.body }; if (body.phone === '') body.phone = undefined;
  ok(res, { user: await acct.updateProfile(req.user, body) });
}));
accountRoutes.put('/preferences', validate({ body: z.object({ orderUpdates: z.boolean().optional(), marketing: z.boolean().optional() }).strict() }),
  asyncHandler(async (req, res) => ok(res, { user: await acct.setPreferences(req.user, req.body) })));

accountRoutes.get('/sessions', asyncHandler(async (req, res) => ok(res, await acct.listSessions(req.user._id))));
accountRoutes.delete('/sessions', asyncHandler(async (req, res) => { await acct.revokeAllSessions(req.user._id); clearAuthCookies(res, 'customer'); ok(res, { signedOut: true }); }));
accountRoutes.post('/delete-account', validate({ body: z.object({ password: z.string().min(1).max(128) }).strict() }),
  asyncHandler(async (req, res) => { await acct.deleteAccount(req.user._id, req.body.password); clearAuthCookies(res, 'customer'); ok(res, { deleted: true }); }));

accountRoutes.get('/notifications', asyncHandler(async (req, res) => {
  const [items, unread] = await Promise.all([Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(30), Notification.countDocuments({ user: req.user._id, readAt: null })]);
  ok(res, { items, unread });
}));
accountRoutes.post('/notifications/read-all', asyncHandler(async (req, res) => { await Notification.updateMany({ user: req.user._id, readAt: null }, { $set: { readAt: new Date() } }); ok(res, { done: true }); }));
accountRoutes.patch('/notifications/:id/read', validate({ params: z.object({ id: oid }) }), asyncHandler(async (req, res) => {
  await Notification.updateOne({ _id: req.params.id, user: req.user._id }, { $set: { readAt: new Date() } }); ok(res, { done: true });
}));

accountRoutes.get('/returns', asyncHandler(async (req, res) => ok(res, await returns.listReturns(req.user._id))));
accountRoutes.get('/returns/:id', validate({ params: z.object({ id: oid }) }), asyncHandler(async (req, res) => ok(res, await returns.getReturn(req.user._id, req.params.id))));
accountRoutes.post('/returns', validate({ body: z.object({ orderId: oid, items: z.array(z.object({
  itemId: oid, qty: z.coerce.number().int().min(1).max(10), reason: z.enum(RETURN_REASONS), comment: z.string().trim().max(500).optional() }).strict()).min(1).max(20) }).strict() }),
asyncHandler(async (req, res) => ok(res, await returns.createReturn(req.user, req.body), 201)));
accountRoutes.post('/returns/:id/cancel', validate({ params: z.object({ id: oid }) }), asyncHandler(async (req, res) => ok(res, await returns.withdrawReturn(req.user._id, req.params.id))));
