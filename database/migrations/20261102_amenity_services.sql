-- Amenity services with rates (2026-11-02).
-- Adds GYM, POOL, and SPA categories to the service catalog so the guest
-- portal amenity pages can offer bookable services with rates, and seeds
-- starter services for each amenity. Bookings reuse the existing priced
-- service-request flow: staff completion posts one SERVICE charge to the
-- guest folio, so nothing else in the charge chain changes.
-- Idempotent: safe to re-run. The ENUM MODIFY is a no-op when the values
-- already exist, and each seed row inserts only when no row with the same
-- name and category exists yet.
ALTER TABLE service_catalog
    MODIFY category ENUM('FOOD_BEVERAGE','HOUSEKEEPING','SERVICE','LAUNDRY','MINIBAR','OTHER','GYM','POOL','SPA') NOT NULL;

-- Seed ids are assigned explicitly: the schema dump's service_catalog has
-- no AUTO_INCREMENT on id, so an INSERT without id fails there (strict
-- mode 1364). Explicit ids work on every shape, with or without
-- AUTO_INCREMENT, and the counter moves past them where it exists.
SET @next_service_id = (SELECT COALESCE(MAX(id), 0) FROM service_catalog);

INSERT INTO service_catalog (id, name, category, description, price, active)
SELECT @next_service_id := @next_service_id + 1, s.name, s.category, s.description, s.price, s.active
FROM (
    SELECT 'Pool Access for Extra Guest' AS name, 'POOL' AS category,
           'Pool access for an additional guest for the day' AS description,
           300.00 AS price, 1 AS active
    UNION ALL
    SELECT 'Cabana Rental', 'POOL',
           'Private cabana for the whole day',
           800.00, 1
    UNION ALL
    SELECT 'Swimming Lesson', 'POOL',
           'One-hour swimming lesson with an instructor',
           700.00, 1
    UNION ALL
    SELECT 'Gym Access for Extra Guest', 'GYM',
           'Gym access for an additional guest for the day',
           300.00, 1
    UNION ALL
    SELECT 'Personal Trainer', 'GYM',
           'One-hour session with a personal trainer',
           900.00, 1
    UNION ALL
    SELECT 'Yoga Class', 'GYM',
           'Guided yoga class, per session',
           400.00, 1
    UNION ALL
    SELECT 'Swedish Massage', 'SPA',
           '60-minute relaxing Swedish massage',
           950.00, 1
    UNION ALL
    SELECT 'Deep Tissue Massage', 'SPA',
           '60-minute deep tissue massage',
           1200.00, 1
    UNION ALL
    SELECT 'Foot Massage', 'SPA',
           '30-minute foot massage',
           500.00, 1
) AS s
WHERE NOT EXISTS (
    SELECT 1 FROM service_catalog sc
    WHERE sc.name = s.name AND sc.category = s.category
);
