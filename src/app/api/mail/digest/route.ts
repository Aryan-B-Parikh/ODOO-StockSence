import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { mailService } from '@/lib/mail/service';
import { computeAttention } from '@/lib/attention';
import { requireUser } from '@/lib/auth';
import { HttpError } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/mail/digest - dispatch the daily shift digest.
 *
 * SEC-001: unauthenticated. Dispatching mail must never be open to the internet
 * (email bombing / cost abuse); requires a session (docs/security-audit-report.md).
 */
export async function POST() {
  try {
    await requireUser();

    const today = new Date().toISOString().slice(0, 10);

    // 1. Fetch managers
    const managers = await db.user.findMany({
      where: { role: 'INVENTORY_MANAGER', active: true },
      select: { email: true },
    });
    const recipients = managers.map((m) => m.email).filter(Boolean);
    if (recipients.length === 0) {
      recipients.push('manager@stocksense.app');
    }

    // 2. Fetch metrics
    const [attention, totalProducts, pendingReceipts, pendingDeliveries] = await Promise.all([
      computeAttention(db),
      db.product.count({ where: { active: true } }),
      db.receipt.count({ where: { status: 'EXPECTED' } }),
      db.deliveryOrder.count({ where: { status: { in: ['DRAFT', 'PICKED', 'PACKED'] } } }),
    ]);

    // 3. Dispatch digest
    await mailService.sendDailyDigest(recipients, {
      date: today,
      totalProducts,
      lowStockCount: attention.summary.belowReorder,
      pendingReceipts,
      pendingDeliveries,
      openFlags: attention.summary.openFlags,
    });

    return NextResponse.json({
      success: true,
      message: 'Daily shift digest dispatched successfully',
      date: today,
      recipients,
    });
  } catch (err: unknown) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    // Never echo err.message: it can carry paths or driver detail (QA-007).
    console.error('[mail] Daily digest error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
