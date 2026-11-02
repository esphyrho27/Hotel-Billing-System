# Hotel Billing System — Shesh Dev Hotel

A complete hotel operations and billing system for Shesh Dev Hotel (Agora, Lapasan, Cagayan de Oro): staff check guests in, run the folio, take payments, handle restaurant and service requests, approve extensions and early departures, and check guests out — while guests follow their own stay live through the guest portal.

This README covers what the system does today, the house rules built into it, how to run and update it, and the journey it took to get here.

## At a glance

| Area | What it covers |
| --- | --- |
| Staff app | Dashboard, rooms, check-in, folio, payments, checkout, approvals, chat |
| Guest portal | Live stay view, billing, orders, service requests, extensions, chat |
| Billing | Room, food, and service charges; 12% VAT; PWD and senior discounts |
| House rules | No-refund early checkout, automatic late fee and overstay charges |
| Backend | PHP API (`api-hotel`) + MySQL, WebSocket server for live updates |

## Tech stack

- **Frontend:** Next.js 14 + React 18, JavaScript, Bootstrap, Axios, SweetAlert2
- **Backend:** PHP running under XAMPP (`api-hotel`), with role-based authorization in `authorization.php`
- **Database:** MySQL — `db_hotel_billing`
- **Realtime:** WebSocket server (`ws`) for dashboard, portal, and chat updates
- **Legacy pages:** `index.php` (staff) and `portal.php` (guest portal) alongside the Next.js app

> The project folder and the server folder each contain an `api-hotel` folder. Only the copy inside `C:\xampp\htdocs\api-hotel` is actually read at runtime. Every backend change has to be copied there to take effect.

## Roles and access control

The system has 11 staff roles, each with its own allowed modules and permissions:

Admin, Manager, Front Desk, Cashier, Service, Restaurant, Bar, Housekeeping, Laundry, Maintenance, and Valet.

Access is enforced in both the interface and the server, so hiding a button is never the only protection:

- **Payments** can only be taken by Cashier and Management roles.
- **Checkout** can be finalized by Admin, Front Desk, and Manager. Manager was added deliberately so a manager waiver at checkout is actually reachable.
- **Late fee waiver** is Manager and Admin only, and always needs a reason. It is written to the audit log.
- **Guest chat** is Front Desk only. Admin and Manager do not see Guest Chats, and the server returns 403 for chat actions from any other role. The guest-facing label is always "front desk," which is now always accurate.
- **Room status board:** Front Desk is view-only in every layer — a hard block in the server beats any saved permission grant. Housekeeping can change room status from the board dropdown.
- **Discount approvals** were removed from the Manager view (dashboard and navigation, including the session module list). Admin keeps the full approvals path, so pending discounts still have an approver.

## Rooms, room types, and room status

- Rooms have a number, type, floor, capacity (taken from the room type), and status. Room numbers are unique; room types have unique names.
- **Reserved status for unpaid check-ins:** when a guest checks in but has not paid yet, the room is `RESERVED` (violet pill on the board), not `OCCUPIED`. The room only becomes `OCCUPIED` at one single point — when the Cashier approves the payment, in the same transaction that sets the stay to `ACTIVE`. This applies to both single and group check-in.
- The dashboard counts Reserved rooms in its totals, while occupancy still counts Occupied rooms only. The board shows a Reserved stat card and donut slice.
- A Reserved room cannot be manually re-statused (same protection as Occupied) and cannot be edited. The guest portal shows "Reserved — payment pending" for the guest.
- **Data fixes behind this:** `room_types.id` and `rooms.id` originally had no `AUTO_INCREMENT`, so adding a new type or room failed while the error message misleadingly said "already exists." Migrations fixed the id-0 rows (Penthouse type, Room 701), added primary keys, unique indexes, and auto-increment, and the save endpoints now run an explicit duplicate check that returns a clean 409 with the real reason.

## Check-in, stays, and the folio

The folio is the single ledger for a stay. Everything the guest owes — and everything they have paid — lives there.

