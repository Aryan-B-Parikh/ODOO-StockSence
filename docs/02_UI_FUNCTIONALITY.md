# 02 — UI / Functionality Specification

Source of truth for visuals: Excalidraw mockups (images 1–13). Business rules referenced here
are defined fully in `06_BUSINESS_RULES.md`. All usernames/avatars in the mockups are ignored.

## Global Layout
- **Top navigation bar** (all authenticated screens): `Dashboard | Operations | Products |
  Move History | Settings`, with an avatar/profile icon on the right opening **My Profile /
  Logout**.
- **Operations** is a dropdown/submenu exposing: `Receipts`, `Delivery Orders`,
  `Inventory Adjustment` (IMG:12). Internal Transfers is added to this submenu for architectural
  consistency (see R7, `07_STATUS_WORKFLOWS.md`).
- **Settings** exposes: `Warehouse`, `Location` (IMG:8,10,11).
- See `01_REQUIREMENTS.md` → **OPEN DECISION (nav-1)** regarding "Products" vs "Stock" in the nav
  bar. Decision used throughout this document: **Products** is the nav item; **Stock** is a tab
  inside the Products page.

---

## Screen: Login (IMG:1)
- Fields: Login Id, Password.
- Actions: **Sign In**, link **Forget Password?**, link **Sign Up**.
- Behavior:
  - Submit checks credentials server-side.
  - Mismatch → inline error: `Invalid Login Id or Password`.
  - Sign Up link → Signup screen.
  - Forget Password link → Forgot Password (OTP) flow.
  - Success → redirect to Dashboard.

## Screen: Sign Up (IMG:1)
- Fields: Login Id, Email Id, Password, Re-Enter Password.
- Action: **Sign Up**.
- Client + server validation (see `06_BUSINESS_RULES.md` R1.2–R1.5):
  - Login Id unique, 6–12 chars.
  - Email unique.
  - Password: lowercase + uppercase + special char + length > 8.
  - Password === Re-Enter Password.
- Success → account created, redirect to Login (or auto-login, **OPEN DECISION** — default:
  redirect to Login with a success toast for MVP simplicity).

## Screen: Forgot Password (OTP) — not mocked, derived from PDF
- Step 1: enter Login Id or Email → request OTP.
- Step 2: enter OTP + new password + confirm.
- Step 3: success → redirect to Login.
- **OPEN DECISION:** OTP is generated server-side and, for the hackathon demo, returned in the
  API response / logged to server console instead of actually emailed/texted (no mockup or PDF
  detail specifies the delivery channel).

## Screen: Dashboard (IMG:12)
- KPI/summary cards:
  - **Receipt** card: "N to receive", "N Late", "N operations".
  - **Delivery** card: "N to Deliver", "N Late", "N waiting", "N operations".
- Definitions (apply to both cards):
  - **Late** = `schedule_date < today`.
  - **Operations** (the trailing count) = total open (non-Done, non-Canceled) records with
    `schedule_date > today`.
  - **Waiting** = records currently in `WAITING` status (Delivery only, see `07_STATUS_WORKFLOWS.md`).
- Dynamic filters bar (PDF): document type (Receipts/Delivery/Internal/Adjustments), status
  (Draft/Waiting/Ready/Done/Canceled), warehouse/location, product category.
- Links: "List the available stock" → Stock tab; "Display history of In/Out stocks" → Move
  History.
- Operations submenu accessible from Dashboard: Receipt / Delivery / Adjustment (shortcut to
  create new).

## Screen: Products — Catalog tab
- Table columns: Name, SKU, Category, Unit of Measure, Reorder Min/Max (from R4.5).
- **New Product** action opens a form: Name, SKU/Code, Category, Unit of Measure, Initial stock
  (optional).
- Edit existing product inline or via detail form.

## Screen: Products — Stock tab (IMG:13)
- Columns: Product, Per Unit Cost, On Hand, Free to Use.
- Search icon (by product/SKU).
- Inline editable "On Hand" value — user can update stock directly from here (writes a Stock
  Adjustment record under the hood, see `06_BUSINESS_RULES.md`).
- `Free to Use = On Hand − Reserved` (reserved = quantity allocated to open Delivery/Transfer
  lines).

## Screen: Receipts — List (IMG:3)
- Header: `NEW` button, title "Receipts".
- Toolbar (right): search icon, list-view icon, kanban-view icon.
- Columns: Reference, From, To, Contact, Schedule date, Status.
- Default view = List. Toggle to Kanban grouped by Status (Draft/Ready/Done/Canceled).
- Search filters rows by Reference or Contact.
- "From" is always a vendor/contact; "To" is always a warehouse Location.

