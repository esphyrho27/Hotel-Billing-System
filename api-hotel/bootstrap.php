<?php
declare(strict_types=1);

/**
 * Hotel Billing System - Core Application Bootstrap
 * Configures secure PHP sessions, security headers, database access, authentication helpers,
 * real-time WebSocket event dispatching, rate limiting, and audit logging.
 */

// 0. Load .env file (check current dir first, then parent) — simple KEY=VALUE parser, no dependencies
(static function (): void {
    $envFile = is_file(__DIR__ . '/.env') ? __DIR__ . '/.env' : dirname(__DIR__) . '/.env';
    if (!is_file($envFile)) return;
    $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) continue;
        if (!str_contains($line, '=')) continue;
        [$key, $val] = explode('=', $line, 2);
        $key = trim($key);
        $val = trim($val);
        if ($key === '') continue;
        // Only set if not already defined in the real environment
        if (getenv($key) === false) {
            putenv("$key=$val");
            $_ENV[$key] = $val;
        }
    }
})();

// 1. Session & Cookie Security Configuration
ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
ini_set('session.use_trans_sid', '0');
ini_set('session.gc_maxlifetime', '1800');

$sessionSecure = getenv('HOTEL_SESSION_SECURE') === '1'
    || (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');

session_set_cookie_params([
    'lifetime' => 0,
    'path'     => '/',
    'secure'   => $sessionSecure,
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

// 2. Global Timezone & Security Headers
date_default_timezone_set(getenv('HOTEL_TIMEZONE') ?: 'Asia/Manila');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('X-Frame-Options: DENY');
header('Cache-Control: no-store');

// 3. Database Connection & Role-Based Access Control Setup
require __DIR__ . '/connection-pdo.php';
require __DIR__ . '/authorization.php';
$pdo = $conn;

// 4. Initial Administrator Auto-Provisioning (One-time bootstrap)
try {
    if ((int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn() === 0) {
        $username = trim((string)getenv('HOTEL_BOOTSTRAP_ADMIN_USERNAME'));
        $password = (string)getenv('HOTEL_BOOTSTRAP_ADMIN_PASSWORD');
        if (!preg_match('/^[A-Za-z0-9_.-]{3,80}$/', $username) || strlen($password) < 6) {
            http_response_code(503);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['error' => 'No staff accounts are configured. Set a valid username and a one-time administrator password of at least 6 characters before first use.']);
            exit;
        }
        $seed = $pdo->prepare('INSERT INTO users(username,password_hash,role) VALUES(?,?,?)');
        $seed->execute([$username, password_hash($password, PASSWORD_DEFAULT), 'admin']);
        putenv('HOTEL_BOOTSTRAP_ADMIN_PASSWORD');
    }
} catch (Throwable $error) {
    http_response_code(503);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'The staff account store is unavailable.']);
    exit;
}

// ============================================================================
// REQUEST & RESPONSE UTILITIES
// ============================================================================

/**
 * Reads and decodes incoming JSON from the request body.
 * Falls back to $_POST for standard form submissions.
 *
 * @return array Decoded key-value request parameters.
 */
function json_input(): array {
    $raw = file_get_contents('php://input');
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : $_POST;
}

/**
 * Sends a structured JSON HTTP response and terminates script execution.
 *
 * @param mixed $data Data payload to encode as JSON.
 * @param int $status HTTP status code (defaults to 200 OK).
 */
function out($data, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_SLASHES);
    exit;
}

/**
 * Broadcasts an event to the local WebSocket server bridge (port 8086).
 * The WebSocket server then pushes the event in real time to connected browsers.
 *
 * @param string $event Event identifier (e.g. REQUEST_CREATED, ROOM_STATUS_CHANGED).
 * @param array $data Event payload data.
 * @param string|null $targetRole Specific role allowed to receive the event.
 * @param string|null $targetDept Specific department allowed to receive the event.
 * @param string|null $targetStay Specific stay code for guest-facing events.
 * @param bool $isPublic Whether this event should broadcast to all connected clients.
 */
