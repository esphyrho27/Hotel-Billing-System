<?php
declare(strict_types=1);

require __DIR__ . '/../api-hotel/vat_service.php';

$assert = static function (bool $condition, string $message): void {
    if (!$condition) {
        throw new RuntimeException($message);
    }
};

$assert(htl_vat_rate_value_to_basis_points('12') === 1200, 'VAT policy values stored as percentages must be supported.');
$assert(htl_vat_rate_value_to_basis_points('0.12') === 1200, 'Legacy fractional VAT policy values must remain supported.');

$singleRoom = htl_vat_inclusive_breakdown(
    [['category' => 'ROOM', 'amount' => '5000.00']],
    [],
    1200
);
$assert($singleRoom['vatable_sales_cents'] === 446429, '₱5,000 VAT-inclusive room rate must produce ₱4,464.29 VATable sales.');
$assert($singleRoom['vat_amount_cents'] === 53571, '₱5,000 VAT-inclusive room rate must produce ₱535.71 VAT.');
$assert($singleRoom['total_amount_cents'] === 500000, 'VAT must not be added to the VAT-inclusive room rate.');

$multipleRooms = htl_vat_inclusive_breakdown(
    [
        ['category' => 'ROOM', 'amount' => '5000.00'],
        ['category' => 'ROOM', 'amount' => '5000.00'],
    ],
    [],
    1200
);
$assert($multipleRooms['total_amount_cents'] === 1000000, 'Multiple rooms must remain VAT-inclusive.');
$assert($multipleRooms['vat_amount_cents'] === 107143, 'VAT must be extracted once from the combined multi-room total.');

$multipleNights = htl_vat_inclusive_breakdown(
    [['category' => 'ROOM', 'amount' => '15000.00']],
    [],
    1200
);
$assert($multipleNights['total_amount_cents'] === 1500000, 'Multiple nights must multiply the inclusive nightly rate without adding VAT.');
$assert($multipleNights['vat_amount_cents'] === 160714, 'VAT must be extracted from the multi-night inclusive total.');

$discounted = htl_vat_inclusive_breakdown(
    [['category' => 'ROOM', 'amount' => '5000.00']],
    [['category' => 'PROMOTIONAL', 'amount' => '500.00', 'status' => 'APPLIED']],
    1200
);
$assert($discounted['total_amount_cents'] === 450000, 'Promotional discounts must reduce the VAT-inclusive amount before extraction.');
$assert($discounted['vat_amount_cents'] === 48214, 'VAT must be extracted after a promotional discount.');

$seniorDiscount = htl_vat_inclusive_breakdown(
    [['category' => 'ROOM', 'amount' => '5000.00']],
    [['category' => 'SENIOR_CITIZEN', 'amount' => '892.86', 'status' => 'APPLIED']],
    1200
);
$assert($seniorDiscount['vatable_sales_cents'] === 0, 'Qualified senior-discount room sales must be VAT-exempt.');
$assert($seniorDiscount['vat_amount_cents'] === 0, 'Qualified senior-discount room sales must not include VAT.');
$assert($seniorDiscount['vat_exempt_sales_cents'] === 357143, 'Senior discount must be applied to VAT-exclusive sales.');
$assert($seniorDiscount['total_amount_cents'] === 357143, 'Senior-discount total must exclude embedded VAT and the discount.');

$checkinSeniorDiscount = htl_vat_inclusive_breakdown(
    [['category' => 'ROOM', 'amount' => '1500.00']],
    [['category' => 'SENIOR_CITIZEN', 'amount' => '267.86', 'status' => 'APPLIED']],
    1200
);
$assert($checkinSeniorDiscount['total_amount_cents'] === 107143, 'A ₱1,500 check-in room bill with the 20% senior discount must require ₱1,071.43.');
$assert($checkinSeniorDiscount['vat_amount_cents'] === 0, 'A senior-discounted check-in bill must not retain embedded VAT.');

$firstPayment = htl_payment_vat_allocation($singleRoom, 0, 250000);
$secondPayment = htl_payment_vat_allocation($singleRoom, 250000, 250000);
$assert($firstPayment['amount_paid_cents'] === 250000 && $secondPayment['amount_paid_cents'] === 250000, 'Partial payments must retain their applied amounts.');
$assert($firstPayment['vat_amount_cents'] + $secondPayment['vat_amount_cents'] === $singleRoom['vat_amount_cents'], 'Partial payment receipts must allocate VAT once across the full bill.');
$assert($firstPayment['outstanding_balance_cents'] === 250000 && $secondPayment['outstanding_balance_cents'] === 0, 'Partial payment balances must reconcile.');

$groupFullPayment = htl_group_checkin_payment_allocation(
    [107143, 280000],
    [107143, 280000],
    400000
);
$assert($groupFullPayment['allocations_cents'] === [107143, 280000], 'A group payment must allocate the full due to each room folio.');
$assert($groupFullPayment['amount_paid_cents'] === 387143 && $groupFullPayment['change_cents'] === 12857, 'Group cash overpayment must be returned as change without over-crediting room folios.');

$groupDownpayment = htl_group_checkin_payment_allocation(
    [1000000, 2000000],
    [600000, 1200000],
    2100000
);
$assert($groupDownpayment['allocations_cents'] === [900000, 1200000], 'Group downpayments must satisfy every room requirement before distributing extra payment.');

$groupPartialExtra = htl_group_checkin_payment_allocation([100, 200], [60, 120], 250);
$assert($groupPartialExtra['allocations_cents'] === [100, 150], 'Additional group payment must be applied deterministically without exceeding a room folio due.');
$belowGroupMinimumRejected = false;
try {
    htl_group_checkin_payment_allocation([1000, 2000], [600, 1200], 1799);
} catch (RuntimeException) {
    $belowGroupMinimumRejected = true;
}
$assert($belowGroupMinimumRejected, 'Group payment allocation must reject tender below the combined room requirements.');

$roundingBreakdown = [
    'total_amount_cents' => 2,
    'vatable_sales_cents' => 1,
    'vat_amount_cents' => 1,
    'vat_exempt_sales_cents' => 0,
];
$roundingFirstPayment = htl_payment_vat_allocation($roundingBreakdown, 0, 1);
$roundingSecondPayment = htl_payment_vat_allocation($roundingBreakdown, 1, 1);
$assert(
    $roundingFirstPayment['vatable_sales_cents'] + $roundingFirstPayment['vat_amount_cents'] === 1
        && $roundingSecondPayment['vatable_sales_cents'] + $roundingSecondPayment['vat_amount_cents'] === 1,
    'One-cent partial receipts must keep allocated tax components equal to the amount paid.'
);
$assert(
    $roundingFirstPayment['vat_amount_cents'] + $roundingSecondPayment['vat_amount_cents'] === 1,
    'Partial receipt rounding must allocate the full VAT amount exactly once.'
);

$checkoutSnapshot = htl_checkout_vat_snapshot([
    'final_amount' => '5000.00',
    'vat_amount' => '535.71',
    'vat_exempt_sales' => '0.00',
]);
$assert($checkoutSnapshot['vatable_sales_cents'] === 446429, 'Checkout VAT reports must use the tax snapshot, not the current VAT setting.');
$legacyCheckoutSnapshot = htl_checkout_vat_snapshot([
    'final_amount' => '5600.00',
    'vat_amount' => '600.00',
    'vat_exempt_sales' => null,
]);
$assert($legacyCheckoutSnapshot['vatable_sales_cents'] === 500000, 'Legacy checkout reports must preserve the amount recorded at checkout.');

echo "VAT service tests passed.\n";
