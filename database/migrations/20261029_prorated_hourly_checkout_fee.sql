ALTER TABLE `early_checkout_policy_configs`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

SET @hourly_fee_policy_id = LAST_INSERT_ID(0);

INSERT INTO `early_checkout_policy_configs`
  (`policy_key`, `name`, `description`, `minimum_hours`, `minimum_nights`, `fixed_fee`, `requires_manager`, `active`, `updated_by`)
SELECT
  'HOURLY_PLUS_FEE',
  'Prorated hourly + ₱500 fee',
  'Recalculates the room charge using actual occupied hours (minimum 1 hour) plus a ₱500 fixed fee. Requires separate manager approval and does not authorize early room release.',
  1,
  0,
  500,
  1,
  1,
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `early_checkout_policy_configs` WHERE `policy_key` = 'HOURLY_PLUS_FEE'
);

SET @hourly_fee_policy_id = LAST_INSERT_ID();

INSERT INTO `audit_logs` (`user_id`, `action`, `entity_type`, `entity_id`, `details`, `ip_address`)
SELECT
  NULL,
  'CREATE_EARLY_CHECKOUT_POLICY',
  'early_checkout_policy',
  `id`,
  JSON_OBJECT('name', `name`, 'policy_key', `policy_key`, 'fixed_fee', `fixed_fee`, 'requires_manager', `requires_manager`, 'configured_by', 'database migration'),
  NULL
FROM `early_checkout_policy_configs`
WHERE `id` = @hourly_fee_policy_id AND @hourly_fee_policy_id > 0;
