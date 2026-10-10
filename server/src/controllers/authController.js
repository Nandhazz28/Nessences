import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/respond.js';
import { User } from '../models/User.js';
import { StaffUser } from '../models/StaffUser.js';
import * as auth from '../services/authService.js';
import { setAuthCookies, clearAuthCookies, rotateSession, revokeSession, scopeOf } from '../services/sessionService.js';
import { audit } from '../services/auditService.js';
import { mergeGuestCart } from '../services/cartService.js';
import { GUEST_COOKIE, clearGuestCookie } from '../middleware/cartContext.js';

const ua = (req) => req.get('user-agent');

export const register = asyncHandler(async (req, res) => {
  const r = await auth.register(req.body);
  ok(res, { user: r.user.toPublic(), verificationRequired: r.verificationRequired, emailAccepted: r.emailAccepted }, 201);
});
export const login = asyncHandler(async (req, res) => {
  const { user, tokens } = await auth.loginCustomer(req.body, ua(req));
  setAuthCookies(res, 'customer', tokens);
  await mergeGuestCart(user, req.cookies?.[GUEST_COOKIE]).catch(() => {}); // never block sign-in on a cart problem
  clearGuestCookie(res);
  ok(res, { user: user.toPublic() });
});
export const refresh = asyncHandler(async (req, res) => {
  try {
    const { account, tokens } = await rotateSession(User, 'customer', req.cookies?.[scopeOf('customer').rt], ua(req));
    setAuthCookies(res, 'customer', tokens);
    ok(res, { user: account.toPublic() });
  } catch (e) { clearAuthCookies(res, 'customer'); throw e; }
});
export const logout = asyncHandler(async (req, res) => {
  await revokeSession(User, req.cookies?.[scopeOf('customer').rt]);
  clearAuthCookies(res, 'customer');
  ok(res, { loggedOut: true });
});
export const me = asyncHandler(async (req, res) => ok(res, { user: req.user.toPublic() }));
export const verifyEmail = asyncHandler(async (req, res) => { await auth.verifyEmail(req.body.token); ok(res, { verified: true }); });
export const resendVerification = asyncHandler(async (req, res) => {
  await auth.resendVerification(req.body.email);
  ok(res, { message: 'If that account exists and is unverified, a new link has been sent.' });
});
export const forgotPassword = asyncHandler(async (req, res) => {
  await auth.forgotPassword(req.body.email);
  ok(res, { message: 'If an account exists for that email, a reset link has been sent.' });
});
export const resetPassword = asyncHandler(async (req, res) => { await auth.resetPassword(req.body.token, req.body.password); ok(res, { reset: true }); });
export const changePassword = asyncHandler(async (req, res) => {
  await auth.changePassword(req.user._id, req.body.currentPassword, req.body.newPassword);
  clearAuthCookies(res, 'customer');
  ok(res, { changed: true, reauthenticate: true });
});

// ---- staff ----
export const staffLogin = asyncHandler(async (req, res) => {
  const { staff, tokens } = await auth.loginStaff(req.body, ua(req));
  setAuthCookies(res, 'staff', tokens);
  await audit(req, { action: 'staff.login', resource: 'StaffUser', resourceId: staff._id, actor: staff });
  ok(res, { staff: staff.toPublic() });
});
export const staffRefresh = asyncHandler(async (req, res) => {
  try {
    const { account, tokens } = await rotateSession(StaffUser, 'staff', req.cookies?.[scopeOf('staff').rt], ua(req));
    setAuthCookies(res, 'staff', tokens);
    ok(res, { staff: account.toPublic() });
  } catch (e) { clearAuthCookies(res, 'staff'); throw e; }
});
export const staffLogout = asyncHandler(async (req, res) => {
  await revokeSession(StaffUser, req.cookies?.[scopeOf('staff').rt]);
  clearAuthCookies(res, 'staff');
  ok(res, { loggedOut: true });
});
export const staffMe = asyncHandler(async (req, res) => ok(res, { staff: req.staff.toPublic() }));
