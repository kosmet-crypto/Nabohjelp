import { z } from 'zod';
import { isInNorway } from '../geo';

export const uuid = z.string().uuid();

export const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max);
export const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform((v) => (v === '' ? undefined : v));

export const geoPointSchema = z
  .object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
  })
  .refine(isInNorway, { message: 'Plasseringen må være i Norge' });

/** Norwegian mobile/landline: +47 followed by 8 digits (spaces allowed). */
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s+/g, ''))
  .refine((v) => /^(\+47)?[2-9]\d{7}$/.test(v), { message: 'Ugyldig norsk telefonnummer' })
  .transform((v) => (v.startsWith('+47') ? v : `+47${v}`));

export const postalCodeSchema = z.string().trim().regex(/^\d{4}$/, 'Postnummer må ha 4 siffer');

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
