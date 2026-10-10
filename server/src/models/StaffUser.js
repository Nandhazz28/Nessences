import mongoose from 'mongoose';
import { ROLES } from '../config/permissions.js';

const staffSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ROLES, required: true },
  active: { type: Boolean, default: true },
  mustChangePassword: { type: Boolean, default: false },
  failedLogins: { type: Number, default: 0, select: false },
  lockUntil: { type: Date, select: false },
  refreshTokens: { type: [{ hash: String, expiresAt: Date, userAgent: String, _id: false }], default: [], select: false },
  lastLoginAt: Date,
}, { timestamps: true });

staffSchema.methods.toPublic = function () {
  return { id: this._id, name: this.name, email: this.email, role: this.role, active: this.active, mustChangePassword: this.mustChangePassword, lastLoginAt: this.lastLoginAt };
};

export const StaffUser = mongoose.model('StaffUser', staffSchema);
