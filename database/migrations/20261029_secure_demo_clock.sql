-- Apply after 20261029_enforce_hotel_time_rules.sql.
-- The API sets @hotel_policy_now only after its development/demo environment
-- gate succeeds. Other database sessions continue using CURRENT_TIMESTAMP.

CREATE TABLE IF NOT EXISTS demo_clock_state (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  simulated_at DATETIME DEFAULT NULL,
  updated_by BIGINT UNSIGNED DEFAULT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO demo_clock_state (id, simulated_at) VALUES (1, NULL);

DROP TRIGGER IF EXISTS hotel_stays_before_insert_time_guard;
DROP TRIGGER IF EXISTS hotel_stays_before_update_time_guard;

DELIMITER $$

CREATE TRIGGER hotel_stays_before_insert_time_guard
BEFORE INSERT ON stays
FOR EACH ROW
BEGIN
  DECLARE policy_now DATETIME;
  SET policy_now = COALESCE(@hotel_policy_now, CURRENT_TIMESTAMP);

  IF NEW.status = 'ACTIVE' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Create check-ins through the cashier approval workflow.';
  END IF;

  IF NEW.status = 'CHECKED_OUT' OR NEW.actual_checkout IS NOT NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'A stay cannot be created as already checked out.';
  END IF;

  IF NEW.checkin_at <> TIMESTAMP(DATE(policy_now), '14:00:00')
      OR policy_now < TIMESTAMP(DATE(policy_now), '14:00:00') THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Hotel check-in is allowed only from 2:00 PM local time.';
  END IF;

  SET NEW.actual_checkin_at = NULL;
END$$

CREATE TRIGGER hotel_stays_before_update_time_guard
BEFORE UPDATE ON stays
FOR EACH ROW
BEGIN
  DECLARE approved_exception_count INT DEFAULT 0;
  DECLARE policy_now DATETIME;
  SET policy_now = COALESCE(@hotel_policy_now, CURRENT_TIMESTAMP);

  IF NOT (NEW.checkin_at <=> OLD.checkin_at) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'The scheduled check-in timestamp cannot be changed.';
  END IF;

  IF NOT (NEW.planned_checkout <=> OLD.planned_checkout) THEN
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
END$$

DELIMITER ;
