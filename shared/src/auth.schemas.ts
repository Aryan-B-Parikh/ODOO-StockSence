import { z } from 'zod';

/**
 * Auth contract schemas — single source of truth shared by the API (server-side
 * validation) and the SPA (client-side form validation), per 03_ARCHITECTURE.md §7.
 *
 * Business rules: BR1 (loginId 6-12, unique), BR2 (unique email), BR3 (password
 * lowercase+uppercase+special and length > 8), BR4 (password/confirm match).
 */

export const LOGIN_ID_MIN_LENGTH = 6;
export const LOGIN_ID_MAX_LENGTH = 12;

/** BR3 says the password must be *more than* 8 characters long. */
export const PASSWORD_MIN_LENGTH = 8;

export const OTP_LENGTH = 6;
export const OTP_TTL_MINUTES = 10;

export const PASSWORD_SPECIAL_CHARS = "!@#$%^&*()_+-=[]{}|;:'\",.<>/?";
const PASSWORD_SPECIAL_CHARS_RE = /[!@#$%^&*()_+\-=\[\]{}|;:'",.<>\/?]/;

export const USER_ROLES = ['INVENTORY_MANAGER', 'WAREHOUSE_STAFF'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const loginIdSchema = z
  .string({ required_error: 'Login Id is required' })
  .trim()
  .min(1, 'Login Id is required')
  .min(
    LOGIN_ID_MIN_LENGTH,
    `Login Id must be between ${LOGIN_ID_MIN_LENGTH} and ${LOGIN_ID_MAX_LENGTH} characters`,
  )
  .max(
    LOGIN_ID_MAX_LENGTH,
    `Login Id must be between ${LOGIN_ID_MIN_LENGTH} and ${LOGIN_ID_MAX_LENGTH} characters`,
  );

export const emailSchema = z
  .string({ required_error: 'Email Id is required' })
  .trim()
  .min(1, 'Email Id is required')
  .max(255, 'Email Id must be at most 255 characters')
  .email('Enter a valid Email Id');

export const passwordSchema = z
  .string({ required_error: 'Password is required' })
  .min(1, 'Password is required')
  .min(PASSWORD_MIN_LENGTH + 1, `Password must be more than ${PASSWORD_MIN_LENGTH} characters long`)
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(PASSWORD_SPECIAL_CHARS_RE, 'Password must contain a special character');

export const signupSchema = z
  .object({
    loginId: loginIdSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z
      .string({ required_error: 'Re-enter Password is required' })
      .min(1, 'Re-enter Password is required'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const loginSchema = z.object({
  loginId: z.string({ required_error: 'Login Id is required' }).trim().min(1, 'Login Id is required'),
  password: z.string({ required_error: 'Password is required' }).min(1, 'Password is required'),
});

export const otpRequestSchema = z.object({
  loginIdOrEmail: z
    .string({ required_error: 'Login Id or Email Id is required' })
    .trim()
    .min(1, 'Enter your Login Id or Email Id'),
});

export const otpVerifyResetSchema = z
  .object({
    loginIdOrEmail: z.string().trim().min(1, 'Enter your Login Id or Email Id'),
    otp: z
      .string({ required_error: 'OTP is required' })
      .trim()
      .regex(new RegExp(`^\\d{${OTP_LENGTH}}$`), `OTP must be a ${OTP_LENGTH}-digit code`),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirm password is required'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const updateProfileSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .max(255, 'Display name must be at most 255 characters')
      .optional(),
    oldPassword: z.string().optional(),
    newPassword: z.string().optional(),
    confirmPassword: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const wantsPasswordChange =
      data.oldPassword !== undefined || data.newPassword !== undefined || data.confirmPassword !== undefined;
    if (!wantsPasswordChange) return;

    if (!data.oldPassword) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['oldPassword'], message: 'Old password is required' });
    }
    if (!data.newPassword) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['newPassword'], message: 'New password is required' });
    } else {
      const result = passwordSchema.safeParse(data.newPassword);
      if (!result.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['newPassword'],
          message: result.error.issues[0]?.message ?? 'Invalid password',
        });
      }
    }
    if (!data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmPassword'],
        message: 'Confirm password is required',
      });
    } else if (data.newPassword && data.confirmPassword !== data.newPassword) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['confirmPassword'], message: 'Passwords do not match' });
    }
  });

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type OtpRequestInput = z.infer<typeof otpRequestSchema>;
export type OtpVerifyResetInput = z.infer<typeof otpVerifyResetSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** Maps a ZodError to the API error `fields` object (first message per field wins). */
export function collectFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : '_';
    if (!(key in fields)) fields[key] = issue.message;
  }
  return fields;
}
