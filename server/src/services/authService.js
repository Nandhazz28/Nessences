import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { StaffUser } from '../models/StaffUser.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { randomToken, sha256 } from '../utils/tokens.js';
import { sendEmail } from './emailService.js';
import { issueSession } from './sessionService.js';

const BCRYPT_COST = 12;
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
// Pre-computed hash so login timing does not reveal whether an email exists.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST);

export const hashPassword = (pw) => bcrypt.hash(pw, BCRYPT_COST);

async function sendVerification(user) {
  const token = randomToken(32);
  user.verifyTokenHash = sha256(token);
  user.verifyTokenExpires = new Date(Date.now() + 24 * 3600 * 1000);
  await user.save({ validateBeforeSave: false });
  return sendEmail({ to: user.email, template: 'verifyEmail', data: { link: `${env.CLIENT_URL}/verify-email?token=${token}` } });
}

export async function register({ name, email, password, phone }) {
  if (await User.exists({ email })) throw ApiError.conflict('EMAIL_TAKEN', 'An account with this email already exists');
  const user = await User.create({
    name, email, phone, passwordHash: await hashPassword(password),
    emailVerified: !env.REQUIRE_EMAIL_VERIFICATION,
  });
  let emailResult = { accepted: false };
  if (env.REQUIRE_EMAIL_VERIFICATION) emailResult = await sendVerification(user);
  return { user, verificationRequired: env.REQUIRE_EMAIL_VERIFICATION, emailAccepted: emailResult.accepted }; // accepted by the provider, not confirmed delivered
}

async function checkCredentials(Model, email, password, { requireVerified }) {
  const acct = await Model.findOne({ email }).select('+passwordHash +failedLogins +lockUntil');
  const match = await bcrypt.compare(password, acct?.passwordHash ?? DUMMY_HASH);
  if (acct?.lockUntil && acct.lockUntil > new Date()) throw new ApiError(429, 'ACCOUNT_LOCKED', 'Too many failed attempts. Try again in a few minutes.');
  if (!acct || !match) {
    if (acct) {
      acct.failedLogins = (acct.failedLogins ?? 0) + 1;
      if (acct.failedLogins >= MAX_FAILS) { acct.lockUntil = new Date(Date.now() + LOCK_MS); acct.failedLogins = 0; }
      await acct.save({ validateBeforeSave: false });
    }
    throw ApiError.unauthorized('INVALID_CREDENTIALS', 'Incorrect email or password');
  }
  if ((acct.status && acct.status !== 'active') || acct.active === false) throw ApiError.forbidden('ACCOUNT_DISABLED', 'This account has been disabled');
  if (requireVerified && !acct.emailVerified) throw ApiError.forbidden('EMAIL_NOT_VERIFIED', 'Please verify your email address before signing in');
  acct.failedLogins = 0; acct.lockUntil = undefined; acct.lastLoginAt = new Date();
  await acct.save({ validateBeforeSave: false });
  return acct;
}

export async function loginCustomer({ email, password }, userAgent) {
  const user = await checkCredentials(User, email, password, { requireVerified: env.REQUIRE_EMAIL_VERIFICATION });
  return { user, tokens: await issueSession(user, 'customer', userAgent) };
}
export async function loginStaff({ email, password }, userAgent) {
  const staff = await checkCredentials(StaffUser, email, password, { requireVerified: false });
  return { staff, tokens: await issueSession(staff, 'staff', userAgent) };
}

export async function verifyEmail(token) {
  const user = await User.findOne({ verifyTokenHash: sha256(token), verifyTokenExpires: { $gt: new Date() } })
    .select('+verifyTokenHash +verifyTokenExpires');
  if (!user) throw ApiError.badRequest('INVALID_TOKEN', 'This verification link is invalid or has expired');
  user.emailVerified = true; user.verifyTokenHash = undefined; user.verifyTokenExpires = undefined;
  await user.save({ validateBeforeSave: false });
}

export async function resendVerification(email) {
  const user = await User.findOne({ email, emailVerified: false });
  if (user) await sendVerification(user); // identical response either way (no enumeration)
}

export async function forgotPassword(email) {
  const user = await User.findOne({ email }).select('+resetTokenHash +resetTokenExpires');
  if (!user) return;
  const token = randomToken(32);
  user.resetTokenHash = sha256(token);
  user.resetTokenExpires = new Date(Date.now() + 3600 * 1000);
  await user.save({ validateBeforeSave: false });
  await sendEmail({ to: user.email, template: 'resetPassword', data: { link: `${env.CLIENT_URL}/reset-password?token=${token}` } });
}

export async function resetPassword(token, password) {
  const user = await User.findOne({ resetTokenHash: sha256(token), resetTokenExpires: { $gt: new Date() } })
    .select('+resetTokenHash +resetTokenExpires +refreshTokens');
  if (!user) throw ApiError.badRequest('INVALID_TOKEN', 'This reset link is invalid or has expired');
  user.passwordHash = await hashPassword(password);
  user.resetTokenHash = undefined; user.resetTokenExpires = undefined;
  user.refreshTokens = []; // sign out everywhere
  await user.save({ validateBeforeSave: false });
}

export async function changePassword(userId, current, next) {
  const user = await User.findById(userId).select('+passwordHash +refreshTokens');
  if (!(await bcrypt.compare(current, user.passwordHash))) throw ApiError.badRequest('WRONG_PASSWORD', 'Current password is incorrect');
  user.passwordHash = await hashPassword(next);
  user.refreshTokens = [];
  await user.save({ validateBeforeSave: false });
}
