# Fresh database installation

This package now includes `database/fresh_install.sql`, a clean schema derived from the supplied `db_hotel_billing` SQL structure and aligned to the current application paths. It intentionally omits the operational rows from the supplied dump. It does not import the old guests, stays, payments, refunds, audit history, room assignments, or staff accounts.

## Important

- Import this script only into a new development database. It creates/uses `hotel_billing_system`.
- Do not import it over a database that contains data you want to keep.
- The script contains the schema and the VAT policy seed only; it does not invent room rates, menu prices, employee credentials, guest records, or hotel branding.
- This was statically checked, but not executed against a live MariaDB server in this environment. Test the import in phpMyAdmin/XAMPP before relying on it.

## Install with XAMPP/phpMyAdmin

1. Start Apache and MySQL in XAMPP.
2. Open phpMyAdmin and choose **Import**.
3. Select `database/fresh_install.sql` and import it. It creates `hotel_billing_system` if needed.
4. Copy `api-hotel/.env.example` to `api-hotel/.env` and set the database host, database name, username, and password. The default database name is `hotel_billing_system`.
5. Before the first API request, replace `HOTEL_BOOTSTRAP_ADMIN_USERNAME` and `HOTEL_BOOTSTRAP_ADMIN_PASSWORD` in `api-hotel/.env` with a unique username and a strong one-time password. The first API bootstrap creates the first admin only when `users` is empty, then clears the password from the current PHP process environment. Do not commit `.env`.
6. Copy `.env.local.example` to `.env.local` for Next.js, then run `npm install`, `npm run dev`, and `npm run ws-server` in separate terminals.
7. Configure room types, rooms, menu categories/items, service catalog entries, and hotel-specific policies through the application before real operational use.

## Schema decisions in this fresh install

- `users` is the employee authentication/account source of truth. The duplicate legacy `user` table was excluded, and best-effort dual writes to it were removed from account-management code.
- `room_types` is the room type source of truth referenced by `rooms.room_type_id`. The unused duplicate `room_type` table was excluded.
- `stays.status` includes `PENDING_PAYMENT`, which the check-in workflow uses.
- Check-in payment identifiers are aligned to the referenced `BIGINT UNSIGNED` IDs, with foreign keys to stays, folios, payments, and users.
- Restaurant orders reference stays; restaurant order items reference their parent order. These constraints are safe for a fresh database because it starts without operational rows.
- Restaurant orders default to `Unpaid`. A room-billed order must have an active stay and open folio, and its folio charge is inserted and verified in the same transaction before the order is marked `Billed to Room`.
- The room type displayed on receipts is retrieved through `rooms.room_type_id -> room_types.id`, rather than a nonexistent `rooms.type` column.

## Verification checklist after import

- Confirm the selected database is `hotel_billing_system`.
- Confirm all tables in `fresh_install.sql` exist and the SQL import reported no errors.
- Confirm `stays.status` includes `PENDING_PAYMENT`.
- Confirm the check-in payment foreign keys exist.
- Confirm the restaurant order foreign keys exist.
- Configure a room type and room, then test check-in and folio creation.
- Create a restaurant order linked to an active stay and verify exactly one `charges` row is created with `order-charge-<order_code>` when billed to the room.
- Attempt to bill an order without an active stay/open folio and confirm the API rejects it without creating an order or charge.
- Test direct restaurant payment, receipt details, partial folio payment, refund handling, and checkout before using the system operationally.

## Scope caveat

This package fixes the identified receipt/schema mismatch, fresh-install schema inconsistencies, account/room-type duplicate-table dependencies, and restaurant-to-folio posting safeguards. It does not claim every requirement in the project Markdown files has been implemented or end-to-end tested. In particular, persistent notification history, reconciliation workflow, full correction/void/reversal approval workflow, concurrent booking tests, and complete role-by-role acceptance testing still need implementation/verification before production use.
