-- room_types.id is a PRIMARY KEY without AUTO_INCREMENT on live databases,
-- and live data includes an id-0 row ('Penthouse'). Converting the column to
-- AUTO_INCREMENT while a 0 value exists fails ("ALTER TABLE causes
-- auto_increment resequencing"), so the 0 row is renumbered first, mirroring
-- 20261030_menu_items_auto_increment.sql. Rooms pointing at type 0 are moved
-- first, so no room is left pointing at a vanished type id. After this, the
-- auto-increment counter starts at MAX(id)+1 and the renumbered type keeps
-- its name, rate, and capacity; only its internal id changes (never shown
-- in the UI, which lists types by name).
SET @next_room_type_id = (
  SELECT COALESCE(MAX(`id`), 0) + 1
  FROM `room_types`
  WHERE `id` <> 0
);

UPDATE `rooms` SET `room_type_id` = @next_room_type_id WHERE `room_type_id` = 0;

UPDATE `room_types` SET `id` = @next_room_type_id WHERE `id` = 0;

ALTER TABLE `room_types`
  MODIFY `id` BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT;
