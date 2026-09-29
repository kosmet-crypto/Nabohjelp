import { dbError, handler, ok, parseJson, parseQuery, requireUser } from '@/lib/api';
import { toEwkt } from '@/lib/geo';
import { taskCreateSchema, taskListQuerySchema } from '@/lib/validation';

export const GET = handler(async (req) => {
  const { supabase, user } = await requireUser();
  const q = parseQuery(req, taskListQuerySchema);
  let query = supabase
    .from('tasks')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(q.offset, q.offset + q.limit - 1);
  if (q.status) query = query.eq('status', q.status);
  if (q.category) query = query.eq('category', q.category);
  if (q.mine) query = query.eq('owner_id', user.id);
  const { data, error, count } = await query;
  if (error) throw dbError(error);
  return ok({ items: data, total: count ?? 0 });
});

export const POST = handler(async (req) => {
  const { supabase, user } = await requireUser();
  const input = await parseJson(req, taskCreateSchema);
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      ...input,
      owner_id: user.id,
      location: toEwkt(input.location),
      starts_at: input.starts_at?.toISOString(),
      ends_at: input.ends_at?.toISOString(),
    })
    .select('*')
    .single();
  if (error) throw dbError(error);
  return ok(data, 201);
});
