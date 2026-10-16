# Hotel Billing System

Back-office billing app for a Philippine hotel: rooms, check-in, folios, charges,
payments, discounts, service requests, checkout with printable receipts, reports,
and role-based user management.

- **Stack:** Next.js 16 (App Router) + React 18 + TypeScript, plain CSS
- **Database:** MySQL on **TiDB Cloud Serverless** (free tier), via `mysql2/promise`
- **Auth:** bcrypt passwords, login throttling, JWT sessions in httpOnly cookies
- **Currency:** Philippine peso (₱)

## 1. Database setup (TiDB Cloud — free)

1. Create a free account at [tidbcloud.com](https://www.tidbcloud.com) and create a
   **Serverless** cluster (no credit card required for the free tier).
2. In the cluster dashboard, open the **SQL Editor**.
3. Paste the entire contents of `htl8_database.sql` (the schema file) and run it.
   This creates the `db_hotel_billing` database with all tables and starter data
   (room types, rooms 101/102/201/301, service catalog, discount policies, VAT 12%).
4. Go to **Connect** and create a password for the database user. Copy the
   connection details: host, port (4000), user, password.
5. Seed the first admin user. Generate a bcrypt hash and insert it — run this in
   the SQL editor (replace `admin123` with a strong password, and change it after
   first login via the Users page):

   ```sql
   USE db_hotel_billing;
   -- bcrypt hash for 'admin123' (cost 10). Generate your own with:
   --   node -e "console.log(require('bcryptjs').hashSync('YOUR_PASSWORD', 10))"
   INSERT INTO users (username, password_hash, role, active)
   VALUES ('admin', '$2b$10$REPLACE_WITH_YOUR_BCRYPT_HASH', 'admin', 1);
   ```

   Example Node one-liner to generate the hash (run in this project folder):

   ```bash
   node -e "console.log(require('bcryptjs').hashSync('admin123', 10))"
   ```

## 2. Environment setup

```bash
cp .env.example .env.local
```

Fill in `.env.local` (never commit it):

| Variable            | Example                                              |
| ------------------- | ---------------------------------------------------- |
| `DATABASE_HOST`     | `gateway01.us-west-2.prod.aws.tidbcloud.com`          |
| `DATABASE_PORT`     | `4000`                                               |
| `DATABASE_USER`     | `root` (or the user TiDB Cloud shows)                |
| `DATABASE_PASSWORD` | your TiDB Cloud password                             |
| `DATABASE_NAME`     | `db_hotel_billing`                                   |
| `JWT_SECRET`        | long random string (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |

On Vercel, add the same variables under **Project → Settings → Environment Variables**.

## 3. Run / build

```bash
npm install
npm run dev        # local dev at http://localhost:3000
npm run typecheck  # tsc --noEmit
npm run build      # production build
npm start          # serve the production build
```

## 4. Deploy to Vercel

1. Push this folder to the `esphyrho27/Hotel-Billing-System` GitHub repo (`main`).
2. In Vercel: **Add New → Project → Import** the repo (framework preset: Next.js).
3. Add the environment variables from section 2.
4. Deploy. Every push to `main` redeploys automatically.

## Role matrix

| Capability                              | admin | manager | frontdesk | cashier | service |
| --------------------------------------- | ----- | ------- | --------- | ------- | ------- |
| Dashboard                               | ✓     | ✓       | ✓         | ✓       | ✓       |
| Rooms board + status changes            | ✓     | ✓       | ✓         | –       | –       |
| Room types management                   | ✓     | ✓       | –         | –       | –       |
| Check-in (new stays)                    | ✓     | ✓       | ✓         | –       | –       |
| Folio: add charges / discounts          | ✓     | ✓       | ✓         | –       | –       |
| Folio: record payments                  | ✓     | ✓       | –         | ✓       | –       |
| Folio: void                             | ✓     | ✓       | –         | –       | –       |
| Approve manager discounts               | ✓     | ✓       | –         | –       | –       |
| Checkout finalize                       | ✓     | ✓       | –         | ✓       | –       |
| Service requests (create/update)        | ✓     | ✓       | ✓         | –       | ✓       |
| Reports                                 | ✓     | ✓       | –         | ✓       | –       |
| Users (create/edit/deactivate)          | ✓     | –       | –         | –       | –       |
| Change own password                     | ✓     | ✓       | ✓         | ✓       | ✓       |

Notes:
- `manager` can do everything except user management.
- `OCCUPIED` room status is system-managed (check-in/check-out); only admin/manager can override it manually.

## Business rules implemented

- Charges and payments are rejected on non-`OPEN` folios (409).
- Payments require tendered ≥ amount; change is computed automatically.
- Balance = charges − applied discounts − payments. Checkout requires exactly ₱0.00.
- Nightly room charges post idempotently (`roomchg:{stayId}:{date}` keys).
- Completing a chargeable service request posts one charge (`svcreq:{requestId}` key).
- Room transfers move the stay, set old room to `CLEANING`, new room to `OCCUPIED`, and log a `room_transfers` row.
- Login locks for 15 minutes after 5 failed attempts in 10 minutes.
- Password changes bump `session_version`, signing out other sessions.
- VAT (12% from `billing_policies`) is shown as an informational VAT-inclusive line on receipts; it does not alter the balance.

## Schema assumptions

- `applied_discounts.status`: only `APPLIED` discounts reduce the balance; `PENDING` ones await manager approval. Approving normalizes to `APPLIED` (the schema has no separate approved-but-unapplied state that affects money).
- `stays.planned_checkout` is a DATE; nights = planned date − check-in date (min 1).
- `checkout_records.unused_nights` is recorded as 0 (early-checkout proration lives in `early_checkout_requests`, not auto-applied).
- `refunds` / `refund_transactions` / `early_checkout_requests` tables exist in the schema but have no UI in this version — void (pre-payment) and the discount flow cover the common cases.
- TiDB Cloud Serverless speaks the MySQL protocol, so the schema SQL imports unchanged. If the SQL editor rejects the `CREATE DATABASE` / `USE` lines, select the `db_hotel_billing` database first and run the rest.
