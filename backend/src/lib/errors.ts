import { Prisma } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import type { ApiErrorCode } from '@stocksense/shared';

/**
 * Standard API error, 05_API_CONTRACTS.md §0:
 * { "error": { "code", "message", "fields"? } }
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly fields?: Record<string, string>;

  constructor(status: number, code: ApiErrorCode, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }

  static validation(message: string, fields?: Record<string, string>): ApiError {
    return new ApiError(400, 'VALIDATION_ERROR', message, fields);
  }

  static unauthorized(message = 'Unauthorized'): ApiError {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }

  static notFound(message = 'Resource not found'): ApiError {
    return new ApiError(404, 'NOT_FOUND', message);
  }

  static conflict(message: string): ApiError {
    return new ApiError(409, 'CONFLICT', message);
  }
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.fields ? { fields: err.fields } : {}),
      },
    });
    return;
  }

  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' },
    });
    return;
  }

  // Unique-constraint races (e.g. two concurrent creates of the same code) become CONFLICT
  // instead of an opaque 500; the services still return field-level VALIDATION_ERRORs on the
  // normal duplicate path.
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    res.status(409).json({
      error: { code: 'CONFLICT', message: 'A record with this unique value already exists' },
    });
    return;
  }

  console.error('[api] unhandled error', err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
}
