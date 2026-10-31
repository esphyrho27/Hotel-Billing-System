SET @legacy_early_checkout_id = (
  SELECT COALESCE(MAX(`id`), 0) + 1
  FROM `early_checkout_requests`
  WHERE `id` <> 0
);

UPDATE `early_checkout_requests`
SET `id` = @legacy_early_checkout_id
WHERE `id` = 0;

ALTER TABLE `early_checkout_requests`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
