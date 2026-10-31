# Hotel Billing System

Next.js/React frontend with a PHP API, MariaDB/MySQL persistence, and a WebSocket event server.

## Fresh database

The repository now includes `database/fresh_install.sql`. It creates a **new, empty** database named `hotel_billing_system` from the supplied SQL structure, with operational/sample records omitted. It does not preserve the old database's guests, stays, payments, staff accounts, or audit history. Review [the fresh database installation guide](docs/FRESH_DATABASE_INSTALL.md) before importing it.

The fresh schema intentionally uses `users` as the employee account source of truth and `room_types` as the room type source of truth. It includes the pending-payment stay state and matching check-in payment identifier types, and adds fresh-install foreign keys for restaurant orders and their items.

## Local setup

1. Install PHP 8.2+, MariaDB/MySQL, Node.js, and npm.
2. Import `database/fresh_install.sql` into phpMyAdmin or MariaDB.
3. Copy `api-hotel/.env.example` to `api-hotel/.env`; configure `HOTEL_DB_HOST`, `HOTEL_DB_NAME=hotel_billing_system`, `HOTEL_DB_USER`, and `HOTEL_DB_PASS`.
4. Set a unique `HOTEL_BOOTSTRAP_ADMIN_USERNAME` and a strong `HOTEL_BOOTSTRAP_ADMIN_PASSWORD` in `api-hotel/.env` before the first API request. There are no default employee credentials. The app creates the first administrator only when the `users` table is empty.
5. Copy `.env.local.example` to `.env.local` and set the PHP backend URL for your local setup.
6. Run `npm install`.
7. Start the frontend with `npm run dev`.
8. In a second terminal, run `npm run ws-server`.
9. Configure room types, rooms, menu items, service catalog, and hotel policies before testing operational workflows.

Do not commit `.env` or `.env.local`. The SQL script intentionally contains no operational data and no hard-coded user passwords.

## Final desktop backup

The `FinalBut.zip` backup contains the current source, the live database export at `source/database/hotel_billing_system_final.sql`, and a copy of the XAMPP deployment at `deployment/htdocs/api-hotel`. The live export contains operational guest/stay/billing data and password hashes; keep the archive private. Restore it only into a new or empty database after taking a separate backup. The deployed API's local `.env` is intentionally excluded; configure database and environment settings before deploying the API snapshot. The source package omits `.git`, `node_modules`, and `.next`; run `npm ci` before starting or building the frontend.

## Important fixes in this package

- Receipt details use the canonical `room_types` relation instead of the nonexistent `rooms.type` column.
- Runtime check-in schema helpers validate the expected schema instead of silently running `CREATE TABLE`/`ALTER TABLE` on normal API requests.
- Account management no longer attempts to keep a duplicate legacy `user` table synchronized; `users` is authoritative.
- Restaurant orders billed to a room require an active stay and open folio, and the charge is inserted/verified transactionally with a shared idempotency key.
- Completing an unpaid room-service order requires an open folio; the status update, folio charge, and mirrored service-request status roll back together on failure.
- Noncash payment/change validation, check-in role validation, portal token validation, and the documented five-night policy correction from the earlier audit are retained.

## Validation status

PHP syntax checks, selected JavaScript/JSON checks, and the Next.js production build pass in the current workspace. The local XAMPP database can be exported and its deployed API passes PHP syntax validation. Browser, WebSocket integration, and end-to-end billing/checkout tests have not been run; verify those workflows in staging before production use.

## Menu / Service Catalog Separation Update

Restaurant food and drink products are managed through `menu_items` and `menu_categories`. `service_catalog` is reserved for hotel services and amenities. Legacy `FOOD_BEVERAGE` rows are intentionally retained but hidden from the service catalog API while the migration is reviewed; they are not deleted automatically.

See `docs/MENU_SERVICE_CATALOG_FIX.md` and `database/migrations/20261025_menu_service_separation/README.md` for the preflight, additive backfill, foreign-key migration, and rollback guidance. Back up and test on a clone before running any SQL migration. No live database migration is performed by this package.


## Recent workflow update

