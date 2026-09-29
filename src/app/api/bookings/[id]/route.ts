import { ApiError, dbError, handler, ok, parseJson, requireUser } from '@/lib/api';
import { canTransition, roleOf } from '@/lib/booking-state';
import type { Booking } from '@/lib/types';
import { bookingTransitionSchema, uuid } from '@/lib/validation';

async function load(id: string) {
  if (!uuid.safeParse(id).success) throw new ApiError(400, 'Ugyldig id');
  const ctx = await requireUser();
  const { data, error } = await ctx.supabase.from('bookings').select('*').eq('id', id).single<Booking>();
  if (error) throw dbError(error);
  return { ...ctx, booking: data };
}

export const GET = handler<{ id: string }>(async (_req, { id }) => {
  const { booking } = await load(id);
  return ok(booking);
});

/** Status transition. Validated here for fast feedback; enforced again by DB trigger. */
export const PATCH = handler<{ id: string }>(async (req, { id }) => {
  const { supabase, user, booking } = await load(id);
  const input = await parseJson(req, bookingTransitionSchema);

  const role = roleOf(booking, user.id);
  if (!role) throw new ApiError(403, 'Ingen tilgang');
  if (!canTransition(booking.status, input.status, role)) {
    throw new ApiError(409, `Ugyldig overgang ${booking.status} → ${input.status}`);
  }

  const { data, error } = await supabase
    .from('bookings')
    .update({
      status: input.status,
      ...(input.status === 'disputed' ? { dispute_reason: input.dispute_reason } : {}),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw dbError(error);
  return ok(data);
});
