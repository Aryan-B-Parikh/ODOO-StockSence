# 01 — Requirements

Legend for **Source**: `PDF:<section>` = hackathon PDF, `IMG:<n>` = Excalidraw mockup image number
(as provided, 1–13). Every requirement below is derived from one of those two sources only.
Usernames/avatars/author labels seen in mockups (e.g. "Blissful Jay", "Bronze Horse") are
**not** requirements and are excluded.

## R1. Authentication
| ID | Requirement | Source |
|---|---|---|
| R1.1 | User can sign up with Login Id, Email Id, Password, Re-enter Password | PDF:Authentication, IMG:1 |
| R1.2 | Login Id must be unique and between 6–12 characters | IMG:1 |
| R1.3 | Email Id must not be a duplicate in the database | IMG:1 |
| R1.4 | Password must contain a lowercase letter, an uppercase letter, a special character, and be more than 8 characters long | IMG:1 |
| R1.5 | Password and Re-Enter Password must match before submission | IMG:1 (implied by field pair) |
| R1.6 | User can log in with Login Id + Password | PDF:Authentication, IMG:1 |
| R1.7 | On login, credentials are checked against stored records; mismatch shows error "Invalid Login Id or Password" | IMG:1 |
| R1.8 | "Sign Up" link on Login page navigates to Sign Up page | IMG:1 |
| R1.9 | "Forget Password?" link navigates to a Forget/Reset Password flow | IMG:1 |
| R1.10 | Password reset is OTP-based | PDF:Authentication |
| R1.11 | On successful login, user is redirected to the Inventory Dashboard | PDF:Authentication |

## R2. Dashboard
| ID | Requirement | Source |
|---|---|---|
| R2.1 | Dashboard is the landing page after login and shows a snapshot of inventory operations | PDF:Dashboard View |
| R2.2 | Dashboard displays KPI: Total Products in Stock | PDF:Dashboard KPIs |
| R2.3 | Dashboard displays KPI: Low Stock / Out of Stock Items | PDF:Dashboard KPIs |
| R2.4 | Dashboard displays KPI: Pending Receipts | PDF:Dashboard KPIs |
| R2.5 | Dashboard displays KPI: Pending Deliveries | PDF:Dashboard KPIs |
| R2.6 | Dashboard displays KPI: Internal Transfers Scheduled | PDF:Dashboard KPIs |
| R2.7 | Dashboard supports dynamic filter by document type: Receipts / Delivery / Internal / Adjustments | PDF:Dynamic Filters |
| R2.8 | Dashboard supports dynamic filter by status: Draft, Waiting, Ready, Done, Canceled | PDF:Dynamic Filters |
| R2.9 | Dashboard supports dynamic filter by warehouse or location | PDF:Dynamic Filters |
| R2.10 | Dashboard supports dynamic filter by product category | PDF:Dynamic Filters |
| R2.11 | Dashboard shows a Receipt summary card: count "to receive", count "Late", count "operations" | IMG:12 |
| R2.12 | Dashboard shows a Delivery summary card: count "to Deliver", count "Late", count "waiting", count "operations" | IMG:12 |
| R2.13 | "Late" = schedule date < today's date | IMG:12 |
| R2.14 | "Operations" (count) = schedule date > today's date | IMG:12 |
| R2.15 | "Waiting" = waiting for the stock to become available | IMG:12 |
| R2.16 | Operations can be performed from a Dashboard submenu: Receipt, Delivery, Adjustment | IMG:12 |
| R2.17 | Dashboard links out to Stock list and to In/Out stock move history | IMG:12 |

## R3. Navigation
| ID | Requirement | Source |
|---|---|---|
| R3.1 | Primary navigation bar contains: Dashboard, Operations, Products, Move History, Settings | IMG:2,3,4,5,6,7,8,9,10,11,13 |
| R3.2 | Operations is a parent menu with sub-items: Receipts, Delivery Orders, Inventory Adjustment | PDF:Navigation, IMG:12 |
| R3.3 | Settings contains Warehouse management (and Location management, see R8) | PDF:Navigation, IMG:8,10,11 |
| R3.4 | A Profile menu (top-right avatar) provides My Profile and Logout | PDF:Navigation |
| R3.5 | Move History and Dashboard are also reachable as top-level items, consistent with PDF navigation list | PDF:Navigation |

