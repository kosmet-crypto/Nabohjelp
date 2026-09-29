import { dbError, handler, ok, parseJson, requireUser } from '@/lib/api';
import { toEwkt } from '@/lib/geo';
import { profileUpdateSchema } from '@/lib/validation';

/** Own full profile (incl. private address). */
export const GET = handler(async () => {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (error) throw dbError(error);
  return ok(data);
});

export const PATCH = handler(async (req) => {
  const { supabase, user } = await requireUser();
  const { location, ...rest } = await parseJson(req, profileUpdateSchema);
  const patch = { ...rest, ...(location ? { location: toEwkt(location) } : {}) };
  const { data, error } = await supabase.from('profiles').update(patch).eq('id', user.id).select('*').single();
  if (error) throw dbError(error);
  return ok(data);
});
