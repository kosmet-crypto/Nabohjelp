'use client';
import { createBrowserClient } from '@supabase/ssr';
import { supabaseEnv } from './env';

export function createSupabaseBrowser() {
  const { url, anonKey } = supabaseEnv();
  return createBrowserClient(url, anonKey);
}
