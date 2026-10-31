<?php
declare(strict_types=1);

function htl_money_cents(mixed $value): int
{
    if (is_float($value)) {
        if (!is_finite($value)) {
            throw new InvalidArgumentException('Money amount must be finite.');
        }
        $value = number_format($value, 2, '.', '');
    }

    $value = trim((string)$value);
    if (!preg_match('/\A(-?)(\d+)(?:\.(\d{1,2}))?\z/', $value, $matches)) {
        throw new InvalidArgumentException('Money amount must have no more than two decimal places.');
    }

    $cents = ((int)$matches[2] * 100) + (int)str_pad($matches[3] ?? '', 2, '0');
    return ($matches[1] ?? '') === '-' ? -$cents : $cents;
}

function htl_vat_rate_basis_points(PDO $pdo): int
{
    $query = $pdo->prepare("SELECT policy_value FROM billing_policies WHERE policy_key='VAT_RATE' LIMIT 1");
    $query->execute();
    $value = $query->fetchColumn();
    if ($value === false) {
        return 1200;
    }
    return htl_vat_rate_value_to_basis_points($value);
}

function htl_vat_rate_value_to_basis_points(mixed $value): int
{
    if (!is_numeric($value)) {
        throw new RuntimeException('The configured VAT rate is invalid.');
    }

    $rate = (float)$value;
    if ($rate > 0 && $rate < 1) {
        $rate *= 100;
    }
    if (!is_finite($rate) || $rate < 0 || $rate > 100) {
        throw new RuntimeException('The configured VAT rate must be between 0% and 100%.');
    }
    return (int)round($rate * 100, 0, PHP_ROUND_HALF_UP);
}

function htl_vat_rate_fraction(PDO $pdo): float
{
    return htl_vat_rate_basis_points($pdo) / 10000;
}

function htl_vat_rate_percent(PDO $pdo): float
{
    return htl_vat_rate_basis_points($pdo) / 100;
}

function htl_vat_extract_cents(int $inclusiveCents, int $rateBasisPoints): array
{
    $inclusiveCents = max(0, $inclusiveCents);
    $denominator = 10000 + $rateBasisPoints;
    if ($denominator <= 0) {
        throw new InvalidArgumentException('VAT rate must be zero or greater.');
    }

    $vatableSalesCents = intdiv(($inclusiveCents * 10000) + intdiv($denominator, 2), $denominator);
    $vatCents = $inclusiveCents - $vatableSalesCents;
    return [
        'vatable_sales_cents' => $vatableSalesCents,
        'vat_amount_cents' => $vatCents,
        'total_amount_cents' => $inclusiveCents,
    ];
}

function htl_vat_inclusive_breakdown(array $charges, array $discounts, int $rateBasisPoints): array
{
    $chargeTotal = 0;
    $roomCharges = 0;
    foreach ($charges as $charge) {
        $amount = htl_money_cents($charge['amount'] ?? 0);
        $chargeTotal += $amount;
        if (strtoupper((string)($charge['category'] ?? '')) === 'ROOM') {
            $roomCharges += $amount;
        }
    }

    $discountTotal = 0;
    $taxExemptDiscounts = 0;
    foreach ($discounts as $discount) {
        if (isset($discount['status']) && !in_array($discount['status'], ['APPLIED', 'APPROVED'], true)) {
            continue;
        }
        $amount = max(0, htl_money_cents($discount['amount'] ?? 0));
        $discountTotal += $amount;
        if (in_array(strtoupper((string)($discount['category'] ?? '')), ['SENIOR_CITIZEN', 'PWD'], true)) {
            $taxExemptDiscounts += $amount;
        }
    }

    if ($taxExemptDiscounts > 0) {
        $exemptRoomGross = min(max(0, $roomCharges), max(0, $chargeTotal));
        $exemptRoomSales = htl_vat_extract_cents($exemptRoomGross, $rateBasisPoints)['vatable_sales_cents'];
        $taxableInclusive = max(0, $chargeTotal - $exemptRoomGross - max(0, $discountTotal - $taxExemptDiscounts));
        $taxExemptSales = max(0, $exemptRoomSales - $taxExemptDiscounts);
    } else {
        $taxableInclusive = max(0, $chargeTotal - $discountTotal);
        $taxExemptSales = 0;
    }

    $taxableBreakdown = htl_vat_extract_cents($taxableInclusive, $rateBasisPoints);
    $totalAmount = $taxableInclusive + $taxExemptSales;

    return [
        'charges_total_cents' => $chargeTotal,
        'room_charges_cents' => $roomCharges,
        'discount_total_cents' => $discountTotal,
        'taxable_inclusive_cents' => $taxableInclusive,
        'vatable_sales_cents' => $taxableBreakdown['vatable_sales_cents'],
        'vat_amount_cents' => $taxableBreakdown['vat_amount_cents'],
        'vat_exempt_sales_cents' => $taxExemptSales,
        'total_amount_cents' => $totalAmount,
        'vat_rate_basis_points' => $rateBasisPoints,
    ];
}

function htl_folio_vat_breakdown(PDO $pdo, int $folioId): array
{
    $chargesQuery = $pdo->prepare('SELECT category, amount FROM charges WHERE folio_id=? ORDER BY id');
    $chargesQuery->execute([$folioId]);
    $discountsQuery = $pdo->prepare("SELECT category, amount, status FROM applied_discounts WHERE folio_id=? AND status IN ('APPLIED','APPROVED') ORDER BY id");
    $discountsQuery->execute([$folioId]);

    return htl_vat_inclusive_breakdown(
        $chargesQuery->fetchAll(PDO::FETCH_ASSOC),
        $discountsQuery->fetchAll(PDO::FETCH_ASSOC),
        htl_vat_rate_basis_points($pdo)
    );
}

