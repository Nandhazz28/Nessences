import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import { StaffUser } from "../models/StaffUser.js";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";
import { randomToken, sha256 } from "../utils/tokens.js";
import { sendEmail } from "./emailService.js";
import { mailCustomer } from "./customerMail.js";
import { logger } from "../config/logger.js";
import { issueSession, revokeAllSessions } from "./sessionService.js";

const BCRYPT_COST = 12;
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_COST);

export const hashPassword = (pw) => bcrypt.hash(pw, BCRYPT_COST);

async function sendVerification(user) {
  const token = randomToken(32);
  user.verifyTokenHash = sha256(token);
  user.verifyTokenExpires = new Date(Date.now() + 24 * 3600 * 1000);
  await user.save({ validateBeforeSave: false });
  return sendEmail({
    to: user.email,
    template: "verifyEmail",
    data: {
      name: user.name,
      link: `${env.CLIENT_URL}/verify-email?token=${token}`,
    },
  });
}

export async function register({ name, email, password, phone }) {
  if (await User.exists({ email }))
    throw ApiError.conflict(
      "EMAIL_TAKEN",
      "An account with this email already exists",
    );
  const user = await User.create({
    name,
    email,
    phone,
    passwordHash: await hashPassword(password),
    emailVerified: !env.REQUIRE_EMAIL_VERIFICATION,
  });
  let emailResult = { accepted: false };
  if (env.REQUIRE_EMAIL_VERIFICATION)
    emailResult = await sendVerification(user);
  else
    mailCustomer(user._id, "welcome", {
      link: `${env.CLIENT_URL}/collections`,
    }); // verification is off: the account is usable now
  return {
    user,
    verificationRequired: env.REQUIRE_EMAIL_VERIFICATION,
    emailAccepted: emailResult.accepted,
  }; // accepted by the provider, not confirmed delivered
}

async function checkCredentials(Model, email, password, { requireVerified }) {
  const acct = await Model.findOne({ email }).select(
    "+passwordHash +failedLogins +lockUntil",
  );
  const match = await bcrypt.compare(
    password,
    acct?.passwordHash ?? DUMMY_HASH,
  );
  if (acct?.lockUntil && acct.lockUntil > new Date())
    throw new ApiError(
      429,
      "ACCOUNT_LOCKED",
      "Too many failed attempts. Try again in a few minutes.",
    );
  if (!acct || !match) {
    if (acct) {
      acct.failedLogins = (acct.failedLogins ?? 0) + 1;
      if (acct.failedLogins >= MAX_FAILS) {
        acct.lockUntil = new Date(Date.now() + LOCK_MS);
        acct.failedLogins = 0;
      }
      await acct.save({ validateBeforeSave: false });
    }
    throw ApiError.unauthorized(
      "INVALID_CREDENTIALS",
      "Incorrect email or password",
    );
  }
  if ((acct.status && acct.status !== "active") || acct.active === false)
    throw ApiError.forbidden(
      "ACCOUNT_DISABLED",
      "This account has been disabled",
    );
  if (requireVerified && !acct.emailVerified)
    throw ApiError.forbidden(
      "EMAIL_NOT_VERIFIED",
      "Please verify your email address before signing in",
    );
  acct.failedLogins = 0;
  acct.lockUntil = undefined;
  acct.lastLoginAt = new Date();
  await acct.save({ validateBeforeSave: false });
  return acct;
}

export async function loginCustomer({ email, password }, userAgent) {
  const user = await checkCredentials(User, email, password, {
    requireVerified: env.REQUIRE_EMAIL_VERIFICATION,
  });
  return { user, tokens: await issueSession(user, "customer", userAgent) };
}
export async function loginStaff({ email, password }, userAgent) {
  const staff = await checkCredentials(StaffUser, email, password, {
    requireVerified: false,
  });
  return { staff, tokens: await issueSession(staff, "staff", userAgent) };
}

export async function verifyEmail(token) {
  const user = await User.findOne({
    verifyTokenHash: sha256(token),
    verifyTokenExpires: { $gt: new Date() },
  }).select("+verifyTokenHash +verifyTokenExpires");
  if (!user)
    throw ApiError.badRequest(
      "INVALID_TOKEN",
      "This verification link is invalid or has expired",
    );
  user.emailVerified = true;
  user.verifyTokenHash = undefined;
  user.verifyTokenExpires = undefined;
  await user.save({ validateBeforeSave: false });
  mailCustomer(user._id, "welcome", { link: `${env.CLIENT_URL}/collections` });
}

export async function resendVerification(email) {
  const user = await User.findOne({ email, emailVerified: false });
  // Same response and same timing whether or not the account exists: the send is not awaited.
  if (user)
    sendVerification(user).catch((err) =>
      logger.error({ err: err?.message }, "verification email failed"),
    );
}

export async function forgotPassword(email) {
  const user = await User.findOne({ email }).select(
    "+resetTokenHash +resetTokenExpires",
  );
  if (!user) return;
  const token = randomToken(32);
  user.resetTokenHash = sha256(token);
  user.resetTokenExpires = new Date(Date.now() + 3600 * 1000);
  await user.save({ validateBeforeSave: false });
  // Not awaited: the response time must not reveal whether the address belongs to an account.
  sendEmail({
    to: user.email,
    template: "resetPassword",
    data: {
      name: user.name,
      link: `${env.CLIENT_URL}/reset-password?token=${token}`,
    },
  }).catch((err) => logger.error({ err: err?.message }, "reset email failed"));
}

export async function resetPassword(token, password) {
  const user = await User.findOne({
    resetTokenHash: sha256(token),
    resetTokenExpires: { $gt: new Date() },
  }).select("+resetTokenHash +resetTokenExpires");
  if (!user)
    throw ApiError.badRequest(
      "INVALID_TOKEN",
      "This reset link is invalid or has expired",
    );
  user.passwordHash = await hashPassword(password);
  user.resetTokenHash = undefined;
  user.resetTokenExpires = undefined;
  await user.save({ validateBeforeSave: false });
  await revokeAllSessions(user._id, "customer");
  mailCustomer(user._id, "passwordChanged", { changedAt: new Date() });
}

export async function changePassword(userId, current, next) {
  const user = await User.findById(userId).select("+passwordHash");
  if (!(await bcrypt.compare(current, user.passwordHash)))
    throw ApiError.badRequest(
      "WRONG_PASSWORD",
      "Current password is incorrect",
    );
  user.passwordHash = await hashPassword(next);
  await user.save({ validateBeforeSave: false });
  await revokeAllSessions(user._id, "customer");
  mailCustomer(user._id, "passwordChanged", { changedAt: new Date() });
}