- **Single and group check-in** open a stay and folio, set the room to Reserved (see above), and record planned check-in and checkout.
- **Cancel a pending check-in** voids the folio, cancels the stay, and frees the room in one transaction, so no half-open records are left behind.
- **Charges** carry a category (Room, Food, Service, Late Checkout, Adjustment, and others), which matters because discounts and VAT treat categories differently.
- **Folio display fix:** portal charge queries include the charge category, so the VAT-exempt branch works and the PWD discount is correctly subtracted. Before this fix, a phantom ₱1,285.71 appeared in the guest's balance. Labels were simplified at the same time: "Total to pay," "Payments made," and "Room stay — N nights."
- The staff folio view shows check-in date correctly (it previously showed "—" because the endpoint did not select `checkin_at`), and shows a Room transfers block only when transfers exist for that stay.

## Payments, discounts, VAT, and receipts

- Every payment is validated against the VAT-inclusive final bill. The checkout settlement panel shows final bill amount, payments made, and balance remaining.
- **VAT is 12%.** Charges before VAT, VAT-free charges, and VAT included are shown separately on the folio, the checkout review, and the receipt.
- **PWD (20%) and senior discounts** are applied by the Cashier, go through discount approvals (Admin), and recompute VAT: for a PWD guest, Room charges are VAT-exempt, so the VAT-free portion grows when more room nights are added. Totals are never just "old total plus new charges" — they are recomputed.
- **Receipts** list each charge with its category, the discount line with who applied it, charges before VAT, VAT, final bill, payments, and balance. The final and printed receipts also show planned nights and nights stayed separately, so a stay that ran long does not read as if it was booked that way.

## Checkout

Checkout closes the folio, frees the stay, and flips the room to Cleaning — but only when a staff member actually checks the guest out. Nothing in the system checks a guest out automatically.

Checkout is blocked while any of these are true: an unpaid balance, open service requests, or an early-checkout request that was filed but never resolved.

### Early checkout and the no-refund house rule

Early checkout follows a strict house rule, chosen by the owner:

> Unused nights are not refunded; the full booked stay remains payable.

- A **Manager Exception** is the only active early-checkout policy. Finalizing it is authorization only — no unused-night credit, fee, or charge is posted.
- Requests approved earlier under older policies still finalize under their original logic.
- If the live database has no Manager Exception row, the policy migration leaves zero active policies, and one must be created and activated in Settings.

### Automatic late fee and overstay rule

Before this rule existed, extra nights were free unless staff remembered to charge them: a guest could prepay 3 nights, stay a 4th, and be checked out at the old balance. The rule now calculates the charge at checkout time, inside the existing checkout transaction, before the balance check — so it must be paid before the folio closes. There is no background sweep and no auto-checkout.

The rule is stored in `billing_policies` with an on/off switch. Turning it off returns the system to manual-only charging. Checkout time is 12:00 PM (noon), Asia/Manila, using the same scheduled-checkout calculation as the rest of the system. The rate is the room type's current nightly rate.

| Checkout happens | Charge |
| --- | --- |
| 12:00 PM – 1:00 PM | Free grace period |
| 1:00 PM – 6:00 PM, same day | Late fee: 50% of the nightly rate (`LATE_CHECKOUT`) |
| After 6:00 PM, same day | 1 full night (`ROOM`) instead of the late fee |
| Each extra calendar night | 1 full night per night |
| Final day, 1:00 PM – 6:00 PM | Plus the 50% late fee |
| Final day, after 6:00 PM | Plus 1 more full night |

On a ₱1,500 room, for example: out at 3:55 PM two days late means a ₱750 late fee plus two ₱1,500 overstay nights — ₱3,750 pending before VAT and discount recomputation.

How double-charging is prevented:

- Each automatic charge has an idempotency key — `late-checkout:{stay}:{planned date}` and `overstay:{stay}:{date}` per night — so a retry or double-click cannot post it twice.
- If staff already added a manual `LATE_CHECKOUT` charge, the automatic late fee is skipped.
- If an extension was approved, the planned checkout date has already moved, so the calculation starts from the new date.
- A finalized Manager Exception early checkout never triggers the rule.
- Staff should not hand-add late or overstay charges while the rule is on, or the guest will be charged twice.