> **OPEN DECISION (nav-1):** IMG:12 (Dashboard) shows the nav bar as *Dashboard, Operations,
> Stock, Move History, Settings* — using "Stock" where every other screen uses "Products". The
> PDF lists "Products" as a top-level nav item and describes Stock as a property of Products
> ("Stock availability per location"). **Decision for MVP:** keep **Products** as the top-level
> nav item; the **Stock** view (IMG:13) is a sub-view/tab reached from Products, not a separate
> top-level nav entry. Document this in `02_UI_FUNCTIONALITY.md`.

## R4. Product Management
| ID | Requirement | Source |
|---|---|---|
| R4.1 | User can create a product with: Name, SKU/Code, Category, Unit of Measure, Initial stock (optional) | PDF:Core Features 1 |
| R4.2 | User can update an existing product | PDF:Core Features 1 |
| R4.3 | Product stock availability is tracked per location | PDF:Core Features 1 |
| R4.4 | Products are organized into categories | PDF:Core Features 1 |
| R4.5 | Products support reordering rules (low-stock threshold) | PDF:Core Features 1 |
| R4.6 | Stock view (IMG:13) lists Product, per-unit cost, On hand, Free to Use, with search | IMG:13 |
| R4.7 | User must be able to update stock quantity directly from the Stock view | IMG:13 |

## R5. Receipts (Incoming Stock)
| ID | Requirement | Source |
|---|---|---|
| R5.1 | User creates a new Receipt | PDF:Core Features 2, IMG:3,4 |
| R5.2 | Receipt captures supplier ("Receive From") and one or more products with quantities | PDF:Core Features 2, IMG:4 |
| R5.3 | On Validate, stock increases automatically for each product line at the destination location | PDF:Core Features 2 |
| R5.4 | Receipt list view (default) shows: Reference, From, To, Contact, Schedule date, Status | IMG:3 |
| R5.5 | Receipt list is searchable by reference and by contact | IMG:3 |
| R5.6 | Receipt list can switch between List view and Kanban view (grouped by status) | IMG:3 |
| R5.7 | Receipt reference auto-increments using pattern `<Warehouse>/<Operation>/<ID>` e.g. `WH/IN/0001` | IMG:3 |
| R5.8 | Receipt detail form has: Reference (read-only), Receive From, Schedule Date, Responsible (auto-filled with current logged-in user), Products table (Product, Quantity), "New Product" row to add lines | IMG:4 |
| R5.9 | Receipt has actions: Validate, Print, Cancel | IMG:4 |
| R5.10 | Receipt status flow: Draft → Ready → Done | IMG:4 |
| R5.11 | Clicking the primary action while Draft moves status to Ready; clicking Validate while Ready moves status to Done | IMG:4 |
| R5.12 | Print action is available/intended once the Receipt is Done | IMG:4 |

## R6. Delivery Orders (Outgoing Stock)
| ID | Requirement | Source |
|---|---|---|
| R6.1 | User creates a new Delivery Order | PDF:Core Features 3, IMG:5,6 |
| R6.2 | Process is pick items → pack items → validate | PDF:Core Features 3 |
| R6.3 | On Validate, stock decreases automatically for each product line at the source location | PDF:Core Features 3 |
| R6.4 | Delivery list view (default) shows: Reference, From, To, Contact, Schedule date, Status | IMG:2,6 |
| R6.5 | Delivery list is searchable by reference and by contact | IMG:2,6 |
| R6.6 | Delivery list can switch between List view and Kanban view (grouped by status) | IMG:2,6 |
| R6.7 | Delivery reference follows the same `<Warehouse>/OUT/<ID>` pattern, e.g. `WH/OUT/0001` | IMG:2,6 (consistent with R5.7) |
| R6.8 | Delivery detail form has: Reference (read-only), Delivery Address, Schedule Date, Responsible, Operation type (dropdown), Products table (Product, Quantity), Add New Product | IMG:5 |
| R6.9 | Delivery has actions: Validate, Print, Cancel | IMG:5 |
| R6.10 | Delivery status flow: Draft → Waiting → Ready → Done | IMG:5 |
| R6.11 | If a product line is out of stock, the row is highlighted red and a notification alert is shown | IMG:5 |
| R6.12 | "Waiting" status = the delivery is waiting for an out-of-stock product to become available | IMG:5 |

