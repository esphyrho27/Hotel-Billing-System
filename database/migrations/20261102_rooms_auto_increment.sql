-- rooms.id is a PRIMARY KEY without AUTO_INCREMENT on live databases,
-- and live data includes an id-0 row (room '701'). Converting the column to
-- AUTO_INCREMENT while a 0 value exists fails ("ALTER TABLE causes
-- auto_increment resequencing"), so the 0 row is renumbered first, mirroring
-- 20261102_room_types_auto_increment.sql. Rows that reference room 0 are
-- moved first (stays, room transfers, transfer requests), so nothing is left
-- pointing at a vanished room id. Audit history is deliberately untouched:
-- audit_logs rows are append-only history, not live references. After this,
-- the auto-increment counter starts at MAX(id)+1 and the renumbered room
-- keeps its number, type, floor, and status; only its internal id changes
-- (never shown in the UI, which lists rooms by number).
SET @next_room_id = (
  SELECT COALESCE(MAX(`id`), 0) + 1
  FROM `rooms`
  WHERE `id` <> 0
);

SET FOREIGN_KEY_CHECKS = 0;

UPDATE `stays` SET `room_id` = @next_room_id WHERE `room_id` = 0;

UPDATE `room_transfers` SET `from_room_id` = @next_room_id WHERE `from_room_id` = 0;

UPDATE `room_transfers` SET `to_room_id` = @next_room_id WHERE `to_room_id` = 0;

UPDATE `service_requests` SET `requested_room_id` = @next_room_id WHERE `requested_room_id` = 0;

UPDATE `rooms` SET `id` = @next_room_id WHERE `id` = 0;

SET FOREIGN_KEY_CHECKS = 1;

ALTER TABLE `rooms`
  MODIFY `id` BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT;
