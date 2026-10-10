import mongoose from 'mongoose';

const subSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  status: { type: String, enum: ['pending', 'subscribed', 'unsubscribed'], default: 'pending', index: true },
  confirmTokenHash: { type: String, select: false },
  unsubscribeToken: { type: String, select: false }, // opaque value embedded in emails
  source: { type: String, default: 'footer' },
  subscribedAt: Date, unsubscribedAt: Date,
}, { timestamps: true });

export const NewsletterSubscriber = mongoose.model('NewsletterSubscriber', subSchema);