## R7. Internal Transfers
| ID | Requirement | Source |
|---|---|---|
| R7.1 | User can move stock between locations inside the company (e.g. Main Warehouse → Production Floor, Rack A → Rack B, Warehouse 1 → Warehouse 2) | PDF:Core Features 4 |
| R7.2 | Total stock quantity is unchanged; only the location of the stock is updated | PDF: Simplified Example, Step 2 |
| R7.3 | Every internal transfer movement is logged in the ledger (Move History) | PDF:Core Features 4 |

> **OPEN DECISION (transfer-1):** No dedicated mockup screen exists for Internal Transfers. Its
> list/detail UI and status flow are modeled on the Receipt screen (IMG:3/4) for visual and
> workflow consistency, since it is structurally a "from location → to location" move like a
> Receipt/Delivery, just internal-to-internal. See `07_STATUS_WORKFLOWS.md`.

## R8. Stock Adjustments
| ID | Requirement | Source |
|---|---|---|
| R8.1 | User can fix mismatches between recorded stock and physical count | PDF:Core Features 5 |
| R8.2 | Steps: select product/location, enter counted quantity | PDF:Core Features 5 |
| R8.3 | System auto-updates stock and logs the adjustment | PDF:Core Features 5 |

> **OPEN DECISION (adjust-1):** No dedicated mockup screen exists for Stock Adjustments. Its UI
> is modeled as a simplified single-step form (product/location picker + counted quantity), with
> status Draft → Done only (no Ready/Waiting), since the PDF describes it as an immediate
> auto-updating action rather than a multi-step pick/pack/validate flow.

## R9. Move History
| ID | Requirement | Source |
|---|---|---|
| R9.1 | Move History list (default) shows: Reference, Date, Contact, From, To, Quantity, Status | IMG:7,9 |
| R9.2 | Populates all moves done between From/To locations in inventory | IMG:7,9 |
| R9.3 | If a single reference has multiple products, each product is displayed as its own row | IMG:7,9 |
| R9.4 | Incoming (IN) moves are displayed in green | IMG:7,9 |
| R9.5 | Outgoing (OUT) moves are displayed in red | IMG:7,9 |
| R9.6 | Move History is searchable by reference and contact, and can switch to Kanban view by status | IMG:7,9 |

## R10. Warehouse & Location (Settings)
| ID | Requirement | Source |
|---|---|---|
| R10.1 | Warehouse page captures: Name, Short Code, Address | IMG:11 |
| R10.2 | Location page captures: Name, Short Code, Warehouse (prefixed "WH") | IMG:8,10 |
| R10.3 | A Location represents a sub-division of a Warehouse (room, rack, zone, etc.) — "holds the multiple locations of warehouse, rooms etc." | IMG:8,10 |
| R10.4 | Multi-warehouse support is required | PDF:Additional Features |

## R11. Additional / Cross-cutting Features
| ID | Requirement | Source |
|---|---|---|
| R11.1 | Alerts for low stock | PDF:Additional Features |
| R11.2 | Multi-warehouse support | PDF:Additional Features |
| R11.3 | SKU search & smart filters | PDF:Additional Features |
| R11.4 | Every stock-affecting action is recorded in a central Stock Ledger | PDF:Simplified Example |

## R12. Non-functional (implementation decisions, not PDF requirements)
| ID | Requirement | Source |
|---|---|---|
| R12.1 | MVP is a web application | Decision (hackathon scope) |
| R12.2 | Single company / single tenant | Decision (out of scope per `00_PROJECT_OVERVIEW.md`) |
| R12.3 | OTP delivery is mocked/logged server-side for demo purposes rather than sent via real SMS/email provider | Decision — flagged as OPEN DECISION, revisit if time allows |
