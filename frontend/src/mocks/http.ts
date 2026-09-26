import { HttpResponse } from 'msw';
import { MOCK_TOKEN } from './fixtures/auth';

/** Shared response helpers for the contract mocks (05_API_CONTRACTS.md §0). */

export function validationError(fields: Record<string, string>, message = 'Validation failed') {
  return HttpResponse.json({ error: { code: 'VALIDATION_ERROR', message, fields } }, { status: 400 });
}

export function unauthorized(message = 'Missing Authorization header') {
  return HttpResponse.json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
}

export function notFound(message = 'Resource not found') {
  return HttpResponse.json({ error: { code: 'NOT_FOUND', message } }, { status: 404 });
}

export function conflict(message: string) {
  return HttpResponse.json({ error: { code: 'CONFLICT', message } }, { status: 409 });
}

/** Mirrors the real JWT middleware for mock fidelity: invalid/missing token → 401. */
export function requireMockAuth(request: Request): Response | null {
  const header = request.headers.get('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : null;
  return token === MOCK_TOKEN ? null : unauthorized();
}
