import mongoose from 'mongoose';
import crypto from 'node:crypto';

export const RETURN_REASONS = ['wrong_size', 'defective', 'not_as_described', 'changed_mind', 'arrived_late', 'other'];
export const RETURN_STATUSES = ['requested', 'approved', 'rejected', 'received', 'refunded', 'withdrawn'];

const line = new mongoose.Schema({
  orderItem: { type: mongoose.Schema.Types.ObjectId, required: true },
  name: String, color: String, size: String, image: { url: String, alt: String, publicId: String },
  unitPrice: { type: Number, required: true }, qty: { type: Number, required: true, min: 1 },
  reason: { type: String, enum: RETURN_REASONS, required: true }, comment: { type: String, maxlength: 500 },
}, { _id: false });

const returnSchema = new mongoose.Schema({
  returnNumber: { type: String, unique: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  items: { type: [line], validate: (v) => v.length > 0 },
  status: { type: String, enum: RETURN_STATUSES, default: 'requested', index: true },
  estimatedRefund: { type: Number, required: true }, // an estimate; staff confirm the final amount
  staffNote: String, // shown to the customer on rejection/approval
  history: [{ status: String, at: { type: Date, default: Date.now }, note: String, _id: false }],
}, { timestamps: true });

returnSchema.index({ user: 1, createdAt: -1 });
returnSchema.index({ 'items.image.publicId': 1 }, { sparse: true });
returnSchema.pre('validate', function () {
  if (!this.returnNumber) this.returnNumber = `RT-${crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6)}`;
});

export const ReturnRequest = mongoose.model('ReturnRequest', returnSchema);
