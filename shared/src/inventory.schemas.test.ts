import { describe, expect, it } from 'vitest';
import {
  collectFieldErrors,
  dashboardQuerySchema,
  locationUpdateSchema,
  paginationQuerySchema,
  productCreateSchema,
  productUpdateSchema,
  stockUpdateSchema,
  warehouseCreateSchema,
} from './index.js';

describe('product schemas', () => {
  const validProduct = { name: 'Steel Rod', sku: 'STL-ROD-001', uom: 'kg' };

  it('accepts a minimal valid product', () => {
    expect(productCreateSchema.safeParse(validProduct).success).toBe(true);
  });

  it('requires name, sku and uom', () => {
    const result = productCreateSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = collectFieldErrors(result.error);
      expect(fields.name).toBe('Name is required');
      expect(fields.sku).toBe('SKU is required');
      expect(fields.uom).toBe('Unit of Measure is required');
    }
  });

  it('rejects negative numbers', () => {
    const result = productCreateSchema.safeParse({
      ...validProduct,
      costPerUnit: -1,
      reorderMin: -2,
      reorderMax: -3,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = collectFieldErrors(result.error);
      expect(fields.costPerUnit).toBeDefined();
      expect(fields.reorderMin).toBeDefined();
      expect(fields.reorderMax).toBeDefined();
    }
  });

  it('rejects reorderMax below reorderMin', () => {
    const result = productCreateSchema.safeParse({ ...validProduct, reorderMin: 10, reorderMax: 5 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(collectFieldErrors(result.error).reorderMax).toContain('greater than or equal');
    }
  });

  it('requires initial stock quantity > 0 (BR27)', () => {
    const zero = productCreateSchema.safeParse({
      ...validProduct,
      initialStock: { locationId: '11111111-1111-4111-8111-111111111111', quantity: 0 },
    });
    expect(zero.success).toBe(false);

    const positive = productCreateSchema.safeParse({
      ...validProduct,
      initialStock: { locationId: '11111111-1111-4111-8111-111111111111', quantity: 4 },
    });
    expect(positive.success).toBe(true);
  });

  it('allows partial updates', () => {
    expect(productUpdateSchema.safeParse({}).success).toBe(true);
    expect(productUpdateSchema.safeParse({ costPerUnit: 9.5 }).success).toBe(true);
  });
});

describe('warehouse / location schemas (BR29)', () => {
  it('limits the warehouse short code to 10 characters', () => {
    const result = warehouseCreateSchema.safeParse({ name: 'Main', shortCode: 'ABCDEFGHIJK' });
    expect(result.success).toBe(false);
    if (!result.success) expect(collectFieldErrors(result.error).shortCode).toBeDefined();
  });

  it('rejects changing a location warehouse on update', () => {
    const result = locationUpdateSchema.safeParse({
      name: 'Rack A',
      warehouseId: '11111111-1111-4111-8111-111111111111',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(collectFieldErrors(result.error).warehouseId).toContain('BR29');
    }
  });

  it('allows renaming a location without a warehouse key', () => {
    expect(locationUpdateSchema.safeParse({ name: 'Rack A', shortCode: 'RACKA' }).success).toBe(true);
  });
});

describe('stock update schema', () => {
  it('accepts 0 and rejects negative quantities', () => {
    expect(stockUpdateSchema.safeParse({ onHand: 0 }).success).toBe(true);
    expect(stockUpdateSchema.safeParse({ onHand: -1 }).success).toBe(false);
  });
});

describe('query schemas', () => {
  it('applies pagination defaults and coerces strings', () => {
    const defaults = paginationQuerySchema.parse({});
    expect(defaults).toEqual({ page: 1, pageSize: 20 });

    const coerced = paginationQuerySchema.parse({ page: '2', pageSize: '50' });
    expect(coerced).toEqual({ page: 2, pageSize: 50 });

    expect(paginationQuerySchema.safeParse({ pageSize: '500' }).success).toBe(false);
  });

  it('validates dashboard type/status filters (R2.7/R2.8)', () => {
    expect(dashboardQuerySchema.safeParse({ type: 'RECEIPT', status: 'WAITING' }).success).toBe(true);
    expect(dashboardQuerySchema.safeParse({ type: 'NOPE' }).success).toBe(false);
    expect(dashboardQuerySchema.safeParse({ status: 'NOPE' }).success).toBe(false);
  });
});
