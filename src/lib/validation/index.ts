export * from './common';
export * from './profile';
export * from './task';
export * from './booking';

import type { ZodError } from 'zod';
/** Flatten Zod errors into { field: message } for forms and API responses. */
export function formatZodError(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    out[key] ??= issue.message;
  }
  return out;
}
