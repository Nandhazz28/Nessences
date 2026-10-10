import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { dbState } from './config/db.js';
import { securityHeaders, corsPolicy, sanitizeInput, csrfGuard, globalLimiter } from './middleware/security.js';
import { notFoundHandler, errorHandler } from './middleware/error.js';
import { customerAuth, staffAuth } from './routes/auth.js';
import { products, categories, collections } from './routes/catalog.js';
import { cart, wishlist } from './routes/cart.js';
import { checkoutRoutes, orderRoutes, addressRoutes } from './routes/checkout.js';
import { accountRoutes } from './routes/account.js';
import { admin } from './routes/admin.js';
import { adminEngage } from './routes/adminEngage.js';
import { engage } from './routes/engage.js';
import { webhooks } from './routes/webhooks.js';
import { renderRobots, getSitemapXml } from './services/seoService.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.isProd ? 1 : false);

  app.use(pinoHttp({ logger, autoLogging: { ignore: (r) => r.url === '/api/health' } }));
  app.use(securityHeaders);
  app.use(corsPolicy);
  app.use(compression());
  app.use('/api/webhooks', webhooks); // raw body + signature; must precede express.json()
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(sanitizeInput);

  app.use('/media', express.static(path.join(here, '..', 'uploads'), { maxAge: '7d', immutable: false, index: false }));

  // Crawler files. They describe the storefront (CLIENT_URL), so in production route /robots.txt and /sitemap.xml on the
  // storefront domain to this server (see README, "SEO").
  app.get('/robots.txt', (_req, res) => { res.type('text/plain').set('Cache-Control', 'public, max-age=3600').send(renderRobots({ clientUrl: env.CLIENT_URL, indexable: env.isProd })); });
  app.get('/sitemap.xml', async (_req, res, next) => {
    try {
      if (dbState() !== 'connected') return res.status(503).set('Retry-After', '300').type('text/plain').send('Sitemap temporarily unavailable');
      res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send(await getSitemapXml(env.CLIENT_URL));
    } catch (e) { next(e); }
  });

  app.get('/api/health', (_req, res) => {
    const db = dbState();
    res.status(db === 'connected' ? 200 : 503).json({ success: db === 'connected', status: db === 'connected' ? 'ok' : 'degraded', db, uptime: Math.round(process.uptime()) });
  });

  app.use('/api', globalLimiter, csrfGuard);
  app.use('/api/auth', customerAuth);
  app.use('/api/admin/auth', staffAuth);
  app.use('/api/admin', admin);
  app.use('/api/admin', adminEngage);
  app.use('/api', engage);
  app.use('/api/products', products);
  app.use('/api/categories', categories);
  app.use('/api/collections', collections);
  app.use('/api/cart', cart);
  app.use('/api/wishlist', wishlist);
  app.use('/api/checkout', checkoutRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/account/addresses', addressRoutes);
  app.use('/api/account', accountRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
