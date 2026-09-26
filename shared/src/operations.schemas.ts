import { z } from 'zod';
import { STOCK_MOVE_STATUSES, STOCK_MOVE_TYPES } from './inventory.types.js';
import { paginationQuerySchema, requiredText, uuidSchema } from './inventory.schemas.js';
import { CONTACT_TYPES } from './operations.types.js';

/**
 * Phase 3 request schemas — Receipts (§6), Deliveries (§7), Contacts (§4b).
 * BR27: every document line requires quantity > 0; a document needs at least one line.
 */

export const isoDateSchema = z
  .string({ required_error: 'Schedule date is required' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

export const moveLineInputSchema = z.object({
  productId: uuidSchema,
  quantity: z
    .number({ required_error: 'Quantity is required' })
    .positive('Quantity must be greater than 0'),
});

/** BR27 + one line per product (keeps reservation/ledger aggregation unambiguous). */
export const moveLinesSchema = z
  .array(moveLineInputSchema)
  .min(1, 'At least one product line is required')
  .max(100, 'At most 100 lines are allowed')
  .superRefine((lines, ctx) => {
    const seen = new Set<string>();
    lines.forEach((line, index) => {
      if (seen.has(line.productId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'productId'],
          message: 'Duplicate product in lines',
        });
      }
      seen.add(line.productId);
    });
  });

// ---------------------------------------------------------------- receipts §6

export const receiptCreateSchema = z.object({
  fromContactId: uuidSchema,
  toLocationId: uuidSchema,
  scheduleDate: isoDateSchema,
  responsibleUserId: uuidSchema.optional(),
  lines: moveLinesSchema,
});

export const receiptUpdateSchema = z.object({
  fromContactId: uuidSchema.optional(),
  toLocationId: uuidSchema.optional(),
  scheduleDate: isoDateSchema.optional(),
  responsibleUserId: uuidSchema.optional(),
  lines: moveLinesSchema.optional(),
});

// -------------------------------------------------------------- deliveries §7

export const deliveryCreateSchema = z.object({
  fromLocationId: uuidSchema,
  toContactId: uuidSchema,
  scheduleDate: isoDateSchema,
  operationType: requiredText('Operation type', 30),
  responsibleUserId: uuidSchema.optional(),
  lines: moveLinesSchema,
});

export const deliveryUpdateSchema = z.object({
  fromLocationId: uuidSchema.optional(),
  toContactId: uuidSchema.optional(),
  scheduleDate: isoDateSchema.optional(),
  operationType: requiredText('Operation type', 30).optional(),
  responsibleUserId: uuidSchema.optional(),
  lines: moveLinesSchema.optional(),
});

// ---------------------------------------------------------------- contacts §4b

export const contactCreateSchema = z.object({
  name: requiredText('Name', 255),
  type: z.enum(CONTACT_TYPES),
  email: z
    .string()
    .trim()
    .email('Enter a valid email')
    .max(255, 'Email must be at most 255 characters')
    .nullish(),
  phone: z.string().trim().max(30, 'Phone must be at most 30 characters').nullish(),
});

export const contactQuerySchema = z.object({
  type: z.enum(CONTACT_TYPES).optional(),
  search: z.string().trim().max(255).optional(),
});

/** Shared list query for §6/§7 (status/search/pagination + warehouse scope, decision 8). */
export const operationsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(255).optional(),
  status: z.enum(STOCK_MOVE_STATUSES).optional(),
  warehouseId: uuidSchema.optional(),
});

// --------------------------------------------------------- transfers §8

/** PHASE4_DECISIONS §1/§6: source and destination must differ. */
export const transferCreateSchema = z
  .object({
    fromLocationId: uuidSchema,
    toLocationId: uuidSchema,
    scheduleDate: isoDateSchema,
    responsibleUserId: uuidSchema.optional(),
    lines: moveLinesSchema,
  })
  .superRefine((data, ctx) => {
    if (data.fromLocationId === data.toLocationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['toLocationId'],
        message: 'Source and destination locations must differ',
      });
    }
  });

export const transferUpdateSchema = z
  .object({
    fromLocationId: uuidSchema.optional(),
    toLocationId: uuidSchema.optional(),
    scheduleDate: isoDateSchema.optional(),
    responsibleUserId: uuidSchema.optional(),
    lines: moveLinesSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.fromLocationId && data.fromLocationId === data.toLocationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['toLocationId'],
        message: 'Source and destination locations must differ',
      });
    }
  });

// ------------------------------------------------------- adjustments §9

export const adjustmentCreateSchema = z.object({
  productId: uuidSchema,
  locationId: uuidSchema,
  countedQuantity: z
    .number({
      required_error: 'Counted quantity is required',
      invalid_type_error: 'Counted quantity is required',
    })
    .nonnegative('Counted quantity must be 0 or more'),
  note: z.string().trim().max(500, 'Note must be at most 500 characters').optional(),
});

export const adjustmentQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(255).optional(),
  status: z.enum(STOCK_MOVE_STATUSES).optional(),
  warehouseId: uuidSchema.optional(),
  productId: uuidSchema.optional(),
  locationId: uuidSchema.optional(),
});

// ------------------------------------------------------ move history §10

export const moveHistoryQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(255).optional(),
  type: z.enum(STOCK_MOVE_TYPES).optional(),
  direction: z.enum(['IN', 'OUT']).optional(),
  status: z.enum(STOCK_MOVE_STATUSES).optional(),
  productId: uuidSchema.optional(),
  warehouseId: uuidSchema.optional(),
  locationId: uuidSchema.optional(),
  dateFrom: isoDateSchema.optional(),
  dateTo: isoDateSchema.optional(),
});

export type MoveLineInput = z.infer<typeof moveLineInputSchema>;
export type ReceiptCreateInput = z.infer<typeof receiptCreateSchema>;
export type ReceiptUpdateInput = z.infer<typeof receiptUpdateSchema>;
export type DeliveryCreateInput = z.infer<typeof deliveryCreateSchema>;
export type DeliveryUpdateInput = z.infer<typeof deliveryUpdateSchema>;
export type ContactCreateInput = z.infer<typeof contactCreateSchema>;
export type ContactQuery = z.infer<typeof contactQuerySchema>;
export type TransferCreateInput = z.infer<typeof transferCreateSchema>;
export type TransferUpdateInput = z.infer<typeof transferUpdateSchema>;
export type AdjustmentCreateInput = z.infer<typeof adjustmentCreateSchema>;
export type AdjustmentQuery = z.infer<typeof adjustmentQuerySchema>;
export type MoveHistoryQuery = z.infer<typeof moveHistoryQuerySchema>;
