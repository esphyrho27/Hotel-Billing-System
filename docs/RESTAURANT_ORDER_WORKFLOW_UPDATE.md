# Restaurant Order Workflow Update

## Included behavior
- Restaurant order creation starts at `Pending`; the kitchen does not collect payment.
- When a room-linked order is confirmed, the server posts a single idempotent `FOOD` charge to the open folio and updates the order payment status to `Billed to Room`.
- Order timing fields include estimated ready, confirmed, preparing, ready, and completed timestamps. Guest and restaurant views display the timing fields; websocket updates are supplemented by a 20-second guest-portal refresh fallback.
- Guest order confirmation uses SweetAlert2 to show an itemized review before submission.
- Food/Drinks “View all items” uses an exposed page-level handler so it can access the menu renderer.
- Guests can request a room change from the Guest Portal’s **Request a service** dialog. Each request is scoped to the portal token’s stay and remains pending until Manager approval; the request submission does not move the guest.
- Only Managers can approve guest room-transfer requests. Front Desk can review requests and change a destination, but cannot approve or finalize a transfer; direct transfers remain Front Desk-only.
- Transfer approval is completed atomically by **Approve & Transfer**: destination availability is rechecked, the guest and room inventory are updated, any rate adjustment is posted, and the request is marked **COMPLETED**. Older **IN_PROGRESS** transfer requests can be finalized by Managers only when the guest is already in the requested room; this does not repeat the move or adjustment.
- If approval fails because the destination became unavailable, the transaction rolls back and the request remains available for a destination change and a fresh approval.
- Front Desk routes or reassigns active service requests to a department; the target team acknowledges, works, and completes its queue. Assignment and lifecycle changes are retained in request history.
- Maintenance staff can flag an assigned active request as an urgent safety concern. The flag and note are retained in the request and its history, and a real-time alert is sent to Front Desk. Safety alerts do not change room status; inspection and the room-status workflow remain separate.
- Discount application is cashier-only in both the folio UI and API; the front-desk check-in forms no longer expose discount inputs and the check-in API rejects client-supplied discounts. Manager approval remains available for policies that require it.
- Guest billing summaries refresh on folio-update WebSocket events and use a polling fallback.
- Check-in screens no longer offer discount entry. Discounts must be handled through cashier workflows.

## Database
For an existing database, back up first and run `database/migrations/20261025_menu_service_separation/03_restaurant_order_timing.sql` once before deploying the updated application code. The migration adds the five timing columns and changes the default payment state to `Unpaid`; do not rerun it after it succeeds. Fresh installs already include these fields in the schema dump.

For this request-routing update, back up the database and run `database/migrations/20261029_service_request_handoffs.sql` once before deploying the updated API. It adds urgent safety-alert fields and queue indexes to `service_requests`; existing requests default to normal priority with no safety alert. The schema dump includes the same fields for new installations.

## Verification limits
Static PHP/JavaScript syntax checks and archive integrity checks are run for this package. A live MySQL instance, configured app credentials, browser session, and WebSocket deployment were not available here, so end-to-end production behavior still needs staging verification.
