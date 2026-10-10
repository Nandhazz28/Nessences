import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { randomToken, sha256, signAccessToken, ACCESS_TTL_SECONDS, REFRESH_TTL_MS } from '../utils/tokens.js';

const SCOPES = {
  customer: { typ: 'customer', at: 'nx_at', rt: 'nx_rt', rtPath: '/api/auth' },
  staff: { typ: 'staff', at: 'nx_staff_at', rt: 'nx_staff_rt', rtPath: '/api/admin/auth' },
};
export const scopeOf = (s) => SCOPES[s];

const cookieBase = () => ({
  httpOnly: true, secure: env.isProd, sameSite: env.COOKIE_SAMESITE, domain: env.COOKIE_DOMAIN,
});

export function setAuthCookies(res, scope, { accessToken, refreshToken }) {
  const s = SCOPES[scope];
  res.cookie(s.at, accessToken, { ...cookieBase(), path: '/api', maxAge: ACCESS_TTL_SECONDS * 1000 });
  res.cookie(s.rt, refreshToken, { ...cookieBase(), path: s.rtPath, maxAge: REFRESH_TTL_MS });
}
export function clearAuthCookies(res, scope) {
  const s = SCOPES[scope];
  res.clearCookie(s.at, { ...cookieBase(), path: '/api' });
  res.clearCookie(s.rt, { ...cookieBase(), path: s.rtPath });
}

// Refresh token format: "<accountId>.<random>"; only the SHA-256 hash is stored.
export async function issueSession(doc, scope, userAgent) {
  const s = SCOPES[scope];
  const raw = `${doc._id}.${randomToken(40)}`;
  const fresh = await doc.constructor.findById(doc._id).select('+refreshTokens');
  const live = fresh.refreshTokens.filter((t) => t.expiresAt > new Date()).slice(-4); // cap 5 devices
  live.push({ hash: sha256(raw), expiresAt: new Date(Date.now() + REFRESH_TTL_MS), userAgent: userAgent?.slice(0, 200) });
  fresh.refreshTokens = live;
  await fresh.save({ validateBeforeSave: false });
  return { accessToken: signAccessToken({ id: doc._id, typ: s.typ, role: doc.role }), refreshToken: raw };
}

export async function rotateSession(Model, scope, rawRefresh, userAgent) {
  if (!rawRefresh) throw ApiError.unauthorized('NO_REFRESH_TOKEN', 'Session expired');
  const id = rawRefresh.split('.')[0];
  if (!/^[a-f0-9]{24}$/.test(id)) throw ApiError.unauthorized('INVALID_REFRESH_TOKEN', 'Session expired');
  const account = await Model.findById(id).select('+refreshTokens');
  if (!account) throw ApiError.unauthorized('INVALID_REFRESH_TOKEN', 'Session expired');
  const hash = sha256(rawRefresh);
  const entry = account.refreshTokens.find((t) => t.hash === hash);
  if (!entry || entry.expiresAt < new Date()) {
    // Unknown/expired token for a real account = possible theft/reuse -> revoke every session.
    account.refreshTokens = [];
    await account.save({ validateBeforeSave: false });
    throw ApiError.unauthorized('REFRESH_REUSE_DETECTED', 'Session expired. Please sign in again.');
  }
  if ((account.status && account.status !== 'active') || account.active === false) throw ApiError.forbidden('ACCOUNT_DISABLED', 'Account disabled');
  account.refreshTokens = account.refreshTokens.filter((t) => t.hash !== hash);
  await account.save({ validateBeforeSave: false });
  return { account, tokens: await issueSession(account, scope, userAgent) };
}

export async function revokeSession(Model, rawRefresh) {
  if (!rawRefresh) return;
  const id = rawRefresh.split('.')[0];
  if (!/^[a-f0-9]{24}$/.test(id)) return;
  await Model.updateOne({ _id: id }, { $pull: { refreshTokens: { hash: sha256(rawRefresh) } } });
}