#### The checkout deadlock fix

The first live use of the rule exposed a deadlock, on a real stay (Room 101, scheduled out Oct 31, checked out Nov 2): the posted bill of ₱2,801.43 was fully paid, but the ₱3,750 automatic charge was still pending, so Confirm stayed disabled — and the Pay button capped payment at the posted balance of ₱0. It was impossible to pay a charge that had not been posted, and impossible to post it without confirming.

The fix, now live in the code:

- When the only amount left is the pending automatic charge, Confirm becomes **"Confirm late charges"** and opens the confirm/waive dialog. It also stays enabled when a pending charge and a posted balance are both due, so the late charges post first and the combined balance is payable in one payment.
- Settle no longer opens a ₱0 payment terminal while a charge is pending; it points staff to confirm the late charges first.
- After confirming, staff get an explicit "Late charges posted — pay, then checkout again" step with a Pay button. Front Desk sees a note that a Cashier or Manager must take the payment.
- The review receipt shows a **"Pending automatic charges — not yet posted"** section with each line, and no longer says "Fully settled" while a pending charge exists. Its new total is VAT-recomputed with the pending charges included — for that PWD guest, ₱6,230.00, not the naive ₱6,551.43.
- The final and printed receipts show the posted late fee and overstay lines in the main list, plus a breakdown box with scheduled checkout, actual checkout time, nightly rate, late fee, and each overstay night.

One known quirk: waiving is per attempt. If a manager waives but checkout then fails on a separate posted balance, the manager waives again after that balance is paid.

## Stay extensions and room transfers

- **Extensions are request-and-approval.** The guest (or staff) requests a later checkout; approval re-checks availability, moves the planned checkout date, and posts the extra nights as Room charges to the folio, paid at checkout. A database guard allows planned-checkout changes only when the API explicitly sets the approval flag.
- Because approval moves the planned date, an approved extension never also triggers late or overstay charges for those nights.
- **Room transfers** adjust charges using a signed day difference clamped at zero, and the folio keeps a visible transfer history. Transfer availability in the guest portal uses the room type's capacity.

## Approvals

Approvers (Admin and Manager) get **one combined approvals list** instead of two separate tables:

- Early-checkout and extension requests are merged and sorted: Requested first, then Approved, then Rejected, newest first within each status.
- Every row shows the guest's name with the stay and folio — "#id · Guest Name," with "Room · Folio" underneath — falling back to the stay code when there is no customer record.
- Each row keeps its own actions and gates: early-checkout rows keep "Authorize Early Departure" for Manager Exception, extension rows keep approve/reject, and the pending badge counts Requested items across both types.
- Front Desk keeps the two separate sections (they do not approve), with the same improved guest-name display.
- Discount approvals remain a separate path and, as noted above, are visible to Admin only.

## Front desk dashboard and visibility

- **Next checkouts card:** lists active stays with an open folio (limit 10), ordered by planned checkout, then room. Each row shows guest, room and folio, checkout date and time (noon, Asia/Manila), a status badge — Overdue, Today, Tomorrow, or "in X days" — and a Checkout button using the existing checkout flow and role gates. A finalized Manager Exception early departure shows its requested departure time with an "Early departure" badge, keeping the scheduled date. The empty state reads "No upcoming checkouts."
- This card fixed a real visibility gap: "Departures due today" only counted guests due that day, so an overdue guest vanished from every count the next morning and could only be found by digging through active stays. Overdue guests now stay visible at the top.
- Dashboard counts include Reserved rooms; occupancy remains Occupied-only. There is no automatic late fee or overstay charge attached to the card itself — charging happens at checkout, under the rule above.

## Guest portal

The guest portal is the guest's live view of their own stay, refreshed by a 5-second poll and live updates. It shows:

