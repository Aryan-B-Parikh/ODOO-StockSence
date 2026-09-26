import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '../src/lib/errors.js';
import { AuthService } from '../src/auth/service.js';
import { FakeAuthStore } from './helpers/fake-store.js';

const JWT_SECRET = 'test-secret';
const VALID = {
  loginId: 'demo01',
  email: 'demo@example.com',
  password: 'Abcdefg1!',
};

function createService(store: FakeAuthStore, now?: () => Date) {
  return new AuthService({
    store,
    jwtSecret: JWT_SECRET,
    jwtExpiresIn: '1h',
    bcryptRounds: 4,
    exposeDebugOtp: true,
    now,
  });
}

async function signupDemo(service: AuthService) {
  return service.signup({ ...VALID, confirmPassword: VALID.password });
}

describe('AuthService.signup (R1.1-R1.5, BR1-BR4)', () => {
  let store: FakeAuthStore;
  let service: AuthService;

  beforeEach(() => {
    store = new FakeAuthStore();
    service = createService(store);
  });

  it('creates a user with a bcrypt hash and returns only safe fields', async () => {
    const result = await signupDemo(service);

    expect(result).toEqual({ id: expect.any(String), loginId: VALID.loginId, email: VALID.email });
    expect(result).not.toHaveProperty('passwordHash');

    const stored = store.users[0];
    expect(stored.passwordHash).not.toBe(VALID.password);
    expect(await bcrypt.compare(VALID.password, stored.passwordHash)).toBe(true);
  });

  it('rejects a duplicate loginId with a field error', async () => {
    await signupDemo(service);
    await expect(
      service.signup({ ...VALID, email: 'other@example.com', confirmPassword: VALID.password }),
    ).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      fields: { loginId: 'Login Id already in use' },
    });
  });

  it('rejects a duplicate email with a field error', async () => {
    await signupDemo(service);
    await expect(
      service.signup({ ...VALID, loginId: 'other01', confirmPassword: VALID.password }),
    ).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      fields: { email: 'Email already in use' },
    });
  });

  it('rejects invalid input with per-field messages', async () => {
    try {
      await service.signup({ loginId: 'abc', email: 'nope', password: 'weak', confirmPassword: 'weak' });
      expect.unreachable('signup should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      const apiError = error as ApiError;
      expect(apiError.fields?.loginId).toContain('6 and 12');
      expect(apiError.fields?.email).toBeDefined();
      expect(apiError.fields?.password).toBeDefined();
    }
  });
});

describe('AuthService.login (R1.6-R1.7, BR5)', () => {
  let store: FakeAuthStore;
  let service: AuthService;

  beforeEach(async () => {
    store = new FakeAuthStore();
    service = createService(store);
    await signupDemo(service);
  });

  it('returns the exact generic error for an unknown loginId', async () => {
    await expect(service.login({ loginId: 'nobody1', password: 'Abcdefg1!' })).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Invalid Login Id or Password',
    });
  });

  it('returns the same generic error for a wrong password', async () => {
    await expect(service.login({ loginId: VALID.loginId, password: 'Wrong123!' })).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Invalid Login Id or Password',
    });
  });

  it('returns a verifiable JWT and a password-free user on success', async () => {
    const result = await service.login({ loginId: VALID.loginId, password: VALID.password });

    const payload = jwt.verify(result.token, JWT_SECRET) as jwt.JwtPayload;
    expect(payload.sub).toBe(store.users[0].id);
    expect(result.user).toEqual({
      id: store.users[0].id,
      loginId: VALID.loginId,
      email: VALID.email,
      displayName: null,
    });
    expect(result.user).not.toHaveProperty('passwordHash');
  });
});

