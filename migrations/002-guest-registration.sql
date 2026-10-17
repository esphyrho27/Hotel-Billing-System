-- Shesh Dev Hotel — guest self-registration (portal modal)
-- Run ONCE in the TiDB Cloud SQL Editor with the `db_hotel_billing` database selected.
-- Existing data is untouched (new columns default to NULL).
-- If you see "Duplicate column name", the columns already exist — you're done.

ALTER TABLE stays
  ADD COLUMN guest_name VARCHAR(120) NULL,
  ADD COLUMN guest_phone VARCHAR(40) NULL,
  ADD COLUMN guest_email VARCHAR(120) NULL,
  ADD COLUMN guest_address VARCHAR(255) NULL,
  ADD COLUMN guest_id_type VARCHAR(40) NULL,
  ADD COLUMN guest_id_number VARCHAR(80) NULL,
  ADD COLUMN guest_registered_at DATETIME NULL;
