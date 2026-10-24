# Corrections included in this package

This is a targeted improvement of the supplied application and a fresh-install schema aligned to the current code paths. It is not a claim that every requirement in the project Markdown files is complete.

## Application corrections

- Guest portal token lookup rejects revoked tokens and requires an active stay; stay-code-only portal access no longer mints a new token.
- Check-in deposit policy matches the documented rule: 100% for five nights or fewer; 60% for more than five nights.
- Check-in payment approval is Cashier-only.
- Checkout blocks known non-terminal service request states.
- Non-cash folio payments must match the amount applied; cash change is recorded only for CASH.
- Receipt details retrieve room type via `rooms.room_type_id -> room_types.id`, avoiding the nonexistent `rooms.type` column.
- Account management no longer attempts best-effort dual writes to the legacy `user` table; `users` is the authentication/account source of truth.
- Runtime check-in schema code validates the expected columns/status instead of running `CREATE TABLE`/`ALTER TABLE` during ordinary API requests.
- Restaurant orders billed to a room require an active stay and open folio. The order and folio charge are created in one transaction, the charge uses the shared `order-charge-{order_code}` idempotency key, and the inserted charge is verified before commit.
- Completing an unpaid room-service order with a linked stay requires an open folio. Charge posting, order status, and mirrored service-request status are committed or rolled back together.
- Restaurant orders default to `Unpaid` in the fresh schema; direct payment and folio billing remain separate paths.
- Guest-visible balance calculation includes charges, applied/approved discounts, VAT, payments, and completed refunds.

## Fresh database schema

- `database/fresh_install.sql` was generated from the uploaded SQL structure with operational/sample INSERT data omitted. It creates `hotel_billing_system` and seeds only the VAT policy setting.
- The unused duplicate `user` and `room_type` tables are excluded. Code uses `users` and `room_types` respectively.
- `stays.status` supports `PENDING_PAYMENT`.
- Check-in payment identifiers use `BIGINT UNSIGNED` to match the related stay, folio, payment, and user identifiers; fresh-install foreign keys enforce those relationships.
- Fresh-install foreign keys connect restaurant orders to stays and restaurant order items to their parent order.
- No employee account, room, rate, menu price, guest, payment, refund, or audit record is seeded. Configure the one-time admin bootstrap variables before the first API request.

## Validation performed

- PHP syntax checks passed for PHP files under `api-hotel/`, `database/`, and root PHP entry files.
- `node --check` passed for `server/websocket.js` and `next.config.js`.
- `package.json` parsed successfully.
- Fresh-install SQL was inspected for operational INSERT statements; only the VAT configuration seed remains.

Not performed: executing `fresh_install.sql` against a live MariaDB server, a Next.js production build, browser/UI acceptance tests, WebSocket end-to-end tests, or full billing/refund/reconciliation regression tests. Persistent notification history, reconciliation workflow, full payment correction/void/reversal approval, concurrent booking tests, and complete role-by-role acceptance testing remain outstanding. Verify the new SQL import and workflows in a disposable local environment before relying on this package.
