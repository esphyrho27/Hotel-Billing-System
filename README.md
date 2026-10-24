# Hotel Billing System

Next.js/React frontend with a PHP API, MariaDB/MySQL persistence, and a WebSocket event server.

## Fresh database

The repository now includes `database/fresh_install.sql`. It creates a **new, empty** database named `hotel_billing_system` from the supplied SQL structure, with operational/sample records omitted. It does not preserve the old database's guests, stays, payments, refunds, staff accounts, or audit history. Review [the fresh database installation guide](docs/FRESH_DATABASE_INSTALL.md) before importing it.

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

## Important fixes in this package

- Receipt details use the canonical `room_types` relation instead of the nonexistent `rooms.type` column.
- Runtime check-in schema helpers validate the expected schema instead of silently running `CREATE TABLE`/`ALTER TABLE` on normal API requests.
- Account management no longer attempts to keep a duplicate legacy `user` table synchronized; `users` is authoritative.
- Restaurant orders billed to a room require an active stay and open folio, and the charge is inserted/verified transactionally with a shared idempotency key.
- Completing an unpaid room-service order requires an open folio; the status update, folio charge, and mirrored service-request status roll back together on failure.
- Noncash payment/change validation, check-in role validation, portal token validation, and the documented five-night policy correction from the earlier audit are retained.

## Validation status

Static PHP syntax checks and selected JavaScript/JSON checks were run after these changes. A live MariaDB import, npm production build, browser test, WebSocket integration test, and end-to-end billing/checkout test were **not** run in this environment. Treat this as a development package requiring the verification checklist in `docs/FRESH_DATABASE_INSTALL.md`, not as production-certified software.
