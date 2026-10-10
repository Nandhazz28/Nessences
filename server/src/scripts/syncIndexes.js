import mongoose from 'mongoose';
import { connectDb } from '../config/db.js';
import '../models/User.js'; import '../models/StaffUser.js'; import '../models/Address.js'; import '../models/Category.js';
import '../models/Collection.js'; import '../models/Product.js'; import '../models/ProductVariant.js'; import '../models/Inventory.js'; import '../models/AdminAuditLog.js'; import '../models/Cart.js'; import '../models/Wishlist.js'; import '../models/Coupon.js'; import '../models/Order.js'; import '../models/Payment.js'; import '../models/Notification.js'; import '../models/Refund.js'; import '../models/ReturnRequest.js'; import '../models/Review.js'; import '../models/ReviewReport.js'; import '../models/NewsletterSubscriber.js'; import '../models/ContactMessage.js'; import '../models/Article.js'; import '../models/SiteContent.js'; import '../models/MediaAsset.js';

await connectDb();
for (const name of mongoose.modelNames()) { await mongoose.model(name).syncIndexes(); console.log('indexes synced:', name); }
await mongoose.disconnect();
