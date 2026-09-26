import { describe, expect, it } from 'vitest';
import {
  adjustmentCreateSchema,
  collectFieldErrors,
  contactCreateSchema,
  deliveryCreateSchema,
  deliveryUpdateSchema,
  moveHistoryQuerySchema,
  operationsQuerySchema,
  receiptCreateSchema,
  receiptUpdateSchema,
  transferCreateSchema,
  transferUpdateSchema,
} from './index.js';

const uuidA = '11111111-1111-4111-8111-111111111111';
const uuidB = '22222222-2222-4222-8222-222222222222';

const baseReceipt = {
  fromContactId: uuidA,
  toLocationId: uuidB,
  scheduleDate: '2026-09-30',
  lines: [{ productId: uuidA, quantity: 5 }],
};

describe('BR27 — document line validation', () => {
  it('accepts a valid receipt', () => {
    expect(receiptCreateSchema.safeParse(baseReceipt).success).toBe(true);
  });

  it('requires at least one line', () => {
    const result = receiptCreateSchema.safeParse({ ...baseReceipt, lines: [] });
    expect(result.success).toBe(false);
    if (!result.success) expect(collectFieldErrors(result.error).lines).toContain('At least one');
  });

  it('rejects zero and negative quantities', () => {
    for (const quantity of [0, -3]) {
      const result = receiptCreateSchema.safeParse({
        ...baseReceipt,
        lines: [{ productId: uuidA, quantity }],
      });
      expect(result.success, `quantity ${quantity}`).toBe(false);
      if (!result.success) expect(collectFieldErrors(result.error).lines).toBeDefined();
    }
  });

  it('rejects duplicate products in one document', () => {
    const result = receiptCreateSchema.safeParse({
      ...baseReceipt,
      lines: [
        { productId: uuidA, quantity: 1 },
        { productId: uuidA, quantity: 2 },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(collectFieldErrors(result.error).lines).toContain('Duplicate');
  });

  it('validates the schedule date format', () => {
    expect(receiptCreateSchema.safeParse({ ...baseReceipt, scheduleDate: '30-09-2026' }).success).toBe(
      false,
    );
  });

  it('requires contact and location references', () => {
    const result = receiptCreateSchema.safeParse({ scheduleDate: '2026-09-30', lines: baseReceipt.lines });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = collectFieldErrors(result.error);
      expect(fields.fromContactId).toBeDefined();
      expect(fields.toLocationId).toBeDefined();
    }
  });
});

describe('document updates are partial but keep line rules', () => {
  it('accepts an empty patch', () => {
    expect(receiptUpdateSchema.safeParse({}).success).toBe(true);
    expect(deliveryUpdateSchema.safeParse({}).success).toBe(true);
  });

  it('still validates provided lines', () => {
    expect(receiptUpdateSchema.safeParse({ lines: [] }).success).toBe(false);
    expect(
      deliveryUpdateSchema.safeParse({ lines: [{ productId: uuidA, quantity: -1 }] }).success,
    ).toBe(false);
  });
});

describe('delivery create schema (05 §7)', () => {
  it('requires the operation type', () => {
    const result = deliveryCreateSchema.safeParse({
      fromLocationId: uuidA,
      toContactId: uuidB,
      scheduleDate: '2026-09-30',
      lines: [{ productId: uuidA, quantity: 1 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(collectFieldErrors(result.error).operationType).toBeDefined();
  });

  it('accepts a complete delivery', () => {
    expect(
      deliveryCreateSchema.safeParse({
        fromLocationId: uuidA,
        toContactId: uuidB,
        scheduleDate: '2026-09-30',
        operationType: 'Delivery order',
        lines: [{ productId: uuidA, quantity: 2 }],
      }).success,
    ).toBe(true);
  });
});

describe('contact schema (§4b)', () => {
  it('accepts a valid vendor', () => {
    expect(
      contactCreateSchema.safeParse({ name: 'Steel Supplier Co.', type: 'VENDOR', email: 'a@b.com' })
        .success,
    ).toBe(true);
  });

  it('rejects unknown types and invalid emails', () => {
    expect(contactCreateSchema.safeParse({ name: 'X', type: 'PARTNER' }).success).toBe(false);
    const badEmail = contactCreateSchema.safeParse({ name: 'X', type: 'CUSTOMER', email: 'nope' });
    expect(badEmail.success).toBe(false);
    if (!badEmail.success) expect(collectFieldErrors(badEmail.error).email).toBeDefined();
  });
});

describe('operations list query', () => {
  it('validates status filter and pagination defaults', () => {
    const parsed = operationsQuerySchema.parse({});
    expect(parsed).toEqual({ page: 1, pageSize: 20 });
    expect(operationsQuerySchema.safeParse({ status: 'NOPE' }).success).toBe(false);
    expect(operationsQuerySchema.safeParse({ status: 'WAITING', warehouseId: uuidA }).success).toBe(true);
  });
});

describe('transfer schema (§8, PHASE4_DECISIONS §1)', () => {
  const validTransfer = {
    fromLocationId: uuidA,
    toLocationId: uuidB,
    scheduleDate: '2026-10-01',
    lines: [{ productId: uuidA, quantity: 3 }],
  };

  it('accepts a valid transfer', () => {
    expect(transferCreateSchema.safeParse(validTransfer).success).toBe(true);
  });

  it('rejects identical source and destination', () => {
    const result = transferCreateSchema.safeParse({ ...validTransfer, toLocationId: uuidA });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(collectFieldErrors(result.error).toLocationId).toContain('must differ');
    }
  });

  it('accepts partial updates but keeps the same-location rule when both are provided', () => {
    expect(transferUpdateSchema.safeParse({}).success).toBe(true);
    expect(
      transferUpdateSchema.safeParse({ fromLocationId: uuidA, toLocationId: uuidA }).success,
    ).toBe(false);
    expect(transferUpdateSchema.safeParse({ fromLocationId: uuidA, toLocationId: uuidB }).success).toBe(
      true,
    );
  });
});

describe('adjustment schema (§9)', () => {
  it('accepts zero and positive counted quantities', () => {
    expect(
      adjustmentCreateSchema.safeParse({ productId: uuidA, locationId: uuidB, countedQuantity: 0 }).success,
    ).toBe(true);
    expect(
      adjustmentCreateSchema.safeParse({ productId: uuidA, locationId: uuidB, countedQuantity: 12.5 }).success,
    ).toBe(true);
  });

  it('rejects negative counted quantities', () => {
    const result = adjustmentCreateSchema.safeParse({
      productId: uuidA,
      locationId: uuidB,
      countedQuantity: -1,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(collectFieldErrors(result.error).countedQuantity).toBeDefined();
  });
});

describe('move history query (§10)', () => {
  it('validates type/direction/date filters', () => {
    const parsed = moveHistoryQuerySchema.parse({
      type: 'TRANSFER',
      direction: 'OUT',
      dateFrom: '2026-09-01',
      dateTo: '2026-09-30',
    });
    expect(parsed).toMatchObject({ type: 'TRANSFER', direction: 'OUT', page: 1, pageSize: 20 });
    expect(moveHistoryQuerySchema.safeParse({ direction: 'SIDEWAYS' }).success).toBe(false);
    expect(moveHistoryQuerySchema.safeParse({ type: 'RETURN' }).success).toBe(false);
    expect(moveHistoryQuerySchema.safeParse({ dateFrom: '01-09-2026' }).success).toBe(false);
  });
});
