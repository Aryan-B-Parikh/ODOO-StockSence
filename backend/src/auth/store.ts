/**
 * Narrow persistence contract for the auth module.
 * Production implementation: PrismaAuthStore (store.prisma.ts).
 * Tests use an in-memory fake so business rules (BR1-BR6) can be verified
 * without a database; DB-level behavior is covered by the opt-in integration test.
 */

export interface UserRecord {
  id: string;
  loginId: string;
  email: string;
  passwordHash: string;
  displayName: string | null;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OtpRecord {
  id: string;
  userId: string;
  otpCode: string;
  expiresAt: Date;
  consumed: boolean;
  createdAt: Date;
}

export interface CreateUserData {
  loginId: string;
  email: string;
  passwordHash: string;
  displayName?: string | null;
  role?: string;
}

export interface UpdateUserData {
  displayName?: string | null;
  passwordHash?: string;
}

export interface AuthStore {
  findUserById(id: string): Promise<UserRecord | null>;
  findUserByLoginId(loginId: string): Promise<UserRecord | null>;
  findUserByEmail(email: string): Promise<UserRecord | null>;
  findUserByLoginIdOrEmail(loginIdOrEmail: string): Promise<UserRecord | null>;
  createUser(data: CreateUserData): Promise<UserRecord>;
  updateUser(id: string, data: UpdateUserData): Promise<UserRecord>;
  invalidatePendingOtps(userId: string): Promise<void>;
  createOtp(data: { userId: string; otpCode: string; expiresAt: Date }): Promise<OtpRecord>;
  findLatestPendingOtp(userId: string, otpCode: string): Promise<OtpRecord | null>;
  markOtpConsumed(id: string): Promise<void>;
}
