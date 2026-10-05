import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { verifyAndConsumeOtp } from '@/lib/auth/otp-store';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      email?: string;
      otp?: string;
      newPassword?: string;
    };

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const otp = typeof body.otp === 'string' ? body.otp.trim() : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

    if (!email || !otp || !newPassword) {
      return NextResponse.json(
        { error: 'Email, verification code (OTP), and new password are required' },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: 'New password must be at least 8 characters long' },
        { status: 400 }
      );
    }

    const otpCheck = verifyAndConsumeOtp(email, otp);
    if (!otpCheck.ok) {
      if (otpCheck.reason === 'locked') {
        // QA-004: the code is destroyed after MAX wrong guesses — tell the client to
        // request a fresh one instead of letting them keep probing.
        return NextResponse.json(
          { error: 'Too many incorrect attempts. Request a new verification code.' },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { error: 'Invalid or expired verification code' },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: 'User account not found' }, { status: 404 });
    }

    const passwordHash = hashPassword(newPassword);
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    // Invalidate existing sessions so user logs in with new password
    await db.session.deleteMany({ where: { userId: user.id } });

    return NextResponse.json({
      success: true,
      message: 'Password reset successful. You may now sign in with your new password.',
    });
  } catch (err: unknown) {
    // QA-007: log internally, return the documented generic message (worklog Task 1-a).
    console.error('[api/auth/reset-password]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
