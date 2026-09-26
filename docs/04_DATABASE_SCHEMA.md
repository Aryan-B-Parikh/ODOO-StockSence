# 04 — Database Schema

Relational schema (PostgreSQL). All PKs are `UUID` unless noted. All tables have `created_at`
(`timestamptz default now()`); tables that are ever updated also have `updated_at`.

## Entity List
users, warehouses, locations, categories, products, contacts, stock, sequence_counters,
stock_moves, stock_move_lines, stock_ledger

---

### `users`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| login_id | varchar(12) | unique, 6–12 chars (R1.2) |
| email | varchar(255) | unique (R1.3) |
| password_hash | varchar(255) | bcrypt hash, never returned by API |
| display_name | varchar(255) | nullable, editable on Profile |
| role | varchar(30) | `INVENTORY_MANAGER` \| `WAREHOUSE_STAFF`; informational only, not enforced (see 00_PROJECT_OVERVIEW OPEN DECISION) |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `otp_requests` (supports R1.10)
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| user_id | UUID FK → users.id | |
| otp_code | varchar(6) | |
| expires_at | timestamptz | e.g. now()+10min |
| consumed | boolean | default false |
| created_at | timestamptz | |

### `warehouses`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | varchar(255) | |
| short_code | varchar(10) | unique, used as reference prefix e.g. `WH` |
| address | text | nullable |
| created_at / updated_at | timestamptz | |

### `locations`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| warehouse_id | UUID FK → warehouses.id | not null |
| name | varchar(255) | |
| short_code | varchar(10) | unique within warehouse |
| created_at / updated_at | timestamptz | |

### `categories`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | varchar(255) | unique |
| created_at | timestamptz | (schema preamble applies — Phase 2 migration) |

### `products`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | varchar(255) | |
| sku | varchar(64) | unique (R4.1, R11.3) |
| category_id | UUID FK → categories.id | nullable |
| uom | varchar(30) | e.g. `kg`, `pcs`, `unit` |
| cost_per_unit | numeric(12,2) | nullable, shown in Stock view (IMG:13) |
| reorder_min | numeric(12,2) | nullable, low-stock threshold (R4.5, R11.1) |
| reorder_max | numeric(12,2) | nullable |
| created_at / updated_at | timestamptz | |

### `contacts`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | varchar(255) | |
| type | varchar(20) | `VENDOR` \| `CUSTOMER` |
| email | varchar(255) | nullable |
| phone | varchar(30) | nullable |
| created_at / updated_at | timestamptz | |

### `stock`
Current on-hand quantity per product per location. One row per (product, location).
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| product_id | UUID FK → products.id | |
| location_id | UUID FK → locations.id | |
| on_hand_qty | numeric(14,3) | default 0; `CHECK (on_hand_qty >= 0)` (Phase 3 migration) |
| reserved_qty | numeric(14,3) | default 0 (allocated to open Delivery lines in Phase 3 — `docs/reviews/PHASE3_DECISIONS.md` §1); `CHECK (0 <= reserved_qty <= on_hand_qty)` |
| created_at | timestamptz | (schema preamble applies — Phase 2 migration) |
| updated_at | timestamptz | |
| — | UNIQUE (product_id, location_id) | |

`free_to_use = on_hand_qty - reserved_qty` (computed, not stored — see `06_BUSINESS_RULES.md`).

### `sequence_counters`
Backs the reference-number generator (R5.7): `<WarehouseShortCode>/<OP>/<padded id>`.
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| warehouse_id | UUID FK → warehouses.id | |
| operation_type | varchar(10) | `IN` \| `OUT` \| `INT` \| `ADJ` |
| last_number | integer | default 0, incremented atomically per new document |
| created_at | timestamptz | (schema preamble applies — Phase 2 migration) |
| — | UNIQUE (warehouse_id, operation_type) | |

### `stock_moves`
Header table for Receipts, Deliveries, Internal Transfers, and Adjustments (one polymorphic
table keeps status/reference logic identical across all four operation types, per
`07_STATUS_WORKFLOWS.md`).
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| reference | varchar(40) | unique, e.g. `WH/IN/0001` |
| type | varchar(10) | `RECEIPT` \| `DELIVERY` \| `TRANSFER` \| `ADJUSTMENT` |
| warehouse_id | UUID FK → warehouses.id | warehouse this document belongs to (for reference generation) |
| from_location_id | UUID FK → locations.id | nullable (null for Receipt = external vendor) |
| to_location_id | UUID FK → locations.id | nullable (null for Delivery = external customer) |
| contact_id | UUID FK → contacts.id | nullable (Receipts/Deliveries only) |
| operation_type | varchar(30) | nullable, Delivery "Operation type" dropdown value (IMG:5) |
| schedule_date | date | |
| responsible_user_id | UUID FK → users.id | defaults to creator (R5.8) |
| status | varchar(15) | `DRAFT` \| `WAITING` \| `READY` \| `DONE` \| `CANCELED` (see `07_STATUS_WORKFLOWS.md`) |
| note | text | nullable; **Phase 2 addition** — optional reason for adjustments (`PATCH /stock`, Phase 4 Adjustment form) |
| recorded_quantity | numeric(14,3) | nullable; **Phase 4 addition** — on-hand before an ADJUSTMENT (set for every adjustment path) |
| counted_quantity | numeric(14,3) | nullable; **Phase 4 addition** — physical count entered for an ADJUSTMENT (§9 list/detail) |
| validated_at | timestamptz | nullable, set when status → DONE |
| created_at / updated_at | timestamptz | |

### `stock_move_lines`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| stock_move_id | UUID FK → stock_moves.id | |
| product_id | UUID FK → products.id | |
| quantity | numeric(14,3) | must be > 0 — `CHECK (quantity > 0)` (Phase 3 migration) |
| created_at | timestamptz | |

### `stock_ledger`
Immutable audit log, one row per (stock_move_id, product_id) written **only** when a
`stock_move` transitions to `DONE`. Backs the Move History screen (R9) and cannot be edited or
deleted by any API.
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| stock_move_id | UUID FK → stock_moves.id | |
| reference | varchar(40) | denormalized copy of stock_moves.reference for fast list queries |
| product_id | UUID FK → products.id | |
| from_location_id | UUID FK → locations.id | nullable |
| to_location_id | UUID FK → locations.id | nullable |
| contact_id | UUID FK → contacts.id | nullable |
| quantity | numeric(14,3) | |
| direction | varchar(3) | `IN` \| `OUT` (drives green/red row color, R9.4/R9.5) |
| moved_at | timestamptz | = validated_at of the parent move |

---

## Relationships (ER summary)
```
warehouses (1)───(N) locations
warehouses (1)───(N) sequence_counters
categories (1)───(N) products
products   (1)───(N) stock
locations  (1)───(N) stock
products   (1)───(N) stock_move_lines
stock_moves(1)───(N) stock_move_lines
stock_moves(1)───(N) stock_ledger
users      (1)───(N) stock_moves [responsible_user_id]
contacts   (1)───(N) stock_moves
```

## Indexing Notes
- `products.sku`, `users.login_id`, `users.email`, `warehouses.short_code`,
  `stock_moves.reference` — unique indexes (also enforce business uniqueness rules).
- `stock_moves(status, schedule_date)` — composite index, supports Dashboard "Late"/"Operations"
  KPI queries (R2.13/R2.14).
- `stock_ledger(product_id, moved_at)` and `stock_ledger(reference)` — support Move History
  search/filter (R9.6).
