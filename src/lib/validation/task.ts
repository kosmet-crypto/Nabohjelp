import { z } from 'zod';
import { APP_CONFIG } from '../config';
import { PRICING_TYPES, TASK_CATEGORIES, TASK_STATUSES } from '../types';
import { geoPointSchema, optionalText, paginationSchema, trimmed } from './common';

const baseTask = z.object({
  title: trimmed(3, 120),
  description: optionalText(4000),
  category: z.enum(TASK_CATEGORIES),
  pricing_type: z.enum(PRICING_TYPES).default('free'),
  price_ore: z.coerce.number().int().min(0).max(10_000_000).default(0),
  location: geoPointSchema,
  area_label: optionalText(80),
  starts_at: z.coerce.date().optional(),
  ends_at: z.coerce.date().optional(),
});

type TaskShape = z.infer<typeof baseTask>;

const taskRules = (t: Partial<TaskShape>, ctx: z.RefinementCtx) => {
  if (t.pricing_type && t.pricing_type !== 'paid' && (t.price_ore ?? 0) > 0) {
    ctx.addIssue({ code: 'custom', path: ['price_ore'], message: 'Gratis/lån kan ikke ha pris' });
  }
  if (t.pricing_type === 'paid' && APP_CONFIG.paymentMode === 'test_free') {
    ctx.addIssue({ code: 'custom', path: ['pricing_type'], message: 'Betalte oppdrag er deaktivert i testfasen' });
  }
  if (t.pricing_type === 'paid' && (t.price_ore ?? 0) <= 0) {
    ctx.addIssue({ code: 'custom', path: ['price_ore'], message: 'Betalt oppdrag må ha pris' });
  }
  if (t.starts_at && t.ends_at && t.ends_at <= t.starts_at) {
    ctx.addIssue({ code: 'custom', path: ['ends_at'], message: 'Slutt må være etter start' });
  }
};

export const taskCreateSchema = baseTask.superRefine(taskRules);

export const taskUpdateSchema = baseTask
  .partial()
  .extend({ status: z.enum(['open', 'cancelled']).optional() }) // other statuses are booking-driven
  .strict()
  .superRefine(taskRules);

export const nearbyTasksQuerySchema = z
  .object({
    lat: z.coerce.number(),
    lng: z.coerce.number(),
    radius_m: z.coerce
      .number()
      .int()
      .min(100)
      .max(APP_CONFIG.maxSearchRadiusM)
      .default(APP_CONFIG.defaultSearchRadiusM),
    category: z.enum(TASK_CATEGORIES).optional(),
  })
  .refine((q) => geoPointSchema.safeParse(q).success, { message: 'Plasseringen må være i Norge' });

export const taskListQuerySchema = paginationSchema.extend({
  status: z.enum(TASK_STATUSES).optional(),
  category: z.enum(TASK_CATEGORIES).optional(),
  mine: z.coerce.boolean().optional(),
});

export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;
export type NearbyTasksQuery = z.infer<typeof nearbyTasksQuerySchema>;
