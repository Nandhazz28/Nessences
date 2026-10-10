import { User } from '../models/User.js';
import { StaffUser } from '../models/StaffUser.js';
import { ApiError } from '../utils/ApiError.js';
import { verifyAccessToken } from '../utils/tokens.js';
import { scopeOf } from '../services/sessionService.js';
import { can } from '../config/permissions.js';

const load = (scope, Model) => async (req, _res, next) => {
  try {
    const token = req.cookies?.[scopeOf(scope).at];
    if (!token) throw ApiError.unauthorized();
    let payload;
    try { payload = verifyAccessToken(token); } catch { throw ApiError.unauthorized('TOKEN_EXPIRED', 'Session expired'); }
    if (payload.typ !== scopeOf(scope).typ) throw ApiError.unauthorized(); // customer tokens never work on staff routes
    const acct = await Model.findById(payload.sub);
    if (!acct || (acct.status && acct.status !== 'active') || acct.active === false) throw ApiError.unauthorized('ACCOUNT_DISABLED', 'Account unavailable');
    req[scope === 'staff' ? 'staff' : 'user'] = acct; // role always read from DB, never from the token or client
    next();
  } catch (e) { next(e); }
};

export const requireAuth = load('customer', User);
export const requireStaff = load('staff', StaffUser);
export const requirePermission = (permission) => {
  const mw = (req, _res, next) => (can(req.staff?.role, permission) ? next() : next(ApiError.forbidden('INSUFFICIENT_PERMISSIONS')));
  Object.defineProperty(mw, 'name', { value: `perm:${permission}` }); // lets tests prove every admin route is guarded
  return mw;
};

// Passes if the staff member holds at least one of the listed permissions.
export const requireAnyPermission = (...permissions) => {
  const mw = (req, _res, next) => (permissions.some((p) => can(req.staff?.role, p)) ? next() : next(ApiError.forbidden('INSUFFICIENT_PERMISSIONS')));
  Object.defineProperty(mw, 'name', { value: `perm:${permissions.join('|')}` });
  return mw;
};
