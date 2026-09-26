import { uuidSchema } from '@stocksense/shared';
import { ApiError } from './errors.js';

/** Validates a UUID route parameter, returning the standard error shape on failure. */
export function parseUuidParam(value: string | undefined, field = 'id'): string {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) {
    throw ApiError.validation('Invalid id', { [field]: 'Invalid id' });
  }
  return parsed.data;
}
