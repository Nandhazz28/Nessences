import { NewsletterSubscriber } from '../../models/NewsletterSubscriber.js';
import { ApiError } from '../../utils/ApiError.js';
import { env } from '../../config/env.js';
import { randomToken, sha256 } from '../../utils/tokens.js';
import { sendEmail } from '../emailService.js';

// Double opt-in: nobody is subscribed until they click the link sent to their own inbox.
export async function subscribe(email, source = 'footer') {
  let sub = await NewsletterSubscriber.findOne({ email }).select('+unsubscribeToken');
  if (sub?.status === 'subscribed') return; // identical response either way — no enumeration
  const token = randomToken(32);
  if (!sub) sub = new NewsletterSubscriber({ email, source });
  sub.status = 'pending'; sub.confirmTokenHash = sha256(token); sub.unsubscribeToken ??= randomToken(24);
  await sub.save();
  await sendEmail({ to: email, template: 'newsletterConfirm', data: { link: `${env.CLIENT_URL}/newsletter/confirm?token=${token}` } });
}
export async function confirm(token) {
  const sub = await NewsletterSubscriber.findOneAndUpdate({ confirmTokenHash: sha256(token), status: 'pending' },
    { $set: { status: 'subscribed', subscribedAt: new Date() }, $unset: { confirmTokenHash: 1 } }, { new: true }).select('+unsubscribeToken');
  if (!sub) throw ApiError.badRequest('INVALID_TOKEN', 'This confirmation link is invalid or has already been used');
  await sendEmail({ to: sub.email, template: 'newsletterWelcome', data: { link: `${env.CLIENT_URL}/newsletter/unsubscribe?token=${sub.unsubscribeToken}` } });
}
export async function unsubscribe(token) {
  const sub = await NewsletterSubscriber.findOneAndUpdate({ unsubscribeToken: token }, { $set: { status: 'unsubscribed', unsubscribedAt: new Date() } });
  if (!sub) throw ApiError.badRequest('INVALID_TOKEN', 'This unsubscribe link is not valid');
}

const csvCell = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; }; // blocks spreadsheet formula injection
export const toCsv = (rows) => ['email,status,source,subscribed_at', ...rows.map((r) => [r.email, r.status, r.source, r.subscribedAt?.toISOString() ?? ''].map(csvCell).join(','))].join('\n');

export async function adminList({ status, page, limit }) {
  const f = status ? { status } : {};
  const [rows, total, counts] = await Promise.all([NewsletterSubscriber.find(f).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), NewsletterSubscriber.countDocuments(f), NewsletterSubscriber.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }])]);
  return { items: rows.map((r) => ({ id: r._id, email: r.email, status: r.status, source: r.source, subscribedAt: r.subscribedAt })), pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }, counts: Object.fromEntries(counts.map((c) => [c._id, c.n])) };
}
export const exportSubscribed = () => NewsletterSubscriber.find({ status: 'subscribed' }).sort({ subscribedAt: -1 }).limit(100000).lean();
