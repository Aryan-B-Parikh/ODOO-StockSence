# 07 — Status Workflows

Global status enum (shared across all `stock_moves`, used by Dashboard filters R2.8):
`DRAFT | WAITING | READY | DONE | CANCELED`. Not every document type uses every status.

## Receipt (IMG:4)
```
DRAFT --(confirm)--> READY --(validate)--> DONE
  |                     |
  +------(cancel)-------+---> CANCELED
```
- **DRAFT**: initial state on creation. Editable.
- **READY**: "Ready to receive" (IMG:4). Editable. Triggered by clicking the primary action while
  Draft — UI label "Confirm" or first press of the button described in IMG:4 ("On click, TODO,
  move to Ready").
- **DONE**: "Received" (IMG:4). Triggered by clicking **Validate** while Ready. Stock increases
  (BR12). Immutable after this point. Print becomes available (R5.12).
- **CANCELED**: from Draft or Ready only (BR25).

## Delivery (IMG:5)
```
DRAFT --(auto, if any line short on stock)--> WAITING --(stock becomes available)--> READY --(validate)--> DONE
  |                                              |                                     |
  +---------------------------(cancel)-----------+-------------------------------------+---> CANCELED
```
- **DRAFT**: initial state, all lines currently within `free_to_use`. (IMG:5 "Draft: Initial
  state")
- **WAITING**: computed automatically (BR17) whenever any line's quantity exceeds
  `free_to_use` at `from_location_id`. (IMG:5 "Waiting: Waiting for the out of stock product to
  be in")
- **READY**: all lines fit within `free_to_use`; "Ready to deliver". (IMG:5)
- **DONE**: triggered by **Validate**; stock decreases (BR13); "Received or delivered" copy in
  mockup is generic to both Receipt/Delivery detail pattern — for Delivery this means delivered.
  (IMG:5)
- **CANCELED**: from Draft, Waiting, or Ready only (BR25).
- **Re-evaluation:** every edit to a Delivery's lines or every relevant Receipt/Transfer/
  Adjustment validation that changes stock at `from_location_id` re-runs the Waiting check
  (BR17) for open Deliveries referencing that location. **Resolved in Phase 3
  (`docs/reviews/PHASE3_DECISIONS.md` §1):** a synchronous FIFO recheck runs in the same
  transaction as the stock-changing event; WAITING deliveries that now fit reserve their lines
  and become READY. Open (`DRAFT`/`READY`) deliveries hold `reserved_qty` equal to their lines;
  WAITING deliveries hold none; cancel releases. See also §3 of that document for the UI
  mapping of the PDF "pick → pack → validate" process (Draft → Ready = "Pick & Pack",
  Ready → Done = "Validate").

## Internal Transfer (derived — `transfer-1` open decision)
```
DRAFT --(confirm)--> READY --(validate)--> DONE
  |                     |
  +------(cancel)-------+---> CANCELED
```
- Modeled identically to Receipt (no external contact, so no analogue to Delivery's `WAITING`
  wait-for-vendor-restock state). **OPEN DECISION:** if a transfer line exceeds `free_to_use` at
  `from_location_id`, the MVP behavior is to block `confirm`/`validate` with a `CONFLICT` error
  (BR13-style) rather than introduce a `WAITING` state — simpler for hackathon scope, revisit if
  time allows.

## Stock Adjustment (derived — `adjust-1` open decision)
```
(create) --> DONE
```
- Single-step: creating the adjustment applies it immediately (R8.3) and writes the ledger entry
  in the same request (BR15). No Draft/Ready intermediate state — matches the PDF's description
  of an immediate auto-updating action.
- **CANCELED** is not applicable to Adjustments in MVP (nothing to cancel before it's applied).

## Status → Dashboard Filter Mapping (R2.8)
| Status | Shown in Dashboard filter | Applies to |
|---|---|---|
| Draft | Yes | Receipt, Delivery, Transfer |
| Waiting | Yes | Delivery only |
| Ready | Yes | Receipt, Delivery, Transfer |
| Done | Yes | Receipt, Delivery, Transfer, Adjustment |
| Canceled | Yes | Receipt, Delivery, Transfer |

## Kanban View Columns (R5.6, R6.6, R9.6)
- Receipts / Transfers Kanban: `Draft | Ready | Done | Canceled`
- Deliveries Kanban: `Draft | Waiting | Ready | Done | Canceled`
- Move History Kanban: `Done` only (ledger entries only ever exist for validated/Done moves per
  BR16), so its "Kanban" view groups by `direction` (IN/OUT) rather than status —
  **OPEN DECISION**, flagged for Person 2/Person 4 alignment at Phase 4 kickoff since the mockup
  icon exists (IMG:7/9) but its exact grouping isn't specified.
