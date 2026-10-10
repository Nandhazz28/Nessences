import { Notification } from '../models/Notification.js';
import { logger } from '../config/logger.js';

// Fire-and-forget: a notification failure must never break the business action that triggered it.
export const notify = (userId, n) => Notification.create({ user: userId, ...n }).catch((err) => logger.error({ err }, 'notify failed'));
