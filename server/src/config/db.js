import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

mongoose.set('strictQuery', true);
// NOTE: do NOT enable mongoose's global `sanitizeFilter`. It rewrites every legitimate operator filter
// ({ $in, $ne, $gte, $lte, ... } -> { $eq: {...} }) so they match nothing, and throws on $expr.
// Operator injection is prevented at the edge instead: sanitizeInput strips `$`/dotted keys from body & query,
// every route validates input with strict zod schemas, and route params/cookies are plain strings.
// test/regression.test.js fails if this setting is ever turned on.

export async function connectDb() {
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  await mongoose.connect(env.MONGODB_URI, {
    autoIndex: !env.isProd,
    serverSelectionTimeoutMS: 8000,
  });
  logger.info('MongoDB connected');
}

export const dbState = () =>
  ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] ?? 'unknown';
