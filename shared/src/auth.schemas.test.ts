import { describe, expect, it } from 'vitest';
import {
  collectFieldErrors,
  loginIdSchema,
  otpVerifyResetSchema,
  passwordSchema,
  signupSchema,
  updateProfileSchema,
} from './auth.schemas.js';

describe('BR1 — Login Id: 6-12 characters', () => {
  it('rejects ids shorter than 6 characters', () => {
    expect(loginIdSchema.safeParse('abcde').success).toBe(false);
  });

  it('rejects ids longer than 12 characters', () => {
    expect(loginIdSchema.safeParse('abcdefghijklm').success).toBe(false);
  });

  it('accepts boundary lengths 6 and 12', () => {
    expect(loginIdSchema.safeParse('abcdef').success).toBe(true);
    expect(loginIdSchema.safeParse('abcdefghijkl').success).toBe(true);
  });

  it('accepts ids padded with whitespace', () => {
    expect(loginIdSchema.safeParse('  abcdef  ').success).toBe(true);
  });
});

describe('BR3 — Password composition', () => {
  it('rejects passwords of 8 characters or fewer', () => {
    expect(passwordSchema.safeParse('Abcdefg!').success).toBe(false);
    expect(passwordSchema.safeParse('Abc1!').success).toBe(false);
  });

  it('rejects a password without a lowercase letter', () => {
    expect(passwordSchema.safeParse('ABCDEFG1!').success).toBe(false);
  });

  it('rejects a password without an uppercase letter', () => {
    expect(passwordSchema.safeParse('abcdefg1!').success).toBe(false);
  });

  it('rejects a password without a special character', () => {
    expect(passwordSchema.safeParse('Abcdefg12').success).toBe(false);
  });

  it('accepts a password satisfying every rule', () => {
    expect(passwordSchema.safeParse('Abcdefg1!').success).toBe(true);
  });
});

describe('BR4 — Password / Re-enter Password must match', () => {
  const valid = {
    loginId: 'demo01',
    email: 'demo@example.com',
    password: 'Abcdefg1!',
  };

  it('rejects mismatched passwords on confirmPassword', () => {
    const result = signupSchema.safeParse({ ...valid, confirmPassword: 'Abcdefg2!' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(collectFieldErrors(result.error).confirmPassword).toBe('Passwords do not match');
    }
  });

  it('accepts matching passwords', () => {
    expect(signupSchema.safeParse({ ...valid, confirmPassword: 'Abcdefg1!' }).success).toBe(true);
  });

  it('reports field-level errors for several invalid fields at once', () => {
    const result = signupSchema.safeParse({
      loginId: 'abc',
      email: 'nope',
      password: 'weak',
      confirmPassword: 'weak',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = collectFieldErrors(result.error);
      expect(fields.loginId).toBeDefined();
      expect(fields.email).toBeDefined();
      expect(fields.password).toBeDefined();
    }
  });
});

describe('OTP verify-reset schema', () => {
  it('requires a 6-digit OTP', () => {
    expect(
      otpVerifyResetSchema.safeParse({
        loginIdOrEmail: 'demo01',
        otp: '12345',
        newPassword: 'Abcdefg1!',
        confirmPassword: 'Abcdefg1!',
      }).success,
    ).toBe(false);
    expect(
      otpVerifyResetSchema.safeParse({
        loginIdOrEmail: 'demo01',
        otp: '123456',
        newPassword: 'Abcdefg1!',
        confirmPassword: 'Abcdefg1!',
      }).success,
    ).toBe(true);
  });
});

describe('PATCH /auth/me schema (password change)', () => {
  it('allows a display name only', () => {
    expect(updateProfileSchema.safeParse({ displayName: 'Ron' }).success).toBe(true);
  });

  it('requires the old password when a new password is supplied', () => {
    const result = updateProfileSchema.safeParse({ newPassword: 'Abcdefg1!', confirmPassword: 'Abcdefg1!' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(collectFieldErrors(result.error).oldPassword).toBeDefined();
    }
  });

  it('enforces password composition on the new password', () => {
    const result = updateProfileSchema.safeParse({
      oldPassword: 'Abcdefg1!',
      newPassword: 'weak',
      confirmPassword: 'weak',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(collectFieldErrors(result.error).newPassword).toBeDefined();
    }
  });
});
