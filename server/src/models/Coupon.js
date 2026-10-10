import mongoose from 'mongoose';

const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true, match: /^[A-Z0-9_-]{3,24}$/ },
  description: String,
  type: { type: String, enum: ['percent', 'fixed'], required: true },
  value: { type: Number, required: true, min: 1 },          // percent: 1-100 ; fixed: paise
  maxDiscount: { type: Number, min: 0 },                   // cap for percent coupons (paise)
  minOrder: { type: Number, default: 0, min: 0 },          // paise
  startsAt: Date,
  expiresAt: Date,
  usageLimit: { type: Number, min: 1 },
  usedCount: { type: Number, default: 0, min: 0 },
  active: { type: Boolean, default: true },
}, { timestamps: true });

couponSchema.pre('validate', function () {
  if (this.type === 'percent' && this.value > 100) throw new Error('percent coupon cannot exceed 100');
});

export const Coupon = mongoose.model('Coupon', couponSchema);
