<?php
declare(strict_types=1);

function hotel_timezone(): DateTimeZone {
    return new DateTimeZone(getenv('HOTEL_TIMEZONE') ?: 'Asia/Manila');
}

function hotel_demo_mode_enabled(): bool {
    $environment = strtolower(trim((string)getenv('HOTEL_ENV')));
    return getenv('HOTEL_DEMO_MODE') === '1'
        && in_array($environment, ['development', 'demo'], true);
}

function hotel_parse_simulated_time(string $value, string $format = 'Y-m-d\TH:i'): DateTimeImmutable {
    $timezone = hotel_timezone();
    $dateTime = DateTimeImmutable::createFromFormat('!' . $format, $value, $timezone);
    $errors = DateTimeImmutable::getLastErrors();
    if (!$dateTime
        || ($errors && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))
        || $dateTime->format($format) !== $value) {
        throw new InvalidArgumentException('Enter a valid simulated hotel date and time.');
    }

    return $dateTime;
}

function hotel_demo_clock_state(PDO $pdo): array {
    if (!hotel_demo_mode_enabled()) {
        return ['available' => false, 'active' => false, 'simulated_at' => null];
    }

    $row = $pdo->query('SELECT simulated_at FROM demo_clock_state WHERE id=1')->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        throw new RuntimeException('Demo clock storage is missing. Apply the demo clock database migration.');
    }

    $simulatedAt = $row['simulated_at'] === null
        ? null
        : hotel_parse_simulated_time((string)$row['simulated_at'], 'Y-m-d H:i:s');

    return [
        'available' => true,
        'active' => $simulatedAt !== null,
        'simulated_at' => $simulatedAt?->format('Y-m-d H:i:s'),
    ];
}

function hotel_local_now(): DateTimeImmutable {
    static $requestNow;
    if ($requestNow instanceof DateTimeImmutable) {
        return $requestNow;
    }

    $now = new DateTimeImmutable('now', hotel_timezone());
    if (!hotel_demo_mode_enabled()) {
        $requestNow = $now;
        return $requestNow;
    }

    global $pdo;
    if (!$pdo instanceof PDO) {
        throw new RuntimeException('The demo clock requires an active database connection.');
    }

    $state = hotel_demo_clock_state($pdo);
    if (!$state['active']) {
        $pdo->exec('SET @hotel_policy_now = NULL');
        $requestNow = $now;
        return $requestNow;
    }

    $simulatedAt = hotel_parse_simulated_time((string)$state['simulated_at'], 'Y-m-d H:i:s');
    $setClock = $pdo->prepare('SET @hotel_policy_now = ?');
    $setClock->execute([$simulatedAt->format('Y-m-d H:i:s')]);
    $requestNow = $simulatedAt;
    return $requestNow;
}

function hotel_ensure_actual_checkin_column(PDO $pdo): void {
    static $checked = false;
    if ($checked) {
        return;
    }

    $column = $pdo->query("SHOW COLUMNS FROM stays LIKE 'actual_checkin_at'")->fetch(PDO::FETCH_ASSOC);
    if (!$column) {
        $pdo->exec('ALTER TABLE stays ADD COLUMN actual_checkin_at DATETIME DEFAULT NULL AFTER checkin_at');
    }
    $checked = true;
}

function hotel_checkin_is_open(?DateTimeImmutable $now = null): bool {
    $now ??= hotel_local_now();
    return $now >= $now->setTime(14, 0, 0);
}

function hotel_scheduled_checkout_at(string $date): DateTimeImmutable {
    $timezone = hotel_timezone();
    $scheduledDate = DateTimeImmutable::createFromFormat('!Y-m-d', $date, $timezone);
    $errors = DateTimeImmutable::getLastErrors();
    if (!$scheduledDate
        || ($errors && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))
        || $scheduledDate->format('Y-m-d') !== $date) {
        throw new InvalidArgumentException('Stay has an invalid scheduled checkout date.');
    }

    return $scheduledDate->setTime(12, 0, 0);
}

function hotel_is_valid_early_checkout_exception(
    array $request,
    DateTimeImmutable $checkinAt,
    DateTimeImmutable $scheduledCheckoutAt,
    DateTimeImmutable $now
): bool {
    if (($request['status'] ?? null) !== 'FINALIZED'
        || ($request['request_type'] ?? null) !== 'EARLY_CHECKOUT'
        || ($request['policy'] ?? null) !== 'MANAGER_EXCEPTION'
        || empty($request['approved_at'])
        || ($request['approved_by'] ?? null) === null
        || ($request['requested_by'] ?? null) === null
        || (int)$request['approved_by'] === (int)$request['requested_by']) {
        return false;
    }

    try {
        $requestedDeparture = new DateTimeImmutable((string)$request['requested_departure_at'], hotel_timezone());
    } catch (Throwable) {
        return false;
    }

    return $requestedDeparture >= $checkinAt
        && $requestedDeparture < $scheduledCheckoutAt
        && $now >= $requestedDeparture;
}

function hotel_checkout_is_allowed(
    string $plannedCheckoutDate,
    DateTimeImmutable $now,
    ?array $earlyCheckoutException = null,
    ?DateTimeImmutable $checkinAt = null
): bool {
    $scheduledCheckoutAt = hotel_scheduled_checkout_at($plannedCheckoutDate);
    if ($now >= $scheduledCheckoutAt) {
        return true;
    }

    return $earlyCheckoutException !== null
        && $checkinAt !== null
        && hotel_is_valid_early_checkout_exception(
            $earlyCheckoutException,
            $checkinAt,
            $scheduledCheckoutAt,
            $now
        );
}
