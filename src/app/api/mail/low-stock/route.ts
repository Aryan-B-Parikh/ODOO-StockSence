import { NextResponse } from 'next/server';
import { triggerLowStockCheck } from '@/lib/mail/triggers';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** POST /api/mail/low-stock - scans inventory and dispatches low-stock alerts to managers */
export async function POST() {
  try {
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
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
