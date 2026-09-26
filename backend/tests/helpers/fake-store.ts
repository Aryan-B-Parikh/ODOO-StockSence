import { randomUUID } from 'node:crypto';
import type {
  AuthStore,
  CreateUserData,
  OtpRecord,
  UpdateUserData,
  UserRecord,
} from '../../src/auth/store.js';

/** In-memory AuthStore used by unit/API tests so BR1-BR6 run without PostgreSQL. */
export class FakeAuthStore implements AuthStore {
  readonly users: UserRecord[] = [];
  readonly otps: OtpRecord[] = [];

  async findUserById(id: string): Promise<UserRecord | null> {
    return this.users.find((user) => user.id === id) ?? null;
  }

  async findUserByLoginId(loginId: string): Promise<UserRecord | null> {
    return this.users.find((user) => user.loginId === loginId) ?? null;
  }

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    return this.users.find((user) => user.email === email) ?? null;
  }

  async findUserByLoginIdOrEmail(loginIdOrEmail: string): Promise<UserRecord | null> {
    return (
      this.users.find((user) => user.loginId === loginIdOrEmail || user.email === loginIdOrEmail) ?? null
    );
  }

  async createUser(data: CreateUserData): Promise<UserRecord> {
    if (this.users.some((user) => user.loginId === data.loginId)) {
      throw new Error('duplicate loginId');
    }
    if (this.users.some((user) => user.email === data.email)) {
      throw new Error('duplicate email');
    }
    const now = new Date();
    const user: UserRecord = {
      id: randomUUID(),
      loginId: data.loginId,
      email: data.email,
      passwordHash: data.passwordHash,
      displayName: data.displayName ?? null,
      role: data.role ?? 'INVENTORY_MANAGER',
      createdAt: now,
      updatedAt: now,
    };
    this.users.push(user);
    return user;
  }

  async updateUser(id: string, data: UpdateUserData): Promise<UserRecord> {
    const user = this.users.find((candidate) => candidate.id === id);
    if (!user) throw new Error('user not found');
    if (data.displayName !== undefined) user.displayName = data.displayName;
    if (data.passwordHash !== undefined) user.passwordHash = data.passwordHash;
    user.updatedAt = new Date();
    return user;
  }

  async invalidatePendingOtps(userId: string): Promise<void> {
    for (const otp of this.otps) {
      if (otp.userId === userId && !otp.consumed) otp.consumed = true;
    }
  }

  async createOtp(data: { userId: string; otpCode: string; expiresAt: Date }): Promise<OtpRecord> {
    const otp: OtpRecord = {
      id: randomUUID(),
      userId: data.userId,
      otpCode: data.otpCode,
      expiresAt: data.expiresAt,
      consumed: false,
      createdAt: new Date(),
    };
    this.otps.push(otp);
    return otp;
  }

  async findLatestPendingOtp(userId: string, otpCode: string): Promise<OtpRecord | null> {
    const matches = this.otps
      .filter((otp) => otp.userId === userId && otp.otpCode === otpCode && !otp.consumed)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return matches[0] ?? null;
  }

  async markOtpConsumed(id: string): Promise<void> {
    const otp = this.otps.find((candidate) => candidate.id === id);
    if (otp) otp.consumed = true;
  }
}
