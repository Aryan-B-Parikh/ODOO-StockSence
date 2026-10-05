import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { mailService } from '@/lib/mail/service';
import { computeAttention } from '@/lib/attention';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
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
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[mail] Daily digest error:', errorMsg);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
