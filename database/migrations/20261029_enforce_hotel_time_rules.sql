-- Apply once to an existing hotel_billing_system database.
-- Set the MySQL session/server timezone to HOTEL_TIMEZONE before using these
-- triggers from direct SQL clients. The PHP connection sets its session zone.

ALTER TABLE stays
  ADD COLUMN IF NOT EXISTS actual_checkin_at DATETIME DEFAULT NULL AFTER checkin_at;

DROP TRIGGER IF EXISTS hotel_stays_before_insert_time_guard;
DROP TRIGGER IF EXISTS hotel_stays_before_update_time_guard;

DELIMITER $$

CREATE TRIGGER hotel_stays_before_insert_time_guard
BEFORE INSERT ON stays
FOR EACH ROW
BEGIN
  IF NEW.status = 'ACTIVE' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Create check-ins through the cashier approval workflow.';
  END IF;

  IF NEW.status = 'CHECKED_OUT' OR NEW.actual_checkout IS NOT NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'A stay cannot be created as already checked out.';
  END IF;

  IF NEW.checkin_at <> TIMESTAMP(CURDATE(), '14:00:00')
      OR CURRENT_TIMESTAMP < TIMESTAMP(CURDATE(), '14:00:00') THEN
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
    IF CURRENT_TIMESTAMP < TIMESTAMP(DATE(NEW.checkin_at), '14:00:00') THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Hotel check-in is allowed only from 2:00 PM local time.';
    END IF;
    SET NEW.actual_checkin_at = CURRENT_TIMESTAMP;
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
    IF CURRENT_TIMESTAMP < TIMESTAMP(NEW.planned_checkout, '12:00:00') THEN
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
         AND e.requested_departure_at <= CURRENT_TIMESTAMP;

      IF approved_exception_count = 0 THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'Checkout before scheduled noon requires a finalized, separately manager-approved exception.';
      END IF;
    END IF;

    SET NEW.actual_checkout = CURRENT_TIMESTAMP;
  END IF;
END$$

DELIMITER ;
