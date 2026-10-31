<?php
declare(strict_types=1);

function hotel_cashier_discount_rules(): array
{
    return [
        'SENIOR_CITIZEN' => ['name' => 'Senior citizen', 'min' => 20, 'max' => 20, 'eligibility' => true],
        'PWD' => ['name' => 'PWD', 'min' => 20, 'max' => 20, 'eligibility' => true],
        'EARLY_BOOKING' => ['name' => 'Early-bird booking', 'min' => 5, 'max' => 15],
        'LONG_STAY' => ['name' => 'Long-stay guest', 'min' => 10, 'max' => 20],
        'GROUP' => ['name' => 'Group booking', 'min' => 5, 'max' => 15],
        'LOYALTY' => ['name' => 'Loyalty / returning guest', 'min' => 5, 'max' => 10],
        'WALK_IN' => ['name' => 'Walk-in promotion', 'min' => 5, 'max' => 10],
        'BIRTHDAY' => ['name' => 'Birthday promotion', 'min' => 5, 'max' => 10],
        'EMPLOYEE' => ['name' => 'Employee discount', 'min' => 10, 'max' => 30],
        'CORPORATE' => ['name' => 'Corporate / partner rate', 'min' => 5, 'max' => 15],
        'OFF_SEASON' => ['name' => 'Off-season promotion', 'min' => 10, 'max' => 25],
    ];
}

function hotel_ensure_cashier_discount_policies(PDO $pdo): void
{
    $rules = hotel_cashier_discount_rules();
    $find = $pdo->prepare("SELECT id FROM discount_policies WHERE name=? AND category=? AND applies_to='ROOM' LIMIT 1");
    $nextIdQuery = $pdo->prepare('SELECT COALESCE(MAX(id), 0) + 1 FROM discount_policies');
    $insert = $pdo->prepare("INSERT INTO discount_policies(id, name, category, discount_type, discount_value, applies_to, min_amount, max_discount, combinable, requires_manager, active, created_by) VALUES(?, ?, ?, 'PERCENT', ?, 'ROOM', 0, NULL, 0, 0, 1, ?)");
    $lockName = 'hotel_discount_presets:' . substr(hash('sha256', (string)$pdo->query('SELECT DATABASE()')->fetchColumn()), 0, 32);
    $lock = $pdo->prepare('SELECT GET_LOCK(?, 5)');
    $lock->execute([$lockName]);
    if ((int)$lock->fetchColumn() !== 1) {
        throw new RuntimeException('Could not lock cashier discount presets for initialization.');
    }

    try {
        foreach ($rules as $category => $rule) {
            $find->execute([$rule['name'], $category]);
            if ($find->fetchColumn() !== false) {
                continue;
            }
            $nextIdQuery->execute();
            $nextId = (int)$nextIdQuery->fetchColumn();
            $insert->execute([$nextId, $rule['name'], $category, $rule['min'], null]);
        }
    } finally {
        $release = $pdo->prepare('SELECT RELEASE_LOCK(?)');
        $release->execute([$lockName]);
    }
}
