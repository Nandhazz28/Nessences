import mongoose from 'mongoose';

const addressSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  label: { type: String, enum: ['Home', 'Work', 'Other'], default: 'Home' },
  fullName: { type: String, required: true, trim: true, maxlength: 80 },
  phone: { type: String, required: true, trim: true },
  line1: { type: String, required: true, trim: true, maxlength: 120 },
  line2: { type: String, trim: true, maxlength: 120 },
  city: { type: String, required: true, trim: true },
  state: { type: String, required: true, trim: true },
  pincode: { type: String, required: true, match: [/^[1-9][0-9]{5}$/, 'Invalid PIN code'] },
  country: { type: String, default: 'IN' },
  isDefault: { type: Boolean, default: false },
}, {
  timestamps: true,
  toJSON: { versionKey: false, transform: (_d, r) => { r.id = r._id; delete r._id; delete r.user; return r; } },
});

export const Address = mongoose.model('Address', addressSchema);
