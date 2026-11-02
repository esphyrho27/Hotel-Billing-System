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

/**
 * Late-checkout / overstay house rule, read from billing_policies with the
 * approved defaults as fallback so an old database works before the seed
 * migration runs. Keys: LATE_CHECKOUT_ENABLED (1), LATE_CHECKOUT_GRACE_MINUTES
 * (60), LATE_CHECKOUT_CUTOFF_TIME (18:00), LATE_CHECKOUT_FEE_PERCENT (50).
 */
function hotel_late_checkout_settings(PDO $pdo): array
{
    $defaults = [
        'enabled' => true,
        'grace_minutes' => 60,
        'cutoff_time' => '18:00',
        'fee_percent' => 50.0,
    ];
    try {
        $rows = $pdo->query("SELECT policy_key, policy_value FROM billing_policies WHERE policy_key IN ('LATE_CHECKOUT_ENABLED','LATE_CHECKOUT_GRACE_MINUTES','LATE_CHECKOUT_CUTOFF_TIME','LATE_CHECKOUT_FEE_PERCENT')")->fetchAll(PDO::FETCH_KEY_PAIR);
    } catch (Throwable) {
        return $defaults;
    }
    if (!is_array($rows)) {
        return $defaults;
    }
    if (isset($rows['LATE_CHECKOUT_ENABLED'])) {
        $defaults['enabled'] = trim((string)$rows['LATE_CHECKOUT_ENABLED']) !== '0';
    }
    if (isset($rows['LATE_CHECKOUT_GRACE_MINUTES']) && is_numeric($rows['LATE_CHECKOUT_GRACE_MINUTES'])) {
        $defaults['grace_minutes'] = max(0, min(720, (int)$rows['LATE_CHECKOUT_GRACE_MINUTES']));
    }
    if (isset($rows['LATE_CHECKOUT_CUTOFF_TIME']) && preg_match('/\A([01]\d|2[0-3]):[0-5]\d\z/', trim((string)$rows['LATE_CHECKOUT_CUTOFF_TIME']))) {
        $defaults['cutoff_time'] = trim((string)$rows['LATE_CHECKOUT_CUTOFF_TIME']);
    }
    if (isset($rows['LATE_CHECKOUT_FEE_PERCENT']) && is_numeric($rows['LATE_CHECKOUT_FEE_PERCENT'])) {
        $defaults['fee_percent'] = max(0.0, min(100.0, (float)$rows['LATE_CHECKOUT_FEE_PERCENT']));
    }
    return $defaults;
}

/**
 * Shared late-checkout / overstay calculation. Preview and checkout call this
 * exact function, so the amount a guest is shown is always the amount posted.
 *
 * Scheduled checkout is the planned date at 12:00 PM (hotel policy time).
 * Grace is free; after grace and up to the cutoff the fee is a percentage of
 * the room type's current nightly rate; after the cutoff that day counts as a
 * full extra night instead of the fee. Each extra calendar night is a full
 * night, and on the final checkout day a late fee (grace..cutoff) or one more
 * full night (after cutoff) is added on top of the calendar nights.
 *
 * A FINALIZED manager-exception early checkout never triggers the rule, and
 * a manual LATE_CHECKOUT charge already on the folio suppresses only the auto
 * late-fee component (overstay nights are still computed). This function only
 * reads; it never posts a charge.
 */
