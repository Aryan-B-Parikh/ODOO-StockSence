import { db } from '@/lib/db';
import { mailService } from './service';

/**
 * Trigger Vendor Goods Receipt Note (GRN) email acknowledgment
 */
export async function triggerGoodsReceiptNote(receiptId: number): Promise<void> {
  try {
    const receipt = await db.receipt.findUnique({
      where: { id: receiptId },
      include: {
        supplier: true,
        warehouse: true,
        lines: { include: { product: true } },
      },
    });

    if (!receipt) return;

    const vendorEmail =
      receipt.supplier?.contact ||
      (receipt.supplier ? `orders@${receipt.supplier.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.example` : 'vendor@stocksense.app');
    const supplierName = receipt.supplier?.name ?? 'Valued Supplier';
    const warehouseName = receipt.warehouse?.name ?? 'Main Warehouse';

    const lines = receipt.lines.map((l) => ({
      sku: l.product.sku,
      productName: l.product.name,
      expectedQty: l.expectedQty,
      receivedQty: l.receivedQty ?? l.expectedQty,
      unit: l.product.unit,
    }));

    await mailService.sendGoodsReceiptNote(vendorEmail, {
      code: receipt.code,
      supplierName,
      warehouseName,
      lines,
    });
  } catch (err) {
    console.error(`[mail:trigger] Failed to trigger Goods Receipt Note for #${receiptId}:`, err);
  }
}

/**
 * Trigger Customer Delivery Dispatch & Packing Slip email
 */
export async function triggerDeliveryDispatch(orderId: number): Promise<void> {
  try {
    const order = await db.deliveryOrder.findUnique({
      where: { id: orderId },
      include: {
        lines: { include: { product: true } },
      },
    });

    if (!order) return;

    const customerEmail = order.customer.includes('@')
      ? order.customer
      : `orders+${order.customer.toLowerCase().replace(/[^a-z0-9]/g, '')}@stocksense.app`;

    const lines = order.lines.map((l) => ({
      sku: l.product.sku,
      productName: l.product.name,
      qty: l.qty,
      unit: l.product.unit,
    }));

    await mailService.sendDeliveryDispatch(customerEmail, {
      code: order.code,
      customerName: order.customer,
      destination: 'Customer Shipping Address',
      lines,
    });

    // Also check if any delivered products reached low-stock threshold
    const productIds = order.lines.map((l) => l.productId);
    await triggerLowStockCheck(productIds);
  } catch (err) {
    console.error(`[mail:trigger] Failed to trigger Delivery Dispatch for #${orderId}:`, err);
  }
}

/**
 * Check if products have dropped below or equal to reorderPoint and notify inventory managers
 */
export async function triggerLowStockCheck(productIds?: number[]): Promise<void> {
  try {
    const where = productIds && productIds.length > 0 ? { id: { in: productIds }, active: true } : { active: true };
    const products = await db.product.findMany({
      where,
      include: { stocks: true },
    });

    const managers = await db.user.findMany({
      where: { role: 'INVENTORY_MANAGER', active: true },
      select: { email: true },
    });

    const recipients = managers.length > 0 ? managers.map((m) => m.email) : ['manager@stocksense.app'];

    for (const p of products) {
      const onHand = p.stocks.reduce((acc, s) => acc + s.onHand, 0);
      const reserved = p.stocks.reduce((acc, s) => acc + s.reserved, 0);
      const incoming = p.stocks.reduce((acc, s) => acc + s.incoming, 0);
      const projectedAvailable = onHand + incoming - reserved;

      if (projectedAvailable <= p.reorderPoint) {
        await mailService.sendLowStockAlert(recipients, {
          productId: p.id,
          productName: p.name,
          sku: p.sku,
          unit: p.unit,
          onHand,
          reorderPoint: p.reorderPoint,
        });
      }
    }
  } catch (err) {
    console.error('[mail:trigger] Failed to execute low stock check:', err);
  }
}

/**
 * Trigger Daily Warehouse Shift Digest
 */
export async function triggerDailyDigest(overrideRecipients?: string[]): Promise<void> {
  try {
    const todayStr = new Date().toISOString().split('T')[0];

    const [products, pendingReceipts, pendingDeliveries, openCounts] = await Promise.all([
      db.product.findMany({ where: { active: true }, include: { stocks: true } }),
      db.receipt.count({ where: { status: 'EXPECTED' } }),
      db.deliveryOrder.count({ where: { status: { in: ['RESERVED', 'PICKED', 'PACKED'] } } }),
      db.cycleCount.count({ where: { status: { in: ['SCHEDULED', 'COUNTING'] } } }),
    ]);

    let lowStockCount = 0;
    for (const p of products) {
      const onHand = p.stocks.reduce((acc, s) => acc + s.onHand, 0);
      const reserved = p.stocks.reduce((acc, s) => acc + s.reserved, 0);
      const incoming = p.stocks.reduce((acc, s) => acc + s.incoming, 0);
      const projected = onHand + incoming - reserved;
      if (projected <= p.reorderPoint) {
        lowStockCount++;
      }
    }

    let recipients = overrideRecipients;
    if (!recipients || recipients.length === 0) {
      const allActive = await db.user.findMany({
        where: { active: true },
        select: { email: true },
      });
      recipients = allActive.map((u) => u.email);
      if (recipients.length === 0) recipients = ['manager@stocksense.app'];
    }

    await mailService.sendDailyDigest(recipients, {
      date: todayStr,
      totalProducts: products.length,
      lowStockCount,
      pendingReceipts,
      pendingDeliveries,
      openFlags: openCounts,
    });
  } catch (err) {
    console.error('[mail:trigger] Failed to execute daily digest:', err);
  }
}
