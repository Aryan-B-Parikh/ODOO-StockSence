import type {
  CurrentUser,
  LoginInput,
  LoginResponse,
  MessageResponse,
  OtpRequestInput,
  OtpRequestResponse,
  OtpVerifyResetInput,
  SignupInput,
  SignupResponse,
  UpdateProfileInput,
} from '@stocksense/shared';
import { apiRequest } from './client';

/** 05_API_CONTRACTS.md §1 — Auth */
export function signup(input: SignupInput): Promise<SignupResponse> {
  return apiRequest<SignupResponse>('/auth/signup', { method: 'POST', body: input });
}

export function login(input: LoginInput): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/auth/login', { method: 'POST', body: input });
}

export function requestOtp(input: OtpRequestInput): Promise<OtpRequestResponse> {
  return apiRequest<OtpRequestResponse>('/auth/otp/request', { method: 'POST', body: input });
}

export function verifyOtpReset(input: OtpVerifyResetInput): Promise<MessageResponse> {
  return apiRequest<MessageResponse>('/auth/otp/verify-reset', { method: 'POST', body: input });
}

export function getMe(token: string): Promise<CurrentUser> {
  return apiRequest<CurrentUser>('/auth/me', { token });
}

export function updateProfile(token: string, input: UpdateProfileInput): Promise<CurrentUser> {
  return apiRequest<CurrentUser>('/auth/me', { method: 'PATCH', token, body: input });
}
