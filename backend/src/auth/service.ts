import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import {
  OTP_LENGTH,
  OTP_TTL_MINUTES,
  collectFieldErrors,
  loginSchema,
  otpRequestSchema,
  otpVerifyResetSchema,
  signupSchema,
  updateProfileSchema,
  type CurrentUser,
  type LoginInput,
  type LoginResponse,
  type MessageResponse,
  type OtpRequestInput,
  type OtpRequestResponse,
  type OtpVerifyResetInput,
  type SignupInput,
  type SignupResponse,
  type UpdateProfileInput,
} from '@stocksense/shared';
import { ApiError } from '../lib/errors.js';
import { signToken } from '../lib/jwt.js';
import type { AuthStore, OtpRecord, UserRecord } from './store.js';

export interface AuthServiceOptions {
  store: AuthStore;
  jwtSecret: string;
  jwtExpiresIn: string;
  bcryptRounds?: number;
  /** OTP is returned in the response (and logged) outside production — documented OPEN DECISION. */
  exposeDebugOtp?: boolean;
  /** Injectable clock for OTP expiry tests. */
  now?: () => Date;
}

function toUserSummary(user: UserRecord) {
  return {
    id: user.id,
    loginId: user.loginId,
    email: user.email,
    displayName: user.displayName,
  };
}

function toCurrentUser(user: UserRecord): CurrentUser {
  return { ...toUserSummary(user), role: user.role };
}

export class AuthService {
  private readonly store: AuthStore;
  private readonly jwtSecret: string;
  private readonly jwtExpiresIn: string;
  private readonly bcryptRounds: number;
  private readonly exposeDebugOtp: boolean;
  private readonly now: () => Date;

  constructor(options: AuthServiceOptions) {
    this.store = options.store;
    this.jwtSecret = options.jwtSecret;
    this.jwtExpiresIn = options.jwtExpiresIn;
    this.bcryptRounds = options.bcryptRounds ?? 10;
    this.exposeDebugOtp = options.exposeDebugOtp ?? false;
    this.now = options.now ?? (() => new Date());
  }

  /** POST /auth/signup — R1.1-R1.5, BR1-BR4 */
  async signup(input: SignupInput): Promise<SignupResponse> {
    const parsed = signupSchema.safeParse(input);
    if (!parsed.success) {
      throw ApiError.validation('Invalid signup details', collectFieldErrors(parsed.error));
    }
    const { loginId, email, password } = parsed.data;

    const loginIdTaken = await this.store.findUserByLoginId(loginId);
    if (loginIdTaken) {
      throw ApiError.validation('Login Id already in use', { loginId: 'Login Id already in use' });
    }

    const emailTaken = await this.store.findUserByEmail(email);
    if (emailTaken) {
      throw ApiError.validation('Email already in use', { email: 'Email already in use' });
    }

    const passwordHash = await bcrypt.hash(password, this.bcryptRounds);
    const user = await this.store.createUser({ loginId, email, passwordHash });

    return { id: user.id, loginId: user.loginId, email: user.email };
  }

  /** POST /auth/login — R1.6, R1.7, BR5 (identical generic error for both failure modes) */
  async login(input: LoginInput): Promise<LoginResponse> {
    const parsed = loginSchema.safeParse(input);
    if (!parsed.success) {
      throw ApiError.validation('Invalid login details', collectFieldErrors(parsed.error));
    }

    const user = await this.store.findUserByLoginId(parsed.data.loginId);
    const passwordMatches = user
      ? await bcrypt.compare(parsed.data.password, user.passwordHash)
      : false;

    if (!user || !passwordMatches) {
      throw ApiError.unauthorized('Invalid Login Id or Password');
    }

    const token = signToken(user.id, this.jwtSecret, this.jwtExpiresIn);
    return { token, user: toUserSummary(user) };
  }

