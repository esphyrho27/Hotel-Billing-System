-- Room RESERVED status (2026-11-02).
-- A room picked at check-in stays RESERVED until the cashier approves the
-- check-in payment; only then does it become OCCUPIED. This keeps unpaid
-- check-ins from reading as occupied on the staff board and in the guest
-- portal, while still blocking the room from being picked twice.
-- Idempotent: safe to re-run. The backfill only flips rooms tied to a
-- PENDING_PAYMENT stay; rooms with ACTIVE stays stay OCCUPIED.
ALTER TABLE rooms MODIFY status ENUM('AVAILABLE','OCCUPIED','CLEANING','MAINTENANCE','RESERVED') NOT NULL DEFAULT 'AVAILABLE';
UPDATE rooms SET status='RESERVED' WHERE status='OCCUPIED' AND id IN (SELECT room_id FROM stays WHERE status='PENDING_PAYMENT');
