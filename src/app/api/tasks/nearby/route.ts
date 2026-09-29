import { dbError, handler, ok, parseQuery, requireUser } from '@/lib/api';
import { nearbyTasksQuerySchema } from '@/lib/validation';

export const GET = handler(async (req) => {
  const { supabase } = await requireUser();
  const q = parseQuery(req, nearbyTasksQuerySchema);
  const { data, error } = await supabase.rpc('nearby_tasks', {
    lat: q.lat,
    lng: q.lng,
    radius_m: q.radius_m,
    p_category: q.category ?? null,
  });
  if (error) throw dbError(error);
  return ok(data);
});
