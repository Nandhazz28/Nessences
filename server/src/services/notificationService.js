import { Notification } from "../models/Notification.js";
import { logger } from "../config/logger.js";

export const notify = (userId, n) =>
  Notification.create({ user: userId, ...n }).catch((err) =>
    logger.error({ err }, "notify failed"),
  );
