// QA-004 regression: a wrong OTP must be counted and eventually destroy the code,
// so the 6-digit space cannot be brute-forced inside the TTL.
//
// Imports the real TypeScript source (Node >= 22.6 type stripping) so the test cannot
// drift from the implementation.
//
// Run: npm test   (no server required)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { storeOtp, verifyAndConsumeOtp, MAX_OTP_ATTEMPTS } from '../../src/lib/auth/otp-store.ts';

const EMAIL = 'qa-otp-test@stocksense.app';

describe('otp-store attempt limiting (QA-004)', () => {
  test('correct code on first try consumes the OTP', () => {
    storeOtp(EMAIL, '123456');
    assert.deepEqual(verifyAndConsumeOtp(EMAIL, '123456'), { ok: true });
    // consumed — a second attempt finds nothing
    assert.deepEqual(verifyAndConsumeOtp(EMAIL, '123456'), { ok: false, reason: 'missing' });
  });

  test('a wrong code is reported as invalid and does NOT consume the OTP', () => {
    storeOtp(EMAIL, '654321');
    for (let i = 1; i < MAX_OTP_ATTEMPTS; i++) {
      assert.deepEqual(
        verifyAndConsumeOtp(EMAIL, '000000'),
        { ok: false, reason: 'invalid' },
        `attempt ${i} should be invalid but not locked`
      );
    }
  });

  test(`the ${MAX_OTP_ATTEMPTS}th wrong code locks and destroys the OTP`, () => {
    storeOtp(EMAIL, '654321');
    for (let i = 1; i < MAX_OTP_ATTEMPTS; i++) verifyAndConsumeOtp(EMAIL, '000000');
    assert.deepEqual(verifyAndConsumeOtp(EMAIL, '000000'), { ok: false, reason: 'locked' });
    // destroyed: even the CORRECT code must now fail — this is what stops brute force
    assert.deepEqual(verifyAndConsumeOtp(EMAIL, '654321'), { ok: false, reason: 'missing' });
  });

  test('requesting a fresh code resets the attempt counter', () => {
    storeOtp(EMAIL, '111111');
    verifyAndConsumeOtp(EMAIL, '000000');
    verifyAndConsumeOtp(EMAIL, '000000');
    storeOtp(EMAIL, '222222'); // fresh request resets attempts
    assert.deepEqual(verifyAndConsumeOtp(EMAIL, '000000'), { ok: false, reason: 'invalid' });
    assert.deepEqual(verifyAndConsumeOtp(EMAIL, '222222'), { ok: true });
  });

  test('an expired OTP is rejected and removed', () => {
    storeOtp(EMAIL, '999999', -1); // already in the past
    assert.deepEqual(verifyAndConsumeOtp(EMAIL, '999999'), { ok: false, reason: 'expired' });
    assert.deepEqual(verifyAndConsumeOtp(EMAIL, '999999'), { ok: false, reason: 'missing' });
  });

  test('never-issued code reports missing (no oracle for arbitrary emails)', () => {
    assert.deepEqual(verifyAndConsumeOtp('nobody@stocksense.app', '123456'), { ok: false, reason: 'missing' });
  });

  test('emails are normalised (case/whitespace insensitive)', () => {
    storeOtp('  MixedCase@Example.COM ', '444444');
    assert.deepEqual(verifyAndConsumeOtp('mixedcase@example.com', '444444'), { ok: true });
  });
});
