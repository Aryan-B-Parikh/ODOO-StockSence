import { NextResponse } from 'next/server';
import { triggerLowStockCheck } from '@/lib/mail/triggers';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { HttpError } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/mail/low-stock - scans inventory and dispatches low-stock alerts to managers.
 *
 * SEC-001: unauthenticated. Triggers outbound mail, so it must not be open to
 * the internet (email bombing / cost abuse); requires a session
 * (docs/security-audit-report.md).
 */
export async function POST() {
  try {
    await requireUser();

    await triggerLowStockCheck();

    // Return count of products currently at or below reorder point
    const products = await db.product.findMany({
      where: { active: true },
      include: { stocks: true },
    });

    const lowStock = products.filter((p) => {
      const onHand = p.stocks.reduce((acc, s) => acc + s.onHand, 0);
      const reserved = p.stocks.reduce((acc, s) => acc + s.reserved, 0);
      const incoming = p.stocks.reduce((acc, s) => acc + s.incoming, 0);
      return onHand + incoming - reserved <= p.reorderPoint;
    });

    return NextResponse.json({
      success: true,
      message: `Low-stock evaluation complete. Scanned ${products.length} products.`,
      lowStockCount: lowStock.length,
      lowStockSkus: lowStock.map((p) => p.sku),
    });
  } catch (err: unknown) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    // Never echo err.message: it can carry paths or driver detail (QA-007).
    console.error('[mail] low-stock check failed:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
