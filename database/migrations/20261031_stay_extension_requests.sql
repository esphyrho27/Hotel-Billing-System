-- Guest stay extension requests (guest request + manager/admin approval).
-- Approved extensions move stays.planned_checkout and post ROOM charges to the open folio.
CREATE TABLE IF NOT EXISTS `stay_extension_requests` (
  `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `stay_id` bigint(20) UNSIGNED NOT NULL,
  `folio_id` bigint(20) UNSIGNED NOT NULL,
  `current_checkout` date NOT NULL,
  `requested_checkout` date NOT NULL,
  `extra_nights` int(11) NOT NULL,
  `nightly_rate` decimal(12,2) NOT NULL,
  `proposed_charge` decimal(12,2) NOT NULL,
  `reason` varchar(500) DEFAULT NULL,
  `status` enum('REQUESTED','APPROVED','REJECTED') NOT NULL DEFAULT 'REQUESTED',
  `review_note` varchar(500) DEFAULT NULL,
  `requested_by` bigint(20) UNSIGNED DEFAULT NULL,
  `approved_by` bigint(20) UNSIGNED DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `stay_id` (`stay_id`),
  KEY `folio_id` (`folio_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The hotel time-guard trigger blocks direct planned_checkout changes. An approved
-- stay extension is the one authorized path: the API sets
-- @hotel_allow_planned_checkout_change = 1 around its UPDATE, then clears it.
DROP TRIGGER IF EXISTS `hotel_stays_before_update_time_guard`;
DELIMITER $$
CREATE TRIGGER `hotel_stays_before_update_time_guard` BEFORE UPDATE ON `stays` FOR EACH ROW BEGIN
  DECLARE approved_exception_count INT DEFAULT 0;
  DECLARE policy_now DATETIME;
  SET policy_now = COALESCE(@hotel_policy_now, CURRENT_TIMESTAMP);

  IF NOT (NEW.checkin_at <=> OLD.checkin_at) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'The scheduled check-in timestamp cannot be changed.';
  END IF;

  IF NOT (NEW.planned_checkout <=> OLD.planned_checkout)
     AND COALESCE(@hotel_allow_planned_checkout_change, 0) <> 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'The scheduled checkout date cannot be changed directly.';
  END IF;

  IF NOT (NEW.actual_checkin_at <=> OLD.actual_checkin_at)
      AND NOT (NEW.status = 'ACTIVE' AND OLD.status <> 'ACTIVE') THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Actual check-in time is recorded only when a stay becomes active.';
  END IF;

  IF NEW.status = 'ACTIVE' AND OLD.status <> 'ACTIVE' THEN
    IF OLD.status NOT IN ('PENDING_PAYMENT', '') THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Only a pending check-in can become active.';
    END IF;
    IF policy_now < TIMESTAMP(DATE(NEW.checkin_at), '14:00:00') THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Hotel check-in is allowed only from 2:00 PM local time.';
    END IF;
    SET NEW.actual_checkin_at = policy_now;
  END IF;

  IF NOT (NEW.actual_checkout <=> OLD.actual_checkout)
      AND NOT (NEW.status = 'CHECKED_OUT' AND OLD.status <> 'CHECKED_OUT') THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Actual checkout time is recorded only when a stay checks out.';
  END IF;

  IF NEW.status = 'CHECKED_OUT' AND OLD.status <> 'CHECKED_OUT' THEN
    IF OLD.status <> 'ACTIVE' THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Only an active stay can be checked out.';
    END IF;
    IF policy_now < TIMESTAMP(NEW.planned_checkout, '12:00:00') THEN
      SELECT COUNT(*)
        INTO approved_exception_count
        FROM early_checkout_requests e
        JOIN early_checkout_policy_configs p
          ON p.policy_key = e.policy
       WHERE e.stay_id = NEW.id
         AND e.status = 'FINALIZED'
         AND e.request_type = 'EARLY_CHECKOUT'
         AND e.policy = 'MANAGER_EXCEPTION'
         AND p.active = 1
         AND p.requires_manager = 1
         AND e.approved_by IS NOT NULL
         AND e.requested_by IS NOT NULL
         AND e.approved_by <> e.requested_by
         AND e.approved_at IS NOT NULL
         AND e.requested_departure_at >= NEW.checkin_at
         AND e.requested_departure_at < TIMESTAMP(NEW.planned_checkout, '12:00:00')
         AND e.requested_departure_at <= policy_now;

      IF approved_exception_count = 0 THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'Checkout before scheduled noon requires a finalized, separately manager-approved exception.';
      END IF;
    END IF;

    SET NEW.actual_checkout = policy_now;
  END IF;
END
$$
DELIMITER ;
