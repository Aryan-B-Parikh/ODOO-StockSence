import { randomInt } from 'node:crypto';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { mailService } from '@/lib/mail/service';
import { storeOtp } from '@/lib/auth/otp-store';

export const dynamic = 'force-dynamic';

const otpDebugEnabled =
  process.env.NODE_ENV !== 'production' ||
  process.env.OTP_DEBUG === '1' ||
  process.env.OTP_DEBUG === 'true';

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { email?: string };
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json(
        {
          error: `No registered account found for "${email}". Pre-provisioned accounts are: owner@stocksense.app, manager@stocksense.app, staff@stocksense.app`,
        },
        { status: 404 }
      );
    }

    // Generate secure 6-digit verification OTP
    const otpCode = randomInt(100000, 1000000).toString();
    storeOtp(user.email, otpCode);

    // Dispatch real email via Brevo / active mail provider
    await mailService.sendOtpEmail(user.email, user.name, otpCode);

    const payload: { success: true; message: string; debugOtp?: string } = {
      success: true,
      message: `Verification code dispatched to ${user.email}. Check your email inbox.`,
    };

    if (otpDebugEnabled) {
      payload.debugOtp = otpCode;
    }

    return NextResponse.json(payload);
  } catch (err: unknown) {
    // QA-007: never echo internal error text to the client (worklog Task 1-a contract).
    console.error('[api/auth/otp]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