- **Hero and journey:** the portal hero photo with an Option 1 journey timeline above the stay stats, and the guest's own room status and transfer availability, updated live.
- **Billing and balance:** folio totals with correct VAT and discount treatment, using the simplified labels. Guests see what they owe without the staff-only detail.
- **Footer amenities carousel:** five slides — Pool, Restaurant, Gym, Spa, Bar & Lounge — auto-playing every 5 seconds with dots, arrows, and swipe. Slides with missing photos are pruned, and the section hides entirely if no photos exist. Tapping Restaurant or Bar opens Food & Drinks; tapping Spa, Pool, or Gym opens Request a Service with "Other assistance" preselected and a prefilled description (a tap is distinguished from a swipe by a 40-pixel threshold).
- **Music:** a music control docked in the hero header, next to "Active stay" — icon only, volume at 15%, on/off remembered, no autoplay, hidden when printing.
- **Clickable live notifications:** tapping a toast (not the ×) or "View details →" in the live update dialog takes the guest to the right place — an order, request, or extension highlights its card in My Requests; a chat update opens the chat popup; a room-change availability update opens Request a Service with Room Transfer preselected; a folio or payment update opens Billing & Balance; their own room becoming available scrolls to the journey timeline. "Got it" only dismisses. The mobile dialog footer stacks its two buttons with proper spacing at a 48-pixel minimum tap height.

### Photos in the portal

- Order-review rows show a 56×56 thumbnail from the menu card.
- Status-alert cards and request lists (Recent Requests and My Requests, in both server and live rendering) show the matching menu or service photo; when no photo matches, a per-type icon is shown instead, and broken images hide themselves. Extension rows stay photo-free.

### No double display

A room-service order no longer appears twice in the portal. Service-request rows whose request code matches a restaurant order are dropped from Service Requests and from live cards and toasts, and Recent is one merged, deduplicated list (non-food requests, orders, and extensions, top 3). A genuine minibar request — an `RQ` code with no restaurant order behind it — is not filtered. The Open Requests stat counts a pending food order once, through the order. The staff side, kitchen queue, shadow rows, and folio charge are unchanged.

## Restaurant orders and service requests

- Guests order food and drinks from the portal; orders post to the folio as Food charges and appear in the kitchen and staff views. Status alerts show the first item's menu photo for orders and a per-type icon for services, with a full visual reset between alerts so one alert never inherits another's image.
- **Service request dialog:** each team has quick-pick chips — Front Desk, Housekeeping, and Maintenance (none for Other or Room Change) — that fill in the description text, plus per-team placeholders. Guests choose timing: "As soon as possible," "Within the hour," or "Today"; a non-ASAP choice is prepended to the description as `[Needed: <label>]`. The housekeeping-charge note appears only for Housekeeping.
- **Housekeeping chip, item, and quantity sync:** chips select the matching dropdown item (Extra Towels, Extra Pillows → Pillow, Toiletries, Room Cleaning) and reset quantity to 1. Room Cleaning is a real catalog item at price 0 — it displays "Free" and its quantity is locked at 1. Quantity resets to 1 on any item change and is clamped between 1 and 20. With no item selected, price shows "—"; an unpriced item shows "Price not set" / "To be confirmed by staff" and Send stays disabled until a valid item is chosen.
- **Required catalog step:** Room Cleaning only becomes orderable once staff add it in Catalog → Add Service/Amenity with the name "Room cleaning," category Housekeeping, price 0 (or the equivalent database insert).

## Guest–front desk live chat

- Guests and Front Desk chat in real time during a stay. Messages are 1–1000 characters, limited to 10 messages per minute per stay.
- The guest side is a floating chat popup with a notification sound (`chat.mp3`), a blurred backdrop, and Messenger-style bubbles.
- The staff side is a two-pane panel: a 340-pixel conversation list on the left and the thread on the right, stacking on screens 767 pixels wide or narrower.
- Front Desk gets six quick-reply chips that fill the reply box without sending, so staff can edit before sending.
- Chat access is Front Desk only, enforced on the server (see Roles above).

