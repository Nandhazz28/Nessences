import bcrypt from 'bcryptjs';
import { StaffUser } from '../../models/StaffUser.js';
import { ApiError } from '../../utils/ApiError.js';
import { hashPassword } from '../authService.js';
import { revokeAllSessions } from '../sessionService.js';

const LAST_SUPER = () => ApiError.conflict('LAST_SUPER_ADMIN', 'At least one active super admin must remain');
const otherActiveSupers = (id) => StaffUser.countDocuments({ role: 'super_admin', active: true, _id: { $ne: id } });

export const list = async () => (await StaffUser.find().sort({ createdAt: 1 }).lean()).map((s) => ({ id: s._id, name: s.name, email: s.email, role: s.role, active: s.active, mustChangePassword: s.mustChangePassword, lastLoginAt: s.lastLoginAt }));

export async function create({ name, email, role, password }) {
  if (await StaffUser.exists({ email })) throw ApiError.conflict('EMAIL_TAKEN', 'A staff account with this email already exists');
  const s = await StaffUser.create({ name, email, role, passwordHash: await hashPassword(password), mustChangePassword: true });
  return s;
}
export async function update(id, actor, { name, role, active }) {
  const s = await StaffUser.findById(id); if (!s) throw ApiError.notFound('STAFF_NOT_FOUND', 'Staff member not found');
  const isSelf = String(s._id) === String(actor._id);
  if (isSelf && (role !== undefined && role !== s.role)) throw ApiError.badRequest('SELF_ROLE_CHANGE', 'You cannot change your own role');
  if (isSelf && active === false) throw ApiError.badRequest('SELF_DEACTIVATE', 'You cannot deactivate your own account');
  const losesSuper = s.role === 'super_admin' && s.active && ((role && role !== 'super_admin') || active === false);
  if (losesSuper && (await otherActiveSupers(s._id)) === 0) throw LAST_SUPER();
  const before = { role: s.role, active: s.active };
  if (name !== undefined) s.name = name; if (role !== undefined) s.role = role; if (active !== undefined) s.active = active;
  await s.save();
  if (active === false || (role !== undefined && role !== before.role)) await revokeAllSessions(s._id, 'staff'); // permission change takes effect immediately
  return { staff: s, before };
}
export async function resetPassword(id, password) {
  const s = await StaffUser.findById(id); if (!s) throw ApiError.notFound('STAFF_NOT_FOUND', 'Staff member not found');
  s.passwordHash = await hashPassword(password); s.mustChangePassword = true; s.failedLogins = 0; s.lockUntil = undefined;
  await s.save(); await revokeAllSessions(s._id, 'staff'); return s;
}
export async function changeOwnPassword(id, current, next) {
  const s = await StaffUser.findById(id).select('+passwordHash'); 
  if (!(await bcrypt.compare(current, s.passwordHash))) throw ApiError.badRequest('WRONG_PASSWORD', 'Current password is incorrect');
  s.passwordHash = await hashPassword(next); s.mustChangePassword = false; await s.save(); await revokeAllSessions(s._id, 'staff');
}
