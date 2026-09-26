import { http, HttpResponse } from 'msw';
import {
  collectFieldErrors,
  loginSchema,
  otpRequestSchema,
  otpVerifyResetSchema,
  signupSchema,
} from '@stocksense/shared';
import { unauthorized, validationError } from './http';
import {
  MOCK_OTP,
  MOCK_TOKEN,
  addMockUser,
  currentMockUser,
  findMockUser,
  findMockUserByLoginId,
  toCurrentUser,
  updateMockUser,
} from './fixtures/auth';
import { inventoryHandlers } from './inventoryHandlers';
import { operationsHandlers } from './operationsHandlers';

const API = '*/api/v1/auth';

/** 05_API_CONTRACTS.md §1 — Auth */
const authHandlers = [
  http.post(`${API}/signup`, async ({ request }) => {
    const body = await request.json().catch(() => ({}));
    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) return validationError(collectFieldErrors(parsed.error));

    const { loginId, email, password } = parsed.data;
    if (findMockUserByLoginId(loginId)) {
      return validationError({ loginId: 'Login Id already in use' });
    }
    if (findMockUser(email)) {
      return validationError({ email: 'Email already in use' });
    }

    const id = crypto.randomUUID();
    addMockUser({ id, loginId, email, displayName: null, role: 'INVENTORY_MANAGER', password });
    return HttpResponse.json({ id, loginId, email }, { status: 201 });
  }),

  http.post(`${API}/login`, async ({ request }) => {
    const body = await request.json().catch(() => ({}));
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) return validationError(collectFieldErrors(parsed.error));

    const user = findMockUserByLoginId(parsed.data.loginId);
    if (!user || user.password !== parsed.data.password) {
      return unauthorized('Invalid Login Id or Password');
    }

    return HttpResponse.json({
      token: MOCK_TOKEN,
      user: { id: user.id, loginId: user.loginId, email: user.email, displayName: user.displayName },
    });
  }),

  http.post(`${API}/otp/request`, async ({ request }) => {
    const body = await request.json().catch(() => ({}));
    const parsed = otpRequestSchema.safeParse(body);
    if (!parsed.success) return validationError(collectFieldErrors(parsed.error));

    if (!findMockUser(parsed.data.loginIdOrEmail)) {
      return HttpResponse.json({ message: 'OTP sent' });
    }
    return HttpResponse.json({ message: 'OTP sent', debugOtp: MOCK_OTP });
  }),

  http.post(`${API}/otp/verify-reset`, async ({ request }) => {
    const body = await request.json().catch(() => ({}));
    const parsed = otpVerifyResetSchema.safeParse(body);
    if (!parsed.success) return validationError(collectFieldErrors(parsed.error));

    const user = findMockUser(parsed.data.loginIdOrEmail);
    if (!user || parsed.data.otp !== MOCK_OTP) {
      return validationError({ otp: 'Invalid or expired OTP' });
    }

    updateMockUser(user.loginId, { password: parsed.data.newPassword });
    return HttpResponse.json({ message: 'Password reset successful' });
  }),

  http.get(`${API}/me`, ({ request }) => {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '').trim();
    if (token !== MOCK_TOKEN) return unauthorized('Missing Authorization header');
    return HttpResponse.json(toCurrentUser(currentMockUser()));
  }),

  http.patch(`${API}/me`, async ({ request }) => {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '').trim();
    if (token !== MOCK_TOKEN) return unauthorized('Missing Authorization header');

    const body = (await request.json().catch(() => ({}))) as {
      displayName?: string;
      oldPassword?: string;
      newPassword?: string;
      confirmPassword?: string;
    };
    const user = currentMockUser();
    const patch: { displayName?: string | null; password?: string } = {};

    if (body.displayName !== undefined) patch.displayName = body.displayName === '' ? null : body.displayName;
    if (body.newPassword) {
      if (body.oldPassword !== user.password) {
        return validationError({ oldPassword: 'Old password is incorrect' });
      }
      patch.password = body.newPassword;
    }

    const updated = updateMockUser(user.loginId, patch) ?? user;
    return HttpResponse.json(toCurrentUser(updated));
  }),
];

export const handlers = [...authHandlers, ...inventoryHandlers, ...operationsHandlers];
