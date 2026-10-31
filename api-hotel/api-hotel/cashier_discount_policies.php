<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/discount_policy_helpers.php';

if (!in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', ['GET', 'HEAD'], true)) {
    out(['error' => 'Method not allowed'], 405);
}

$user = require_user();
$role = strtolower(trim(str_replace([' ', '_', '-'], '', (string)($user['role'] ?? ''))));
if (!in_array($role, ['admin', 'manager', 'cashier'], true)) {
    out(['error' => 'Permission denied'], 403);
}

try {
    hotel_ensure_cashier_discount_policies($pdo);
    $q = $pdo->query("SELECT id, name, category, discount_type, discount_value, applies_to, starts_at, expires_at, min_amount, max_discount, combinable, requires_manager FROM discount_policies WHERE active=1 AND (starts_at IS NULL OR starts_at<=NOW()) AND (expires_at IS NULL OR expires_at>=NOW()) ORDER BY name");
    out(['discounts' => $q->fetchAll()]);
} catch (Throwable $e) {
    out(['error' => 'Could not load discount policies. ' . $e->getMessage()], 500);
}
