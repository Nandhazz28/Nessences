import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true },
  genders: { type: [String], enum: ['men', 'women'], default: ['men', 'women'] },
  description: String,
  sortOrder: { type: Number, default: 0 },
  active: { type: Boolean, default: true, index: true },
}, { timestamps: true });

export const Category = mongoose.model('Category', categorySchema);
