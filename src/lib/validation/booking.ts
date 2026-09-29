import { z } from 'zod';
import { BOOKING_STATUSES } from '../types';
import { optionalText, uuid } from './common';

/** Helper applies for a task. Payment/escrow fields are never accepted from clients. */
export const bookingCreateSchema = z
  .object({
    task_id: uuid,
    message: optionalText(1000),
  })
  .strict();

export const bookingTransitionSchema = z
  .object({
    status: z.enum(BOOKING_STATUSES).exclude(['requested']),
    dispute_reason: optionalText(2000),
  })
  .strict()
  .refine((b) => b.status !== 'disputed' || !!b.dispute_reason, {
    path: ['dispute_reason'],
    message: 'Begrunnelse kreves ved tvist',
  });

export type BookingCreateInput = z.infer<typeof bookingCreateSchema>;
export type BookingTransitionInput = z.infer<typeof bookingTransitionSchema>;
