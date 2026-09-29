import { ApiError, dbError, handler, ok, parseJson, requireUser } from '@/lib/api';
import { toEwkt } from '@/lib/geo';
import { taskUpdateSchema, uuid } from '@/lib/validation';

const checkId = (id: string) => {
  if (!uuid.safeParse(id).success) throw new ApiError(400, 'Ugyldig id');
};

export const GET = handler<{ id: string }>(async (_req, { id }) => {
  checkId(id);
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from('tasks')
    .select('*, owner:public_profiles!tasks_owner_id_fkey(*)')
    .eq('id', id)
    .single();
  if (error) {
    // Embedding a view via FK may be unavailable — fall back to a plain select.
    const plain = await supabase.from('tasks').select('*').eq('id', id).single();
    if (plain.error) throw dbError(plain.error);
    return ok(plain.data);
  }
  return ok(data);
});

export const PATCH = handler<{ id: string }>(async (req, { id }) => {
  checkId(id);
  const { supabase, user } = await requireUser();
  const { location, starts_at, ends_at, ...rest } = await parseJson(req, taskUpdateSchema);
  const patch = {
    ...rest,
    ...(location ? { location: toEwkt(location) } : {}),
    ...(starts_at ? { starts_at: starts_at.toISOString() } : {}),
    ...(ends_at ? { ends_at: ends_at.toISOString() } : {}),
  };
  const { data, error } = await supabase
    .from('tasks')
    .update(patch)
    .eq('id', id)
    .eq('owner_id', user.id)
    .select('*')
    .single();
  if (error) throw dbError(error);
  return ok(data);
});

export const DELETE = handler<{ id: string }>(async (_req, { id }) => {
  checkId(id);
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase.from('tasks').delete().eq('id', id).eq('owner_id', user.id).select('id');
  if (error) throw dbError(error);
  if (!data?.length) throw new ApiError(409, 'Kan ikke slettes (ikke din, eller har aktiv booking)');
  return ok({ id });
});