See `docs/RESTAURANT_ORDER_WORKFLOW_UPDATE.md` for the restaurant order timing, guest review, cashier settlement, and room-transfer confirmation changes. Existing databases must back up first and run `database/migrations/20261025_menu_service_separation/03_restaurant_order_timing.sql` once before deploying the updated application code. Fresh installs already include these columns in the schema dump.


## UI/API workflow fixes (2026-10-25)

- Front Desk check-in screens no longer apply discounts; the check-in API rejects non-zero client-supplied discounts. Folio discount application is cashier-only.
- Applied discount names and percentage rates are included on payment receipts, folio statements, final checkout bills, and the guest billing view.
- Guest service quantity controls only show after a catalog item is selected.
- Guest Food/Drinks view-all button is wired to the page-local renderer.
- Guest and kitchen order placement use SweetAlert review/confirmation; successful submission closes the cart/modal.
- Room-linked restaurant orders are charged to the open folio when the kitchen confirms them, not when the order is placed or when it is completed. The kitchen has no payment settlement action.
- Restaurant order timing timestamps and estimated-ready time are stored and displayed.
- Existing databases should apply `database/migrations/20261030_menu_items_auto_increment.sql` once. It repairs menu item ID `0` (including its order-line references) and enables generated menu IDs so guest ordering and future menu entries work consistently.
- Guest order status and folio summaries refresh from WebSocket events, with a polling fallback for order and folio views.
- Guests can request a room change from the Guest Portal’s **Request a service** dialog. The request is tied to the token’s stay/room, shows the destination rate and estimated remaining-stay adjustment, and stays pending until Manager approval; it never moves the guest on submission.
- Existing databases must apply `database/migrations/20261030_room_transfers_auto_increment.sql` once so transfer approvals can write their generated primary key; fresh installs already use an auto-incrementing `room_transfers.id`.
- Only Managers can approve guest room-transfer requests. Front Desk can review pending requests and change an unavailable destination, but cannot approve or finalize a transfer. Direct transfers remain Front Desk-only. Ordinary department request lifecycle controls remain restricted by role.
- Transfer approval is a single **Approve & Transfer** action: the API rechecks destination availability, moves the guest, applies any rate adjustment, and marks the request **COMPLETED** in one transaction. Older requests already in **IN_PROGRESS** can be finalized by Managers only when the guest is already in the requested room; finalization does not repeat the room move or charge.
- If a requested room becomes unavailable, approval leaves the guest’s current room and transfer request unchanged. Managers or Front Desk can use **Change destination room** on the pending request to select another available room; the destination change is recorded in request history and a fresh approval is required.
- The Manager dashboard includes a live room-occupancy chart and a pending room-transfer approval count; no chart library or external analytics service is required.
- Early-checkout billing supports an active **Prorated hourly + ₱500 fee** policy with a one-hour minimum and a separate manager approval. Apply `database/migrations/20261029_prorated_hourly_checkout_fee.sql` once to existing databases; fresh databases can configure the policy under Settings → Policies. This billing policy does not authorize early room release.
- Existing databases should apply `database/migrations/20261029_fix_early_checkout_request_ids.sql` once so early-checkout requests get valid auto-generated IDs; it repairs legacy request ID `0` records so manager decisions can target them.

## Front Desk and Cashier workflow (2026-10-27)

