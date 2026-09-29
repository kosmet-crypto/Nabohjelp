import { ApiError, dbError, handler, ok, requireUser } from '@/lib/api';
import { uuid } from '@/lib/validation';

/** Applicants for a task — RLS limits rows to the task owner (or the helper's own). */
export const GET = handler<{ id: string }>(async (_req, { id }) => {
  if (!uuid.safeParse(id).success) throw new ApiError(400, 'Ugyldig id');
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('task_id', id)
    .order('created_at', { ascending: true });
  if (error) throw dbError(error);
  return ok(data);
});
