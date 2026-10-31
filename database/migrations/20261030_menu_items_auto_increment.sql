SET @next_menu_item_id = (
  SELECT COALESCE(MAX(`id`), 0) + 1
  FROM `menu_items`
  WHERE `id` <> 0
);

SET FOREIGN_KEY_CHECKS = 0;

UPDATE `restaurant_order_items` oi
JOIN `menu_items` mi ON mi.`id` = oi.`item_id`
SET oi.`item_id` = @next_menu_item_id
WHERE mi.`id` = 0;

UPDATE `menu_items`
SET `id` = @next_menu_item_id
WHERE `id` = 0;

SET FOREIGN_KEY_CHECKS = 1;

ALTER TABLE `menu_items`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;
