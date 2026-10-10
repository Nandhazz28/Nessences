import { Order } from '../../models/Order.js';
import { User } from '../../models/User.js';
import { ApiError } from '../../utils/ApiError.js';
import { presentImage } from '../imageUrls.js';

// Public lookup: needs BOTH the order number and the email on the account. Any mismatch looks identical to "not found".
export async function track(orderNumber, email) {
  const miss = () => ApiError.notFound('ORDER_NOT_FOUND', 'We could not find an order matching those details');
  const o = await Order.findOne({ orderNumber, status: { $ne: 'pending_payment' } }).lean();
  if (!o) throw miss();
  const u = await User.findById(o.user).select('email').lean();
  if (!u || u.email !== email) throw miss();
  return { orderNumber: o.orderNumber, status: o.status, placedAt: o.createdAt, statusHistory: o.statusHistory, delivery: { label: o.delivery.label, eta: o.delivery.eta }, city: o.shippingAddress.city, items: o.items.map((i) => ({ name: i.name, color: i.color, size: i.size, qty: i.qty, image: presentImage(i.image, 'thumb') })) };
}
