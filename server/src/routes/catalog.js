import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/respond.js';
import * as catalog from '../services/catalogService.js';

const slugParam = z.object({ slug: z.string().regex(/^[a-z0-9-]{1,100}$/) });

export const products = Router();
products.get('/', validate({ query: catalog.listQuerySchema }), asyncHandler(async (req, res) => {
  const { items, pagination, facets } = await catalog.listProducts(req.query);
  res.set('Cache-Control', 'public, max-age=30');
  ok(res, items, 200, { pagination, facets });
}));
products.get('/:slug', validate({ params: slugParam }), asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'public, max-age=30');
  ok(res, await catalog.getProductBySlug(req.params.slug));
}));

export const categories = Router();
categories.get('/', validate({ query: z.object({ gender: z.enum(['men', 'women']).optional() }) }),
  asyncHandler(async (req, res) => { res.set('Cache-Control', 'public, max-age=60'); ok(res, await catalog.listCategories(req.query.gender)); }));

export const collections = Router();
collections.get('/', asyncHandler(async (_req, res) => { res.set('Cache-Control', 'public, max-age=60'); ok(res, await catalog.listCollections()); }));
collections.get('/:slug', validate({ params: slugParam }), asyncHandler(async (req, res) => { res.set('Cache-Control', 'public, max-age=60'); ok(res, await catalog.getCollection(req.params.slug)); }));