- Guest checkout is finalized by Front Desk; cashier checkout controls are removed and the API rejects cashier checkout requests.
- Cashier billing access includes active folios, payment history, receipt details, and payment collection without requiring financial-report permissions.
- The Cashier has a dedicated cashier-station dashboard and Payment Desk navigation, with a hotel-specific green-and-brass visual theme, check-in payment queue, outstanding balance metrics, and open folios prioritized by balance. The cashier workflow remains in the existing payment and receipt flows; checkout remains Front Desk-only. Existing `role_permissions` records retain the required cashier billing-read permissions and cannot grant cashier checkout.
- Cashier discount presets are selected in the check-in payment approval modal; selecting a preset recalculates the total and amount due, and the discount is posted together with payment approval. 20% Senior Citizen/PWD selections require eligibility and ID verification confirmation. Whole-number rates within the supplied ranges are selectable for early booking, long stay, group, loyalty, walk-in, birthday, employee, corporate/partner, and off-season discounts. These standard discounts apply to room charges before VAT, are not stackable, and retain the selected category, rate, amount, and cashier audit note in the bill history.
- Cashier screens hide payment, check-in, and checkout actions when the signed-in account lacks the required permission. Redundant direct-payment actions route through the folio billing screen instead.
- Refund records, endpoints, permissions, and UI have been removed. New payment amounts cannot exceed the current folio balance; any older overpayment remains visible as an unrefunded credit and does not block Front Desk checkout.
- Existing databases should be backed up and then run [the refund-removal migration](database/migrations/20261027_remove_refunds.sql) once. It deletes legacy refund tables and removes the checkout refund field; the active XAMPP database has already been migrated.
- Guest food and drink photos are displayed in full without cropping. When PHP serves the guest portal from Apache, deploy `public/assets/menu/` to the Apache document root at `assets/menu/` so the guest portal image URLs resolve there as well as on the Next.js frontend. Tanduay menu items use `public/assets/menu/tanduay.png` automatically.
- Legacy restaurant/request tables are repaired at runtime to use generated IDs before guest orders or service requests are written; existing zero-valued IDs are preserved so older order and request history remains linked.
- Front Desk can route or reassign active service requests to a department. Requests specifically submitted for Front Desk can be accepted, started, put on hold, completed, or declined by Front Desk; requests assigned to other departments remain owned by those departments. Room-transfer approval remains Manager-only.
- Department users have a department-scoped guest request queue. Service, Housekeeping, Laundry, Maintenance, and Valet dashboards show their assigned queue; Bar and Restaurant dashboards summarize assigned guest requests and link directly to the actionable queue. Department request status changes remain API-authorized by assigned department.
- Guest Services and Maintenance use the shared service-request workflow but have separate department-owned queues: Guest Services handles general assistance and Maintenance handles repair/safety work. The API scopes request lists and history to the signed-in department; Front Desk and management retain the routing/oversight view.

## VAT-inclusive billing

- Room rates and folio charges are treated as VAT-inclusive; existing rates are not increased. `api-hotel/vat_service.php` is the backend source of truth for cent-accurate VAT extraction, discount treatment, partial-payment receipt allocation, and checkout tax snapshots.
- The default VAT policy is 12%. The Admin VAT settings screen stores the rate as a percentage in `billing_policies`; existing values between 0 and 1 are interpreted as legacy fractional rates. Configure either 0% or a rate from 1% through 100%.
- All monetary columns remain `DECIMAL`. Apply [the checkout VAT snapshot migration](database/migrations/20261030_vat_inclusive_checkout_snapshots.sql) once before deploying the updated API. It records VAT-exempt sales with each finalized checkout so reports do not change when the configured rate later changes. Existing checkout snapshots are preserved.
- Validate the core calculations with `php tests/vat_service_test.php` from the `source` directory.

## Walk-in-only Front Desk check-in (2026-10-28)

- The hotel does not accept advance room bookings or reservation holds through this system. Guests request a room in person, and Front Desk confirms the stay during check-in.
- Each check-in locks the selected room, validates its availability and guest capacity, and checks for overlapping active or pending-payment stays before creating the stay and payment record. If two staff members attempt to check in different guests to the same room concurrently, the first transaction to claim the room succeeds; the other is rejected and must select another available room.
- Stay date ranges are half-open: check-out is not an occupied night, so a new stay may check in on the prior guest's check-out date once the room has been checked out and released.
- Group Check-In remains available for a group arriving together; it creates the group and its room stays as one Front Desk transaction. It is not an advance booking feature.
- A group check-in keeps separate room stays and folios for accounting, but the Cashier queue groups them into one booking. The Cashier can collect once, apply a discount only to checked eligible room folios, and print one group receipt with per-room payment and VAT allocations. Existing databases may run [the group receipt migration](database/migrations/20261030_group_checkin_receipts.sql); the API also creates these additive receipt tables on demand.
- Front Desk has a separate Checked-Out Guests screen backed by completed stay and checkout records. It supports searching guest, room, stay, folio, or contact details, filtering by checkout date, and paginating the history; completed stays do not appear in Active Stays.
