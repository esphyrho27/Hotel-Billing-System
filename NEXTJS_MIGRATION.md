# Next.js migration guide

## Project structure and conventions

The `intud/my-app` reference is a Next.js App Router project with a single
client-side page using React-Bootstrap and a separate global stylesheet. This
project keeps the same App Router foundation while separating route handling,
the dashboard mount, shared API configuration, and retained static assets:

- `app/` — root layout, page entry point, and route loading/error states.
- `components/legacy/` — browser-only adapter for the retained hotel dashboard.
- `lib/` — shared API client and request configuration.
- `public/legacy/` — established hotel UI template and operational scripts.

The dashboard uses the hotel's existing Bootstrap UI, API actions, and PHP
session flow rather than importing the reference app's laptop CRUD page,
hard-coded API URL, Tailwind setup, or newer framework dependencies. Route and
component files follow the reference's readable, multi-line JSX style while
preserving the hotel app's established backend and visual identity.

## What changed

The staff application now starts through Next.js App Router. The existing PHP/PDO API and MySQL schema remain authoritative, so no billing rules, user roles, session checks, CSRF checks, or data tables were replaced. The established dashboard markup and vanilla-JavaScript operations modules are mounted by one client-only, route-split dashboard component to preserve the complete operations UI during the framework transition.

Axios is configured once in `lib/axios.js`. The dashboard authentication bridge uses that configured client for every request, including the existing CSRF header and session cookie. Next.js rewrites `/api/*` to the PHP backend, avoiding a browser CORS change when both services run locally.

## Run locally

1. Start Apache and MySQL in XAMPP and import `sql/htl8_database.sql` for a fresh database, or apply the documented migration for an existing installation.
2. Configure PHP database variables in the Apache/PHP environment as needed. Keep database secrets out of `.env.local`.
3. Back up the database, then apply `C:\xampp\htdocs\htl-api\sql\migration_rbac_auth_payment_hardening.sql` to an existing installation. It adds session-version tracking, login throttling, approval timestamps, and payment idempotency fields without deleting existing records.
4. Copy `.env.example` to `.env.local`. Set `PHP_BACKEND_URL` to the existing Apache application URL, normally `http://localhost/htl-api`.
5. Install JavaScript packages with `npm install`.
6. Start the Next application with `npm run dev`, then open `http://localhost:3000`.

For a production check, run `npm run build` followed by `npm start`.

If the staff table is empty, configure `HOTEL_BOOTSTRAP_ADMIN_USERNAME` and a unique `HOTEL_BOOTSTRAP_ADMIN_PASSWORD` (at least 6 characters) in the PHP environment before the first API request. The API creates that one administrator instead of seeding published default credentials. Remove these bootstrap variables after the first administrator is created. Set `HOTEL_SESSION_SECURE=1` when TLS terminates in front of Apache and Apache itself does not see HTTPS.

## Architecture

- `app/` — App Router layout, route, loading/error/not-found states.
- `components/legacy/LegacyDashboard.js` — dynamic browser-only mount for the complete retained dashboard, keeping route JavaScript out of the initial server render.
- `lib/axios.js` — shared Axios instance, timeout, credentials, and response-error normalization.
- `public/legacy/` — preserved dashboard template and operational vanilla-JS modules. The replacement authentication bridge sends its existing PHP actions through Axios.
- The PHP API is deployed separately under XAMPP at `http://localhost/htl-api`.

## Role boundaries

The PHP API checks the active database role on every protected request; the sidebar filtering is only a usability layer.

| Role | Main access | Explicitly denied |
|---|---|---|
| Admin | Staff accounts and role assignment, configuration, all operational and financial workflows, reports, audit logs, approvals | Cannot approve its own refund, discount, or early-checkout request |
| Manager | Operations, billing, designated payments, financial reports, refund/discount/early-checkout approvals, audit review | User/role management and system configuration |
| Front Desk | Rooms, walk-in check-in/out, authorized charges, transfers, service requests, checkout billing preview | Payments, financial reports, refund approval, user/configuration management |
| Cashier | Billing review, payments, receipts, transaction history, authorized financial reports, discount/refund requests | Check-in/out, charge/rate changes, user/configuration management, approvals |
| Service (retained) | Room status and service-request handling | Billing, payments, reports, and administration |

## Authentication and financial safeguards

- SweetAlert2 provides the dashboard's login notices, destructive-action confirmations, and required text-entry dialogs instead of browser-native JavaScript prompts.
- Session cookies are HttpOnly and SameSite=Lax; session IDs rotate on login, idle sessions expire, and role/active status is reloaded from the database on protected requests.
- Login failures are limited per username/IP pair. Passwords must be at least 6 characters for account creation, administrator resets, bootstrap, or self-service changes; passwords are hashed with PHP's password API.
- Payment submissions carry a stable idempotency key. Split-payment retries return the original receipt set; the database unique key prevents repeated posting.
- Restricted discounts, refunds, and early checkouts record their approver and approval time. An initiator cannot approve their own restricted request.
- Guest identity fields are not collected by the walk-in workflow. Do not add guest PII to URLs, browser storage, reports, or error messages without a reviewed requirement and migration.
- The frontend adds baseline anti-framing, MIME-sniffing, referrer, and browser-feature headers. It does not claim a complete CSP or substitute for HTTPS.

## Operational notes

The backend continues to own authorization and validation. Do not expose database credentials via `NEXT_PUBLIC_*` variables. If PHP is hosted elsewhere, make the Next rewrite target private/reachable from the Next server and preserve HTTPS/session-cookie settings in production.
