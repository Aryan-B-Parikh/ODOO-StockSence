-- Phase 3 — document-line schema finalization + stock invariants
-- (docs/reviews/PHASE3_DECISIONS.md §6).
--
-- BR27: stock_move_lines.quantity must be > 0 (04_DATABASE_SCHEMA.md).
-- BR11/BR13: on_hand_qty is never negative and reservations never exceed on-hand.
-- These are hand-written CHECK constraints (Prisma schema has no @check support); they are
-- intentionally not represented in schema.prisma and are managed by this migration only.

ALTER TABLE "stock_move_lines"
  ADD CONSTRAINT "stock_move_lines_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "stock"
  ADD CONSTRAINT "stock_on_hand_non_negative" CHECK ("on_hand_qty" >= 0);

ALTER TABLE "stock"
  ADD CONSTRAINT "stock_reserved_within_on_hand" CHECK ("reserved_qty" >= 0 AND "reserved_qty" <= "on_hand_qty");