function ws_broadcast(string $event, array $data, ?string $targetRole = null, ?string $targetDept = null, ?string $targetStay = null, bool $isPublic = false): void {
    try {
        $payload = json_encode([
            'event'      => $event,
            'data'       => $data,
            'targetRole' => $targetRole,
            'targetDept' => $targetDept,
            'targetStay' => $targetStay,
            'isPublic'   => $isPublic
        ], JSON_UNESCAPED_SLASHES);
        $ctx = stream_context_create([
            'http' => [
                'method'  => 'POST',
                'header'  => "Content-Type: application/json\r\n",
                'content' => $payload,
                'timeout' => 0.5
            ]
        ]);
        @file_get_contents('http://127.0.0.1:8086/broadcast', false, $ctx);
    } catch (Throwable $e) {
        // Silently continue if WebSocket daemon is temporarily unreachable
    }
}

// ============================================================================
// AUTHENTICATION & SESSION MANAGEMENT
// ============================================================================

/**
 * Completely clears the current user session and invalidates the session cookie.
 */
function clear_session(): void {
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires'  => time() - 42000,
            'path'     => $params['path'],
            'domain'   => $params['domain'],
            'secure'   => $params['secure'],
            'httponly' => $params['httponly'],
            'samesite' => $params['samesite'] ?? 'Lax',
        ]);
    }
    session_destroy();
}

/**
 * Ensures a valid staff member is signed in.
 * Verifies active session timeout (30 minutes), account active status, and session version.
 *
 * @return array Authenticated user session data.
 */
function require_user(): array {
    global $pdo;
    if (empty($_SESSION['user']['id'])) {
        out(['error' => 'Sign in required'], 401);
    }
    if (isset($_SESSION['_last_activity']) && $_SESSION['_last_activity'] < time() - 1800) {
        clear_session();
        out(['error' => 'Session expired. Sign in again.'], 401);
    }
    $q = $pdo->prepare('SELECT id,username,role,active,session_version FROM users WHERE id=?');
    $q->execute([(int)$_SESSION['user']['id']]);
    $user = $q->fetch();
    if (!$user || !(int)$user['active']) {
        clear_session();
        out(['error' => 'Sign in required'], 401);
    }
    if (!isset($_SESSION['_session_version']) || (int)$_SESSION['_session_version'] !== (int)$user['session_version']) {
        clear_session();
        out(['error' => 'Session expired. Sign in again.'], 401);
    }
    $_SESSION['user'] = [
        'id'       => (int)$user['id'],
        'username' => $user['username'],
        'role'     => $user['role'],
    ];
    $_SESSION['_last_activity'] = time();
    return $_SESSION['user'];
}

/**
 * Checks whether the logged-in user possesses a specific permission.
 * Rejects unauthorized requests with HTTP 403 Forbidden.
 *
 * @param string $permission Required permission key (e.g. 'stays.checkout').
 * @return array Authenticated user session data.
 */
function require_permission(string $permission): array {
    $user = require_user();
    if (!hotel_user_can($user, $permission)) {
        out(['error' => 'Permission denied'], 403);
    }
    return $user;
}

/**
 * Ensures the signed-in user belongs to one of the authorized roles,
 * or possesses an authorized fallback permission.
 *
 * @param array $roles List of authorized role names (e.g. ['manager', 'frontdesk']).
 * @param string|null $fallbackPermission Optional fallback permission to verify.
 * @return array Authenticated user session data.
 */
function require_role(array $roles, ?string $fallbackPermission = null): array {
    global $action, $pdo;
    $user = require_user();
    $userRole = strtolower(trim(str_replace([' ', '_', '-'], '', (string)($user['role'] ?? ''))));
    if ($userRole === 'admin') {
        return $user;
    }
    $normalizedRoles = array_map(fn($r) => strtolower(trim(str_replace([' ', '_', '-'], '', $r))), $roles);
    if (in_array($userRole, $normalizedRoles, true)) {
        return $user;
    }
    $perm = $fallbackPermission ?? (isset($action, HOTEL_ACTION_PERMISSIONS[$action]) ? HOTEL_ACTION_PERMISSIONS[$action] : null);
    if ($perm && hotel_user_can($user, $perm, $pdo)) {
        return $user;
    }
    out(['error' => 'Permission denied'], 403);
    return $user;
}

