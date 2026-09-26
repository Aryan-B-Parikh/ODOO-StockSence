import type { PrismaClient } from '@prisma/client';
import type { ReferenceGenerator, StockEngineDb, StockOperationType } from './interface.js';

/**
 * BR7: `<WarehouseShortCode>/<OP>/<Seq>`, OP ∈ {IN, OUT, INT, ADJ}, Seq zero-padded to 4.
 * BR8: atomic increment of sequence_counters(warehouse_id, operation_type) inside the
 *       caller's transaction.
 * BR9: references are immutable and never reused.
 */
export function formatReference(
  warehouseShortCode: string,
  operationType: StockOperationType,
  sequence: number,
): string {
  return `${warehouseShortCode}/${operationType}/${String(sequence).padStart(4, '0')}`;
}

export function createReferenceGenerator(prisma: PrismaClient): ReferenceGenerator {
  return {
    async next(warehouseId: string, operationType: StockOperationType, db: StockEngineDb = prisma) {
      const rows = await db.$queryRaw<Array<{ last_number: number }>>`
        INSERT INTO sequence_counters (id, warehouse_id, operation_type, last_number, created_at)
        VALUES (gen_random_uuid(), ${warehouseId}::uuid, ${operationType}, 1, now())
        ON CONFLICT (warehouse_id, operation_type)
        DO UPDATE SET last_number = sequence_counters.last_number + 1
        RETURNING last_number
      `;

      const warehouse = await db.warehouse.findUniqueOrThrow({
        where: { id: warehouseId },
        select: { shortCode: true },
      });

      return formatReference(warehouse.shortCode, operationType, Number(rows[0]?.last_number ?? 1));
    },
  };
}
