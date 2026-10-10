import mongoose from 'mongoose';
import crypto from 'node:crypto';

export const ORDER_STATUSES = ['pending_payment', 'paid', 'confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'refunded'];

// Line items are an immutable snapshot taken at purchase time (prices/names can change later in the catalogue).
const item = new mongoose.Schema({
  variant: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', required: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  sku: String, name: String, slug: String, color: String, size: String,
  image: { url: String, alt: String, publicId: String },
  unitPrice: { type: Number, required: true }, qty: { type: Number, required: true, min: 1 }, lineTotal: { type: Number, required: true },
}, { _id: true });

const orderSchema = new mongoose.Schema({
  orderNumber: { type: String, unique: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  items: { type: [item], validate: (v) => v.length > 0 },
  shippingAddress: { fullName: String, phone: String, line1: String, line2: String, city: String, state: String, pincode: String, country: String },
  delivery: { method: String, label: String, eta: String },
  totals: { subtotal: Number, discount: Number, shipping: Number, tax: Number, total: Number },
  coupon: { code: String, discount: Number },
  status: { type: String, enum: ORDER_STATUSES, default: 'pending_payment', index: true },
  statusHistory: [{ status: String, at: { type: Date, default: Date.now }, note: String, _id: false }],
  paymentStatus: { type: String, enum: ['pending', 'captured', 'failed', 'refunded'], default: 'pending' },
  reservationExpiresAt: { type: Date, index: true },
  paidAt: Date,
  attention: String, // set when staff action is required (e.g. payment arrived after the order expired)
}, { timestamps: true });

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ 'items.image.publicId': 1 }, { sparse: true });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ status: 1, reservationExpiresAt: 1 });

orderSchema.pre('validate', function () {
  if (!this.orderNumber) {
    const d = new Date();
    this.orderNumber = `NS-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}-${crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6)}`;
  }
});

export const Order = mongoose.model('Order', orderSchema);