describe('AuthService OTP flow (R1.10, BR6)', () => {
  let store: FakeAuthStore;
  let service: AuthService;
  let currentTime: Date;

  beforeEach(async () => {
    store = new FakeAuthStore();
    currentTime = new Date('2026-09-26T10:00:00Z');
    service = createService(store, () => currentTime);
    await signupDemo(service);
  });

  it('issues a 6-digit OTP that expires in 10 minutes', async () => {
    const result = await service.requestOtp({ loginIdOrEmail: VALID.loginId });

    expect(result.debugOtp).toMatch(/^\d{6}$/);
    const otp = store.otps[0];
    expect(otp.expiresAt.getTime() - currentTime.getTime()).toBe(10 * 60 * 1000);
    expect(otp.consumed).toBe(false);
  });

  it('does not reveal whether an unknown account exists', async () => {
    const result = await service.requestOtp({ loginIdOrEmail: 'ghost99' });
    expect(result).toEqual({ message: 'OTP sent' });
    expect(store.otps).toHaveLength(0);
  });

  it('rejects an expired OTP', async () => {
    const { debugOtp } = await service.requestOtp({ loginIdOrEmail: VALID.email });
    currentTime = new Date(currentTime.getTime() + 11 * 60 * 1000);

    await expect(
      service.verifyOtpReset({
        loginIdOrEmail: VALID.loginId,
        otp: debugOtp!,
        newPassword: 'Newpass1!',
        confirmPassword: 'Newpass1!',
      }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR', fields: { otp: 'Invalid or expired OTP' } });
  });

  it('consumes the OTP so it cannot be reused', async () => {
    const { debugOtp } = await service.requestOtp({ loginIdOrEmail: VALID.loginId });
    const payload = {
      loginIdOrEmail: VALID.loginId,
      otp: debugOtp!,
      newPassword: 'Newpass1!',
      confirmPassword: 'Newpass1!',
    };

    await expect(service.verifyOtpReset(payload)).resolves.toEqual({ message: 'Password reset successful' });
    await expect(service.verifyOtpReset(payload)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('invalidates the previous OTP when a new one is requested', async () => {
    const first = await service.requestOtp({ loginIdOrEmail: VALID.loginId });
    const second = await service.requestOtp({ loginIdOrEmail: VALID.loginId });

    const firstOtpRecord = store.otps.find((otp) => otp.otpCode === first.debugOtp);
    if (first.debugOtp !== second.debugOtp) {
      expect(firstOtpRecord?.consumed).toBe(true);
      await expect(
        service.verifyOtpReset({
          loginIdOrEmail: VALID.loginId,
          otp: first.debugOtp!,
          newPassword: 'Newpass1!',
          confirmPassword: 'Newpass1!',
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    }

    await expect(
      service.verifyOtpReset({
        loginIdOrEmail: VALID.loginId,
        otp: second.debugOtp!,
        newPassword: 'Newpass1!',
        confirmPassword: 'Newpass1!',
      }),
    ).resolves.toEqual({ message: 'Password reset successful' });
  });

  it('lets the user log in with the reset password and rejects the old one', async () => {
    const { debugOtp } = await service.requestOtp({ loginIdOrEmail: VALID.loginId });
    await service.verifyOtpReset({
      loginIdOrEmail: VALID.loginId,
      otp: debugOtp!,
      newPassword: 'Newpass1!',
      confirmPassword: 'Newpass1!',
    });

    await expect(service.login({ loginId: VALID.loginId, password: 'Newpass1!' })).resolves.toBeDefined();
    await expect(service.login({ loginId: VALID.loginId, password: VALID.password })).rejects.toMatchObject({
      message: 'Invalid Login Id or Password',
    });
  });
});

describe('AuthService profile (GET/PATCH /auth/me)', () => {
  let store: FakeAuthStore;
  let service: AuthService;

  beforeEach(async () => {
    store = new FakeAuthStore();
    service = createService(store);
    await signupDemo(service);
  });

  it('returns the current user including role', async () => {
    const user = await service.getMe(store.users[0].id);
    expect(user).toMatchObject({ loginId: VALID.loginId, role: 'INVENTORY_MANAGER' });
  });

  it('updates the display name', async () => {
    const user = await service.updateProfile(store.users[0].id, { displayName: 'Ron' });
    expect(user.displayName).toBe('Ron');
  });

  it('rejects a password change when the old password is wrong', async () => {
    await expect(
      service.updateProfile(store.users[0].id, {
        oldPassword: 'Wrong123!',
        newPassword: 'Newpass1!',
        confirmPassword: 'Newpass1!',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', fields: { oldPassword: 'Old password is incorrect' } });
  });

  it('changes the password when the old password matches', async () => {
    await service.updateProfile(store.users[0].id, {
      oldPassword: VALID.password,
      newPassword: 'Newpass1!',
      confirmPassword: 'Newpass1!',
    });

    await expect(service.login({ loginId: VALID.loginId, password: 'Newpass1!' })).resolves.toBeDefined();
  });
});
