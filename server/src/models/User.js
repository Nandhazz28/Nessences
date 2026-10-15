import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  phone: { type: String, trim: true, match: [/^\+?[0-9 ]{8,15}$/, 'Invalid phone number'] },
  dateOfBirth: Date,
  role: { type: String, enum: ['customer'], default: 'customer' },
  status: { type: String, enum: ['active', 'suspended', 'deleted'], default: 'active', index: true },
  emailVerified: { type: Boolean, default: false },
  preferences: { orderUpdates: { type: Boolean, default: true }, marketing: { type: Boolean, default: false } },
  verifyTokenHash: { type: String, select: false },
  verifyTokenExpires: { type: Date, select: false },
  resetTokenHash: { type: String, select: false },
  resetTokenExpires: { type: Date, select: false },
  failedLogins: { type: Number, default: 0, select: false },
  lockUntil: { type: Date, select: false },
  lastLoginAt: Date,
}, { timestamps: true });

userSchema.index({ createdAt: -1 });
userSchema.methods.toPublic = function () {
  return { id: this._id, name: this.name, email: this.email, phone: this.phone, role: this.role,
    emailVerified: this.emailVerified, preferences: this.preferences, dateOfBirth: this.dateOfBirth, createdAt: this.createdAt };
};

export const User = mongoose.model('User', userSchema);
