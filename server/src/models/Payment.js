import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  provider: { type: String, required: true },
  providerOrderId: { type: String, required: true, unique: true },
  providerPaymentId: { type: String, sparse: true, index: true },
  amount: { type: Number, required: true, min: 100 }, 
  currency: { type: String, default: 'INR' },
  status: { type: String, enum: ['created', 'captured', 'failed', 'refunded'], default: 'created' },
  method: String,
  failureReason: String,
  processedEvents: { type: [String], select: false }, 
}, { timestamps: true });

export const Payment = mongoose.model('Payment', paymentSchema);
