-- Stay occupants (2026-11-02).
-- One row per person actually staying in a room, so a stay booked under one
-- guest (e.g. an additional room booked under a guest who is already staying)
-- can still record the friends or relatives who occupy it. Occupants are a
-- registration record only: they get no login and no portal, and they never
-- affect the room charge (the nightly rate is flat per room).
-- REQUIRED before the occupant capture code: run FIRST in phpMyAdmin into
-- the existing database (never re-import the full schema).
-- Idempotent: safe to re-run (CREATE TABLE IF NOT EXISTS, no seed rows).
CREATE TABLE IF NOT EXISTS `stay_occupants` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `stay_id` BIGINT NOT NULL,
  `full_name` VARCHAR(150) NOT NULL,
  `contact_number` VARCHAR(30) NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `stay_id` (`stay_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
