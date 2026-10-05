import { NextResponse } from 'next/server';
import { mailService } from '@/lib/mail/service';

export const dynamic = 'force-dynamic';

export async function GET() {
  const emails = mailService.getRecentEmails();
  return NextResponse.json({ count: emails.length, emails });
}
