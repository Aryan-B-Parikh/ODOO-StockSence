import { randomInt } from 'node:crypto';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { mailService } from '@/lib/mail/service';
import { storeOtp } from '@/lib/auth/otp-store';

export const dynamic = 'force-dynamic';

// QA-005: previously gated on NODE_ENV !== 'production', which leaks the code from any
// dev/staging process. Now requires an explicit opt-in (set OTP_DEBUG=1 locally to keep
// the "click to autofill" helper in the login view).
const otpDebugEnabled = process.env.OTP_DEBUG === '1' || process.env.OTP_DEBUG === 'true';

// QA-006: one message for both branches — the old code returned different text (and a
// missing `success` key) for unknown accounts, which defeated its own anti-enumeration.
const MESSAGE = 'If an account exists, a verification code has been dispatched.';

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { email?: string };
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const user = await db.user.findUnique({ where: { email } });

    // Identical payload whether or not the account exists.
    const payload: { success: true; message: string; debugOtp?: string } = {
      success: true,
      message: MESSAGE,
    };

    if (user) {
      // QA-003: Math.random() is predictable; a reset OTP must come from a CSPRNG.
      const otpCode = randomInt(100000, 1000000).toString();
      storeOtp(user.email, otpCode);

      await mailService.sendOtpEmail(user.email, user.name, otpCode);

      if (otpDebugEnabled) payload.debugOtp = otpCode;
    }

    return NextResponse.json(payload);
  } catch (err: unknown) {
    // QA-007: never echo internal error text to the client (worklog Task 1-a contract).
    console.error('[api/auth/otp]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
