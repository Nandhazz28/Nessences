import mongoose from 'mongoose';
import { COMMERCE } from '../config/commerce.js';

const line = new mongoose.Schema({
  variant: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', required: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  qty: { type: Number, required: true, min: 1, max: COMMERCE.maxLineQty, validate: Number.isInteger },
}, { _id: false });

// Prices are never stored on the cart: they are read from the catalogue every time.
const cartSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true, sparse: true },
  guestId: { type: String, unique: true, sparse: true },
  items: { type: [line], default: [] },
  saved: { type: [line], default: [] },
  couponCode: { type: String, uppercase: true, trim: true },
  expiresAt: { type: Date, index: { expireAfterSeconds: 0 } }, // TTL for guest carts only
}, { timestamps: true });

export const Cart = mongoose.model('Cart', cartSchema);
