import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

mongoose.set('strictQuery', true);

let listening = false;
export async function connectDb() {
  if (!listening) {
    listening = true;
    mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
    mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  }
  await mongoose.connect(env.MONGODB_URI, {
    autoIndex: !env.isProd,
    serverSelectionTimeoutMS: 8000,
    maxPoolSize: env.MONGODB_MAX_POOL_SIZE,
    socketTimeoutMS: 45_000,               
  });
  logger.info('MongoDB connected');
}

const redact = (m) => String(m ?? '').replace(/mongodb(\+srv)?:\/\/[^\s@]*@/gi, 'mongodb$1://***@').slice(0, 300);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function connectDbWithRetry({ timeoutMs = 0, initialDelayMs = 1000, maxDelayMs = 15_000, isStopping = () => false } = {}) {
  const t0 = Date.now(); let delay = initialDelayMs;
  for (let attempt = 1; ; attempt += 1) {
    try { await connectDb(); return; } catch (err) {
      logger.error({ attempt, name: err?.name, reason: redact(err?.message) }, 'MongoDB connection failed');
      if (isStopping() || (timeoutMs && Date.now() - t0 + delay > timeoutMs)) throw err;
      await mongoose.disconnect().catch(() => {});
      await sleep(delay); delay = Math.min(delay * 2, maxDelayMs);
    }
  }
}

export const dbState = () =>
  ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] ?? 'unknown';

let pingCache = { at: 0, ok: false };
export async function dbReady({ timeoutMs = 1500, ttlMs = 3000 } = {}) {
  if (dbState() !== 'connected') { pingCache = { at: 0, ok: false }; return false; }
  if (Date.now() - pingCache.at < ttlMs) return pingCache.ok;
  let ok = false;
  try {
    await Promise.race([mongoose.connection.db.command({ ping: 1 }), new Promise((_, rej) => setTimeout(() => rej(new Error('ping timeout')), timeoutMs).unref())]);
    ok = true;
  } catch { ok = false; }
  pingCache = { at: Date.now(), ok };
  return ok;
}