## Settings and billing policies

House rules live in `billing_policies` and Settings, not in hard-coded constants — including the early-checkout policies and the late checkout policy (enabled flag, grace, percentages, and cutoffs seeded by its migration). Only Admin and Manager can change them. Turning the late fee rule off restores fully manual charging.

## Running the system locally

The live setup runs on the owner's Windows PC:

1. MySQL and Apache run under XAMPP, with `api-hotel` copied into `C:\xampp\htdocs\api-hotel`.
2. The Next.js staff app is built and run from the project folder.
3. The WebSocket server runs alongside it for live dashboard, portal, and chat updates. Restart it only when a change notes that it is required — most changes do not need it.

A demo clock exists for testing time-dependent behavior (checkout deadlines, late fees). Its environment setting (`HOTEL_DEMO_MODE=1`, development environment) lives in the server copy's environment file — the one in `htdocs` — not the project folder copy.

## Applying an update — the full chain

Most "it is not working" reports on this project have traced back to a missed step in this chain, not to the code. Do all of it, in order:

1. **Pull** the latest code (`git pull`). Do not pin to an older commit — later fixes are stacked on top of earlier ones.
2. **Run any required migration first**, in phpMyAdmin, before testing the feature it belongs to (see the table below).
3. **Copy `api-hotel`** from the project folder to `C:\xampp\htdocs\api-hotel`, overwriting the old copy.
4. **Rebuild and restart** the Next.js app (`npm run build`, then restart) whenever the staff app or its scripts changed.
5. **Restart the WebSocket server** only if the change notes say it is required.
6. **Hard refresh** the browser (or use a private window) so cached scripts and styles are not served.
7. **Do one visible proof check** for the change — for example, open a test stay due at noon, start checkout in the afternoon, and confirm the preview shows the late fee before anything is posted.

> A fresh clone is not the same as a pull: untracked files — hero and amenity photos, `chat.mp3`, `.env` — do not come down with a clone and must be copied back, or the portal will look broken for an unrelated reason.

## Database migrations that matter

These migrations are required, in the sense that their feature does not work correctly until they have run:

| Migration | What it does |
| --- | --- |
| `20261031_stay_extension_requests.sql` | Stay extension requests table |
| `20261031_chat_messages.sql` | Guest–front desk chat messages table |
| `20261101_no_refund_early_checkout_policies.sql` | Leaves Manager Exception as the only active early-checkout policy |
| `20261102_room_reserved_status.sql` | Adds `RESERVED` to the room status enum; flips unpaid occupied rooms to Reserved |
| `20261102_room_types_auto_increment.sql` | Fixes the room type id-0 row and adds auto-increment and unique name |
| `20261102_rooms_auto_increment.sql` | Fixes the Room 701 id-0 row and adds auto-increment and unique room number |
| `20261102_late_checkout_policy.sql` | Seeds the automatic late fee and overstay policy in `billing_policies` |

The migrations are written to be safe to re-run: a second run is a no-op where the change is already applied.

## What the system deliberately does not do

These are house policy and design decisions, not missing features:

- **No auto-checkout.** An overdue stay stays Active, its folio stays Open, and its room stays Occupied until staff check the guest out. A guest may still be in the room; that is a safety and belongings decision, not just a billing one.
- **No refunds for unused nights** on early checkout, under the Manager Exception rule above.
- **No refund displays.** Refund wording and "extra payment to refund" lines were removed from the staff folio, receipt, and checkout, and from the guest folio. The underlying settlement fields are still computed; they are simply not shown. The one wording kept on purpose is the early-checkout notice itself: "Unused nights are not refunded."
- **No silent waivers.** A late fee can only be waived by a Manager or Admin, with a reason, recorded in the audit log.
- **No background billing jobs.** Late and overstay charges are calculated at checkout, not by a cron or sweep, so there is no scheduled task to keep alive on XAMPP.

## The journey — what we went through