  /** POST /auth/otp/request — R1.9, R1.10, BR6 */
  async requestOtp(input: OtpRequestInput): Promise<OtpRequestResponse> {
    const parsed = otpRequestSchema.safeParse(input);
    if (!parsed.success) {
      throw ApiError.validation('Invalid OTP request', collectFieldErrors(parsed.error));
    }

    const user = await this.store.findUserByLoginIdOrEmail(parsed.data.loginIdOrEmail);
    if (!user) {
      // Anti-enumeration, consistent with BR5: unknown accounts get the same generic response.
      return { message: 'OTP sent' };
    }

    // BR6: a new OTP request invalidates prior unconsumed OTPs for that user.
    await this.store.invalidatePendingOtps(user.id);

    const otpCode = this.generateOtp();
    const expiresAt = new Date(this.now().getTime() + OTP_TTL_MINUTES * 60 * 1000);
    await this.store.createOtp({ userId: user.id, otpCode, expiresAt });

    if (this.exposeDebugOtp) {
      console.log(`[auth] OTP for ${user.loginId}: ${otpCode} (expires in ${OTP_TTL_MINUTES} min)`);
      return { message: 'OTP sent', debugOtp: otpCode };
    }
    return { message: 'OTP sent' };
  }

  /** POST /auth/otp/verify-reset — BR6 (single-use, 10-minute expiry) + BR3/BR4 */
  async verifyOtpReset(input: OtpVerifyResetInput): Promise<MessageResponse> {
    const parsed = otpVerifyResetSchema.safeParse(input);
    if (!parsed.success) {
      throw ApiError.validation('Invalid reset request', collectFieldErrors(parsed.error));
    }

    const { loginIdOrEmail, otp, newPassword } = parsed.data;
    const user = await this.store.findUserByLoginIdOrEmail(loginIdOrEmail);
    if (!user) {
      throw ApiError.validation('Invalid or expired OTP', { otp: 'Invalid or expired OTP' });
    }

    const otpRecord = await this.store.findLatestPendingOtp(user.id, otp);
    if (!otpRecord || !this.isOtpValid(otpRecord)) {
      throw ApiError.validation('Invalid or expired OTP', { otp: 'Invalid or expired OTP' });
    }

    const passwordHash = await bcrypt.hash(newPassword, this.bcryptRounds);
    await this.store.updateUser(user.id, { passwordHash });
    await this.store.markOtpConsumed(otpRecord.id);

    return { message: 'Password reset successful' };
  }

  /** GET /auth/me */
  async getMe(userId: string): Promise<CurrentUser> {
    const user = await this.store.findUserById(userId);
    if (!user) {
      throw ApiError.unauthorized('User no longer exists');
    }
    return toCurrentUser(user);
  }

  /** PATCH /auth/me — display name + optional password change (BR3, BR4) */
  async updateProfile(userId: string, input: UpdateProfileInput): Promise<CurrentUser> {
    const parsed = updateProfileSchema.safeParse(input);
    if (!parsed.success) {
      throw ApiError.validation('Invalid profile details', collectFieldErrors(parsed.error));
    }

    const user = await this.store.findUserById(userId);
    if (!user) {
      throw ApiError.unauthorized('User no longer exists');
    }

    const data: { displayName?: string | null; passwordHash?: string } = {};

    if (parsed.data.displayName !== undefined) {
      data.displayName = parsed.data.displayName === '' ? null : parsed.data.displayName;
    }

    if (parsed.data.newPassword) {
      const oldPasswordMatches = await bcrypt.compare(parsed.data.oldPassword ?? '', user.passwordHash);
      if (!oldPasswordMatches) {
        throw ApiError.validation('Old password is incorrect', { oldPassword: 'Old password is incorrect' });
      }
      data.passwordHash = await bcrypt.hash(parsed.data.newPassword, this.bcryptRounds);
    }

    const updated = await this.store.updateUser(userId, data);
    return toCurrentUser(updated);
  }

  private generateOtp(): string {
    const max = 10 ** OTP_LENGTH;
    return randomInt(0, max).toString().padStart(OTP_LENGTH, '0');
  }

  private isOtpValid(otp: OtpRecord): boolean {
    return !otp.consumed && otp.expiresAt.getTime() > this.now().getTime();
  }
}
