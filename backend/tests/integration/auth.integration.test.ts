/**
 * Opt-in PostgreSQL integration test (Person 4's harness, used here for Phase 1 auth).
 *
 * Run with:
 *   DATABASE_URL=postgresql://... RUN_DB_TESTS=1 npm run test -w @stocksense/backend
 *
 * Applies to a migrated throwaway database; the suite cleans up the rows it creates.
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../src/app.js';
import { PrismaAuthStore } from '../../src/auth/store.prisma.js';
import type { AppConfig } from '../../src/config.js';

const runDbTests = process.env.RUN_DB_TESTS === '1' && Boolean(process.env.DATABASE_URL);
const describeDb = runDbTests ? describe : describe.skip;

describeDb('Phase 1 auth against real PostgreSQL', () => {
  const suffix = Date.now().toString(36).slice(-6);
  const loginId = `it${suffix}`.slice(0, 12);
  const email = `${loginId}@example.com`;
  const password = 'Abcdefg1!';

  let prisma: PrismaClient;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.user.deleteMany({ where: { loginId: { startsWith: 'it' } } });

    const config: AppConfig = {
      nodeEnv: 'test',
      port: 0,
      databaseUrl: process.env.DATABASE_URL!,
      jwtSecret: 'integration-secret',
      jwtExpiresIn: '1h',
      corsOrigin: 'http://localhost:5173',
      bcryptRounds: 4,
    };
    app = createApp({ config, store: new PrismaAuthStore(prisma) });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.otpRequest.deleteMany({ where: { user: { loginId: { startsWith: 'it' } } } });
    await prisma.user.deleteMany({ where: { loginId: { startsWith: 'it' } } });
    await prisma.$disconnect();
  });

  it('persists a user, enforces uniqueness, and completes signup → reset → login', async () => {
    const signup = await request(app)
      .post('/api/v1/auth/signup')
      .send({ loginId, email, password, confirmPassword: password })
      .expect(201);
    expect(signup.body.id).toEqual(expect.any(String));

    await request(app)
      .post('/api/v1/auth/signup')
      .send({ loginId, email: `x${email}`, password, confirmPassword: password })
      .expect(400);

    const login = await request(app).post('/api/v1/auth/login').send({ loginId, password }).expect(200);

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.token}`)
      .expect(200);
    expect(me.body.loginId).toBe(loginId);

    const otp = await request(app)
      .post('/api/v1/auth/otp/request')
      .send({ loginIdOrEmail: email })
      .expect(200);
    expect(otp.body.debugOtp).toMatch(/^\d{6}$/);

    await request(app)
      .post('/api/v1/auth/otp/verify-reset')
      .send({
        loginIdOrEmail: loginId,
        otp: otp.body.debugOtp,
        newPassword: 'Newpass1!',
        confirmPassword: 'Newpass1!',
      })
      .expect(200);

    await request(app).post('/api/v1/auth/login').send({ loginId, password: 'Newpass1!' }).expect(200);

    const storedOtp = await prisma.otpRequest.findFirst({
      where: { user: { loginId } },
      orderBy: { createdAt: 'desc' },
    });
    expect(storedOtp?.consumed).toBe(true);

    const storedUser = await prisma.user.findUnique({ where: { loginId } });
    expect(storedUser?.passwordHash).not.toContain('Newpass1!');
  });
});
