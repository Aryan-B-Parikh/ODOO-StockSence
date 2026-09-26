import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';
import { FakeAuthStore } from './helpers/fake-store.js';

const config: AppConfig = {
  nodeEnv: 'test',
  port: 0,
  databaseUrl: 'postgresql://unused',
  jwtSecret: 'test-secret',
  jwtExpiresIn: '1h',
  corsOrigin: 'http://localhost:5173',
  bcryptRounds: 4,
};

const VALID = {
  loginId: 'demo01',
  email: 'demo@example.com',
  password: 'Abcdefg1!',
  confirmPassword: 'Abcdefg1!',
};

describe('API integration surface (fake store, no DB)', () => {
  let store: FakeAuthStore;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    store = new FakeAuthStore();
    app = createApp({ config, store });
  });

  it('GET /api/v1/health returns ok', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('POST /api/v1/auth/signup returns 201 with safe fields (R1.1)', async () => {
    const res = await request(app).post('/api/v1/auth/signup').send(VALID);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: expect.any(String), loginId: VALID.loginId, email: VALID.email });
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('POST /api/v1/auth/signup rejects invalid input with the standard error shape', async () => {
    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({ loginId: 'abc', email: 'nope', password: 'weak', confirmPassword: 'weak' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.fields).toMatchObject({
      loginId: expect.any(String),
      email: expect.any(String),
      password: expect.any(String),
    });
  });

  it('POST /api/v1/auth/signup rejects duplicate loginId/email (BR1, BR2)', async () => {
    await request(app).post('/api/v1/auth/signup').send(VALID).expect(201);

    const duplicateLoginId = await request(app)
      .post('/api/v1/auth/signup')
      .send({ ...VALID, email: 'another@example.com' });
    expect(duplicateLoginId.status).toBe(400);
    expect(duplicateLoginId.body.error.fields.loginId).toBe('Login Id already in use');

    const duplicateEmail = await request(app)
      .post('/api/v1/auth/signup')
      .send({ ...VALID, loginId: 'another1' });
    expect(duplicateEmail.status).toBe(400);
    expect(duplicateEmail.body.error.fields.email).toBe('Email already in use');
  });

  it('POST /api/v1/auth/login returns the exact generic error (BR5)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ loginId: 'nobody1', password: 'Abcdefg1!' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Invalid Login Id or Password' },
    });
  });

  it('POST /api/v1/auth/login → GET /api/v1/auth/me round trip (R1.11)', async () => {
    await request(app).post('/api/v1/auth/signup').send(VALID).expect(201);

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ loginId: VALID.loginId, password: VALID.password })
      .expect(200);
    expect(login.body.token).toEqual(expect.any(String));

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.token}`)
      .expect(200);
    expect(me.body).toEqual({
      id: expect.any(String),
      loginId: VALID.loginId,
      email: VALID.email,
      displayName: null,
      role: 'INVENTORY_MANAGER',
    });
  });

  it('GET /api/v1/auth/me requires a valid JWT', async () => {
    const missing = await request(app).get('/api/v1/auth/me');
    expect(missing.status).toBe(401);
    expect(missing.body.error.code).toBe('UNAUTHORIZED');

    const garbage = await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer not-a-token');
    expect(garbage.status).toBe(401);
    expect(garbage.body.error.code).toBe('UNAUTHORIZED');
  });

  it('PATCH /api/v1/auth/me updates the display name', async () => {
    await request(app).post('/api/v1/auth/signup').send(VALID).expect(201);
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ loginId: VALID.loginId, password: VALID.password })
      .expect(200);

    const patched = await request(app)
      .patch('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ displayName: 'Ron' })
      .expect(200);

    expect(patched.body.displayName).toBe('Ron');
    expect(patched.body).not.toHaveProperty('passwordHash');
  });

  it('OTP request → verify-reset → login with new password', async () => {
    await request(app).post('/api/v1/auth/signup').send(VALID).expect(201);

    const otpRes = await request(app)
      .post('/api/v1/auth/otp/request')
      .send({ loginIdOrEmail: VALID.loginId })
      .expect(200);
    expect(otpRes.body.debugOtp).toMatch(/^\d{6}$/);

    await request(app)
      .post('/api/v1/auth/otp/verify-reset')
      .send({
        loginIdOrEmail: VALID.loginId,
        otp: otpRes.body.debugOtp,
        newPassword: 'Newpass1!',
        confirmPassword: 'Newpass1!',
      })
      .expect(200);

    await request(app)
      .post('/api/v1/auth/login')
      .send({ loginId: VALID.loginId, password: 'Newpass1!' })
      .expect(200);
  });

  it('returns NOT_FOUND with the standard shape for unknown routes', async () => {
    const res = await request(app).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
  });

  it('returns VALIDATION_ERROR for malformed JSON bodies', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"loginId": oops');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