The system did not arrive in one build. It grew through live use, screenshots of real failures, and fixes verified against a scratch copy of the real database shape before anything was pushed. The main chapters:

**The guest portal became a product of its own.** It started as a stay view and gained, in order: the hero photo and journey timeline; staff–guest live chat, first as a panel, then floating with sound, then with Messenger-style bubbles; a five-slide amenities carousel (Pool, Restaurant, Gym, Spa, Bar & Lounge) whose photos the owner pushed himself; music docked in the hero header; photos on orders and requests; tappable notifications that navigate to the right card; and deduplication so a room-service order never shows twice.

**Chat was narrowed on purpose.** Chat launched for several roles and was then restricted to Front Desk only — in the navigation, in the panel, and as a hard server gate — with the staff view rebuilt as a two-pane inbox at the same time.

**Money bugs were found by real stays, not by inspection.** The folio balance fix removed a phantom ₱1,285.71 caused by a missing charge category. Cancel, transfer, and early-checkout money paths were made transactional. Refund displays were first kept, then removed everywhere on the owner's instruction, reversing the earlier decision. The discount approvals path was removed from the Manager view after it became clear managers should not be in that flow.

**Schema drift surfaced as misleading errors.** Adding a room type and adding Room 701 both failed with "already exists" — one was a false error caused by missing auto-increment, the other was a true duplicate hiding behind an id of 0. Both were reproduced on a scratch database with the live data shape, fixed with careful migrations that renumbered the id-0 rows without changing anything visible, and given honest duplicate errors afterward.

**Visibility came before automation.** Overdue guests used to disappear from the counts the morning after their due date. The Next Checkouts card fixed the visibility first. Only then was the automatic late fee and overstay rule planned and approved — grace to 1:00 PM, 50% to 6:00 PM, a full night after — calculated at checkout with a preview, never silently.

**The late fee's first live stay deadlocked checkout.** The pending charge could neither be paid nor posted (Room 101, ₱3,750 pending on a fully paid ₱2,801.43 bill). The fix made Confirm reachable as "Confirm late charges," added the post-then-pay step, let managers actually reach their own waiver, and corrected the receipts — including the VAT recomputation that made the true total ₱6,230.00 for that PWD guest, not ₱6,551.43. The approvals build that landed alongside it was rebased onto the late fee commit, and the late fee code was verified intact afterward, marker by marker.

Throughout, one lesson repeated: when the live PC disagreed with the repository, the cause was almost always the deploy chain — a stale Next build, an old `api-hotel` copy in `htdocs`, two competing project folders, browser cache, or a migration not yet run — not the code on GitHub. That is why the apply chain above exists.

## Current standing and known limits

For daily operations the system is complete: check-in, folio, payments, VAT and discounts, checkout in all its forms, the guest portal, orders, services, chat, and approvals all work as one loop, and the big money gaps that live use exposed are closed.

What keeps it from being fully hardened:

- There is **no automated test suite in the repository**. New builds are tested on a scratch database and, for interface logic, in a simulated DOM — most are not driven end-to-end in a real browser before landing.
- **Deployment is manual** at every step (pull, copy, migrate, build, restart, refresh), which is exactly how drift happens.
- A **truly fresh install** from the schema dump alone can crash on first guest-order load, because some restaurant and service tables in the dump lack primary keys and auto-increment. Existing live databases are unaffected.
- **Backups and a few security items** from early reviews (seeded admin password, the public health endpoint) were never confirmed closed, so they are not claimed as done here.
- Housekeeping workflow, reservations, and reporting remain thinner than the billing core.

## Repository

- Current hotel repository: `esphyrho27/Hotel-Billing-System` — this superseded the earlier `pitok_htl_bil_sys` repository, which is no longer listed.
- A separate, different hotel application (`park-view-hotel-billing-next`) also exists in the owner's history; it is not this system.

---

*README for the Shesh Dev Hotel billing system, covering all features and changes through 2 November 2026 — including the Reserved room status, the combined approvals list, the automatic late fee and overstay rule, and the checkout deadlock and receipt fix.*
