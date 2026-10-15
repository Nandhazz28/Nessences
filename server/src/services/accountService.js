import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { Address } from '../models/Address.js';
import { Cart } from '../models/Cart.js';
import { Wishlist } from '../models/Wishlist.js';
import { Order } from '../models/Order.js';
import { Notification } from '../models/Notification.js';
import { ApiError } from '../utils/ApiError.js';
import { listLiveSessions, revokeAllSessions as revokeAll } from './sessionService.js';

export async function updateProfile(user, data) {
  user.set(data); await user.save(); return user.toPublic();
}
export async function setPreferences(user, prefs) { user.preferences = { ...user.preferences?.toObject?.(), ...prefs }; await user.save(); return user.toPublic(); }

export async function listSessions(userId) {
  return (await listLiveSessions(userId, 'customer')).map((t) => ({ id: t.hash.slice(0, 12), device: summariseAgent(t.userAgent), expiresAt: t.expiresAt }));
}
const summariseAgent = (ua = '') => {
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown device';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${br} on ${os}`;
};
export const revokeAllSessions = (userId) => revokeAll(userId, 'customer');

const OPEN = ['pending_payment', 'confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery'];
export async function deleteAccount(userId, password) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!(await bcrypt.compare(password, user.passwordHash))) throw ApiError.badRequest('WRONG_PASSWORD', 'Password is incorrect');
  if (await Order.exists({ user: userId, status: { $in: OPEN } })) throw ApiError.conflict('OPEN_ORDERS', 'You have orders in progress. You can delete your account once they are delivered or cancelled.');
  user.name = 'Deleted customer'; user.email = `deleted+${user._id}@invalid.local`; user.phone = undefined; user.dateOfBirth = undefined;
  user.status = 'deleted'; user.preferences = { orderUpdates: false, marketing: false };
  user.passwordHash = await bcrypt.hash(`${user._id}${Date.now()}${Math.random()}`, 10);
  await user.save({ validateBeforeSave: false });
  await Promise.all([revokeAll(userId, 'customer'), Address.deleteMany({ user: userId }), Cart.deleteMany({ user: userId }), Wishlist.deleteMany({ user: userId }), Notification.deleteMany({ user: userId })]);
}
