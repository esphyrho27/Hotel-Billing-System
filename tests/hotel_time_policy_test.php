<?php
declare(strict_types=1);

putenv('HOTEL_TIMEZONE=Asia/Manila');
require __DIR__ . '/../api-hotel/hotel_time_policy.php';

$timezone = new DateTimeZone('Asia/Manila');
$assert = static function (bool $condition, string $message): void {
    if (!$condition) {
        throw new RuntimeException($message);
    }
};

putenv('HOTEL_ENV=development');
putenv('HOTEL_DEMO_MODE=1');
$assert(hotel_demo_mode_enabled(), 'Demo Mode must require an explicit development/demo environment and server flag.');
putenv('HOTEL_DEMO_MODE=0');
$assert(!hotel_demo_mode_enabled(), 'Demo Mode must remain disabled unless the server flag is explicitly enabled.');
putenv('HOTEL_DEMO_MODE=1');
$simulatedAt = hotel_parse_simulated_time('2026-10-29T14:00');
$assert($simulatedAt->format('Y-m-d H:i:s') === '2026-10-29 14:00:00', 'Simulated time must use the configured hotel timezone and exact minute.');
$invalidClockRejected = false;
try {
    hotel_parse_simulated_time('2026-02-30T14:00');
} catch (InvalidArgumentException) {
    $invalidClockRejected = true;
}
$assert($invalidClockRejected, 'Invalid calendar dates must be rejected for the simulated clock.');
putenv('HOTEL_ENV=production');
$assert(!hotel_demo_mode_enabled(), 'Production must never use the simulated clock.');

$assert(!hotel_checkin_is_open(new DateTimeImmutable('2026-10-29 13:59:59', $timezone)), 'Check-in must be blocked before 2:00 PM.');
$assert(hotel_checkin_is_open(new DateTimeImmutable('2026-10-29 14:00:00', $timezone)), 'Check-in must open at 2:00 PM exactly.');
$assert(hotel_checkin_is_open(new DateTimeImmutable('2026-10-29 14:00:01', $timezone)), 'Check-in must remain open after 2:00 PM.');

$checkinAt = new DateTimeImmutable('2026-10-29 14:00:00', $timezone);
$exception = [
    'status' => 'FINALIZED',
    'request_type' => 'EARLY_CHECKOUT',
    'policy' => 'MANAGER_EXCEPTION',
    'requested_departure_at' => '2026-10-30 10:00:00',
    'requested_by' => 7,
    'approved_by' => 8,
    'approved_at' => '2026-10-29 15:00:00',
];

$assert(!hotel_checkout_is_allowed('2026-10-30', new DateTimeImmutable('2026-10-29 12:00:00', $timezone)), 'Checkout must be blocked before the scheduled date.');
$assert(!hotel_checkout_is_allowed('2026-10-30', new DateTimeImmutable('2026-10-30 11:59:59', $timezone)), 'Checkout must be blocked before scheduled noon.');
$assert(hotel_checkout_is_allowed('2026-10-30', new DateTimeImmutable('2026-10-30 12:00:00', $timezone)), 'Normal checkout must open at noon exactly.');
$assert(!hotel_checkout_is_allowed('2026-10-30', new DateTimeImmutable('2026-10-30 09:59:59', $timezone), $exception, $checkinAt), 'An approved exception must not allow departure before its approved time.');
$assert(hotel_checkout_is_allowed('2026-10-30', new DateTimeImmutable('2026-10-30 10:00:00', $timezone), $exception, $checkinAt), 'A valid exception must allow departure at its approved time.');

$sameApprover = $exception;
$sameApprover['approved_by'] = $sameApprover['requested_by'];
$assert(!hotel_checkout_is_allowed('2026-10-30', new DateTimeImmutable('2026-10-30 10:00:00', $timezone), $sameApprover, $checkinAt), 'The requester must not approve their own exception.');
$unfinalized = $exception;
$unfinalized['status'] = 'APPROVED';
$assert(!hotel_checkout_is_allowed('2026-10-30', new DateTimeImmutable('2026-10-30 10:00:00', $timezone), $unfinalized, $checkinAt), 'An exception must be finalized before it authorizes checkout.');
$wrongPolicy = $exception;
$wrongPolicy['policy'] = 'PRORATED_HOURLY';
$assert(!hotel_checkout_is_allowed('2026-10-30', new DateTimeImmutable('2026-10-30 10:00:00', $timezone), $wrongPolicy, $checkinAt), 'Billing policies must not authorize early checkout.');

echo "Hotel time policy tests passed.\n";
