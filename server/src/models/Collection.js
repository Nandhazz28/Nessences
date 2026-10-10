import mongoose from 'mongoose';

const collectionSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true },
  description: String,
  season: String,
  genders: { type: [String], enum: ['men', 'women'], default: ['men', 'women'] },
  featured: { type: Boolean, default: false },
  active: { type: Boolean, default: true, index: true },
  sortOrder: { type: Number, default: 0 },
}, { timestamps: true });

export const Collection = mongoose.model('Collection', collectionSchema);
