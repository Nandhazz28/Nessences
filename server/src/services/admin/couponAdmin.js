import { z } from 'zod';
import { Coupon } from '../../models/Coupon.js';
import { ApiError } from '../../utils/ApiError.js';

export const couponBody = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,24}$/, '3–24 letters, numbers, - or _'), description: z.string().trim().max(140).optional(),
  type: z.enum(['percent', 'fixed']), value: z.number().int().min(1), maxDiscount: z.number().int().min(0).nullable().optional(), minOrder: z.number().int().min(0).default(0),
  startsAt: z.coerce.date().nullable().optional(), expiresAt: z.coerce.date().nullable().optional(), usageLimit: z.number().int().min(1).nullable().optional(), active: z.boolean().default(true),
}).strict().refine((c) => c.type !== 'percent' || c.value <= 100, { message: 'Percent coupons cannot exceed 100', path: ['value'] })
  .refine((c) => !c.startsAt || !c.expiresAt || c.expiresAt > c.startsAt, { message: 'Expiry must be after the start date', path: ['expiresAt'] });
export const couponUpdate = z.object({ description: z.string().trim().max(140).optional(), value: z.number().int().min(1).optional(), maxDiscount: z.number().int().min(0).nullable().optional(), minOrder: z.number().int().min(0).optional(),
  startsAt: z.coerce.date().nullable().optional(), expiresAt: z.coerce.date().nullable().optional(), usageLimit: z.number().int().min(1).nullable().optional(), active: z.boolean().optional() }).strict();

export const listCoupons = () => Coupon.find().sort({ createdAt: -1 }).limit(200).lean();
export async function createCoupon(b) { return Coupon.create(b); } // duplicate codes surface as 409 DUPLICATE
export async function updateCoupon(id, b) {
  const c = await Coupon.findById(id); if (!c) throw ApiError.notFound('COUPON_NOT_FOUND', 'Coupon not found');
  const before = { active: c.active, value: c.value };
  for (const [k, v] of Object.entries(b)) c[k] = v === null ? undefined : v;
  await c.save(); return { coupon: c, before };
}
