import { z } from 'zod';
import { geoPointSchema, optionalText, phoneSchema, postalCodeSchema, trimmed } from './common';

export const profileUpdateSchema = z
  .object({
    full_name: trimmed(2, 120),
    bio: optionalText(1000),
    avatar_url: z.string().url().optional(),
    phone: phoneSchema.optional(),
    address_line: optionalText(200),
    postal_code: postalCodeSchema.optional(),
    city: trimmed(1, 80).default('Oslo'),
    location: geoPointSchema.optional(),
  })
  .partial()
  .strict(); // rejects rating_avg / is_verified etc.

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
