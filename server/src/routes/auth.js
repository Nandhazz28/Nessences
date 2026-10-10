import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { authLimiter, staffLoginLimiter } from '../middleware/security.js';
import { requireAuth, requireStaff } from '../middleware/auth.js';
import * as c from '../controllers/authController.js';

const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(8, 'Use at least 8 characters').max(128)
  .regex(/[A-Za-z]/, 'Include at least one letter').regex(/[0-9]/, 'Include at least one number');
const token = z.string().regex(/^[a-f0-9]{64}$/, 'Invalid token');
const phone = z.string().trim().regex(/^\+?[0-9 ]{8,15}$/, 'Enter a valid phone number').optional();

export const customerAuth = Router();
customerAuth.post('/register', authLimiter, validate({ body: z.object({ name: z.string().trim().min(2).max(80), email, password, phone }).strict() }), c.register);
customerAuth.post('/login', authLimiter, validate({ body: z.object({ email, password: z.string().min(1).max(128) }).strict() }), c.login);
customerAuth.post('/refresh', c.refresh);
customerAuth.post('/logout', c.logout);
customerAuth.get('/me', requireAuth, c.me);
customerAuth.post('/verify-email', authLimiter, validate({ body: z.object({ token }).strict() }), c.verifyEmail);
customerAuth.post('/resend-verification', authLimiter, validate({ body: z.object({ email }).strict() }), c.resendVerification);
customerAuth.post('/forgot-password', authLimiter, validate({ body: z.object({ email }).strict() }), c.forgotPassword);
customerAuth.post('/reset-password', authLimiter, validate({ body: z.object({ token, password }).strict() }), c.resetPassword);
customerAuth.post('/change-password', requireAuth, validate({ body: z.object({ currentPassword: z.string().min(1).max(128), newPassword: password }).strict() }), c.changePassword);

import * as staffSvc from '../services/engage/staffService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/respond.js';
import { audit } from '../services/auditService.js';
import { clearAuthCookies } from '../services/sessionService.js';

export const staffAuth = Router();
staffAuth.post('/login', staffLoginLimiter, validate({ body: z.object({ email, password: z.string().min(1).max(128) }).strict() }), c.staffLogin);
staffAuth.post('/refresh', c.staffRefresh);
staffAuth.post('/logout', c.staffLogout);
staffAuth.get('/me', requireStaff, c.staffMe);
staffAuth.post('/change-password', requireStaff, validate({ body: z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(10, 'Use at least 10 characters').max(128).regex(/[A-Za-z]/, 'Include a letter').regex(/[0-9]/, 'Include a number') }).strict() }),
  asyncHandler(async (req, res) => { await staffSvc.changeOwnPassword(req.staff._id, req.body.currentPassword, req.body.newPassword); await audit(req, { action: 'staff.password_changed', resource: 'StaffUser', resourceId: req.staff._id }); clearAuthCookies(res, 'staff'); ok(res, { changed: true, reauthenticate: true }); }));
