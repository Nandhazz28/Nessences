import mongoose from "mongoose";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { connectDbWithRetry } from "./config/db.js";
import { lifecycle } from "./config/lifecycle.js";
import { createApp } from "./app.js";
import {
  expirePendingOrders,
  reconcilePaidOrders,
} from "./services/checkoutService.js";
import { media } from "./services/mediaService.js";
import { storage } from "./services/storage.js";

const app = createApp();

const server = app.listen(env.PORT, env.HOST, () =>
  logger.info(`API listening on ${env.HOST}:${env.PORT} (${env.NODE_ENV})`),
);
server.keepAliveTimeout = 120_000;
server.headersTimeout = 125_000;
server.requestTimeout = 60_000;

const timers = [];
const every = (ms, fn) => {
  const t = setInterval(fn, ms);
  t.unref();
  timers.push(t);
};

let closing = null;
export function shutdown(reason, exitCode = 0) {
  if (closing) return closing;
  lifecycle.shuttingDown = true;
  logger.info({ reason }, "shutting down: no longer accepting new connections");
  closing = (async () => {
    const forced = setTimeout(() => {
      logger.error("graceful shutdown timed out; exiting");
      process.exit(1);
    }, env.SHUTDOWN_TIMEOUT_SECONDS * 1000);
    forced.unref();
    timers.forEach(clearInterval);
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeIdleConnections?.();
    }); // resolves once in-flight requests have finished
    await mongoose
      .disconnect()
      .catch((err) =>
        logger.warn({ err: err?.message }, "error while closing MongoDB"),
      );
    logger.info("shutdown complete");
    process.exit(exitCode);
  })();
  return closing;
}
["SIGINT", "SIGTERM"].forEach((s) => process.on(s, () => shutdown(s)));
process.on("unhandledRejection", (err) =>
  logger.error({ err }, "unhandledRejection"),
);
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "uncaughtException");
  shutdown("uncaughtException", 1);
});

try {
  await connectDbWithRetry({
    timeoutMs: env.DB_STARTUP_TIMEOUT_SECONDS * 1000,
    isStopping: () => lifecycle.shuttingDown,
  });
} catch (err) {
  logger.fatal(
    { name: err?.name },
    "MongoDB is unreachable; giving up so the platform can restart or fail the deploy (check MONGODB_URI and Atlas network access)",
  );
  await shutdown("database unavailable at startup", 1);
}
if (!lifecycle.shuttingDown) {
  lifecycle.started = true;
  logger.info("startup complete");

  every(60_000, () => {
    if (mongoose.connection.readyState === 1)
      expirePendingOrders().catch((err) =>
        logger.error({ err }, "expiry sweep failed"),
      );
  });
  every(2 * 60_000, () => {
    if (mongoose.connection.readyState === 1)
      reconcilePaidOrders().catch((err) =>
        logger.error({ err }, "paid-order reconcile failed"),
      );
  });
  if (storage.supportsRegistry) {
    every(10 * 60_000, () => {
      if (mongoose.connection.readyState !== 1) return;
      media
        .reconcile()
        .then((r) => {
          if (r.checked) logger.info(r, "media reconcile");
        })
        .catch((err) => logger.error({ err }, "media reconcile failed"));
    });
  }
}
