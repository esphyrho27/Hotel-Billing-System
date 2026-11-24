<?php
declare(strict_types=1);

$pdo = new PDO("mysql:host=127.0.0.1;dbname=hotel_billing_system;charset=utf8mb4", "root", "", [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
]);

echo "Starting migration...\n";

// 1. audit_logs enhancements
$auditCols = $pdo->query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='audit_logs'")->fetchAll(PDO::FETCH_COLUMN);
$auditColsMap = array_flip(array_map('strtolower', $auditCols));

if (!isset($auditColsMap['user_name'])) {
    $pdo->exec("ALTER TABLE audit_logs ADD COLUMN user_name VARCHAR(80) NULL AFTER user_id");
    echo "- Added user_name to audit_logs\n";
}
if (!isset($auditColsMap['user_role'])) {
    $pdo->exec("ALTER TABLE audit_logs ADD COLUMN user_role VARCHAR(50) NULL AFTER user_name");
    echo "- Added user_role to audit_logs\n";
}
if (!isset($auditColsMap['module'])) {
    $pdo->exec("ALTER TABLE audit_logs ADD COLUMN module VARCHAR(80) NULL AFTER action");
    echo "- Added module to audit_logs\n";
}
if (!isset($auditColsMap['old_value'])) {
    $pdo->exec("ALTER TABLE audit_logs ADD COLUMN old_value LONGTEXT NULL AFTER details");
    echo "- Added old_value to audit_logs\n";
}
if (!isset($auditColsMap['new_value'])) {
    $pdo->exec("ALTER TABLE audit_logs ADD COLUMN new_value LONGTEXT NULL AFTER old_value");
    echo "- Added new_value to audit_logs\n";
}

// Backfill existing audit_logs user_name and user_role from users table where null
$pdo->exec("UPDATE audit_logs a JOIN users u ON u.id = a.user_id SET a.user_name = COALESCE(a.user_name, u.username), a.user_role = COALESCE(a.user_role, u.role), a.module = COALESCE(a.module, a.entity_type) WHERE a.user_name IS NULL OR a.user_role IS NULL OR a.module IS NULL");
echo "- Backfilled existing audit_logs user_name, user_role, and module\n";

// 2. restaurant_orders cancellation columns
$roCols = $pdo->query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='restaurant_orders'")->fetchAll(PDO::FETCH_COLUMN);
$roColsMap = array_flip(array_map('strtolower', $roCols));

if (!isset($roColsMap['cancelled_at'])) {
    $pdo->exec("ALTER TABLE restaurant_orders ADD COLUMN cancelled_at DATETIME NULL AFTER completed_at");
    echo "- Added cancelled_at to restaurant_orders\n";
}
if (!isset($roColsMap['cancelled_by'])) {
    $pdo->exec("ALTER TABLE restaurant_orders ADD COLUMN cancelled_by BIGINT UNSIGNED NULL AFTER cancelled_at");
    echo "- Added cancelled_by to restaurant_orders\n";
}
if (!isset($roColsMap['cancellation_reason'])) {
    $pdo->exec("ALTER TABLE restaurant_orders ADD COLUMN cancellation_reason VARCHAR(255) NULL AFTER cancelled_by");
    echo "- Added cancellation_reason to restaurant_orders\n";
}

// 3. charges subcategory and updated_at
$chargesCols = $pdo->query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='charges'")->fetchAll(PDO::FETCH_COLUMN);
$chargesColsMap = array_flip(array_map('strtolower', $chargesCols));

// Also loosen category column from strict enum to varchar(100) if needed
$catType = $pdo->query("SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='charges' AND COLUMN_NAME='category'")->fetchColumn();
if (stripos($catType, 'enum') !== false) {
    $pdo->exec("ALTER TABLE charges MODIFY COLUMN category VARCHAR(100) NOT NULL DEFAULT 'OTHER'");
    echo "- Modified charges.category to VARCHAR(100)\n";
}

if (!isset($chargesColsMap['subcategory'])) {
    $pdo->exec("ALTER TABLE charges ADD COLUMN subcategory VARCHAR(120) NULL AFTER category");
    echo "- Added subcategory to charges\n";
}
if (!isset($chargesColsMap['updated_at'])) {
    $pdo->exec("ALTER TABLE charges ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at");
    echo "- Added updated_at to charges\n";
}

