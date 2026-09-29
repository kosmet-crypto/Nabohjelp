import { z } from 'zod';
import { dbError, handler, ok, parseJson, parseQuery, requireUser } from '@/lib/api';
import { BOOKING_STATUSES } from '@/lib/types';
import { bookingCreateSchema, paginationSchema } from '@/lib/validation';

const listQuery = paginationSchema.extend({
  role: z.enum(['owner', 'helper', 'any']).default('any'),
  status: z.enum(BOOKING_STATUSES).optional(),
});

export const GET = handler(async (req) => {
  const { supabase, user } = await requireUser();
  const q = parseQuery(req, listQuery);
  let query = supabase
    .from('bookings')
    .select('*, task:tasks(id, title, category, pricing_type, status, area_label)')
    .order('updated_at', { ascending: false })
    .range(q.offset, q.offset + q.limit - 1);
  if (q.role === 'owner') query = query.eq('owner_id', user.id);
  if (q.role === 'helper') query = query.eq('helper_id', user.id);
  if (q.status) query = query.eq('status', q.status);
  const { data, error } = await query;
  if (error) throw dbError(error);
  return ok(data);
});

/** Helper requests a task. owner_id, status and payment fields are set by DB trigger. */
export const POST = handler(async (req) => {
  const { supabase, user } = await requireUser();
  const input = await parseJson(req, bookingCreateSchema);
  const { data, error } = await supabase
    .from('bookings')
    .insert({ ...input, helper_id: user.id, owner_id: user.id /* overwritten by trigger */ })
    .select('*')
    .single();
  if (error) throw dbError(error);
  return ok(data, 201);
});
