import type { PrismaClient } from '@prisma/client';
import type {
  AuthStore,
  CreateUserData,
  OtpRecord,
  UpdateUserData,
  UserRecord,
} from './store.js';

export class PrismaAuthStore implements AuthStore {
  constructor(private readonly prisma: PrismaClient) {}

  async findUserById(id: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findUserByLoginId(loginId: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where: { loginId } });
  }

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findUserByLoginIdOrEmail(loginIdOrEmail: string): Promise<UserRecord | null> {
    return this.prisma.user.findFirst({
      where: { OR: [{ loginId: loginIdOrEmail }, { email: loginIdOrEmail }] },
    });
  }

  async createUser(data: CreateUserData): Promise<UserRecord> {
    return this.prisma.user.create({
      data: {
        loginId: data.loginId,
        email: data.email,
        passwordHash: data.passwordHash,
        displayName: data.displayName ?? null,
        ...(data.role ? { role: data.role } : {}),
      },
    });
  }

  async updateUser(id: string, data: UpdateUserData): Promise<UserRecord> {
    return this.prisma.user.update({ where: { id }, data });
  }

  async invalidatePendingOtps(userId: string): Promise<void> {
    await this.prisma.otpRequest.updateMany({
      where: { userId, consumed: false },
      data: { consumed: true },
    });
  }

  async createOtp(data: { userId: string; otpCode: string; expiresAt: Date }): Promise<OtpRecord> {
    return this.prisma.otpRequest.create({ data });
  }

  async findLatestPendingOtp(userId: string, otpCode: string): Promise<OtpRecord | null> {
    return this.prisma.otpRequest.findFirst({
      where: { userId, otpCode, consumed: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markOtpConsumed(id: string): Promise<void> {
    await this.prisma.otpRequest.update({ where: { id }, data: { consumed: true } });
  }
}
