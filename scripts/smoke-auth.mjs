#!/usr/bin/env node
/**
 * Phase 1 auth smoke test (Person 4 deliverable, 08_PHASE_PLAN.md Phase 1 §13).
 *
 * Hits a running backend (docker-compose or native) and exercises:
 *   signup → duplicate signup → bad login → login → /auth/me → PATCH /auth/me
 *   → OTP request → OTP reset → login with new password.
 *
 * Usage:
 *   node scripts/smoke-auth.mjs
 *   SMOKE_BASE_URL=http://localhost:4000/api/v1 node scripts/smoke-auth.mjs
 */
const BASE_URL = process.env.SMOKE_BASE_URL ?? 'http://localhost:4000/api/v1';

const suffix = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
const loginId = `smoke${suffix}`;
const email = `${loginId}@example.com`;
const password = 'Abcdefg1!';
const newPassword = 'Newpass1!';

let failures = 0;

function pass(message) {
  console.log(`  PASS  ${message}`);
}

function fail(message) {
  failures += 1;
  console.error(`  FAIL  ${message}`);
}

function check(condition, message) {
  if (condition) pass(message);
  else fail(message);
}

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }
  return { status: response.status, body: payload };
}

async function main() {
  console.log(`Smoke-testing ${BASE_URL} as ${loginId}`);

  const signup = await request('/auth/signup', {
    method: 'POST',
    body: { loginId, email, password, confirmPassword: password },
  });
  check(signup.status === 201 && signup.body?.id, 'signup creates a user (201)');

  const duplicate = await request('/auth/signup', {
    method: 'POST',
    body: { loginId, email: `x${email}`, password, confirmPassword: password },
  });
  check(duplicate.status === 400 && duplicate.body?.error?.fields?.loginId, 'duplicate loginId rejected (BR1)');

  const badLogin = await request('/auth/login', {
    method: 'POST',
    body: { loginId, password: 'Wrong123!' },
  });
  check(
    badLogin.status === 401 && badLogin.body?.error?.message === 'Invalid Login Id or Password',
    'bad login returns the generic message (BR5)',
  );

  const login = await request('/auth/login', { method: 'POST', body: { loginId, password } });
  check(login.status === 200 && typeof login.body?.token === 'string', 'login returns a JWT');
  const token = login.body?.token;

  const me = await request('/auth/me', { token });
  check(me.status === 200 && me.body?.loginId === loginId, 'GET /auth/me returns the caller');

  const patched = await request('/auth/me', { method: 'PATCH', token, body: { displayName: 'Smoke Test' } });
  check(patched.status === 200 && patched.body?.displayName === 'Smoke Test', 'PATCH /auth/me updates displayName');

  const unauthorized = await request('/auth/me');
  check(unauthorized.status === 401, 'GET /auth/me without a token is rejected');

  const otp = await request('/auth/otp/request', { method: 'POST', body: { loginIdOrEmail: loginId } });
  check(otp.status === 200 && otp.body?.message === 'OTP sent', 'OTP requested');

  if (otp.body?.debugOtp) {
    const reset = await request('/auth/otp/verify-reset', {
      method: 'POST',
      body: { loginIdOrEmail: loginId, otp: otp.body.debugOtp, newPassword, confirmPassword: newPassword },
    });
    check(reset.status === 200, 'OTP reset succeeds');

    const relogin = await request('/auth/login', { method: 'POST', body: { loginId, password: newPassword } });
    check(relogin.status === 200, 'login with the new password succeeds');

    const oldPassword = await request('/auth/login', { method: 'POST', body: { loginId, password } });
    check(oldPassword.status === 401, 'old password no longer works');
  } else {
    console.log('  SKIP  OTP reset steps (debugOtp absent — production mode)');
  }

  if (failures > 0) {
    console.error(`\nSmoke test FAILED with ${failures} failure(s).`);
    process.exit(1);
  }
  console.log('\nSmoke test passed.');
}

main().catch((error) => {
  console.error('\nSmoke test crashed:', error);
  process.exit(1);
});
