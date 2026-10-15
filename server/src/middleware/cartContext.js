import crypto from 'node:crypto';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { verifyAccessToken } from '../utils/tokens.js';
import { env } from '../config/env.js';
import { COMMERCE } from '../config/commerce.js';

export const GUEST_COOKIE = 'nx_cart';
const guestCookieOpts = () => ({ httpOnly: true, secure: env.isProd, sameSite: env.COOKIE_SAMESITE, domain: env.COOKIE_DOMAIN, path: '/api', maxAge: COMMERCE.guestCartDays * 86400000 });

export async function optionalAuth(req, _res, next) {
  try {
    const token = req.cookies?.nx_at;
    if (!token) return next();
    let payload;
    try { payload = verifyAccessToken(token); } catch { throw ApiError.unauthorized('TOKEN_EXPIRED', 'Session expired'); }
    if (payload.typ !== 'customer') return next();
    const user = await User.findById(payload.sub);
    if (!user || user.status !== 'active') throw ApiError.unauthorized('ACCOUNT_DISABLED', 'Account unavailable');
    req.user = user;
    next();
  } catch (e) { next(e); }
}

export function cartIdentity(req, res, next) {
  if (req.user) { req.cartKey = { user: req.user._id }; return next(); }
  let id = req.cookies?.[GUEST_COOKIE];
  if (!/^[a-f0-9]{32}$/.test(id ?? '')) {
    id = crypto.randomBytes(16).toString('hex');
    res.cookie(GUEST_COOKIE, id, guestCookieOpts());
  }
  req.cartKey = { guestId: id };
  next();
}
export const clearGuestCookie = (res) => res.clearCookie(GUEST_COOKIE, { ...guestCookieOpts(), maxAge: undefined });
