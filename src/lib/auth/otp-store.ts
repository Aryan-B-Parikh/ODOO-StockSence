// In-memory OTP storage for password recovery with 10-minute TTL.
//
// QA-004: a wrong code previously returned false WITHOUT invalidating the entry or
// counting an attempt, so the 6-digit space could be retried for the whole TTL.
// Attempts are now counted and the code is destroyed once MAX_OTP_ATTEMPTS is hit.

interface StoredOtp {
  code: string;
  expiresAt: number;
  attempts: number;
}

const globalForOtp = globalThis as unknown as {
  __stocksense_otp_store?: Map<string, StoredOtp>;
};

const otpStore = globalForOtp.__stocksense_otp_store ?? new Map<string, StoredOtp>();
if (process.env.NODE_ENV !== 'production') {
  globalForOtp.__stocksense_otp_store = otpStore;
}

/** Wrong guesses allowed before the code is destroyed for good. */
export const MAX_OTP_ATTEMPTS = 5;

export type OtpVerification =
  | { ok: true }
  | { ok: false; reason: 'missing' | 'expired' | 'invalid' | 'locked' };

export function storeOtp(email: string, code: string, ttlMinutes = 10): void {
  const normalized = email.trim().toLowerCase();
  otpStore.set(normalized, {
    code: code.trim(),
    expiresAt: Date.now() + ttlMinutes * 60 * 1000,
    attempts: 0,
  });
}

export function verifyAndConsumeOtp(email: string, candidateCode: string): OtpVerification {
  const normalized = email.trim().toLowerCase();
  const entry = otpStore.get(normalized);
  if (!entry) return { ok: false, reason: 'missing' };

  if (Date.now() > entry.expiresAt) {
    otpStore.delete(normalized);
    return { ok: false, reason: 'expired' };
  }

  if (entry.code !== candidateCode.trim()) {
    entry.attempts += 1;
    if (entry.attempts >= MAX_OTP_ATTEMPTS) {
      // Destroy it so the remaining code space cannot be explored.
      otpStore.delete(normalized);
      return { ok: false, reason: 'locked' };
    }
    return { ok: false, reason: 'invalid' };
  }

  otpStore.delete(normalized);
  return { ok: true };
}