function hotel_late_checkout_breakdown(
    PDO $pdo,
    int $stayId,
    string $plannedCheckout,
    int $folioId,
    int $roomId,
    DateTimeImmutable $now,
    bool $hasEarlyCheckoutException
): array {
    $settings = hotel_late_checkout_settings($pdo);
    $scheduled = hotel_scheduled_checkout_at($plannedCheckout);
    $zero = [
        'enabled' => $settings['enabled'],
        'grace_minutes' => $settings['grace_minutes'],
        'cutoff_time' => $settings['cutoff_time'],
        'fee_percent' => $settings['fee_percent'],
        'scheduled_checkout_at' => $scheduled->format('Y-m-d H:i:s'),
        'actual_checkout_at' => $now->format('Y-m-d H:i:s'),
        'nightly_rate' => 0.0,
        'late_fee_amount' => 0.0,
        'overstay_nights' => 0,
        'overstay_dates' => [],
        'overstay_amount' => 0.0,
        'total_auto_amount' => 0.0,
        'has_manual_late_checkout' => false,
        'lines' => [],
        'notes' => [],
    ];
    if (!$settings['enabled'] || $hasEarlyCheckoutException || $now <= $scheduled) {
        return $zero;
    }
    $rateRow = $pdo->prepare('SELECT rt.nightly_rate FROM rooms r JOIN room_types rt ON rt.id = r.room_type_id WHERE r.id = ?');
    $rateRow->execute([$roomId]);
    $nightlyRate = $rateRow->fetchColumn();
    if ($nightlyRate === false || (float)$nightlyRate <= 0) {
        $zero['notes'][] = 'Nightly rate could not be determined, so no automatic late charge was calculated.';
        return $zero;
    }
    $nightlyRate = round((float)$nightlyRate, 2);
    $zero['nightly_rate'] = $nightlyRate;

    $manual = $pdo->prepare("SELECT COUNT(*) FROM charges WHERE folio_id = ? AND category = 'LATE_CHECKOUT'");
    $manual->execute([$folioId]);
    $hasManualLate = (int)$manual->fetchColumn() > 0;
    $zero['has_manual_late_checkout'] = $hasManualLate;
    if ($hasManualLate) {
        $zero['notes'][] = 'Automatic late fee skipped: a manual LATE_CHECKOUT charge is already on the folio.';
    }

    [$cutoffHour, $cutoffMinute] = array_map('intval', explode(':', $settings['cutoff_time']));
    $scheduledDate = $scheduled->setTime(0, 0, 0);
    $actualDate = $now->setTime(0, 0, 0);
    $graceEnd = $scheduled->modify('+' . $settings['grace_minutes'] . ' minutes');
    $cutoffToday = $scheduledDate->setTime($cutoffHour, $cutoffMinute);
    $lateFee = round($nightlyRate * $settings['fee_percent'] / 100, 2);
    $overstayNights = 0;
    $overstayDates = [];
    $applyLateFee = false;

    if ($now <= $graceEnd) {
        return $zero;
    }
    $dayDiff = (int)$scheduledDate->diff($actualDate)->format('%a');
    if ($dayDiff === 0) {
        if ($now <= $cutoffToday) {
            $applyLateFee = true;
        } else {
            $overstayNights = 1;
            $overstayDates[] = $scheduledDate->format('Y-m-d');
        }
    } else {
        $overstayNights = $dayDiff;
        for ($i = 0; $i < $dayDiff; $i++) {
            $overstayDates[] = $scheduledDate->modify('+' . $i . ' days')->format('Y-m-d');
        }
        $finalGraceEnd = $actualDate->setTime(12, 0, 0)->modify('+' . $settings['grace_minutes'] . ' minutes');
        $finalCutoff = $actualDate->setTime($cutoffHour, $cutoffMinute);
        if ($now > $finalCutoff) {
            $overstayNights++;
            $overstayDates[] = $actualDate->format('Y-m-d');
        } elseif ($now > $finalGraceEnd) {
            $applyLateFee = true;
        }
    }

    // Charges already posted by an earlier confirmed attempt (for example
    // one that then failed the balance check) are deducted, so the preview
    // and a retry never double-count or re-prompt for them. The idempotency
    // keys are the single source of truth for "already posted".
    $postedKeys = [];
    if ($overstayNights > 0 || $applyLateFee) {
        $keyParams = [];
        $keyPlaceholders = [];
        if ($applyLateFee) {
            $keyParams[] = 'late-checkout:' . $stayId . ':' . $plannedCheckout;
            $keyPlaceholders[] = '?';
        }
        foreach ($overstayDates as $date) {
            $keyParams[] = 'overstay:' . $stayId . ':' . $date;
            $keyPlaceholders[] = '?';
        }
        $postedQuery = $pdo->prepare('SELECT idempotency_key FROM charges WHERE folio_id = ? AND idempotency_key IN (' . implode(',', $keyPlaceholders) . ')');
        $postedQuery->execute(array_merge([$folioId], $keyParams));
        $postedKeys = $postedQuery->fetchAll(PDO::FETCH_COLUMN) ?: [];
    }
    if ($applyLateFee && in_array('late-checkout:' . $stayId . ':' . $plannedCheckout, $postedKeys, true)) {
        $applyLateFee = false;
        $zero['notes'][] = 'Late fee already posted on an earlier checkout attempt.';
    }
    if ($overstayNights > 0) {
        $remainingDates = [];
        foreach ($overstayDates as $date) {
            if (!in_array('overstay:' . $stayId . ':' . $date, $postedKeys, true)) {
                $remainingDates[] = $date;
            }
        }
        if (count($remainingDates) !== count($overstayDates)) {
            $zero['notes'][] = 'Overstay nights already posted on an earlier checkout attempt are not charged again.';
        }
        $overstayDates = $remainingDates;
        $overstayNights = count($remainingDates);
    }

    $lines = [];
    $lateFeeAmount = 0.0;
    if ($applyLateFee && !$hasManualLate && $lateFee > 0) {
        $lateFeeAmount = $lateFee;
        $lines[] = 'Late checkout fee — scheduled ' . $scheduled->format('g:i A') . ', checked out ' . $now->format('g:i A') . ' (' . rtrim(rtrim(number_format($settings['fee_percent'], 2, '.', ''), '0'), '.') . '% nightly rate)';
    }
    $overstayAmount = round($overstayNights * $nightlyRate, 2);
    foreach ($overstayDates as $date) {
        $lines[] = 'Overstay night — ' . $date;
    }
    $zero['late_fee_amount'] = $lateFeeAmount;
    $zero['overstay_nights'] = $overstayNights;
    $zero['overstay_dates'] = $overstayDates;
    $zero['overstay_amount'] = $overstayAmount;
    $zero['total_auto_amount'] = round($lateFeeAmount + $overstayAmount, 2);
    $zero['lines'] = $lines;
    return $zero;
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
