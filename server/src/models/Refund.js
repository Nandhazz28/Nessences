import mongoose from 'mongoose';

// A refund the business owes. Created as 'pending'; staff process it through the payment provider (admin phase).
const refundSchema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  returnRequest: { type: mongoose.Schema.Types.ObjectId, ref: 'ReturnRequest' },
  amount: { type: Number, required: true, min: 1 },
  reason: { type: String, enum: ['customer_cancelled', 'return', 'payment_after_expiry', 'other'], required: true },
  status: { type: String, enum: ['pending', 'processing', 'processed', 'failed'], default: 'pending', index: true },
  providerRefundId: String,
  failureReason: String,
  processedAt: Date,
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'StaffUser' },
}, { timestamps: true });

export const Refund = mongoose.model('Refund', refundSchema);
