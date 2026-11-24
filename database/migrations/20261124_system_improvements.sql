-- Hotel Billing System - Comprehensive System Improvements Migration
-- Migration Date: 2026-11-24

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_name VARCHAR(80) NULL AFTER user_id;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_role VARCHAR(50) NULL AFTER user_name;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS module VARCHAR(80) NULL AFTER action;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS old_value LONGTEXT NULL AFTER details;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS new_value LONGTEXT NULL AFTER old_value;

UPDATE audit_logs a JOIN users u ON u.id = a.user_id 
SET a.user_name = COALESCE(a.user_name, u.username), 
    a.user_role = COALESCE(a.user_role, u.role), 
    a.module = COALESCE(a.module, a.entity_type) 
WHERE a.user_name IS NULL OR a.user_role IS NULL OR a.module IS NULL;

ALTER TABLE restaurant_orders ADD COLUMN IF NOT EXISTS cancelled_at DATETIME NULL AFTER completed_at;
ALTER TABLE restaurant_orders ADD COLUMN IF NOT EXISTS cancelled_by BIGINT UNSIGNED NULL AFTER cancelled_at;
ALTER TABLE restaurant_orders ADD COLUMN IF NOT EXISTS cancellation_reason VARCHAR(255) NULL AFTER cancelled_by;

ALTER TABLE charges MODIFY COLUMN category VARCHAR(100) NOT NULL DEFAULT 'OTHER';
ALTER TABLE charges ADD COLUMN IF NOT EXISTS subcategory VARCHAR(120) NULL AFTER category;
ALTER TABLE charges ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

ALTER TABLE charge_categories MODIFY COLUMN charge_category_id INT NOT NULL AUTO_INCREMENT;

CREATE TABLE IF NOT EXISTS charge_subcategories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category_id INT NOT NULL,
    subcategory_name VARCHAR(120) NOT NULL,
    default_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    description TEXT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_category_id (category_id),
    UNIQUE KEY uq_cat_subcat (category_id, subcategory_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE damage_reports ADD COLUMN IF NOT EXISTS photo_url VARCHAR(255) NULL AFTER reference;
