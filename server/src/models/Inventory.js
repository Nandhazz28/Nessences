import mongoose from 'mongoose';

const inventorySchema = new mongoose.Schema({
  variant: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', required: true, unique: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  sku: { type: String, required: true, index: true },
  stock: { type: Number, required: true, min: 0, default: 0, validate: Number.isInteger },
  reserved: { type: Number, required: true, min: 0, default: 0, validate: Number.isInteger },
  lowStockThreshold: { type: Number, default: 5, min: 0 },
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

inventorySchema.virtual('available').get(function () { return this.stock - this.reserved; });
inventorySchema.pre('validate', function () {
  if (this.reserved > this.stock) throw new Error('reserved cannot exceed stock');
});

export const Inventory = mongoose.model('Inventory', inventorySchema);
