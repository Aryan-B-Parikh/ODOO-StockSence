-- AlterTable
ALTER TABLE "stock_moves" ADD COLUMN     "counted_quantity" DECIMAL(14,3),
ADD COLUMN     "recorded_quantity" DECIMAL(14,3);
