-- Guest ↔ front-desk live chat (text only, version one).
-- Guests send from the portal (token-resolved stay); front desk, manager and
-- admin read and reply from the staff dashboard. The portal live poll carries
-- new messages to guests, so chat keeps working even if the WebSocket bridge
-- is down. Safe to run more than once: the table is created only if missing.
CREATE TABLE IF NOT EXISTS `chat_messages` (
  `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `stay_id` bigint(20) UNSIGNED NOT NULL,
  `sender_type` enum('GUEST','STAFF') NOT NULL,
  `sender_id` bigint(20) UNSIGNED DEFAULT NULL,
  `sender_name` varchar(255) NOT NULL,
  `body` text NOT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT 0,
  `read_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `stay_id` (`stay_id`),
  KEY `stay_created` (`stay_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
