import mongoose from 'mongoose';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDb } from './config/db.js';
import { createApp } from './app.js';
import { expirePendingOrders } from './services/checkoutService.js';
import { media } from './services/mediaService.js';
import { storage } from './services/storage.js';

const app = createApp();
const server = app.listen(env.PORT, () => logger.info(`API listening on :${env.PORT} (${env.NODE_ENV})`));

// Server stays up (health reports "degraded") if Mongo is briefly unavailable.
connectDb().catch((err) => logger.error({ err }, 'Initial MongoDB connection failed'));

// Release stock held by unpaid orders whose payment window has lapsed.
setInterval(() => { if (mongoose.connection.readyState === 1) expirePendingOrders().catch((err) => logger.error({ err }, 'expiry sweep failed')); }, 60_000).unref();

// Finish interrupted image deletions/uploads (provider outage, crash mid-request). Idempotent, so running on every instance is safe.
if (storage.supportsRegistry) {
  setInterval(() => {
    if (mongoose.connection.readyState !== 1) return;
    media.reconcile().then((r) => { if (r.checked) logger.info(r, 'media reconcile'); }).catch((err) => logger.error({ err }, 'media reconcile failed'));
  }, 10 * 60_000).unref();
}

const shutdown = (sig) => {
  logger.info(`${sig} received, shutting down`);
  server.close(async () => { await mongoose.disconnect().catch(() => {}); process.exit(0); });
  setTimeout(() => process.exit(1), 10000).unref();
};
['SIGINT', 'SIGTERM'].forEach((s) => process.on(s, () => shutdown(s)));
process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandledRejection'));
