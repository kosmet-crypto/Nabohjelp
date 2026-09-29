import { dbError, handler, ok, requireUser } from '@/lib/api';
import { uuid } from '@/lib/validation';
import { ApiError } from '@/lib/api';

/** Public-safe profile of another user (no address/phone). */
export const GET = handler<{ id: string }>(async (_req, { id }) => {
  if (!uuid.safeParse(id).success) throw new ApiError(400, 'Ugyldig id');
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from('public_profiles').select('*').eq('id', id).single();
  if (error) throw dbError(error);
  return ok(data);
});
