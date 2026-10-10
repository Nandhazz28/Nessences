import mongoose from 'mongoose';

const contactSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254, index: true },
  category: { type: String, enum: ['order', 'product', 'returns', 'press', 'other'], default: 'other' },
  subject: { type: String, required: true, trim: true, maxlength: 120 },
  message: { type: String, required: true, trim: true, minlength: 10, maxlength: 3000 },
  orderNumber: { type: String, trim: true, uppercase: true, maxlength: 20 },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['new', 'in_progress', 'resolved'], default: 'new', index: true },
  replies: [{ by: String, message: String, at: { type: Date, default: Date.now }, _id: false }],
  ip: String,
}, { timestamps: true });

contactSchema.index({ createdAt: -1 });
export const ContactMessage = mongoose.model('ContactMessage', contactSchema);