function htl_payment_vat_allocation(array $breakdown, int $paidBeforeCents, int $paymentCents): array
{
    $billCents = max(0, (int)$breakdown['total_amount_cents']);
    $paidBeforeCents = min($billCents, max(0, $paidBeforeCents));
    $paidAfterCents = min($billCents, $paidBeforeCents + max(0, $paymentCents));
    $appliedCents = $paidAfterCents - $paidBeforeCents;
    if ($billCents === 0 || $appliedCents === 0) {
        return [
            'amount_paid_cents' => 0,
            'vatable_sales_cents' => 0,
            'vat_amount_cents' => 0,
            'vat_exempt_sales_cents' => 0,
            'outstanding_balance_cents' => max(0, $billCents - $paidAfterCents),
        ];
    }

    $components = [
        'vatable_sales_cents' => (int)$breakdown['vatable_sales_cents'],
        'vat_amount_cents' => (int)$breakdown['vat_amount_cents'],
        'vat_exempt_sales_cents' => (int)$breakdown['vat_exempt_sales_cents'],
    ];
    $allocateCumulative = static function (int $cumulativeCents) use ($billCents, $components): array {
        $allocations = [];
        $remainders = [];
        $allocatedCents = 0;
        $index = 0;
        foreach ($components as $key => $componentCents) {
            $numerator = $componentCents * $cumulativeCents;
            $allocations[$key] = intdiv($numerator, $billCents);
            $allocatedCents += $allocations[$key];
            $remainders[] = ['key' => $key, 'remainder' => $numerator % $billCents, 'index' => $index++];
        }
        usort($remainders, static fn(array $left, array $right): int =>
            ($right['remainder'] <=> $left['remainder']) ?: ($left['index'] <=> $right['index'])
        );
        $remainingCents = $cumulativeCents - $allocatedCents;
        for ($i = 0; $i < $remainingCents; $i++) {
            $allocations[$remainders[$i]['key']]++;
        }
        return $allocations;
    };
    $beforeAllocation = $allocateCumulative($paidBeforeCents);
    $afterAllocation = $allocateCumulative($paidAfterCents);
    $vatableSalesCents = $afterAllocation['vatable_sales_cents'] - $beforeAllocation['vatable_sales_cents'];
    $vatCents = $afterAllocation['vat_amount_cents'] - $beforeAllocation['vat_amount_cents'];
    $exemptSalesCents = $afterAllocation['vat_exempt_sales_cents'] - $beforeAllocation['vat_exempt_sales_cents'];

    return [
        'amount_paid_cents' => $appliedCents,
        'vatable_sales_cents' => $vatableSalesCents,
        'vat_amount_cents' => $vatCents,
        'vat_exempt_sales_cents' => $exemptSalesCents,
        'outstanding_balance_cents' => max(0, $billCents - $paidAfterCents),
    ];
}

function htl_group_checkin_payment_allocation(array $dueAmountsCents, array $requiredAmountsCents, int $receivedCents): array
{
    if (count($dueAmountsCents) !== count($requiredAmountsCents)) {
        throw new InvalidArgumentException('Group payment due and required amounts must match.');
    }

    $dueAmountsCents = array_map(static fn($amount): int => max(0, (int)$amount), array_values($dueAmountsCents));
    $requiredAmountsCents = array_map(
        static fn($amount, $index): int => min($dueAmountsCents[$index], max(0, (int)$amount)),
        array_values($requiredAmountsCents),
        array_keys(array_values($requiredAmountsCents))
    );
    $requiredTotalCents = array_sum($requiredAmountsCents);
    if ($receivedCents < $requiredTotalCents) {
        throw new RuntimeException('Received amount is below the group required amount.');
    }

    $totalDueCents = array_sum($dueAmountsCents);
    $appliedTotalCents = min(max(0, $receivedCents), $totalDueCents);
    $allocations = $requiredAmountsCents;
    $remainingCents = $appliedTotalCents - array_sum($allocations);
    foreach ($allocations as $index => $allocatedCents) {
        if ($remainingCents <= 0) break;
        $extraCents = min($remainingCents, $dueAmountsCents[$index] - $allocatedCents);
        $allocations[$index] += $extraCents;
        $remainingCents -= $extraCents;
    }

    return [
        'allocations_cents' => $allocations,
        'required_total_cents' => $requiredTotalCents,
        'total_due_cents' => $totalDueCents,
        'amount_paid_cents' => $appliedTotalCents,
        'change_cents' => max(0, $receivedCents - $appliedTotalCents),
    ];
}

function htl_checkout_vat_snapshot(array $record): array
{
    $totalCents = max(0, htl_money_cents($record['final_amount'] ?? 0));
    $vatCents = max(0, htl_money_cents($record['vat_amount'] ?? 0));
    $exemptSalesCents = array_key_exists('vat_exempt_sales', $record) && $record['vat_exempt_sales'] !== null
        ? max(0, htl_money_cents($record['vat_exempt_sales']))
        : 0;
    $exemptSalesCents = min($totalCents, $exemptSalesCents);
    $vatCents = min(max(0, $totalCents - $exemptSalesCents), $vatCents);

    return [
        'vatable_sales_cents' => $totalCents - $vatCents - $exemptSalesCents,
        'vat_amount_cents' => $vatCents,
        'vat_exempt_sales_cents' => $exemptSalesCents,
        'total_amount_cents' => $totalCents,
    ];
}

function htl_vat_money_fields(array $breakdown): array
{
    $fields = [];
    foreach ($breakdown as $key => $value) {
        if (str_ends_with($key, '_cents')) {
            $fields[substr($key, 0, -6)] = number_format($value / 100, 2, '.', '');
        }
    }
    return $fields;
}
