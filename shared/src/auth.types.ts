import type { UserRole } from './auth.schemas.js';

/** Response payloads for 05_API_CONTRACTS.md §1 (Auth). */

export interface AuthUserSummary {
  id: string;
  loginId: string;
  email: string;
  displayName: string | null;
}

export interface CurrentUser extends AuthUserSummary {
  role: UserRole | string;
}

export interface LoginResponse {
  token: string;
  user: AuthUserSummary;
}

export interface SignupResponse {
  id: string;
  loginId: string;
  email: string;
}

export interface MessageResponse {
  message: string;
}

export interface OtpRequestResponse extends MessageResponse {
  /** Present only outside production (documented OPEN DECISION, 05_API_CONTRACTS.md §1). */
  debugOtp?: string;
}

/** Standard API error shape, 05_API_CONTRACTS.md §0. */
export type ApiErrorCode = 'VALIDATION_ERROR' | 'NOT_FOUND' | 'UNAUTHORIZED' | 'CONFLICT' | 'INTERNAL';

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    fields?: Record<string, string>;
  };
}
