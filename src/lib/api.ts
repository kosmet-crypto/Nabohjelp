import 'server-only';
import { NextResponse } from 'next/server';
import type { PostgrestError, SupabaseClient, User } from '@supabase/supabase-js';
import type { ZodType, ZodTypeDef } from 'zod';
import { createSupabaseServer } from './supabase/server';
import { formatZodError } from './validation';

export const ok = <T>(data: T, status = 200) => NextResponse.json({ ok: true, data }, { status });
export const fail = (status: number, error: string, details?: unknown) =>
  NextResponse.json({ ok: false, error, details }, { status });

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export async function requireUser(): Promise<{ supabase: SupabaseClient; user: User }> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new ApiError(401, 'Ikke innlogget');
  return { supabase, user: data.user };
}

export async function parseJson<T>(req: Request, schema: ZodType<T, ZodTypeDef, unknown>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, 'Ugyldig JSON');
  }
  return parseWith(schema, body);
}

export function parseQuery<T>(req: Request, schema: ZodType<T, ZodTypeDef, unknown>): T {
  return parseWith(schema, Object.fromEntries(new URL(req.url).searchParams));
}

function parseWith<T>(schema: ZodType<T, ZodTypeDef, unknown>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw new ApiError(422, 'Valideringsfeil', formatZodError(r.error));
  return r.data;
}

/** Map Postgres/PostgREST errors (incl. RAISE EXCEPTION from triggers) to HTTP. */
export function dbError(e: PostgrestError): ApiError {
  switch (e.code) {
    case 'PGRST116': return new ApiError(404, 'Ikke funnet');
    case '23505': return new ApiError(409, 'Finnes allerede', e.message);
    case '23514': return new ApiError(422, 'Ugyldige data', e.message);
    case '42501': return new ApiError(403, 'Ingen tilgang');
    case 'P0001': return new ApiError(409, e.message);
    default: return new ApiError(500, 'Databasefeil', e.message);
  }
}

type Ctx<P> = { params: Promise<P> };

/** Wraps a route handler with uniform error handling. */
export function handler<P = Record<string, never>>(fn: (req: Request, params: P) => Promise<Response>) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
      return await fn(req, await ctx.params);
    } catch (e) {
      if (e instanceof ApiError) return fail(e.status, e.message, e.details);
      console.error(e);
      return fail(500, 'Intern feil');
    }
  };
}
