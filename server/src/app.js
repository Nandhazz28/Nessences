import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cookieParser from "cookie-parser";
import compression from "compression";
import pinoHttp from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import crypto from "node:crypto";
import { dbState, dbReady } from "./config/db.js";
import { lifecycle } from "./config/lifecycle.js";
import {
  securityHeaders,
  corsPolicy,
  sanitizeInput,
  csrfGuard,
  globalLimiter,
} from "./middleware/security.js";
import { notFoundHandler, errorHandler } from "./middleware/error.js";
import { customerAuth, staffAuth } from "./routes/auth.js";
import { products, categories, collections } from "./routes/catalog.js";
import { cart, wishlist } from "./routes/cart.js";
import {
  checkoutRoutes,
  orderRoutes,
  addressRoutes,
} from "./routes/checkout.js";
import { accountRoutes } from "./routes/account.js";
import { admin } from "./routes/admin.js";
import { adminEngage } from "./routes/adminEngage.js";
import { engage } from "./routes/engage.js";
import { webhooks } from "./routes/webhooks.js";
import { renderRobots, getSitemapXml } from "./services/seoService.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", env.isProd ? env.TRUST_PROXY_HOPS : false);

  const quiet = new Set(["/health", "/ready", "/api/health"]);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const h = req.headers["x-request-id"];
        const id =
          typeof h === "string" && /^[\w.-]{8,64}$/.test(h)
            ? h
            : crypto.randomUUID();
        res.setHeader("X-Request-Id", id);
        return id;
      },
      autoLogging: { ignore: (r) => quiet.has(r.url) },
    }),
  );
  app.use((_req, res, next) => {
    const writeHead = res.writeHead;
    res.writeHead = function patched(...args) {
      if (lifecycle.shuttingDown && !this.headersSent)
        this.setHeader("Connection", "close");
      return writeHead.apply(this, args);
    };
    next();
  });

  app.use(securityHeaders);
  app.use(corsPolicy);
  app.use(compression());
  app.use("/api/webhooks", webhooks);
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use(sanitizeInput);

  app.use(
    "/media",
    express.static(path.join(here, "..", "uploads"), {
      maxAge: "7d",
      immutable: false,
      index: false,
    }),
  );

  app.get("/robots.txt", (_req, res) => {
    res
      .type("text/plain")
      .set("Cache-Control", "public, max-age=3600")
      .send(renderRobots({ clientUrl: env.CLIENT_URL, indexable: env.isProd }));
  });
  app.get("/sitemap.xml", async (_req, res, next) => {
    try {
      if (dbState() !== "connected")
        return res
          .status(503)
          .set("Retry-After", "300")
          .type("text/plain")
          .send("Sitemap temporarily unavailable");
      res
        .type("application/xml")
        .set("Cache-Control", "public, max-age=3600")
        .send(await getSitemapXml(env.CLIENT_URL));
    } catch (e) {
      next(e);
    }
  });

  app.get("/health", (_req, res) => {
    res.set("Cache-Control", "no-store");
    if (lifecycle.shuttingDown)
      return res.status(503).json({ status: "shutting_down" });
    if (!lifecycle.started) return res.status(503).json({ status: "starting" });
    res.json({ status: "ok" });
  });
  app.get("/ready", async (_req, res) => {
    res.set("Cache-Control", "no-store");
    if (lifecycle.shuttingDown)
      return res.status(503).json({ status: "shutting_down" });
    if (!lifecycle.started || !(await dbReady()))
      return res.status(503).json({ status: "not_ready", reason: "database" });
    res.json({ status: "ready" });
  });

  app.get("/api/health", (_req, res) => {
    res.set("Cache-Control", "no-store");
    const db = dbState();
    res
      .status(db === "connected" ? 200 : 503)
      .json({
        success: db === "connected",
        status: db === "connected" ? "ok" : "degraded",
        db,
        uptime: Math.round(process.uptime()),
      });
  });

  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use("/api", globalLimiter, csrfGuard);
  app.use("/api/auth", customerAuth);
  app.use("/api/admin/auth", staffAuth);
  app.use("/api/admin", admin);
  app.use("/api/admin", adminEngage);
  app.use("/api", engage);
  app.use("/api/products", products);
  app.use("/api/categories", categories);
  app.use("/api/collections", collections);
  app.use("/api/cart", cart);
  app.use("/api/wishlist", wishlist);
  app.use("/api/checkout", checkoutRoutes);
  app.use("/api/orders", orderRoutes);
  app.use("/api/account/addresses", addressRoutes);
  app.use("/api/account", accountRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