// 4. charge_categories repair / ensure AUTO_INCREMENT primary key
$ccCols = $pdo->query("SELECT COLUMN_TYPE, EXTRA, COLUMN_KEY FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='charge_categories' AND COLUMN_NAME='charge_category_id'")->fetch(PDO::FETCH_ASSOC);
if ($ccCols && stripos($ccCols['EXTRA'], 'auto_increment') === false) {
    $pdo->exec("ALTER TABLE charge_categories MODIFY COLUMN charge_category_id INT NOT NULL AUTO_INCREMENT");
    echo "- Added AUTO_INCREMENT to charge_categories.charge_category_id\n";
}

// 5. charge_subcategories table
$pdo->exec("CREATE TABLE IF NOT EXISTS charge_subcategories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category_id INT NOT NULL,
    subcategory_name VARCHAR(120) NOT NULL,
    default_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    description TEXT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_category_id (category_id),
    UNIQUE KEY uq_cat_subcat (category_id, subcategory_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
echo "- Ensured charge_subcategories table\n";

// Seed default charge categories if empty
$catCount = (int)$pdo->query("SELECT COUNT(*) FROM charge_categories")->fetchColumn();
if ($catCount === 0) {
    $seedCats = [
        'Damages' => [
            'desc' => 'Charges for damages to hotel property and room items',
            'subcategories' => [
                ['name' => 'Broken Glass', 'price' => 200.00, 'desc' => 'Broken drinking glasses, mirrors, or window panes'],
                ['name' => 'Damaged Furniture', 'price' => 2500.00, 'desc' => 'Damaged chairs, tables, bedframes, or sofas'],
                ['name' => 'Stained Bedsheets', 'price' => 500.00, 'desc' => 'Permanently stained or burned linens and bedsheets'],
                ['name' => 'Damaged Appliances', 'price' => 3000.00, 'desc' => 'Damaged television, air conditioner, electric kettle, or refrigerator'],
                ['name' => 'Damaged Doors or Cabinets', 'price' => 1500.00, 'desc' => 'Damaged wardrobe, closet, or room doors'],
            ]
        ],
        'Additional Services' => [
            'desc' => 'Hotel guest additional services and conveniences',
            'subcategories' => [
                ['name' => 'Laundry', 'price' => 150.00, 'desc' => 'Guest laundry, washing and pressing service'],
                ['name' => 'Room Service', 'price' => 100.00, 'desc' => 'Dedicated room delivery and hospitality service'],
                ['name' => 'Other Services', 'price' => 200.00, 'desc' => 'Special concierge, printing, or amenity assistance'],
            ]
        ],
        'Other Charges' => [
            'desc' => 'Miscellaneous and general charges',
            'subcategories' => [
                ['name' => 'Miscellaneous Charges', 'price' => 100.00, 'desc' => 'Other authorized hotel fees and charges'],
            ]
        ]
    ];

    $insCat = $pdo->prepare("INSERT INTO charge_categories (category_name, description, is_active) VALUES (?, ?, 1)");
    $insSub = $pdo->prepare("INSERT INTO charge_subcategories (category_id, subcategory_name, default_price, description, is_active) VALUES (?, ?, ?, ?, 1)");

    foreach ($seedCats as $cName => $cData) {
        $insCat->execute([$cName, $cData['desc']]);
        $cId = (int)$pdo->lastInsertId();
        foreach ($cData['subcategories'] as $sub) {
            $insSub->execute([$cId, $sub['name'], $sub['price'], $sub['desc']]);
        }
    }
    echo "- Seeded default charge categories and subcategories\n";
}

// 6. damage_reports photo_url
$drCols = $pdo->query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='damage_reports'")->fetchAll(PDO::FETCH_COLUMN);
$drColsMap = array_flip(array_map('strtolower', $drCols));

if (!isset($drColsMap['photo_url'])) {
    $pdo->exec("ALTER TABLE damage_reports ADD COLUMN photo_url VARCHAR(255) NULL AFTER reference");
    echo "- Added photo_url to damage_reports\n";
}

echo "Migration completed successfully!\n";
