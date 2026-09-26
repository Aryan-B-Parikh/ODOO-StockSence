# 06 — Business Rules

Each rule references its source requirement ID from `01_REQUIREMENTS.md`.

## Authentication
- **BR1** Login Id: 6–12 characters, unique across `users`. (R1.2)
- **BR2** Email: unique across `users`. (R1.3)
- **BR3** Password: must contain ≥1 lowercase, ≥1 uppercase, ≥1 special character
  (`!@#$%^&*()_+-=[]{}|;:'",.<>/?`), and length > 8. (R1.4)
- **BR4** Password and Re-Enter Password (or newPassword/confirmPassword) must match exactly,
  validated client-side and re-validated server-side. (R1.5)
- **BR5** Login failure (unknown loginId or wrong password) returns the exact same generic error
  `"Invalid Login Id or Password"` regardless of which part was wrong (prevents user enumeration,
  also matches IMG:1 literal copy). (R1.7)
- **BR6** OTP codes expire 10 minutes after creation and are single-use (`consumed=true` after
  successful verify). A new OTP request invalidates prior unconsumed OTPs for that user.

## Reference Numbering
- **BR7** Format: `<WarehouseShortCode>/<OP>/<Seq>` where `OP ∈ {IN, OUT, INT, ADJ}` and `Seq` is
  zero-padded to 4 digits, e.g. `WH/IN/0001`. (R5.7, R6.7)
- **BR8** `Seq` increments per `(warehouse_id, operation_type)` pair using
  `sequence_counters.last_number`, incremented inside the same DB transaction as document
  creation to avoid duplicate references under concurrent requests.
- **BR9** References are immutable once assigned; they are never reused, even if a document is
  later Canceled.

## Stock Engine (single source of truth — see `03_ARCHITECTURE.md`)
- **BR10** No module other than the stock-engine may write to `stock.on_hand_qty`,
  `stock.reserved_qty`, or insert into `stock_ledger`.
- **BR11** `free_to_use = on_hand_qty - reserved_qty`. Never persisted; always computed at read
  time. (IMG:13)
- **BR12** A Receipt validation increases `on_hand_qty` at `to_location_id` by each line's
  quantity. (R5.3)
- **BR13** A Delivery validation decreases `on_hand_qty` at `from_location_id` by each line's
  quantity. Quantity may never be validated below 0 on hand — if insufficient stock exists at
  validate time, the API returns `CONFLICT` and the UI keeps the delivery in `WAITING`. (R6.3)
- **BR14** An Internal Transfer validation decreases `on_hand_qty` at `from_location_id` and
  increases `on_hand_qty` at `to_location_id` by the same quantity, in a single DB transaction.
  Total system-wide stock for that product is unchanged. (R7.2)
- **BR15** A Stock Adjustment sets `on_hand_qty` at the given location to `countedQuantity`
  directly; the ledger entry records `delta = countedQuantity - previousQuantity` with
  `direction = IN` if `delta > 0`, `OUT` if `delta < 0`, and no ledger row is written if
  `delta = 0`. (R8.2, R8.3)
- **BR16** Every transition of a `stock_move` to `DONE` writes exactly one `stock_ledger` row per
  line (two rows per line for Transfers — one OUT leg, one IN leg). Ledger rows are append-only;
  no API may update or delete them. (R11.4, R9)

## Delivery "Waiting" Logic
- **BR17** A Delivery is computed as `WAITING` whenever at least one line's `quantity` exceeds
  `free_to_use` at `from_location_id` at the time of creation/edit or at re-check before
  Validate. Once all lines fit within `free_to_use`, status is eligible to move to `READY`.
  (R6.10, R6.12)
- **BR18** A line that is currently short on stock is flagged `outOfStock: true` in the API
  response so the UI can render the row red and show the alert banner. (R6.11)

## Dashboard KPI Rules
- **BR19** `late = schedule_date < today AND status NOT IN (DONE, CANCELED)`. (R2.13)
- **BR20** `operations count = schedule_date > today AND status NOT IN (DONE, CANCELED)`. (R2.14)
- **BR21** `waiting count` (Delivery card only) = count of Deliveries with `status = WAITING`.
  (R2.15)
- **BR22** `lowStockCount` = count of distinct products where, summed across all locations,
  `on_hand_qty <= reorder_min` (only for products with `reorder_min` set). (R11.1, R4.5)

## Move History Rules
- **BR23** One row is rendered per `(reference, product)` pair, sourced directly from
  `stock_ledger` — never from `stock_moves` — because a single move can have multiple lines.
  (R9.3)
- **BR24** `direction = IN` renders green; `direction = OUT` renders red. (R9.4, R9.5)

## Cancellation Rules
- **BR25** A `stock_move` (Receipt/Delivery/Transfer) can only be Canceled while status is
  `DRAFT`, `READY`, or `WAITING` — never from `DONE` (stock has already moved; reversal would
  require a new counter-document, out of scope for MVP).
- **BR26** Canceling a document never writes to `stock_ledger` (no stock has moved yet by
  definition of BR25).

## Validation / Form Rules
- **BR27** Every operation line requires `quantity > 0`.
- **BR28** Product `sku` must be unique; attempting to create a duplicate returns
  `VALIDATION_ERROR` with `fields.sku`.
- **BR29** A Location's `warehouse_id` is required and immutable after creation (moving a
  location to another warehouse is out of scope for MVP).
