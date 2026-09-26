import { describe, expect, it } from 'vitest';
import { summarizeDashboard, type DashboardMoveRow, type DashboardStockRow } from './dashboard.js';

const TODAY = '2026-09-26';

function move(
  type: DashboardMoveRow['type'],
  status: DashboardMoveRow['status'],
  scheduleDate: string,
): DashboardMoveRow {
  return { type, status, scheduleDate };
}

function stock(productId: string, onHand: number, reorderMin: number | null): DashboardStockRow {
  return { productId, onHand, reorderMin };
}

describe('summarizeDashboard — BR19-BR22', () => {
  it('computes late / today / operations boundaries (R2.13, R2.14, decision toReceive = <= today)', () => {
    const kpis = summarizeDashboard({
      today: TODAY,
      moves: [
        move('RECEIPT', 'DRAFT', '2026-09-25'), // late
        move('RECEIPT', 'READY', TODAY), // due today → toReceive
        move('RECEIPT', 'READY', '2026-09-28'), // operations
        move('RECEIPT', 'DONE', '2026-09-20'), // excluded
        move('RECEIPT', 'CANCELED', '2026-09-20'), // excluded
      ],
      stock: [],
    });

    expect(kpis.pendingReceipts).toBe(3);
    expect(kpis.receiptSummary).toEqual({ toReceive: 2, late: 1, operations: 1 });
  });

  it('computes delivery waiting count and summary (R2.12, R2.15)', () => {
    const kpis = summarizeDashboard({
      today: TODAY,
      moves: [
        move('DELIVERY', 'WAITING', TODAY),
        move('DELIVERY', 'WAITING', '2026-09-30'),
        move('DELIVERY', 'READY', '2026-09-30'),
        move('DELIVERY', 'DONE', '2026-09-10'), // excluded
        move('TRANSFER', 'READY', '2026-09-30'),
      ],
      stock: [],
    });

    expect(kpis.pendingDeliveries).toBe(3);
    expect(kpis.internalTransfersScheduled).toBe(1);
    expect(kpis.deliverySummary.waiting).toBe(2);
    expect(kpis.deliverySummary.toDeliver).toBe(1);
    expect(kpis.deliverySummary.operations).toBe(2);
  });

  it('counts low stock at product level across locations (BR22)', () => {
    const kpis = summarizeDashboard({
      today: TODAY,
      moves: [],
      stock: [
        stock('p1', 10, 20), // low
        stock('p1', 5, 20), // combined 15 ≤ 20 → one low product
        stock('p2', 100, 50), // fine
        stock('p3', 0, 5), // out of stock + below min → low
        stock('p4', 0, null), // no reorder rule → not counted
        stock('p5', 3, null), // no reorder rule → not counted
      ],
    });

    expect(kpis.lowStockCount).toBe(2);
    expect(kpis.totalProductsInStock).toBe(3); // p1, p2, p5 (p3 and p4 are 0)
  });

  it('returns zeros for an empty dataset', () => {
    const kpis = summarizeDashboard({ today: TODAY, moves: [], stock: [] });
    expect(kpis).toEqual({
      totalProductsInStock: 0,
      lowStockCount: 0,
      pendingReceipts: 0,
      pendingDeliveries: 0,
      internalTransfersScheduled: 0,
      receiptSummary: { toReceive: 0, late: 0, operations: 0 },
      deliverySummary: { toDeliver: 0, late: 0, waiting: 0, operations: 0 },
    });
  });
});

describe('summarizeDashboard — dynamic filters (R2.7, R2.8)', () => {
  const moves = [
    move('RECEIPT', 'DRAFT', TODAY),
    move('RECEIPT', 'DONE', TODAY),
    move('DELIVERY', 'WAITING', TODAY),
    move('TRANSFER', 'READY', TODAY),
  ];

  it('scopes every count to the selected document type', () => {
    const kpis = summarizeDashboard({ today: TODAY, moves, stock: [], type: 'DELIVERY' });
    expect(kpis.pendingDeliveries).toBe(1);
    expect(kpis.pendingReceipts).toBe(0);
    expect(kpis.internalTransfersScheduled).toBe(0);
    expect(kpis.receiptSummary).toEqual({ toReceive: 0, late: 0, operations: 0 });
    expect(kpis.deliverySummary.toDeliver).toBe(1);
  });

  it('lets an explicit status filter replace the default open predicate', () => {
    const done = summarizeDashboard({ today: TODAY, moves, stock: [], status: 'DONE' });
    expect(done.pendingReceipts).toBe(1);
    expect(done.pendingDeliveries).toBe(0);
    expect(done.receiptSummary.toReceive).toBe(1);

    const waiting = summarizeDashboard({ today: TODAY, moves, stock: [], status: 'WAITING' });
    expect(waiting.deliverySummary.waiting).toBe(1);
    expect(waiting.pendingReceipts).toBe(0);
  });
});
