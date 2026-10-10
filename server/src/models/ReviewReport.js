import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema({
  review: { type: mongoose.Schema.Types.ObjectId, ref: 'Review', required: true },
  reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reason: { type: String, enum: ['spam', 'offensive', 'irrelevant', 'personal_info', 'other'], required: true },
  note: { type: String, maxlength: 300 },
  status: { type: String, enum: ['open', 'dismissed', 'actioned'], default: 'open', index: true },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'StaffUser' },
}, { timestamps: true });

reportSchema.index({ review: 1, reporter: 1 }, { unique: true });
export const ReviewReport = mongoose.model('ReviewReport', reportSchema);
