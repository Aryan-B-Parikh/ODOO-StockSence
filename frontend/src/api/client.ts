import type { ApiErrorBody, ApiErrorCode } from '@stocksense/shared';

export const TOKEN_STORAGE_KEY = 'stocksense.token';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode | 'NETWORK';
  readonly fields?: Record<string, string>;

  constructor(status: number, code: ApiErrorCode | 'NETWORK', message: string, fields?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

function resolveUrl(path: string): string {
  const combined = `${BASE_URL}${path}`;
  if (/^https?:\/\//.test(combined)) return combined;
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
  return new URL(combined, origin).toString();
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  token?: string | null;
}

/** Thin fetch wrapper honoring the standard error shape (05_API_CONTRACTS.md §0). */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  let response: Response;
  try {
    response = await fetch(resolveUrl(path), {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Unable to reach the server. Please try again.');
  }

  const text = await response.text();
  let payload: unknown;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = undefined;
    }
  }

  if (!response.ok) {
    const body = payload as ApiErrorBody | undefined;
    throw new ApiError(
      response.status,
      body?.error?.code ?? 'INTERNAL',
      body?.error?.message ?? `Request failed (${response.status})`,
      body?.error?.fields,
    );
  }

  return payload as T;
}
