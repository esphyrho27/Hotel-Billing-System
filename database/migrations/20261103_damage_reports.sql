-- Damage reports with manager approval (2026-11-03).
-- A damage report is filed while the stay is active, a manager (or admin)
-- approves it and sets the final amount, and only then can it be posted
-- to the guest folio as one DAMAGE / MISSING_ITEM charge. Pending and
-- approved-but-not-yet-posted reports block checkout (see
-- htl_checkout_blockers() in api-hotel/index.php), so a damage charge
-- cannot be lost by checking out before it is posted.
-- REQUIRED before the damage code: run FIRST in phpMyAdmin into the
-- existing database (never re-import the full schema).
-- Idempotent: safe to re-run. The ENUM MODIFY is a no-op when DAMAGE
-- already exists, CREATE TABLE IF NOT EXISTS skips an existing table,
-- and each seed row inserts only when no row with the same name and
-- category exists yet.
ALTER TABLE service_catalog
    MODIFY category ENUM('FOOD_BEVERAGE','HOUSEKEEPING','SERVICE','LAUNDRY','MINIBAR','OTHER','GYM','POOL','SPA','DAMAGE') NOT NULL;

CREATE TABLE IF NOT EXISTS `damage_reports` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `stay_id` BIGINT NOT NULL,
  `folio_id` BIGINT NOT NULL,
  `room_id` BIGINT NULL,
  `room_number` VARCHAR(20) NULL,
  `item_name` VARCHAR(150) NOT NULL,
  `kind` VARCHAR(20) NOT NULL DEFAULT 'DAMAGE',
  `description` VARCHAR(500) NOT NULL,
  `reference` VARCHAR(255) NULL,
  `quantity` INT NOT NULL DEFAULT 1,
  `unit_price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `estimated_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `final_amount` DECIMAL(10,2) NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  `rejection_reason` VARCHAR(255) NULL,
  `reported_by` BIGINT NULL,
  `approved_by` BIGINT NULL,
  `approved_at` DATETIME NULL,
  `posted_by` BIGINT NULL,
  `posted_at` DATETIME NULL,
  `posted_charge_id` BIGINT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT current_timestamp(),
  `updated_at` TIMESTAMP NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `stay_id` (`stay_id`),
  KEY `folio_id` (`folio_id`),
  KEY `status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Common damage / missing-item price list (STARTER rates drafted for a
-- mid-range Philippine hotel, NOT verified hotel rates). Staff correct
-- them any time in Catalog (category: Damage), where the same items can
-- also be added, renamed, repriced, or deactivated. The damage report
-- form pre-fills item + price from this list; the manager still sets the
-- final amount at approval, so a starter price is never charged blindly.
-- Seed ids are assigned explicitly: the schema dump's service_catalog has
-- no AUTO_INCREMENT on id, so an INSERT without id fails there (strict
-- mode 1364). Explicit ids work on every shape, with or without
-- AUTO_INCREMENT, and the counter moves past them where it exists.
SET @next_service_id = (SELECT COALESCE(MAX(id), 0) FROM service_catalog);

INSERT INTO service_catalog (id, name, category, description, price, active)
SELECT @next_service_id := @next_service_id + 1, s.name, s.category, s.description, s.price, s.active
FROM (
    SELECT 'Towel' AS name, 'DAMAGE' AS category,
           'Missing or stained towel, per piece' AS description,
           350.00 AS price, 1 AS active
    UNION ALL
    SELECT 'Bathrobe', 'DAMAGE',
           'Missing bathrobe',
           800.00, 1
    UNION ALL
    SELECT 'Bed sheet', 'DAMAGE',
           'Stained or torn bed sheet',
           900.00, 1
    UNION ALL
    SELECT 'Pillowcase', 'DAMAGE',
           'Stained or torn pillowcase',
           250.00, 1
    UNION ALL
    SELECT 'Pillow', 'DAMAGE',
           'Stained or damaged pillow',
           600.00, 1
    UNION ALL
    SELECT 'Blanket / comforter', 'DAMAGE',
           'Stained or damaged blanket or comforter',
           1200.00, 1
    UNION ALL
    SELECT 'Key card', 'DAMAGE',
           'Lost room key card',
           300.00, 1
    UNION ALL
    SELECT 'TV remote', 'DAMAGE',
           'Broken or missing TV remote',
           800.00, 1
    UNION ALL
    SELECT 'Aircon remote', 'DAMAGE',
           'Broken or missing aircon remote',
           700.00, 1
    UNION ALL
    SELECT 'Electric kettle', 'DAMAGE',
           'Broken or missing electric kettle',
           1200.00, 1
    UNION ALL
    SELECT 'Hair dryer', 'DAMAGE',
           'Broken or missing hair dryer',
           1500.00, 1
    UNION ALL
    SELECT 'Lamp', 'DAMAGE',
           'Broken lamp',
           1500.00, 1
    UNION ALL
    SELECT 'Curtain', 'DAMAGE',
           'Stained or torn curtain',
           1500.00, 1
    UNION ALL
    SELECT 'Door handle / lock', 'DAMAGE',
           'Damaged door handle or lock',
           2000.00, 1
    UNION ALL
    SELECT 'Mirror / glass', 'DAMAGE',
           'Broken mirror or glass',
           2500.00, 1
    UNION ALL
    SELECT 'Wall damage', 'DAMAGE',
           'Wall repair or repainting',
           2500.00, 1
    UNION ALL
    SELECT 'Mattress damage', 'DAMAGE',
           'Stain or burn damage to mattress',
           3500.00, 1
    UNION ALL
    SELECT 'Television', 'DAMAGE',
           'Broken or cracked television screen',
           12000.00, 1
    UNION ALL
    SELECT 'Smoking cleanup fee', 'DAMAGE',
           'Extra cleaning after smoking in the room',
           2000.00, 1
) AS s
WHERE NOT EXISTS (
    SELECT 1 FROM service_catalog sc
    WHERE sc.name = s.name AND sc.category = s.category
);