// ============================================================================
// BRUTE-FORCE PROTECTION & RATE LIMITING
// ============================================================================

/**
 * Derives a secure SHA-256 attempt key from a username and client IP address.
 *
 * @param string $username Sign-in username.
 * @return string Hashed attempt key.
 */
function login_attempt_key(string $username): string {
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    return hash('sha256', strtolower(trim($username)) . "\0" . $ip);
}

/**
 * Determines whether the given login attempt key is currently locked out.
 *
 * @param PDO $db Database connection handle.
 * @param string $key Hashed attempt key.
 * @return bool True if currently rate-limited, false otherwise.
 */
function login_is_rate_limited(PDO $db, string $key): bool {
    $q = $db->prepare('SELECT locked_until>NOW() FROM auth_login_attempts WHERE attempt_key=?');
    $q->execute([$key]);
    return (bool)$q->fetchColumn();
}

/**
 * Records a failed sign-in attempt and enforces a 15-minute lockout after 5 consecutive failures.
 *
 * @param PDO $db Database connection handle.
 * @param string $key Hashed attempt key.
 * @return bool True if the attempt count has reached or exceeded 5.
 */
function record_login_failure(PDO $db, string $key): bool {
    $db->beginTransaction();
    try {
        $q = $db->prepare(
            'INSERT IGNORE INTO auth_login_attempts(attempt_key,attempts,window_started_at)
             VALUES(?,0,NOW())'
        );
        $q->execute([$key]);
        $q = $db->prepare(
            'SELECT attempts,window_started_at,window_started_at<=DATE_SUB(NOW(),INTERVAL 15 MINUTE) expired
             FROM auth_login_attempts WHERE attempt_key=? FOR UPDATE'
        );
        $q->execute([$key]);
        $row = $q->fetch();
        $attempts = !$row || (int)$row['expired'] ? 1 : (int)$row['attempts'] + 1;
        $q = $db->prepare(
            'INSERT INTO auth_login_attempts(attempt_key,attempts,window_started_at,locked_until)
             VALUES(?,?,NOW(),IF(? >= 5,DATE_ADD(NOW(),INTERVAL 15 MINUTE),NULL))
             ON DUPLICATE KEY UPDATE
               attempts=VALUES(attempts),
               window_started_at=IF(VALUES(attempts)=1,NOW(),window_started_at),
               locked_until=VALUES(locked_until)'
        );
        $q->execute([$key, $attempts, $attempts]);
        $db->commit();
        return $attempts >= 5;
    } catch (Throwable $error) {
        $db->rollBack();
        throw $error;
    }
}

/**
 * Clears failed sign-in attempt records upon a successful authentication.
 *
 * @param PDO $db Database connection handle.
 * @param string $key Hashed attempt key.
 */
function clear_login_failures(PDO $db, string $key): void {
    $q = $db->prepare('DELETE FROM auth_login_attempts WHERE attempt_key=?');
    $q->execute([$key]);
}

// ============================================================================
// AUDIT LOGGING & FORMATTING
// ============================================================================

/**
 * Writes an immutable audit trail entry to the database.
 * Tracks user ID, action type, entity type, entity ID, metadata details, and client IP.
 *
 * @param PDO $db Database connection handle.
 * @param int|null $uid ID of the user performing the action (null for guests or system).
 * @param string $action Action identifier (e.g. CHECKOUT, LOGIN, ROOM_TRANSFER).
 * @param string $type Target entity name (e.g. 'stay', 'folio', 'user').
 * @param int|null $id Target entity primary key.
 * @param array $details Additional context and changed attributes.
 */
/**
 * Self-healing schema guard for the money tables. Older local databases
 * (created from early SQL dumps) can miss columns the current billing code
 * writes to; add whatever is missing so payments and discounts never fail
 * with "unknown column" errors. Runs at most once per request.
 */
