import { NextResponse } from 'next/server';
import { mailService } from '@/lib/mail/service';
import { requireUser } from '@/lib/auth';
import { HttpError } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/mail/inbox - recent outbox backing the notification panel.
 *
 * SEC-001 / ARCH-001 (CRITICAL): this handler previously ran with NO auth gate
 * and returned 200 to an unauthenticated caller with full message bodies -
 * including password-reset OTP codes - which is a complete account-takeover
 * chain. `requireUser()` closes it; do not remove it without replacing it with
 * an equivalent gate. See docs/security-audit-report.md.
 */
export async function GET() {
  try {
    await requireUser();
    const emails = mailService.getRecentEmails();
    return NextResponse.json({ count: emails.length, emails });
  } catch (err: unknown) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    // Never echo err.message: it can carry paths or driver detail (QA-007).
    console.error('[mail] inbox read failed:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