## Screen: Receipt — Detail (IMG:4)
- Header: `New`, title "Receipt", Reference shown as `WH/IN/0001`.
- Action bar: **Validate**, **Print**, **Cancel**, plus a read-only status stepper
  `Draft > Ready > Done`.
- Fields: Receive From (contact/vendor), Schedule Date, Responsible (auto-filled with the
  logged-in user, editable).
- Products table: Product, Quantity, with a "New Product" row to add another line.
- Button semantics (see `07_STATUS_WORKFLOWS.md`):
  - While **Draft**: primary action label is "Confirm"/moves to **Ready**.
  - While **Ready**: primary action label is "Validate"/moves to **Done** and increases stock.
- **Print** is enabled once status = Done.
- **Cancel** available from Draft or Ready.

## Screen: Delivery — List (IMG:2, IMG:6)
- Same layout pattern as Receipts List.
- Columns: Reference, From, To, Contact, Schedule date, Status.
- "From" is always a warehouse Location; "To" is always a vendor/customer contact.
- Search + List/Kanban toggle, same as Receipts.

## Screen: Delivery — Detail (IMG:5)
- Header: `New`, title "Delivery", Reference shown as `WH/OUT/0001`.
- Action bar: **Validate**, **Print**, **Cancel**, status stepper
  `Draft > Waiting > Ready > Done`.
- Fields: Delivery Address, Schedule Date, Responsible, Operation type (dropdown).
- Products table: Product, Quantity, "Add New product" row.
- Behavior: if a line's quantity exceeds `Free to Use` stock, the row is rendered in red and a
  notification/alert banner is shown; status automatically reflects `Waiting` until resolved
  (see `07_STATUS_WORKFLOWS.md`).

## Screen: Internal Transfer — List & Detail (derived, no direct mockup)
- Modeled after Receipt screens for consistency (`transfer-1` open decision).
- List columns: Reference, From (Location), To (Location), Schedule date, Status.
- Detail fields: From Location, To Location, Schedule Date, Responsible, Products table
  (Product, Quantity).
- Status flow: `Draft > Ready > Done` (matches Receipt; no external contact/vendor involved so no
  Waiting state is needed for stock availability the way Delivery does — but see
  `07_STATUS_WORKFLOWS.md` for the OPEN DECISION on this).

## Screen: Stock Adjustment — List & Detail (derived, no direct mockup)
- Simplified single-step form per PDF: Product, Location, Counted Quantity, Reason/Note
  (optional, added for MVP usability, not in PDF — flagged as an implementation addition).
- On submit: system computes delta (`counted − recorded`), updates stock, writes a ledger entry,
  status goes directly `Draft → Done` (no Ready/Waiting — see R8 open decision).

## Screen: Move History (IMG:7, IMG:9)
- Header: `NEW` button (creates a new operation via the Operations submenu — **not** a raw
  ledger entry, ledger entries are never created directly), title "Move History".
- Toolbar: search, list-view, kanban-view icons.
- Columns: Reference, Date, Contact, From, To, Quantity, Status.
- One row per (reference, product) pair — if a reference has 3 product lines, 3 rows are shown.
- Row color: IN (Receipts, or internal-transfer "arrival" leg) = green; OUT (Deliveries, or
  internal-transfer "departure" leg) = red.
- Search by Reference/Contact; Kanban toggle groups by Status.

## Screen: Warehouse (Settings) (IMG:11)
- Fields: Name, Short Code, Address.
- List + Create/Edit form. Short Code is the `WH` prefix used in reference numbers
  (see `06_BUSINESS_RULES.md`).

## Screen: Location (Settings) (IMG:8, IMG:10)
- Fields: Name, Short Code, Warehouse (dropdown, prefixed display "WH").
- List + Create/Edit form. A Location always belongs to exactly one Warehouse.

## Screen: My Profile (derived, no mockup)
- Shows Login Id, Email, editable display name.
- Password change (old password + new password + confirm), reusing R1.4 password rule.

---

## Cross-screen UI conventions
- Every list screen: List view is default; Kanban view groups cards by `status` with columns
  Draft / Waiting (where applicable) / Ready / Done / Canceled.
- Every detail form for an operation (Receipt/Delivery/Transfer/Adjustment) shows a horizontal
  status stepper matching that document type's workflow (`07_STATUS_WORKFLOWS.md`).
- "Responsible" always defaults to the currently logged-in user but remains editable.
- Reference numbers are always system-generated and read-only in the UI.