function htl_ensure_billing_schema(PDO $pdo): void {
    static $done = false;
    if ($done) return;
    $done = true;
    try {
        $cols = [];
        $q = $pdo->query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments'");
        foreach ($q->fetchAll(PDO::FETCH_COLUMN) as $c) $cols[strtolower((string)$c)] = true;
        if ($cols) {
            $want = [
                'received_amount' => "ADD COLUMN received_amount DECIMAL(12,2) NOT NULL DEFAULT 0",
                'change_amount'   => "ADD COLUMN change_amount DECIMAL(12,2) NOT NULL DEFAULT 0",
                'reference_note'  => "ADD COLUMN reference_note VARCHAR(120) NULL",
                'idempotency_key' => "ADD COLUMN idempotency_key CHAR(64) NULL",
                'idempotency_part'=> "ADD COLUMN idempotency_part SMALLINT UNSIGNED NULL",
            ];
            foreach ($want as $name => $ddl) {
                if (!isset($cols[$name])) {
                    try { $pdo->exec("ALTER TABLE payments $ddl"); } catch (Throwable $e) { /* another request may have added it */ }
                }
            }
        }
        $t = $pdo->query("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='applied_discounts'")->fetchColumn();
        if (!$t) {
            $pdo->exec("CREATE TABLE IF NOT EXISTS applied_discounts (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, folio_id BIGINT UNSIGNED NOT NULL, policy_id BIGINT UNSIGNED NULL, name VARCHAR(120) NOT NULL, category VARCHAR(40) NOT NULL DEFAULT 'PROMOTIONAL', discount_type ENUM('PERCENT','FIXED') NOT NULL DEFAULT 'FIXED', discount_value DECIMAL(12,2) NOT NULL DEFAULT 0, amount DECIMAL(12,2) NOT NULL DEFAULT 0, status ENUM('PENDING','APPROVED','REJECTED','APPLIED','VOID') NOT NULL DEFAULT 'APPLIED', reason VARCHAR(255) NULL, applied_by BIGINT UNSIGNED NULL, approved_by BIGINT UNSIGNED NULL, approved_at DATETIME NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX(folio_id,status)) ENGINE=InnoDB");
        }
        // The approve/pay flows read completed refunds unguarded; databases
        // built from partial dumps may not have the refund tables at all,
        // which fails approvals with SQLSTATE 42S02 (table doesn't exist).
        $t = $pdo->query("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='refunds'")->fetchColumn();
        if (!$t) {
            try { $pdo->exec("CREATE TABLE IF NOT EXISTS refunds (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, folio_id BIGINT UNSIGNED NOT NULL, payment_id BIGINT UNSIGNED NOT NULL, refund_number VARCHAR(32) NOT NULL UNIQUE, amount DECIMAL(12,2) NOT NULL, method ENUM('CASH','CARD','GCASH','BANK_TRANSFER','MAYA','QR_PH','OTHER') NOT NULL, reason VARCHAR(500) NOT NULL, transaction_reference VARCHAR(120) NULL, status ENUM('REQUESTED','APPROVED','PROCESSING','COMPLETED','REJECTED','FAILED') NOT NULL DEFAULT 'REQUESTED', requested_by BIGINT UNSIGNED NULL, approved_by BIGINT UNSIGNED NULL, approved_at DATETIME NULL, processed_by BIGINT UNSIGNED NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, completed_at DATETIME NULL, INDEX(folio_id,status), INDEX(payment_id,status)) ENGINE=InnoDB"); } catch (Throwable $e) { /* fail-safe */ }
        }
        $t = $pdo->query("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='refund_transactions'")->fetchColumn();
        if (!$t) {
            try { $pdo->exec("CREATE TABLE IF NOT EXISTS refund_transactions (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, refund_id BIGINT UNSIGNED NOT NULL, attempt_number INT UNSIGNED NOT NULL, provider VARCHAR(40) NOT NULL DEFAULT 'MANUAL', transaction_reference VARCHAR(120) NULL, status ENUM('PROCESSING','COMPLETED','FAILED') NOT NULL, amount DECIMAL(12,2) NOT NULL, result_message VARCHAR(500) NULL, processed_by BIGINT UNSIGNED NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_refund_attempt(refund_id,attempt_number), INDEX idx_refund_tx_reference(transaction_reference)) ENGINE=InnoDB"); } catch (Throwable $e) { /* fail-safe */ }
        }
    } catch (Throwable $e) {
        // Never block a payment because the schema guard itself failed.
    }
}

