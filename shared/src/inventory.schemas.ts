import { z } from 'zod';
import { STOCK_MOVE_STATUSES, STOCK_MOVE_TYPES } from './inventory.types.js';

/**
 * Phase 2 request schemas — shared by the API (server validation) and the SPA
 * (form validation), per 03_ARCHITECTURE.md §7.
 *
 * Business rules: BR27 (quantity > 0), BR28 (unique SKU), BR29 (location warehouse
 * immutable), BR22 (low-stock threshold uses reorder_min).
 */

export const uuidSchema = z.string().uuid('Invalid id');

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int('Page must be a whole number').min(1, 'Page must be at least 1').default(1),
  pageSize: z.coerce
    .number()
    .int('Page size must be a whole number')
    .min(1, 'Page size must be at least 1')
    .max(MAX_PAGE_SIZE, `Page size must be at most ${MAX_PAGE_SIZE}`)
    .default(DEFAULT_PAGE_SIZE),
});

export const requiredText = (label: string, max: number) =>
  z
    .string({ required_error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`);

// ---------------------------------------------------------------- products

const productFields = {
  name: requiredText('Name', 255),
  sku: requiredText('SKU', 64),
  categoryId: uuidSchema.nullish(),
  uom: requiredText('Unit of Measure', 30),
  costPerUnit: z.number().nonnegative('Cost per unit must be 0 or more').nullish(),
  reorderMin: z.number().nonnegative('Reorder minimum must be 0 or more').nullish(),
  reorderMax: z.number().nonnegative('Reorder maximum must be 0 or more').nullish(),
};

function checkReorderRange(data: { reorderMin?: number | null; reorderMax?: number | null }, ctx: z.RefinementCtx) {
  if (data.reorderMin != null && data.reorderMax != null && data.reorderMin > data.reorderMax) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['reorderMax'],
      message: 'Reorder maximum must be greater than or equal to reorder minimum',
    });
  }
}

/** BR27: initial stock quantity must be > 0. */
export const initialStockSchema = z.object({
  locationId: uuidSchema,
  quantity: z
    .number({ required_error: 'Initial stock quantity is required' })
    .positive('Initial stock quantity must be greater than 0'),
});

export const productCreateSchema = z
  .object({ ...productFields, initialStock: initialStockSchema.optional() })
  .superRefine(checkReorderRange);

export const productUpdateSchema = z
  .object(productFields)
  .partial()
  .superRefine(checkReorderRange);

export const productQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(255).optional(),
  categoryId: uuidSchema.optional(),
});

export const categoryCreateSchema = z.object({
  name: requiredText('Name', 255),
});

// --------------------------------------------------- warehouses & locations

const warehouseFields = {
  name: requiredText('Name', 255),
  shortCode: requiredText('Short Code', 10),
  address: z.string().trim().max(500, 'Address must be at most 500 characters').nullish(),
};

export const warehouseCreateSchema = z.object(warehouseFields);
export const warehouseUpdateSchema = z.object(warehouseFields).partial();

const locationFields = {
  name: requiredText('Name', 255),
  shortCode: requiredText('Short Code', 10),
};

export const locationCreateSchema = z.object({
  warehouseId: uuidSchema,
  ...locationFields,
});

/** BR29: a location's warehouse is required and immutable after creation. */
export const locationUpdateSchema = z
  .object({ ...locationFields, warehouseId: z.unknown().optional() })
  .partial()
  .superRefine((data, ctx) => {
    if (data.warehouseId !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['warehouseId'],
        message: 'Warehouse cannot be changed after creation (BR29)',
      });
    }
  });

export const locationQuerySchema = z.object({
  warehouseId: uuidSchema.optional(),
});

// ------------------------------------------------------------------- stock

export const stockQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(255).optional(),
  locationId: uuidSchema.optional(),
  warehouseId: uuidSchema.optional(),
});

export const stockUpdateSchema = z.object({
  onHand: z
    .number({ required_error: 'On hand quantity is required' })
    .nonnegative('On hand quantity must be 0 or more'),
  note: z.string().trim().max(500, 'Note must be at most 500 characters').optional(),
});

// --------------------------------------------------------------- dashboard

/**
 * Warehouse/location/category filters are documented in 05 §5.
 * `type` and `status` are the Phase 2 extension that makes the R2.7/R2.8 dynamic
 * filters effective on the KPI payload (documented in 05 §5 + 14_CHANGELOG.md).
 */
export const dashboardQuerySchema = z.object({
  warehouseId: uuidSchema.optional(),
  locationId: uuidSchema.optional(),
  categoryId: uuidSchema.optional(),
  type: z.enum(STOCK_MOVE_TYPES).optional(),
  status: z.enum(STOCK_MOVE_STATUSES).optional(),
});

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;
export type WarehouseCreateInput = z.infer<typeof warehouseCreateSchema>;
export type WarehouseUpdateInput = z.infer<typeof warehouseUpdateSchema>;
export type LocationCreateInput = z.infer<typeof locationCreateSchema>;
export type LocationUpdateInput = z.infer<typeof locationUpdateSchema>;
export type StockUpdateInput = z.infer<typeof stockUpdateSchema>;
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
