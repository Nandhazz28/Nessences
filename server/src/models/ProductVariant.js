import mongoose from 'mongoose';

const variantSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  sku: { type: String, required: true, unique: true, uppercase: true, trim: true },
  color: { name: { type: String, required: true }, hex: { type: String, required: true, match: /^#[0-9a-fA-F]{6}$/ } },
  size: { type: String, required: true },
  active: { type: Boolean, default: true },
}, { timestamps: true });

variantSchema.index({ product: 1, 'color.name': 1, size: 1 }, { unique: true });

export const ProductVariant = mongoose.model('ProductVariant', variantSchema);
