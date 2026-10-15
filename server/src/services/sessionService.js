import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { Session } from '../models/Session.js';
import { randomToken, sha256, signAccessToken, REFRESH_TTL_MS } from '../utils/tokens.js';

const SCOPES = {
  customer: { typ: 'customer', at: 'nx_at', rt: 'nx_rt', rtPath: '/api/auth' },
  staff: { typ: 'staff', at: 'nx_staff_at', rt: 'nx_staff_rt', rtPath: '/api/admin/auth' },
};
export const scopeOf = (s) => SCOPES[s];

const MAX_SESSIONS = 5;           
const REUSE_RETENTION_MS = 10 * 60 * 1000; 
const cookieBase = () => ({ httpOnly: true, secure: env.isProd, sameSite: env.COOKIE_SAMESITE, domain: env.COOKIE_DOMAIN });
export function setAuthCookies(res, scope, { accessToken, refreshToken }) {
  const s = SCOPES[scope];
  res.cookie(s.at, accessToken, { ...cookieBase(), path: '/api', maxAge: REFRESH_TTL_MS });
  res.cookie(s.rt, refreshToken, { ...cookieBase(), path: s.rtPath, maxAge: REFRESH_TTL_MS });
}
export function clearAuthCookies(res, scope) {
  const s = SCOPES[scope];
  res.clearCookie(s.at, { ...cookieBase(), path: '/api' });
  res.clearCookie(s.rt, { ...cookieBase(), path: s.rtPath });
}
export const isSessionEnded = (e) => e instanceof ApiError && (e.status === 401 || e.status === 403);

export async function issueSession(doc, scope, userAgent, family = randomToken(12)) {
  const raw = `${doc._id}.${randomToken(40)}`;
  await Session.create({ account: doc._id, scope, family, hash: sha256(raw), expiresAt: new Date(Date.now() + REFRESH_TTL_MS), userAgent: userAgent?.slice(0, 200) });
  const live = await Session.find({ account: doc._id, scope, rotatedAt: null }).sort({ createdAt: 1, _id: 1 }).select('_id').lean();
  if (live.length > MAX_SESSIONS) await Session.deleteMany({ _id: { $in: live.slice(0, live.length - MAX_SESSIONS).map((x) => x._id) } });
  return { accessToken: signAccessToken({ id: doc._id, typ: SCOPES[scope].typ, role: doc.role }), refreshToken: raw };
}

const inactive = (a) => (a.status && a.status !== 'active') || a.active === false;

export async function rotateSession(Model, scope, rawRefresh, userAgent) {
  if (!rawRefresh) throw ApiError.unauthorized('NO_REFRESH_TOKEN', 'Session expired');
  const id = String(rawRefresh).split('.')[0];
  if (!/^[a-f0-9]{24}$/.test(id)) throw ApiError.unauthorized('INVALID_REFRESH_TOKEN', 'Session expired');
  const hash = sha256(rawRefresh);
  const now = new Date();
  const own = { hash, scope, account: id };

  const won = await Session.findOneAndUpdate({ ...own, rotatedAt: null, expiresAt: { $gt: now } },
    { $set: { rotatedAt: now, expiresAt: new Date(Math.min(Date.now() + REUSE_RETENTION_MS, now.getTime() + REFRESH_TTL_MS)) } }, { returnDocument: 'before' }).lean();
  let family = won?.family;

  if (!won) {
    const seen = await Session.findOne(own).lean();
    if (!seen) throw ApiError.unauthorized('INVALID_REFRESH_TOKEN', 'Session expired'); // unknown or already revoked: says nothing about the account's other sessions
    if (!seen.rotatedAt) { await Session.deleteOne({ _id: seen._id }); throw ApiError.unauthorized('REFRESH_EXPIRED', 'Session expired. Please sign in again.'); }
    if (now - seen.rotatedAt > env.REFRESH_REUSE_GRACE_SECONDS * 1000) {
      await Session.deleteMany({ family: seen.family });
      throw ApiError.unauthorized('REFRESH_REUSE_DETECTED', 'Session expired. Please sign in again.');
    }
    family = seen.family;
  }

  const account = await Model.findById(id);
  if (!account || inactive(account)) {
    await Session.deleteMany({ family });
    throw ApiError.forbidden('ACCOUNT_DISABLED', 'Account disabled');
  }
  return { account, tokens: await issueSession(account, scope, userAgent, family) };
}

export async function revokeSession(rawRefresh, scope) {
  if (!rawRefresh) return;
  const hash = sha256(String(rawRefresh));
  const s = await Session.findOne({ hash, ...(scope ? { scope } : {}) }).select('family').lean();
  if (s) await Session.deleteMany({ family: s.family });
}
export const revokeAllSessions = (accountId, scope) => Session.deleteMany({ account: accountId, ...(scope ? { scope } : {}) });
export const listLiveSessions = (accountId, scope = 'customer') => Session.find({ account: accountId, scope, rotatedAt: null, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 }).lean();