/**
 * Self-healing schema guard for the restaurant / department tables added by
 * the Restaurant Dashboard feature (menu_categories, menu_items,
 * restaurant_orders, restaurant_order_items, department_inventory).
 * Databases built from the original dump do not have these tables at all;
 * the guest portal and the restaurant/department API actions query them
 * directly, so a missing table fails the whole portal page with
 * SQLSTATE 42S02. Create whatever is missing (and add the settlement
 * columns to restaurant_orders when an older seeded table lacks them).
 * Runs at most once per request and never throws.
 */
function htl_ensure_restaurant_schema(PDO $pdo): void {
    static $done = false;
    if ($done) return;
    $done = true;
    try {
        $exists = function (string $table) use ($pdo): bool {
            $q = $pdo->prepare("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?");
            $q->execute([$table]);
            return (bool)$q->fetchColumn();
        };
        if (!$exists('menu_categories')) {
            try { $pdo->exec("CREATE TABLE IF NOT EXISTS menu_categories (id INT AUTO_INCREMENT PRIMARY KEY, category_name VARCHAR(100) NOT NULL UNIQUE, menu_type ENUM('Food','Drinks') NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"); } catch (Throwable $e) { /* fail-safe */ }
        }
        if (!$exists('menu_items')) {
            try { $pdo->exec("CREATE TABLE IF NOT EXISTS menu_items (id INT AUTO_INCREMENT PRIMARY KEY, category_id INT NOT NULL, item_name VARCHAR(150) NOT NULL, description TEXT NULL, price DECIMAL(10,2) NOT NULL DEFAULT 0.00, image_path VARCHAR(255) NULL, availability_status ENUM('Available','Unavailable') DEFAULT 'Available', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY uq_cat_item (category_id, item_name)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"); } catch (Throwable $e) { /* fail-safe */ }
        }
        if (!$exists('restaurant_orders')) {
            try { $pdo->exec("CREATE TABLE IF NOT EXISTS restaurant_orders (id INT AUTO_INCREMENT PRIMARY KEY, order_code VARCHAR(32) NOT NULL UNIQUE, customer_id BIGINT UNSIGNED NULL, stay_id BIGINT UNSIGNED NULL, room_number VARCHAR(20) NULL, order_type VARCHAR(50) DEFAULT 'Room Service', notes TEXT NULL, total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00, order_status ENUM('Pending','Confirmed','Preparing','Ready for Serving','Served','Completed','Cancelled') DEFAULT 'Pending', payment_status ENUM('Unpaid','Billed to Room','Paid') DEFAULT 'Billed to Room', payment_method VARCHAR(40) NULL, paid_amount DECIMAL(10,2) NULL, payment_reference VARCHAR(120) NULL, paid_at DATETIME NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_stay (stay_id), INDEX idx_status (order_status), INDEX idx_customer (customer_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"); } catch (Throwable $e) { /* fail-safe */ }
        } else {
            // Tables created by the earlier seed script lack the settlement
            // columns that restaurant_order_pay writes to.
            try {
                $cols = [];
                $q = $pdo->query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='restaurant_orders'");
                foreach ($q->fetchAll(PDO::FETCH_COLUMN) as $c) $cols[strtolower((string)$c)] = true;
                $want = [
                    'payment_method'    => "ADD COLUMN payment_method VARCHAR(40) NULL",
                    'paid_amount'       => "ADD COLUMN paid_amount DECIMAL(10,2) NULL",
                    'payment_reference' => "ADD COLUMN payment_reference VARCHAR(120) NULL",
                    'paid_at'           => "ADD COLUMN paid_at DATETIME NULL",
                ];
                foreach ($want as $name => $ddl) {
                    if (!isset($cols[$name])) {
                        try { $pdo->exec("ALTER TABLE restaurant_orders $ddl"); } catch (Throwable $e) { /* another request may have added it */ }
                    }
                }
            } catch (Throwable $e) { /* fail-safe */ }
        }
        if (!$exists('restaurant_order_items')) {
            try { $pdo->exec("CREATE TABLE IF NOT EXISTS restaurant_order_items (id INT AUTO_INCREMENT PRIMARY KEY, order_id INT NOT NULL, item_id INT NOT NULL, item_name VARCHAR(150) NOT NULL, category_name VARCHAR(100) NULL, quantity INT NOT NULL DEFAULT 1, unit_price DECIMAL(10,2) NOT NULL, subtotal DECIMAL(10,2) NOT NULL, INDEX idx_order (order_id), INDEX idx_item (item_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"); } catch (Throwable $e) { /* fail-safe */ }
        }
        // The catalog/restaurant code reads and writes service_catalog
        // .subcategory and .item_type, which databases from the original
        // dump do not have; every catalog save and the guest portal menu
        // query fail with "Unknown column 'subcategory'" without them.
        try {
            $cols = [];
            $q = $pdo->query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='service_catalog'");
            foreach ($q->fetchAll(PDO::FETCH_COLUMN) as $c) $cols[strtolower((string)$c)] = true;
            if ($cols && !isset($cols['subcategory'])) {
                try { $pdo->exec("ALTER TABLE service_catalog ADD COLUMN subcategory VARCHAR(120) NULL"); } catch (Throwable $e) { /* another request may have added it */ }
            }
            if ($cols && !isset($cols['item_type'])) {
                try { $pdo->exec("ALTER TABLE service_catalog ADD COLUMN item_type VARCHAR(20) NOT NULL DEFAULT 'FOOD'"); } catch (Throwable $e) { /* another request may have added it */ }
            }
        } catch (Throwable $e) { /* fail-safe */ }
        if (!$exists('menu_item_categories')) {
            try { $pdo->exec("CREATE TABLE IF NOT EXISTS menu_item_categories (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(120) NOT NULL, department VARCHAR(50) NOT NULL DEFAULT 'restaurant', type VARCHAR(20) NOT NULL DEFAULT 'FOOD', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_dept_name (department, name)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"); } catch (Throwable $e) { /* fail-safe */ }
        }
        if (!$exists('department_inventory')) {
            try { $pdo->exec("CREATE TABLE IF NOT EXISTS department_inventory (id INT AUTO_INCREMENT PRIMARY KEY, department VARCHAR(40) NOT NULL, item_name VARCHAR(120) NOT NULL, category VARCHAR(80) NOT NULL DEFAULT 'General', quantity INT NOT NULL DEFAULT 0, unit VARCHAR(20) NOT NULL DEFAULT 'pcs', reorder_level INT NOT NULL DEFAULT 5, cost_price DECIMAL(10,2) NOT NULL DEFAULT 0.00, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_department (department)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"); } catch (Throwable $e) { /* fail-safe */ }
        }
    } catch (Throwable $e) {
        // Never block a page because the schema guard itself failed.
    }
}

function audit(PDO $db, ?int $uid, string $action, string $type, ?int $id, array $details = []): void {
    $s = $db->prepare('INSERT INTO audit_logs(user_id,action,entity_type,entity_id,details,ip_address) VALUES(?,?,?,?,?,?)');
    $s->execute([$uid, $action, $type, $id, json_encode($details), $_SERVER['REMOTE_ADDR'] ?? null]);
}

/**
 * Formats a monetary number into a standard 2-decimal string representation.
 *
 * @param mixed $v Numeric or string monetary amount.
 * @return string Formatted amount (e.g. "1250.00").
 */
function money($v): string {
    return number_format((float)$v, 2, '.', '');
}
