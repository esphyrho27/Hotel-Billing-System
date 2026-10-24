<?php
/**
 * Hotel Billing System - Primary API Controller & Route Dispatcher
 *
 * Handles HTTP requests, enforces role-based access control (RBAC),
 * processes business workflows, manages billing transactions, and
 * coordinates real-time WebSocket event broadcasts.
 */

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$in = json_input();
$action = (string)($in['action'] ?? $_GET['action'] ?? '');

// ============================================================================
// SYSTEM CONFIGURATION & HELPER FUNCTIONS
// ============================================================================

/**
 * Retrieves the configured VAT rate from billing policies or defaults to 12% (0.12).
 *
 * @param PDO $pdo Active database connection
 * @return float VAT rate as a decimal (e.g. 0.12)
 */
function htl103_vat_rate(PDO $pdo): float {
    try {
        $q = $pdo->prepare("SELECT policy_value FROM billing_policies WHERE policy_key='VAT_RATE' LIMIT 1");
        $q->execute();
        $value = $q->fetchColumn();
        if ($value !== false && is_numeric($value)) {
            $rate = (float)$value;
            if ($rate <= 0 || $rate > 100) {
                return 0.12;
            }
            if ($rate <= 1) {
                $rate *= 100;
            }
            return $rate / 100;
        }
    } catch (Throwable $e) {
        // Fallback to documented 12% statutory VAT rate if table does not exist
    }
    return 0.12;
}

/**
 * Ensures the check-in payment queue table exists. The table is created lazily
 * so the FOR PAYMENT workflow works immediately after deployment without a
 * separate migration step; database/migrations/001_checkin_payments.sql
 * carries the same DDL for fresh installs.
 */
function htl_ensure_checkin_payments(PDO $pdo): void {
    static $done = false;
    if ($done) return;

    $tableExists = $pdo->query("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='checkin_payments'")->fetchColumn();
    if (!(int)$tableExists) {
        throw new RuntimeException('Database schema is incomplete. Import database/fresh_install.sql before using check-in payments.');
    }

    $required = ['stay_id', 'folio_id', 'status', 'confirmed_by', 'confirmed_at', 'gross_amount', 'discount_amount', 'discount_type', 'discount_reason', 'balance_amount'];
    $q = $pdo->prepare("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='checkin_payments'");
    $q->execute();
    $present = array_flip($q->fetchAll(PDO::FETCH_COLUMN));
    $missing = array_values(array_diff($required, array_keys($present)));
    if ($missing) {
        throw new RuntimeException('Database schema is outdated. Missing checkin_payments columns: ' . implode(', ', $missing) . '. Rebuild the development database from database/fresh_install.sql.');
    }

    $statusType = (string)$pdo->query("SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='stays' AND COLUMN_NAME='status'")->fetchColumn();
    if (stripos($statusType, 'PENDING_PAYMENT') === false) {
        throw new RuntimeException("Database schema is outdated: stays.status must support PENDING_PAYMENT. Import database/fresh_install.sql into the fresh development database.");
    }
    $done = true;
}

// ============================================================================
// AUTHENTICATION & SESSION MANAGEMENT
// ============================================================================

/**
 * Authenticates user credentials, applies brute-force rate-limiting,
 * seeds session data with permissions and modules, and generates CSRF token.
 */
if ($action === 'login') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        out(['error' => 'Method not allowed'], 405);
    }

    $username = trim((string)($in['username'] ?? ''));
    $password = (string)($in['password'] ?? '');
    $attemptKey = login_attempt_key($username);

    if (login_is_rate_limited($pdo, $attemptKey)) {
        header('Retry-After: 900');
        out(['error' => 'Too many login attempts. Try again in 15 minutes.'], 429);
    }

    $q = $pdo->prepare('SELECT id, username, password_hash, role, session_version FROM users WHERE username=? AND active=1');
    $q->execute([$username]);
    $row = $q->fetch();

    if (!$row || !password_verify($password, $row['password_hash'])) {
        if (record_login_failure($pdo, $attemptKey)) {
            header('Retry-After: 900');
            out(['error' => 'Too many login attempts. Try again in 15 minutes.'], 429);
        }
        out(['error' => 'Invalid username or password'], 401);
    }

    clear_login_failures($pdo, $attemptKey);
    session_regenerate_id(true);

    $_SESSION['user'] = [
        'id' => (int)$row['id'],
        'username' => $row['username'],
        'role' => $row['role'],
        'permissions' => hotel_get_role_permissions($row['role'], $pdo),
        'allowed_modules' => hotel_get_allowed_modules_for_role($row['role'], $pdo)
    ];
    $_SESSION['_session_version'] = (int)$row['session_version'];
    $_SESSION['_last_activity'] = time();
    $_SESSION['csrf'] = bin2hex(random_bytes(32));

    audit($pdo, (int)$row['id'], 'LOGIN', 'user', (int)$row['id']);
    out(['user' => $_SESSION['user'], 'csrf' => $_SESSION['csrf']]);
}

/**
 * Terminates user session, clears server session storage, and invalidates session cookies.
 */
if ($action === 'logout') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        out(['error' => 'Method not allowed'], 405);
    }
    if (!empty($_SESSION['user']) && (empty($_SESSION['csrf']) || !hash_equals($_SESSION['csrf'], (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')))) {
        out(['error' => 'Security token expired. Refresh and try again.'], 403);
    }
    clear_session();
    out(['ok' => true]);
}

/**
 * Checks the current active session and returns authenticated user details, permissions, and CSRF token.
 */
if ($action === 'session') {
    if (!in_array($_SERVER['REQUEST_METHOD'], ['GET', 'HEAD'], true)) {
        out(['error' => 'Method not allowed'], 405);
    }
    $user = empty($_SESSION['user']) ? null : require_user();
    if ($user) {
        $user['permissions'] = hotel_get_role_permissions($user['role'], $pdo);
        $user['allowed_modules'] = hotel_get_allowed_modules_for_role($user['role'], $pdo);
    }
    out(['user' => $user, 'csrf' => $user ? ($_SESSION['csrf'] ?? null) : null]);
}

// ============================================================================
// ACCESS CONTROL & CSRF VERIFICATION
// ============================================================================

$readActions = [
    'dashboard', 'rooms', 'room_types', 'service_catalog', 'active_stays',
    'requests', 'request_history', 'early_checkout_policies', 'early_checkout_requests',
    'discount_policy_admin_list', 'pending_discounts', 'discount_policies', 'refund_list',
    'reports', 'payment_history', 'report_transactions', 'audit_logs', 'users',
    'permissions_get', 'my_permissions', 'checkin_payments', 'pending_checkins',
    'inventory_list', 'menu_categories', 'department_reports',
    'restaurant_dashboard_stats', 'restaurant_menu_list', 'restaurant_orders_list'
];

if (!isset(HOTEL_ACTION_PERMISSIONS[$action])) {
    out(['error' => 'Unknown action'], 404);
}

if (in_array($_SERVER['REQUEST_METHOD'], ['GET', 'HEAD'], true) && !in_array($action, $readActions, true)) {
    out(['error' => 'Method not allowed'], 405);
}

// Enforce role permission requirements
$u = require_permission(HOTEL_ACTION_PERMISSIONS[$action]);

// Verify CSRF token for mutating HTTP requests
if (!in_array($_SERVER['REQUEST_METHOD'], ['GET', 'HEAD'], true)) {
    $csrf = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (empty($_SESSION['csrf']) || !hash_equals($_SESSION['csrf'], $csrf)) {
        out(['error' => 'Security token expired. Refresh and try again.'], 403);
    }
}

// ============================================================================
// USER ACCOUNT & ACCESS CONTROL MANAGEMENT
// ============================================================================

/**
 * Retrieves list of all registered staff accounts for user management.
 */
if ($action === 'users') {
    $q = $pdo->query('SELECT id, username, role, active, created_at FROM users ORDER BY username');
    out(['users' => $q->fetchAll()]);
}

/**
 * Creates or updates a staff user account with role assignment and hashed password.
 */
if ($action === 'user_save') {
    $id = (int)($in['id'] ?? 0);
    $username = trim((string)($in['username'] ?? ''));
    $role = (string)($in['role'] ?? '');
    $password = (string)($in['password'] ?? '');
    $active = isset($in['active']) ? (int)$in['active'] : 1;
    $validRole = preg_match('/^[A-Za-z0-9_.-]{2,50}$/', $role);

    if (!preg_match('/^[A-Za-z0-9_.-]{3,80}$/', $username) || !$validRole || !in_array($active, [0, 1], true) || (($id === 0 || $password !== '') && strlen($password) < 6)) {
        out(['error' => 'Enter a valid username, role, active state, and password of at least 6 characters.'], 400);
    }

    require_permission('roles.assign');

    if ($role === 'admin' && $u['role'] !== 'admin') {
        out(['error' => 'Only an administrator can assign the admin role.'], 403);
    }
    if ($id === (int)$u['id'] && ($role !== $u['role'] || $active === 0 || $password !== '')) {
        out(['error' => 'Use Change Password for your account; you cannot alter your own role or active state.'], 400);
    }

    $pdo->beginTransaction();
    try {
        if ($id === 0) {
            $q = $pdo->prepare('INSERT INTO users(username, password_hash, role, active) VALUES(?, ?, ?, ?)');
            $q->execute([$username, password_hash($password, PASSWORD_DEFAULT), $role, $active]);
            $id = (int)$pdo->lastInsertId();
            $event = 'CREATE_USER';
        } else {
            $q = $pdo->prepare('SELECT id, username, role, active FROM users WHERE id=? FOR UPDATE');
            $q->execute([$id]);
            $target = $q->fetch();
            if (!$target) {
                throw new RuntimeException('User not found.');
            }
            if ($target['role'] === 'admin' && (int)$target['active'] === 1 && ($role !== 'admin' || $active === 0)) {
                $admins = $pdo->query("SELECT id FROM users WHERE role='admin' AND active=1 FOR UPDATE")->fetchAll();
                if (count($admins) <= 1) {
                    throw new RuntimeException('The last active administrator cannot be deactivated or demoted.');
                }
            }
            if ($password !== '') {
                $q = $pdo->prepare('UPDATE users SET username=?, role=?, active=?, password_hash=?, session_version=session_version+1 WHERE id=?');
                $q->execute([$username, $role, $active, password_hash($password, PASSWORD_DEFAULT), $id]);
            } else {
                $q = $pdo->prepare('UPDATE users SET username=?, role=?, active=? WHERE id=?');
                $q->execute([$username, $role, $active, $id]);
            }
            $event = 'UPDATE_USER';
        }
        audit($pdo, (int)$u['id'], $event, 'user', $id, ['username' => $username, 'role' => $role, 'active' => $active]);
        $pdo->commit();
        out(['ok' => true, 'id' => $id]);
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        out(['error' => 'Username already exists or account data is invalid.'], 400);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        out(['error' => $e->getMessage()], 400);
    }
}

/**
 * Deactivates a staff user account preventing future logins.
 */
if ($action === 'user_deactivate') {
    $id = (int)($in['id'] ?? 0);
    if ($id < 1) {
        out(['error' => 'Choose a valid staff account.'], 400);
    }
    if ($id === (int)$u['id']) {
        out(['error' => 'You cannot deactivate your own account.'], 400);
    }
    $pdo->beginTransaction();
    try {
        $q = $pdo->prepare('SELECT username, role, active FROM users WHERE id=? FOR UPDATE');
        $q->execute([$id]);
        $target = $q->fetch();
        if (!$target) {
            throw new RuntimeException('User not found.');
        }
        if ($target['role'] === 'admin' && (int)$target['active'] === 1) {
            $admins = $pdo->query("SELECT id FROM users WHERE role='admin' AND active=1 FOR UPDATE")->fetchAll();
            if (count($admins) <= 1) {
                throw new RuntimeException('The last active administrator cannot be deactivated.');
            }
        }
        $pdo->prepare('UPDATE users SET active=0 WHERE id=?')->execute([$id]);
        audit($pdo, (int)$u['id'], 'DEACTIVATE_USER', 'user', $id);
        $pdo->commit();
        out(['ok' => true]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        out(['error' => $e->getMessage()], 400);
    }
}

/**
 * Retrieves granular permission settings and allowed modules for a given role (Admin only).
 */
if ($action === 'permissions_get') {
    require_role(['admin']);
    $targetRole = strtolower(trim((string)($in['role'] ?? $_GET['role'] ?? 'manager')));
    $allRoles = ['manager', 'frontdesk', 'cashier', 'maintenance', 'housekeeping', 'restaurant', 'bar', 'valet', 'laundry', 'service', 'other'];
    if (!in_array($targetRole, $allRoles, true)) {
        $targetRole = 'manager';
    }
    $rolePermissions = hotel_get_role_permissions($targetRole, $pdo);
    $allowedModules = hotel_get_allowed_modules_for_role($targetRole, $pdo);
    out([
        'roles' => $allRoles,
        'selected_role' => $targetRole,
        'permissions' => $rolePermissions,
        'allowed_modules' => $allowedModules,
        'permission_definitions' => HOTEL_ALL_PERMISSIONS
    ]);
}

/**
 * Saves updated permissions for a user role and broadcasts real-time update (Admin only).
 */
if ($action === 'permissions_save') {
    require_role(['admin']);
    $targetRole = strtolower(trim(str_replace([' ', '_', '-'], '', (string)($in['role'] ?? ''))));
    if (empty($targetRole)) {
        out(['error' => 'Target role is required.'], 400);
    }
    if ($targetRole === 'admin') {
        out(['error' => 'The Administrator role retains full access and cannot be restricted.'], 400);
    }
    $submitted = $in['permissions'] ?? [];
    if (!is_array($submitted)) {
        out(['error' => 'Invalid permissions array format.'], 400);
    }
    $validKeys = array_column(HOTEL_ALL_PERMISSIONS, 'key');
    $newPerms = array_values(array_intersect($submitted, $validKeys));
    if (!in_array('account.password.change', $newPerms, true)) {
        $newPerms[] = 'account.password.change';
    }
    $pdo->beginTransaction();
    try {
        $pdo->prepare('DELETE FROM role_permissions WHERE role = ?')->execute([$targetRole]);
        if (!empty($newPerms)) {
            $ins = $pdo->prepare('INSERT INTO role_permissions (role, permission) VALUES (?, ?)');
            foreach ($newPerms as $p) {
                $ins->execute([$targetRole, $p]);
            }
        }
        audit($pdo, (int)$u['id'], 'UPDATE_ROLE_PERMISSIONS', 'role', 0, [
            'role' => $targetRole,
            'permissions' => $newPerms
        ]);
        $pdo->commit();
        hotel_get_role_permissions($targetRole, $pdo, true);
        $allowedModules = hotel_get_allowed_modules_for_role($targetRole, $pdo);
        ws_broadcast('PERMISSIONS_UPDATED', [
            'role' => $targetRole,
            'permissions' => $newPerms,
            'allowed_modules' => $allowedModules,
            'updated_by' => $u['username'] ?? 'Administrator',
            'actor_id' => (int)$u['id']
        ], null, null, null, true);
        out([
            'ok' => true,
            'message' => "Permissions for role '{$targetRole}' have been successfully saved.",
            'role' => $targetRole,
            'permissions' => $newPerms,
            'allowed_modules' => $allowedModules
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        out(['error' => 'Failed to save permissions: ' . $e->getMessage()], 500);
    }
}

/**
 * Returns permissions and allowed navigation modules for the currently authenticated role.
 */
if ($action === 'my_permissions') {
    $myRole = $u['role'] ?? 'guest';
    out([
        'role' => $myRole,
        'permissions' => hotel_get_role_permissions($myRole, $pdo),
        'allowed_modules' => hotel_get_allowed_modules_for_role($myRole, $pdo)
    ]);
}

// ============================================================================
// OPERATIONAL DASHBOARD & METRICS
// ============================================================================

/**
 * Computes live operational dashboard metrics including room statuses, active stays,
 * open folios, pending department requests, and today's collections.
 */
if ($action === 'dashboard') {
    $counts = [];
    foreach (['AVAILABLE', 'OCCUPIED', 'CLEANING', 'MAINTENANCE'] as $st) {
        $s = $pdo->prepare('SELECT COUNT(*) n FROM rooms WHERE status=?');
        $s->execute([$st]);
        $counts[$st] = (int)$s->fetch()['n'];
    }

    $active = (int)$pdo->query("SELECT COUNT(*) n FROM stays s JOIN folios f ON f.stay_id=s.id WHERE s.status='ACTIVE' AND f.status='OPEN'")->fetch()['n'];

    $open = (float)$pdo->query("SELECT COALESCE(SUM(c.amount),0)-COALESCE((SELECT SUM(p.amount) FROM payments p JOIN folios f2 ON f2.id=p.folio_id WHERE f2.status='OPEN'),0) total FROM charges c JOIN folios f ON f.id=c.folio_id WHERE f.status='OPEN'")->fetch()['total'];

    $_deptTypes = get_role_department_types($u['role']);
    if ($_deptTypes !== null) {
        $_ph = implode(',', array_fill(0, count($_deptTypes), '?'));
        $__q = $pdo->prepare("SELECT COUNT(*) n FROM service_requests WHERE status IN ('NEW','ACCEPTED','IN_PROGRESS') AND service_type IN ({$_ph})");
        $__q->execute($_deptTypes);
        $pending = (int)$__q->fetch()['n'];

        $__q = $pdo->prepare("SELECT COUNT(*) n FROM service_requests WHERE status='NEW' AND service_type IN ({$_ph})");
        $__q->execute($_deptTypes);
        $newRequests = (int)$__q->fetch()['n'];
    } else {
        $pending = (int)$pdo->query("SELECT COUNT(*) n FROM service_requests WHERE status IN ('NEW','PENDING','ACCEPTED','IN_PROGRESS')")->fetch()['n'];
        $newRequests = (int)$pdo->query("SELECT COUNT(*) n FROM service_requests WHERE status IN ('NEW','PENDING')")->fetch()['n'];
    }

    $today = (float)$pdo->query('SELECT COALESCE(SUM(amount),0) total FROM payments WHERE DATE(created_at)=CURDATE()')->fetch()['total'];
    $roomTotal = array_sum($counts);

    $roleKey = strtolower(trim(str_replace([' ', '_', '-'], '', (string)$u['role'])));

    $response = [
        'rooms' => $counts,
        'room_total' => $roomTotal,
        'occupancy_rate' => $roomTotal ? round(($counts['OCCUPIED'] / $roomTotal) * 100, 1) : 0,
        'active_stays' => $active,
        'open_balance' => hotel_user_can($u, 'payments.process', $pdo) ? money(max(0, $open)) : null,
        'pending_requests' => $pending,
        'new_requests' => $newRequests,
        'today_collections' => hotel_user_can($u, 'payments.process', $pdo) ? money($today) : null,
        'role' => $u['role']
    ];

    // Front desk movement block: today's check-ins, departures due, and completed check-outs.
    if (hotel_user_can($u, 'stays.checkin', $pdo)) {
        try {
            $response['frontdesk'] = [
                'checkins_today' => (int)$pdo->query("SELECT COUNT(*) n FROM stays WHERE DATE(checkin_at)=CURDATE()")->fetch()['n'],
                'departures_today' => (int)$pdo->query("SELECT COUNT(*) n FROM stays WHERE status='ACTIVE' AND DATE(planned_checkout)=CURDATE()")->fetch()['n'],
                'checkouts_today' => (int)$pdo->query("SELECT COUNT(*) n FROM stays WHERE DATE(actual_checkout)=CURDATE()")->fetch()['n']
            ];
            htl_ensure_checkin_payments($pdo);
            $response['frontdesk']['pending_payments'] = (int)$pdo->query("SELECT COUNT(*) n FROM checkin_payments WHERE status='FOR_PAYMENT'")->fetch()['n'];
            $response['frontdesk']['payments_to_confirm'] = (int)$pdo->query("SELECT COUNT(*) n FROM checkin_payments WHERE status='APPROVED' AND confirmed_at IS NULL")->fetch()['n'];
        } catch (Throwable $e) {
            // Optional block: core dashboard metrics remain available.
        }
    }

    // Approvals inbox block: pending items for each approval permission the user holds.
    $approvals = [];
    try {
        if (hotel_user_can($u, 'discounts.approve', $pdo)) {
            $approvals['discounts'] = (int)$pdo->query("SELECT COUNT(*) n FROM applied_discounts WHERE status='PENDING'")->fetch()['n'];
        }
        if (hotel_user_can($u, 'early_checkout.approve', $pdo)) {
            $approvals['early_checkouts'] = (int)$pdo->query("SELECT COUNT(*) n FROM early_checkout_requests WHERE status='REQUESTED'")->fetch()['n'];
        }
        if (hotel_user_can($u, 'refunds.approve', $pdo)) {
            $approvals['refunds'] = (int)$pdo->query("SELECT COUNT(*) n FROM refunds WHERE status='REQUESTED'")->fetch()['n'];
        }
        if (hotel_user_can($u, 'payments.process', $pdo) || $roleKey === 'cashier') {
            htl_ensure_checkin_payments($pdo);
            $approvals['checkin_payments'] = (int)$pdo->query("SELECT COUNT(*) n FROM checkin_payments WHERE status='FOR_PAYMENT'")->fetch()['n'];
        }
    } catch (Throwable $e) {
        $approvals = [];
    }
    if ($approvals) {
        $approvals['total'] = array_sum($approvals);
        $response['approvals'] = $approvals;
    }

    // Billing summary block for payment-handling roles (cashier focus).
    if (hotel_user_can($u, 'payments.process', $pdo)) {
        try {
            htl_ensure_checkin_payments($pdo);
            $response['billing_summary'] = [
                'collections_by_method' => $pdo->query("SELECT method, COUNT(*) AS payments_count, COALESCE(SUM(amount),0) AS total FROM payments WHERE DATE(created_at)=CURDATE() GROUP BY method ORDER BY total DESC")->fetchAll(),
                'payments_today' => (int)$pdo->query("SELECT COUNT(*) n FROM payments WHERE DATE(created_at)=CURDATE()")->fetch()['n'],
                'unpaid_folios' => $pdo->query("SELECT folio_number, stay_code, room_number, balance FROM (SELECT f.folio_number AS folio_number, s.stay_code AS stay_code, r.room_number AS room_number, (COALESCE((SELECT SUM(c.amount) FROM charges c WHERE c.folio_id=f.id),0) - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.folio_id=f.id),0)) AS balance FROM folios f JOIN stays s ON s.id=f.stay_id JOIN rooms r ON r.id=s.room_id WHERE f.status='OPEN') open_folios WHERE balance > 0.009 ORDER BY balance DESC LIMIT 5")->fetchAll(),
                'unpaid_folio_count' => (int)$pdo->query("SELECT COUNT(*) n FROM (SELECT f.id AS fid, (COALESCE((SELECT SUM(c.amount) FROM charges c WHERE c.folio_id=f.id),0) - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.folio_id=f.id),0)) AS balance FROM folios f WHERE f.status='OPEN') open_folios WHERE balance > 0.009")->fetch()['n'],
                'refunds_pending' => (int)$pdo->query("SELECT COUNT(*) n FROM refunds WHERE status='REQUESTED'")->fetch()['n'],
                'checkin_payments_pending' => (int)$pdo->query("SELECT COUNT(*) n FROM checkin_payments WHERE status='FOR_PAYMENT'")->fetch()['n'],
                'pending_checkins' => $pdo->query("SELECT cp.*, s.stay_code, s.status AS stay_status, s.guest_count, s.checkin_at, s.planned_checkout, r.room_number, f.folio_number, TRIM(CONCAT_WS(' ', c.first_name, NULLIF(c.middle_name, ''), c.last_name)) AS guest_name, c.contact_number, uc.username AS created_by_name FROM checkin_payments cp JOIN stays s ON s.id=cp.stay_id JOIN rooms r ON r.id=s.room_id JOIN folios f ON f.id=cp.folio_id LEFT JOIN customers c ON c.customer_id=s.customer_id LEFT JOIN users uc ON uc.id=cp.created_by WHERE cp.status='FOR_PAYMENT' ORDER BY cp.created_at DESC")->fetchAll()
            ];
        } catch (Throwable $e) {
            // Optional block: core dashboard metrics remain available.
        }
    }

    // Administrator block: staff accounts and today's audit activity.
    if ($roleKey === 'admin') {
        try {
            $response['admin'] = [
                'staff_active' => (int)$pdo->query("SELECT COUNT(*) n FROM users WHERE active=1")->fetch()['n'],
                'staff_total' => (int)$pdo->query("SELECT COUNT(*) n FROM users")->fetch()['n'],
                'audit_today' => (int)$pdo->query("SELECT COUNT(*) n FROM audit_logs WHERE DATE(created_at)=CURDATE()")->fetch()['n']
            ];
        } catch (Throwable $e) {
            // Optional block: core dashboard metrics remain available.
        }
    }

    // Department block: queue counts filtered to the role's own service types.
    if ($_deptTypes !== null) {
        try {
            $_ph2 = implode(',', array_fill(0, count($_deptTypes), '?'));
            $_q = $pdo->prepare("SELECT COUNT(*) n FROM service_requests WHERE status IN ('NEW','PENDING') AND service_type IN ({$_ph2})");
            $_q->execute($_deptTypes);
            $queueNew = (int)$_q->fetch()['n'];
            $_q = $pdo->prepare("SELECT COUNT(*) n FROM service_requests WHERE status IN ('ASSIGNED','ACKNOWLEDGED','ACCEPTED','IN_PROGRESS','ON_HOLD') AND service_type IN ({$_ph2})");
            $_q->execute($_deptTypes);
            $queueActive = (int)$_q->fetch()['n'];
            $_q = $pdo->prepare("SELECT COUNT(*) n FROM service_requests WHERE status='COMPLETED' AND DATE(fulfilled_at)=CURDATE() AND service_type IN ({$_ph2})");
            $_q->execute($_deptTypes);
            $completedToday = (int)$_q->fetch()['n'];

            $department = [
                'queue_new' => $queueNew,
                'queue_active' => $queueActive,
                'completed_today' => $completedToday
            ];
            if (hotel_user_can($u, 'rooms.view', $pdo)) {
                $department['rooms_attention'] = $pdo->query("SELECT r.room_number, r.status, rt.name AS type FROM rooms r JOIN room_types rt ON rt.id=r.room_type_id WHERE r.status IN ('CLEANING','MAINTENANCE') ORDER BY r.status, r.room_number LIMIT 8")->fetchAll();
            }
            $response['department'] = $department;
        } catch (Throwable $e) {
            // Optional block: core dashboard metrics remain available.
        }
    }

    out($response);
}

// ============================================================================
// ROOM & ROOM TYPE MANAGEMENT
// ============================================================================

/**
 * Retrieves the complete room inventory with room type and rate details.
 */
if ($action === 'rooms') {
    $q = $pdo->query('SELECT r.id, r.room_number, r.room_type_id, r.floor_number, r.status, rt.name AS type, rt.nightly_rate, rt.capacity FROM rooms r JOIN room_types rt ON rt.id=r.room_type_id ORDER BY r.room_number');
    out(['rooms' => $q->fetchAll(), 'vat_rate' => htl103_vat_rate($pdo)]);
}

/**
 * Retrieves all configured room types sorted by rate and name.
 */
if ($action === 'room_types') {
    out(['types' => $pdo->query('SELECT * FROM room_types ORDER BY nightly_rate, name')->fetchAll()]);
}

/**
 * Creates or updates a room type definition and broadcasts changes in real time.
 */
if ($action === 'room_type_save') {
    require_role(['admin', 'manager', 'frontdesk']);
    $id = (int)($in['id'] ?? 0);
    $name = trim((string)($in['name'] ?? ''));
    $rate = round((float)($in['nightly_rate'] ?? 0), 2);
    $capacity = (int)($in['capacity'] ?? 2);

    if ($name === '' || strlen($name) > 80 || $rate < 0 || $capacity < 1 || $capacity > 20) {
        out(['error' => 'Enter a valid room type, nightly rate, and capacity.'], 400);
    }

    try {
        if ($id) {
            $q = $pdo->prepare('UPDATE room_types SET name=?, nightly_rate=?, capacity=? WHERE id=?');
            $q->execute([$name, $rate, $capacity, $id]);
        } else {
            $q = $pdo->prepare('INSERT INTO room_types(name, nightly_rate, capacity) VALUES(?, ?, ?)');
            $q->execute([$name, $rate, $capacity]);
            $id = (int)$pdo->lastInsertId();
        }
        audit($pdo, $u['id'], $in['id'] ? 'UPDATE_ROOM_TYPE' : 'CREATE_ROOM_TYPE', 'room_type', $id, ['name' => $name, 'nightly_rate' => $rate, 'capacity' => $capacity]);
        ws_broadcast('ROOM_TYPE_UPDATED', ['id' => $id, 'name' => $name, 'nightly_rate' => $rate, 'capacity' => $capacity], null, null, null, true);
        out(['ok' => true, 'id' => $id]);
    } catch (PDOException $e) {
        out(['error' => 'Room type name already exists or is in use.'], 400);
    }
}

/**
 * Creates or updates an individual room inventory record with floor auto-validation.
 */
if ($action === 'room_save') {
    // Rooms are created/edited by admin and manager only (owner directive
    // 2026-10-22: Add Room removed for Front Desk). Front desk keeps
    // rooms.view + rooms.status (the status board) via their own actions.
    require_role(['admin', 'manager']);
    $id = (int)($in['id'] ?? 0);
    $number = trim((string)($in['room_number'] ?? ''));
    $type = (int)($in['room_type_id'] ?? 0);
    $floor = (int)($in['floor_number'] ?? 1);

    if (!preg_match('/^[1-9][0-9]{2,3}$/', $number)) {
        out(['error' => 'Use a room number such as 101, 205, or 1204 so the floor can be determined.'], 400);
    }

    $derivedFloor = (int)substr($number, 0, strlen($number) - 2);
    if ($floor !== $derivedFloor) {
        out(['error' => 'Floor mismatch: room ' . $number . ' belongs on floor ' . $derivedFloor . '.'], 400);
    }
    if ($type < 1) {
        out(['error' => 'Choose a valid room type.'], 400);
    }

    $q = $pdo->prepare('SELECT id FROM room_types WHERE id=?');
    $q->execute([$type]);
    if (!$q->fetch()) {
        out(['error' => 'Choose an existing room type.'], 400);
    }

    try {
        if ($id) {
            $check = $pdo->prepare('SELECT status FROM rooms WHERE id=?');
            $check->execute([$id]);
            $current = $check->fetch();
            if (!$current || $current['status'] === 'OCCUPIED') {
                out(['error' => 'Room could not be updated; it may be occupied or no longer exists.'], 400);
            }
            $q = $pdo->prepare("UPDATE rooms SET room_number=?, room_type_id=?, floor_number=? WHERE id=? AND status<>'OCCUPIED'");
            $q->execute([$number, $type, $floor, $id]);
        } else {
            $q = $pdo->prepare('INSERT INTO rooms(room_number, room_type_id, floor_number) VALUES(?, ?, ?)');
            $q->execute([$number, $type, $floor]);
            $id = (int)$pdo->lastInsertId();
        }

        audit($pdo, $u['id'], $in['id'] ? 'UPDATE_ROOM' : 'CREATE_ROOM', 'room', $id, ['room_number' => $number, 'room_type_id' => $type, 'floor_number' => $floor]);
        $rq = $pdo->prepare('SELECT r.id, r.room_number, r.status, rt.name AS type, rt.nightly_rate FROM rooms r JOIN room_types rt ON rt.id=r.room_type_id WHERE r.id=?');
        $rq->execute([$id]);
        $rmInfo = $rq->fetch();
        if ($rmInfo) {
            ws_broadcast('ROOM_STATUS_CHANGED', [
                'room_id' => (int)$rmInfo['id'],
                'room_number' => $rmInfo['room_number'],
                'status' => $rmInfo['status'],
                'type' => $rmInfo['type'],
                'nightly_rate' => (float)$rmInfo['nightly_rate'],
                'is_new' => !$in['id'],
                'actor_id' => (int)$u['id']
            ], null, null, null, true);
        }
        out(['ok' => true, 'id' => $id]);
    } catch (PDOException $e) {
        out(['error' => 'Room number already exists or room data is invalid.'], 400);
    }
}

/**
 * Updates operational room status (AVAILABLE, CLEANING, MAINTENANCE) for unreserved rooms.
 */
if ($action === 'room_status') {
    require_role(['admin', 'manager', 'frontdesk', 'service', 'maintenance', 'housekeeping']);
    $id = (int)($in['room_id'] ?? 0);
    $status = (string)($in['status'] ?? '');

    if (!in_array($status, ['AVAILABLE', 'CLEANING', 'MAINTENANCE'], true)) {
        out(['error' => 'Invalid room status'], 400);
    }

    $q = $pdo->prepare("SELECT COUNT(*) n FROM stays WHERE room_id=? AND status='ACTIVE'");
    $q->execute([$id]);
    if ((int)$q->fetch()['n'] > 0) {
        out(['error' => 'An active stay occupies this room.'], 400);
    }

    $pdo->prepare('UPDATE rooms SET status=? WHERE id=?')->execute([$status, $id]);
    $rq = $pdo->prepare('SELECT r.id, r.room_number, r.status, rt.name AS type, rt.nightly_rate FROM rooms r JOIN room_types rt ON rt.id=r.room_type_id WHERE r.id=?');
    $rq->execute([$id]);
    $rmInfo = $rq->fetch();

    audit($pdo, $u['id'], 'ROOM_STATUS', 'room', $id, ['status' => $status]);
    if ($rmInfo) {
        ws_broadcast('ROOM_STATUS_CHANGED', [
            'room_id' => (int)$rmInfo['id'],
            'room_number' => $rmInfo['room_number'],
            'status' => $rmInfo['status'],
            'type' => $rmInfo['type'],
            'nightly_rate' => (float)$rmInfo['nightly_rate'],
            'updated_by' => $u['username'] ?? 'Staff',
            'actor_id' => (int)$u['id']
        ], null, null, null, true);
    }
    out(['ok' => true]);
}

// ============================================================================
// The restaurant / department actions below (and the inventory, menu and
// department-report actions further down) query tables that older databases
// do not have yet; create them on first use so nothing fails with a
// missing-table error.
if (in_array($action, ['restaurant_dashboard_stats', 'restaurant_menu_list', 'restaurant_item_save', 'restaurant_item_toggle', 'restaurant_category_save', 'restaurant_orders_list', 'restaurant_order_status', 'restaurant_order_pay', 'restaurant_order_create', 'customer_place_order', 'customer_cancel_order', 'inventory_list', 'inventory_save', 'inventory_delete', 'menu_categories', 'menu_category_save', 'menu_category_delete', 'department_reports', 'service_catalog', 'service_catalog_save', 'service_catalog_toggle', 'request_create', 'add_charge'], true)) {
    htl_ensure_restaurant_schema($pdo);
}

// ============================================================================
// RESTAURANT DASHBOARD & CUSTOMER FOOD/DRINK ORDERING SYSTEM
// ============================================================================

/**
 * Returns database-driven statistics for the Restaurant Dashboard.
 */
if ($action === 'restaurant_dashboard_stats') {
    $totalMenuItems = (int)$pdo->query("SELECT COUNT(*) FROM menu_items")->fetchColumn();
    $availableItems = (int)$pdo->query("SELECT COUNT(*) FROM menu_items WHERE availability_status='Available'")->fetchColumn();
    $unavailableItems = (int)$pdo->query("SELECT COUNT(*) FROM menu_items WHERE availability_status='Unavailable'")->fetchColumn();
    $totalOrders = (int)$pdo->query("SELECT COUNT(*) FROM restaurant_orders")->fetchColumn();
    $pendingOrders = (int)$pdo->query("SELECT COUNT(*) FROM restaurant_orders WHERE order_status IN ('Pending','Confirmed','Preparing')")->fetchColumn();
    $completedOrders = (int)$pdo->query("SELECT COUNT(*) FROM restaurant_orders WHERE order_status IN ('Completed','Served')")->fetchColumn();
    $todayOrders = (int)$pdo->query("SELECT COUNT(*) FROM restaurant_orders WHERE DATE(created_at)=CURDATE()")->fetchColumn();
    $todayRevenue = (float)$pdo->query("SELECT COALESCE(SUM(total_amount),0) FROM restaurant_orders WHERE DATE(created_at)=CURDATE() AND order_status!='Cancelled'")->fetchColumn();

    out([
        'stats' => [
            'total_menu_items' => $totalMenuItems,
            'available_items' => $availableItems,
            'unavailable_items' => $unavailableItems,
            'total_orders' => $totalOrders,
            'pending_orders' => $pendingOrders,
            'completed_orders' => $completedOrders,
            'today_orders' => $todayOrders,
            'today_revenue' => $todayRevenue
        ]
    ]);
}

/**
 * Lists categories and menu items with filters for Food and Drinks.
 */
if ($action === 'restaurant_menu_list') {
    $menuType = trim((string)($in['menu_type'] ?? $_GET['menu_type'] ?? 'All'));
    $catId = (int)($in['category_id'] ?? $_GET['category_id'] ?? 0);
    $search = trim((string)($in['search'] ?? $_GET['search'] ?? ''));
    $avail = trim((string)($in['availability'] ?? $_GET['availability'] ?? 'All'));

    // Fetch categories with item counts
    $catQuery = "SELECT c.id, c.category_name, c.menu_type, COUNT(m.id) AS item_count,
                        SUM(CASE WHEN m.availability_status='Available' THEN 1 ELSE 0 END) AS available_count
                 FROM menu_categories c
                 LEFT JOIN menu_items m ON m.category_id=c.id";
    if (in_array($menuType, ['Food', 'Drinks'], true)) {
        $catQuery .= " WHERE c.menu_type=" . $pdo->quote($menuType);
    }
    $catQuery .= " GROUP BY c.id, c.category_name, c.menu_type ORDER BY c.menu_type, c.category_name";
    $cats = $pdo->query($catQuery)->fetchAll(PDO::FETCH_ASSOC);

    // Fetch menu items
    $itemQuery = "SELECT m.id, m.category_id, c.category_name, c.menu_type, m.item_name, m.description,
                         m.price, m.availability_status, m.image_path, m.updated_at
                  FROM menu_items m
                  JOIN menu_categories c ON c.id=m.category_id
                  WHERE 1=1";
    $params = [];

    if (in_array($menuType, ['Food', 'Drinks'], true)) {
        $itemQuery .= " AND c.menu_type=?";
        $params[] = $menuType;
    }
    if ($catId > 0) {
        $itemQuery .= " AND m.category_id=?";
        $params[] = $catId;
    }
    if (in_array($avail, ['Available', 'Unavailable'], true)) {
        $itemQuery .= " AND m.availability_status=?";
        $params[] = $avail;
    }
    if ($search !== '') {
        $itemQuery .= " AND (m.item_name LIKE ? OR m.description LIKE ?)";
        $params[] = '%' . $search . '%';
        $params[] = '%' . $search . '%';
    }
    $itemQuery .= " ORDER BY c.menu_type, c.category_name, m.item_name";

    $stmt = $pdo->prepare($itemQuery);
    $stmt->execute($params);
    $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

    out([
        'categories' => $cats,
        'items' => $items
    ]);
}

/**
 * Creates or updates a restaurant menu item.
 * Strictly restricted to authorized Restaurant Staff.
 * Admin and Manager are prohibited from modifying restaurant items.
 */
if ($action === 'restaurant_item_save') {
    
    $id = (int)($in['id'] ?? 0);
    $catId = (int)($in['category_id'] ?? 0);
    $name = trim((string)($in['item_name'] ?? ''));
    $desc = trim((string)($in['description'] ?? ''));
    $price = round((float)($in['price'] ?? 0), 2);
    $status = (string)($in['availability_status'] ?? 'Available');
    $imagePath = trim((string)($in['image_path'] ?? '')) ?: null;

    if ($name === '' || strlen($name) > 150) {
        out(['error' => 'Item name is required (max 150 characters).'], 400);
    }
    if ($catId <= 0) {
        out(['error' => 'Please select a valid menu category.'], 400);
    }
    if ($price < 0) {
        out(['error' => 'Price cannot be negative.'], 400);
    }
    if (!in_array($status, ['Available', 'Unavailable'], true)) {
        $status = 'Available';
    }

    $cq = $pdo->prepare("SELECT category_name, menu_type FROM menu_categories WHERE id=?");
    $cq->execute([$catId]);
    $catRow = $cq->fetch(PDO::FETCH_ASSOC);
    if (!$catRow) {
        out(['error' => 'Selected category does not exist.'], 400);
    }

    $dupCheck = $pdo->prepare("SELECT id FROM menu_items WHERE category_id=? AND item_name=? AND id!=?");
    $dupCheck->execute([$catId, $name, $id]);
    if ($dupCheck->fetch()) {
        out(['error' => "An item named '{$name}' already exists in this category."], 400);
    }

    if ($id > 0) {
        $stmt = $pdo->prepare("UPDATE menu_items SET category_id=?, item_name=?, description=?, price=?, image_path=?, availability_status=? WHERE id=?");
        $stmt->execute([$catId, $name, $desc, $price, $imagePath, $status, $id]);
    } else {
        $stmt = $pdo->prepare("INSERT INTO menu_items (category_id, item_name, description, price, image_path, availability_status) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([$catId, $name, $desc, $price, $imagePath, $status]);
        $id = (int)$pdo->lastInsertId();
    }

    // Mirror to service_catalog for legacy integration
    $itemTypeCode = ($catRow['menu_type'] === 'Food') ? 'FOOD' : 'DRINK';
    $catCheck = $pdo->prepare("SELECT id FROM service_catalog WHERE name=? AND category='FOOD_BEVERAGE'");
    $catCheck->execute([$name]);
    $scId = $catCheck->fetchColumn();
    $isActiveNum = ($status === 'Available') ? 1 : 0;

    if ($scId) {
        $pdo->prepare("UPDATE service_catalog SET subcategory=?, item_type=?, description=?, price=?, active=? WHERE id=?")
            ->execute([$catRow['category_name'], $itemTypeCode, $desc, $price, $isActiveNum, (int)$scId]);
    } else {
        $pdo->prepare("INSERT INTO service_catalog (name, category, subcategory, item_type, description, price, active) VALUES (?, 'FOOD_BEVERAGE', ?, ?, ?, ?, ?)")
            ->execute([$name, $catRow['category_name'], $itemTypeCode, $desc, $price, $isActiveNum]);
    }

    audit($pdo, $u['id'], !empty($in['id']) ? 'MENU_ITEM_UPDATE' : 'MENU_ITEM_CREATE', 'menu_items', $id, [
        'item' => $name, 'category' => $catRow['category_name'], 'price' => $price, 'status' => $status
    ]);

    ws_broadcast('RESTAURANT_MENU_UPDATED', [
        'id' => $id,
        'item_name' => $name,
        'category_name' => $catRow['category_name'],
        'menu_type' => $catRow['menu_type'],
        'price' => $price,
        'availability_status' => $status
    ], null, null, null, true);

    out(['ok' => true, 'id' => $id, 'message' => 'Menu item saved successfully.']);
}

/**
 * Toggles a menu item between Available and Unavailable.
 * Restricted to Restaurant Staff.
 */
if ($action === 'restaurant_item_toggle') {
    
    $id = (int)($in['id'] ?? 0);
    $status = (string)($in['availability_status'] ?? '');

    $cur = $pdo->prepare("SELECT availability_status, item_name, category_id FROM menu_items WHERE id=?");
    $cur->execute([$id]);
    $row = $cur->fetch(PDO::FETCH_ASSOC);
    if (!$row) out(['error' => 'Item not found.'], 404);

    if (!in_array($status, ['Available', 'Unavailable'], true)) {
        $status = ($row['availability_status'] === 'Available') ? 'Unavailable' : 'Available';
    }

    $stmt = $pdo->prepare("UPDATE menu_items SET availability_status=? WHERE id=?");
    $stmt->execute([$status, $id]);

    $pdo->prepare("UPDATE service_catalog SET active=? WHERE name=? AND category='FOOD_BEVERAGE'")
        ->execute([$status === 'Available' ? 1 : 0, $row['item_name']]);

    audit($pdo, $u['id'], 'MENU_ITEM_AVAILABILITY_TOGGLE', 'menu_items', $id, ['status' => $status]);

    ws_broadcast('RESTAURANT_ITEM_TOGGLED', [
        'id' => $id,
        'item_name' => $row['item_name'],
        'availability_status' => $status
    ], null, null, null, true);

    out(['ok' => true, 'id' => $id, 'availability_status' => $status, 'message' => "Item is now {$status}."]);
}

/**
 * Adds a new food or drinks category.
 * Restricted to Restaurant Staff.
 */
if ($action === 'restaurant_category_save') {
    
    $name = trim((string)($in['category_name'] ?? ''));
    $type = (string)($in['menu_type'] ?? 'Food');
    if (!in_array($type, ['Food', 'Drinks'], true)) $type = 'Food';

    if ($name === '' || strlen($name) > 100) {
        out(['error' => 'Category name is required (max 100 characters).'], 400);
    }

    $chk = $pdo->prepare("SELECT id FROM menu_categories WHERE category_name=?");
    $chk->execute([$name]);
    if ($chk->fetch()) {
        out(['error' => "Category '{$name}' already exists."], 400);
    }

    $stmt = $pdo->prepare("INSERT INTO menu_categories (category_name, menu_type) VALUES (?, ?)");
    $stmt->execute([$name, $type]);
    $catId = (int)$pdo->lastInsertId();

    ws_broadcast('RESTAURANT_CATEGORY_CREATED', [
        'id' => $catId,
        'category_name' => $name,
        'menu_type' => $type
    ], null, null, null, true);

    out(['ok' => true, 'id' => $catId, 'message' => "Category '{$name}' created."]);
}

/**
 * Places a customer food/drink order.
 * Validates availability and price on server using actual database records.
 */
if ($action === 'customer_place_order') {
    $items = $in['items'] ?? [];
    if (!is_array($items) || empty($items)) {
        out(['error' => 'Your cart is empty. Please select food or drinks to order.'], 400);
    }

    $stayId = (int)($in['stay_id'] ?? 0);
    $orderType = trim((string)($in['order_type'] ?? 'Room Service'));
    $notes = trim((string)($in['notes'] ?? ''));

    // If stay_id not provided, try to find active stay for current customer
    if ($stayId <= 0 && !empty($u['customer_id'])) {
        $stq = $pdo->prepare("SELECT id FROM stays WHERE customer_id=? AND status='ACTIVE' LIMIT 1");
        $stq->execute([(int)$u['customer_id']]);
        $stayId = (int)$stq->fetchColumn();
    }

    $roomNumber = null;
    $customerId = null;
    if ($stayId > 0) {
        $stq = $pdo->prepare("SELECT s.id, s.stay_code, s.customer_id, r.room_number FROM stays s JOIN rooms r ON r.id=s.room_id WHERE s.id=? AND s.status='ACTIVE'");
        $stq->execute([$stayId]);
        $stayRow = $stq->fetch(PDO::FETCH_ASSOC);
        if ($stayRow) {
            $roomNumber = $stayRow['room_number'];
            $customerId = $stayRow['customer_id'];
        }
    }

    // Server-side validation of all items, availability, and prices
    $validatedLines = [];
    $totalAmount = 0.0;

    $itemCheck = $pdo->prepare("SELECT m.id, m.item_name, m.price, m.availability_status, c.category_name
                                FROM menu_items m
                                JOIN menu_categories c ON c.id=m.category_id
                                WHERE m.id=?");

    foreach ($items as $entry) {
        $itemId = (int)($entry['item_id'] ?? 0);
        $qty = max(1, (int)($entry['quantity'] ?? 1));

        if ($itemId <= 0) continue;

        $itemCheck->execute([$itemId]);
        $itemRow = $itemCheck->fetch(PDO::FETCH_ASSOC);

        if (!$itemRow) {
            out(['error' => "A selected item was not found in the menu."], 400);
        }

        if ($itemRow['availability_status'] !== 'Available') {
            out(['error' => "Sorry, '{$itemRow['item_name']}' is currently unavailable and cannot be ordered."], 400);
        }

        $dbPrice = (float)$itemRow['price'];
        $lineSubtotal = round($dbPrice * $qty, 2);
        $totalAmount += $lineSubtotal;

        $validatedLines[] = [
            'item_id' => $itemId,
            'item_name' => $itemRow['item_name'],
            'category_name' => $itemRow['category_name'],
            'quantity' => $qty,
            'unit_price' => $dbPrice,
            'subtotal' => $lineSubtotal
        ];
    }

    if (empty($validatedLines)) {
        out(['error' => 'No valid items found in order.'], 400);
    }

    $totalAmount = round($totalAmount, 2);
    $orderCode = 'RO-' . date('Ymd') . '-' . strtoupper(bin2hex(random_bytes(3)));

    $pdo->beginTransaction();
    try {
        $insOrder = $pdo->prepare("INSERT INTO restaurant_orders (order_code, customer_id, stay_id, room_number, order_type, notes, total_amount, order_status, payment_status) VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending', 'Billed to Room')");
        $insOrder->execute([$orderCode, $customerId, $stayId ?: null, $roomNumber, $orderType, $notes, $totalAmount]);
        $orderId = (int)$pdo->lastInsertId();

        $insLine = $pdo->prepare("INSERT INTO restaurant_order_items (order_id, item_id, item_name, category_name, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)");
        $itemDescriptions = [];
        foreach ($validatedLines as $line) {
            $insLine->execute([
                $orderId,
                $line['item_id'],
                $line['item_name'],
                $line['category_name'],
                $line['quantity'],
                $line['unit_price'],
                $line['subtotal']
            ]);
            $itemDescriptions[] = "{$line['quantity']}x {$line['item_name']}";
        }

        // Link with unified service_requests queue for restaurant kitchen
        if ($stayId > 0) {
            $descSummary = implode(', ', $itemDescriptions) . ($notes ? " (Note: {$notes})" : "");
            $pdo->prepare("INSERT INTO service_requests (stay_id, request_code, service_type, assigned_department, status, description, chargeable, price) VALUES (?, ?, 'FOOD_BEVERAGE', 'restaurant', 'PENDING', ?, 1, ?)")
                ->execute([$stayId, $orderCode, $descSummary, $totalAmount]);
        }

        $pdo->commit();

        ws_broadcast('RESTAURANT_ORDER_CREATED', [
            'id' => $orderId,
            'order_code' => $orderCode,
            'room_number' => $roomNumber,
            'order_type' => $orderType,
            'total_amount' => $totalAmount,
            'order_status' => 'Pending',
            'items_count' => count($validatedLines),
            'items_summary' => implode(', ', $itemDescriptions)
        ], null, 'restaurant', $stayRow['stay_code'] ?? null);

        out([
            'ok' => true,
            'order_id' => $orderId,
            'order_code' => $orderCode,
            'total_amount' => $totalAmount,
            'message' => "Order #{$orderCode} submitted successfully!"
        ]);
    } catch (Exception $e) {
        $pdo->rollBack();
        out(['error' => 'Failed to place order: ' . $e->getMessage()], 500);
    }
}

/**
 * Lists restaurant orders with item details.
 */
if ($action === 'restaurant_orders_list') {
    $stayId = (int)($in['stay_id'] ?? $_GET['stay_id'] ?? 0);
    $status = trim((string)($in['status'] ?? $_GET['status'] ?? 'all'));

    $orderQ = "SELECT o.*, TRIM(CONCAT_WS(' ', c.first_name, NULLIF(c.middle_name, ''), c.last_name)) AS customer_name,
                      c.contact_number, s.stay_code
               FROM restaurant_orders o
               LEFT JOIN customers c ON c.customer_id=o.customer_id
               LEFT JOIN stays s ON s.id=o.stay_id
               WHERE 1=1";
    $params = [];

    if ($stayId > 0) {
        $orderQ .= " AND o.stay_id=?";
        $params[] = $stayId;
    }
    if ($status !== 'all' && $status !== '') {
        $orderQ .= " AND o.order_status=?";
        $params[] = $status;
    }
    $orderQ .= " ORDER BY o.created_at DESC LIMIT 150";

    $stmt = $pdo->prepare($orderQ);
    $stmt->execute($params);
    $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Attach order items
    $itemStmt = $pdo->prepare("SELECT * FROM restaurant_order_items WHERE order_id=? ORDER BY id");
    foreach ($orders as &$ord) {
        $itemStmt->execute([$ord['id']]);
        $ord['items'] = $itemStmt->fetchAll(PDO::FETCH_ASSOC);
    }
    unset($ord);

    out(['orders' => $orders]);
}

/**
 * Updates restaurant order status (e.g. Confirmed, Preparing, Ready, Completed, Cancelled).
 */
if ($action === 'restaurant_order_status') {
    $orderId = (int)($in['order_id'] ?? 0);
    $newStatus = trim((string)($in['order_status'] ?? ''));
    $reason = trim((string)($in['reason'] ?? ''));

    $allowedTransitions = ['Pending', 'Confirmed', 'Preparing', 'Ready for Serving', 'Served', 'Completed', 'Cancelled'];
    if (!in_array($newStatus, $allowedTransitions, true)) {
        out(['error' => 'Invalid order status transition.'], 400);
    }

    $q = $pdo->prepare("SELECT o.*, s.stay_code FROM restaurant_orders o LEFT JOIN stays s ON s.id=o.stay_id WHERE o.id=?");
    $q->execute([$orderId]);
    $order = $q->fetch(PDO::FETCH_ASSOC);
    if (!$order) {
        out(['error' => 'Order not found.'], 404);
    }

    $curRole = strtolower(trim((string)$u['role']));
    $isCustomer = in_array($curRole, ['customer', 'guest', ''], true) || !empty($u['customer_id']);

    // Customers can only cancel if Pending or Confirmed
    if ($isCustomer && $newStatus === 'Cancelled') {
        if (!in_array($order['order_status'], ['Pending', 'Confirmed'], true)) {
            out(['error' => "This order is already {$order['order_status']} and cannot be cancelled."], 400);
        }
    }

    $pdo->beginTransaction();
    try {
        $lockOrder = $pdo->prepare('SELECT * FROM restaurant_orders WHERE id=? FOR UPDATE');
        $lockOrder->execute([$orderId]);
        $lockedOrder = $lockOrder->fetch(PDO::FETCH_ASSOC);
        if (!$lockedOrder) throw new RuntimeException('Order no longer exists. Refresh the order list.');
        $order = array_merge($order, $lockedOrder);

        // Posting and status changes must succeed or roll back together.
        if (in_array($newStatus, ['Completed', 'Served'], true) && !empty($order['stay_id']) && ($order['payment_status'] ?? 'Unpaid') === 'Unpaid') {
            $fidQ = $pdo->prepare("SELECT id FROM folios WHERE stay_id=? AND status='OPEN' LIMIT 1 FOR UPDATE");
            $fidQ->execute([$order['stay_id']]);
            $folioId = $fidQ->fetchColumn();
            if (!$folioId) {
                throw new RuntimeException('This room-service order cannot be completed because the guest has no open folio. Open or correct the folio, then retry.');
            }

            $idemKey = 'order-charge-' . $order['order_code'];
            $desc = "Restaurant Order {$order['order_code']} ({$order['order_type']})";
            $pdo->prepare("INSERT IGNORE INTO charges (folio_id, category, description, quantity, unit_price, amount, created_by, idempotency_key) VALUES (?, 'FOOD', ?, 1, ?, ?, ?, ?)")
                ->execute([$folioId, $desc, $order['total_amount'], $order['total_amount'], $u['id'] ?? 1, $idemKey]);
            $verify = $pdo->prepare('SELECT folio_id, amount FROM charges WHERE idempotency_key=? LIMIT 1');
            $verify->execute([$idemKey]);
            $charge = $verify->fetch(PDO::FETCH_ASSOC);
            if (!$charge || (int)$charge['folio_id'] !== (int)$folioId || abs((float)$charge['amount'] - (float)$order['total_amount']) > 0.009) {
                throw new RuntimeException('The restaurant charge could not be verified; no order status changes were saved.');
            }
            $pdo->prepare("UPDATE restaurant_orders SET payment_status='Billed to Room', payment_method='Billed to Room', paid_amount=total_amount, paid_at=COALESCE(paid_at,NOW()) WHERE id=? AND payment_status='Unpaid'")
                ->execute([$orderId]);
        }

        $stmt = $pdo->prepare("UPDATE restaurant_orders SET order_status=? WHERE id=?");
        $stmt->execute([$newStatus, $orderId]);

        // Mirror status in service_requests within the same transaction.
        $pdo->prepare("UPDATE service_requests SET status=? WHERE request_code=?")
            ->execute([($newStatus === 'Completed' || $newStatus === 'Served') ? 'COMPLETED' : ($newStatus === 'Cancelled' ? 'CANCELLED' : 'IN_PROGRESS'), $order['order_code']]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        out(['error' => $e->getMessage()], 409);
    }

    ws_broadcast('RESTAURANT_ORDER_STATUS_CHANGED', [
        'id' => $orderId,
        'order_code' => $order['order_code'],
        'room_number' => $order['room_number'],
        'order_status' => $newStatus,
        'reason' => $reason
    ], null, 'restaurant', $order['stay_code'] ?? null);

    out(['ok' => true, 'order_id' => $orderId, 'order_status' => $newStatus, 'message' => "Order #{$order['order_code']} status updated to {$newStatus}."]);
}

/**
 * Settles payment for a restaurant order.
 * Supports Cash, Credit Card, Debit Card, GCash, and Billed to Room.
 */
if ($action === 'restaurant_order_pay') {
    $orderId = (int)($in['order_id'] ?? 0);
    $payMethod = trim((string)($in['payment_method'] ?? 'Cash'));
    $paidAmount = round((float)($in['paid_amount'] ?? 0), 2);
    $reference = trim((string)($in['payment_reference'] ?? ''));
    $notes = trim((string)($in['notes'] ?? ''));

    if ($orderId <= 0) {
        out(['error' => 'Please select a valid order.'], 400);
    }

    $q = $pdo->prepare("SELECT o.*, s.stay_code FROM restaurant_orders o LEFT JOIN stays s ON s.id=o.stay_id WHERE o.id=?");
    $q->execute([$orderId]);
    $order = $q->fetch(PDO::FETCH_ASSOC);
    if (!$order) {
        out(['error' => 'Order not found.'], 404);
    }

    if (in_array((string)$order['payment_status'], ['Paid', 'Billed to Room'], true)) {
        out(['error' => 'This restaurant order has already been settled or billed to the room.'], 409);
    }
    if ($paidAmount <= 0) {
        $paidAmount = (float)$order['total_amount'];
    }
    if ($payMethod !== 'Billed to Room' && abs($paidAmount - (float)$order['total_amount']) > 0.009) {
        out(['error' => 'Restaurant direct payment must equal the order total. Partial settlement must be recorded through the guest folio.'], 400);
    }

    $allowedMethods = ['Cash', 'Credit Card', 'Debit Card', 'GCash', 'Billed to Room'];
    if (!in_array($payMethod, $allowedMethods, true)) {
        $payMethod = 'Cash';
    }

    $pdo->beginTransaction();
    try {
        $lockOrder = $pdo->prepare('SELECT * FROM restaurant_orders WHERE id=? FOR UPDATE');
        $lockOrder->execute([$orderId]);
        $lockedOrder = $lockOrder->fetch(PDO::FETCH_ASSOC);
        if (!$lockedOrder) throw new RuntimeException('Order no longer exists. Refresh the order list.');
        if (in_array((string)$lockedOrder['payment_status'], ['Paid', 'Billed to Room'], true)) {
            throw new RuntimeException('This restaurant order has already been settled or billed to the room.');
        }
        $order = array_merge($order, $lockedOrder);

        if ($payMethod === 'Billed to Room') {
            if (empty($order['stay_id'])) {
                throw new RuntimeException('Cannot bill to room: this order is not linked to an active guest stay.');
            }

            // Find active open folio for the stay
            $fq = $pdo->prepare("SELECT id FROM folios WHERE stay_id=? AND status='OPEN' LIMIT 1");
            $fq->execute([$order['stay_id']]);
            $folioId = $fq->fetchColumn();
            if (!$folioId) {
                throw new RuntimeException('No open folio found for this stay.');
            }

            // Add/verify the shared idempotency key before changing payment status.
            $idemKey = 'order-charge-' . $order['order_code'];
            $desc = "Restaurant Order #{$order['order_code']} ({$order['order_type']})";
            $pdo->prepare("INSERT IGNORE INTO charges (folio_id, category, description, quantity, unit_price, amount, created_by, idempotency_key) VALUES (?, 'FOOD', ?, 1, ?, ?, ?, ?)")
                ->execute([$folioId, $desc, $order['total_amount'], $order['total_amount'], $u['id'] ?? 1, $idemKey]);
            $verifyCharge = $pdo->prepare('SELECT folio_id, amount FROM charges WHERE idempotency_key=? LIMIT 1');
            $verifyCharge->execute([$idemKey]);
            $chargeRow = $verifyCharge->fetch(PDO::FETCH_ASSOC);
            if (!$chargeRow || (int)$chargeRow['folio_id'] !== (int)$folioId || abs((float)$chargeRow['amount'] - (float)$order['total_amount']) > 0.009) {
                throw new RuntimeException('The order charge could not be verified. Payment status was not changed.');
            }

            $stmt = $pdo->prepare("UPDATE restaurant_orders SET payment_status='Billed to Room', payment_method='Billed to Room', paid_amount=?, paid_at=NOW() WHERE id=? AND payment_status='Unpaid'");
            $stmt->execute([$order['total_amount'], $orderId]);
            if ($stmt->rowCount() !== 1) throw new RuntimeException('The order payment status changed during processing. Refresh and retry.');
            $newPaymentStatus = 'Billed to Room';
        } else {
            $stmt = $pdo->prepare("UPDATE restaurant_orders SET payment_status='Paid', payment_method=?, paid_amount=?, payment_reference=?, paid_at=NOW() WHERE id=? AND payment_status='Unpaid'");
            $stmt->execute([$payMethod, $paidAmount, $reference ?: null, $orderId]);
            if ($stmt->rowCount() !== 1) throw new RuntimeException('The order payment status changed during processing. Refresh and retry.');
            $newPaymentStatus = 'Paid';
        }

        audit($pdo, $u['id'], 'SETTLE_RESTAURANT_PAYMENT', 'restaurant_orders', $orderId, [
            'method' => $payMethod, 'amount' => $paidAmount, 'reference' => $reference
        ]);

        $pdo->commit();

        ws_broadcast('RESTAURANT_ORDER_PAID', [
            'id' => $orderId,
            'order_code' => $order['order_code'],
            'payment_status' => $newPaymentStatus,
            'payment_method' => $payMethod,
            'paid_amount' => $paidAmount,
            'total_amount' => (float)$order['total_amount']
        ], null, 'restaurant', $order['stay_code'] ?? null);

        if ($payMethod === 'Billed to Room') {
            ws_broadcast('FOLIO_UPDATED', ['stay_id' => $order['stay_id']], null, null, $order['stay_code'] ?? null);
        }

        out([
            'ok' => true,
            'order_id' => $orderId,
            'payment_status' => $newPaymentStatus,
            'payment_method' => $payMethod,
            'message' => "Payment of ₱" . number_format($paidAmount, 2) . " settled via {$payMethod}."
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        out(['error' => $e->getMessage()], 400);
    }
}

/**
 * Takes a new restaurant order directly from staff.
 * Validates category, item, and price on server.
 */
if ($action === 'restaurant_order_create') {
    $stayId = (int)($in['stay_id'] ?? 0);
    $orderType = trim((string)($in['order_type'] ?? 'Dine-In'));
    $customerName = trim((string)($in['customer_name'] ?? ''));
    $roomNumber = trim((string)($in['room_number'] ?? ''));
    $notes = trim((string)($in['notes'] ?? ''));
    $payMethod = trim((string)($in['payment_method'] ?? 'Cash'));
    $payStatus = trim((string)($in['payment_status'] ?? 'Unpaid'));
    $items = $in['items'] ?? [];

    if (!is_array($items) || empty($items)) {
        out(['error' => 'Please select at least one menu item.'], 400);
    }

    $customerId = null;
    if ($stayId > 0) {
        $stq = $pdo->prepare("SELECT s.id, s.stay_code, s.customer_id, r.room_number FROM stays s JOIN rooms r ON r.id=s.room_id WHERE s.id=? AND s.status='ACTIVE'");
        $stq->execute([$stayId]);
        $stayRow = $stq->fetch(PDO::FETCH_ASSOC);
        if (!$stayRow) {
            out(['error' => 'The selected stay is not active or no longer exists. Refresh the stay list and try again.'], 409);
        }
        $roomNumber = $stayRow['room_number'];
        $customerId = $stayRow['customer_id'];
    }

    // Validate all items, quantities, and prices from database
    $validatedLines = [];
    $totalAmount = 0.0;
    $itemCheck = $pdo->prepare("SELECT m.id, m.item_name, m.price, m.availability_status, c.category_name
                                FROM menu_items m
                                JOIN menu_categories c ON c.id=m.category_id
                                WHERE m.id=?");

    foreach ($items as $entry) {
        $itemId = (int)($entry['item_id'] ?? 0);
        $qty = max(1, (int)($entry['quantity'] ?? 1));
        if ($itemId <= 0) continue;

        $itemCheck->execute([$itemId]);
        $row = $itemCheck->fetch(PDO::FETCH_ASSOC);
        if (!$row) continue;

        $unitPrice = (float)$row['price'];
        $lineSubtotal = round($unitPrice * $qty, 2);
        $totalAmount += $lineSubtotal;

        $validatedLines[] = [
            'item_id' => $itemId,
            'item_name' => $row['item_name'],
            'category_name' => $row['category_name'],
            'quantity' => $qty,
            'unit_price' => $unitPrice,
            'subtotal' => $lineSubtotal
        ];
    }

    if (empty($validatedLines)) {
        out(['error' => 'No valid menu items found in order.'], 400);
    }

    $totalAmount = round($totalAmount, 2);
    $orderCode = 'RO-' . date('Ymd') . '-' . strtoupper(bin2hex(random_bytes(3)));

    if ($payMethod === 'Billed to Room') {
        if ($stayId <= 0) {
            out(['error' => 'Billed to Room requires an active guest stay. Choose an active stay or use direct payment.'], 400);
        }
        $payStatus = 'Billed to Room';
    } elseif (in_array($payMethod, ['Cash', 'Credit Card', 'GCash'], true) && $payStatus === 'Paid') {
        $payStatus = 'Paid';
    } else {
        $payStatus = 'Unpaid';
    }

    $pdo->beginTransaction();
    try {
        $folioIdForOrder = null;
        if ($payStatus === 'Billed to Room') {
            // Lock the active stay and its open folio before creating the order.
            $lockStay = $pdo->prepare("SELECT id FROM stays WHERE id=? AND status='ACTIVE' FOR UPDATE");
            $lockStay->execute([$stayId]);
            if (!$lockStay->fetchColumn()) {
                throw new RuntimeException('The selected stay is no longer active. The order was not created.');
            }
            $fq = $pdo->prepare("SELECT id FROM folios WHERE stay_id=? AND status='OPEN' LIMIT 1 FOR UPDATE");
            $fq->execute([$stayId]);
            $folioIdForOrder = $fq->fetchColumn();
            if (!$folioIdForOrder) {
                throw new RuntimeException('No open folio exists for this stay. Open or correct the folio before billing this order to the room.');
            }
        }

        $ins = $pdo->prepare("INSERT INTO restaurant_orders (order_code, customer_id, stay_id, room_number, order_type, notes, total_amount, order_status, payment_status, payment_method, paid_amount, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'Confirmed', ?, ?, ?, ?)");
        $ins->execute([
            $orderCode,
            $customerId,
            $stayId ?: null,
            $roomNumber ?: ($customerName ?: 'Walk-in / Table'),
            $orderType,
            $notes,
            $totalAmount,
            $payStatus,
            $payMethod,
            $payStatus === 'Paid' ? $totalAmount : null,
            $payStatus === 'Paid' ? date('Y-m-d H:i:s') : null
        ]);
        $orderId = (int)$pdo->lastInsertId();

        $insLine = $pdo->prepare("INSERT INTO restaurant_order_items (order_id, item_id, item_name, category_name, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)");
        $descList = [];
        foreach ($validatedLines as $line) {
            $insLine->execute([
                $orderId,
                $line['item_id'],
                $line['item_name'],
                $line['category_name'],
                $line['quantity'],
                $line['unit_price'],
                $line['subtotal']
            ]);
            $descList[] = "{$line['quantity']}x {$line['item_name']}";
        }

        // A Billed-to-Room order and its folio charge are one atomic operation.
        // Use the same idempotency key as the mirrored restaurant service request.
        if ($payStatus === 'Billed to Room') {
            $idemKey = 'order-charge-' . $orderCode;
            $pdo->prepare("INSERT IGNORE INTO charges (folio_id, category, description, quantity, unit_price, amount, created_by, idempotency_key) VALUES (?, 'FOOD', ?, 1, ?, ?, ?, ?)")
                ->execute([$folioIdForOrder, "Restaurant Order #{$orderCode} ({$orderType})", $totalAmount, $totalAmount, $u['id'] ?? 1, $idemKey]);
            $verifyCharge = $pdo->prepare('SELECT folio_id, amount FROM charges WHERE idempotency_key=? LIMIT 1');
            $verifyCharge->execute([$idemKey]);
            $chargeRow = $verifyCharge->fetch(PDO::FETCH_ASSOC);
            if (!$chargeRow || (int)$chargeRow['folio_id'] !== (int)$folioIdForOrder || abs((float)$chargeRow['amount'] - $totalAmount) > 0.009) {
                throw new RuntimeException('The order charge could not be verified. The order was rolled back to prevent an incorrect bill.');
            }
        }

        // Also mirror to service_requests for staff tracking if room stay
        if ($stayId > 0) {
            $descSummary = implode(', ', $descList) . ($notes ? " (Note: {$notes})" : "");
            $pdo->prepare("INSERT INTO service_requests (stay_id, request_code, service_type, assigned_department, status, description, chargeable, price) VALUES (?, ?, 'FOOD_BEVERAGE', 'restaurant', 'PENDING', ?, 1, ?)")
                ->execute([$stayId, $orderCode, $descSummary, $totalAmount]);
        }

        audit($pdo, $u['id'], 'CREATE_RESTAURANT_ORDER', 'restaurant_orders', $orderId, [
            'order_code' => $orderCode, 'total' => $totalAmount, 'type' => $orderType
        ]);

        $pdo->commit();

        ws_broadcast('RESTAURANT_ORDER_CREATED', [
            'id' => $orderId,
            'order_code' => $orderCode,
            'room_number' => $roomNumber ?: $customerName,
            'order_type' => $orderType,
            'total_amount' => $totalAmount,
            'order_status' => 'Confirmed',
            'payment_status' => $payStatus,
            'item_count' => count($validatedLines),
            'created_at' => date('Y-m-d H:i:s')
        ], null, 'restaurant', null, true);

        out([
            'ok' => true,
            'order_id' => $orderId,
            'order_code' => $orderCode,
            'total_amount' => $totalAmount,
            'message' => "Order #{$orderCode} created successfully (Total: ₱" . number_format($totalAmount, 2) . ")."
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        out(['error' => $e->getMessage()], 400);
    }
}

// SERVICE & AMENITY CATALOG MANAGEMENT
// ============================================================================

/**
 * Retrieves all items in the service catalog grouped by category.
 */
if ($action === 'service_catalog') {
    $q = $pdo->query('SELECT id, name, category, description, price, active FROM service_catalog ORDER BY category, name');
    out(['items' => $q->fetchAll()]);
}

/**
 * Creates or updates an item in the service/amenity catalog and broadcasts real-time changes.
 */
if ($action === 'service_catalog_save') {
    require_role(['admin', 'manager', 'restaurant', 'bar']);
    $id = (int)($in['id'] ?? 0);
    $name = trim((string)($in['name'] ?? ''));
    $category = (string)($in['category'] ?? '');
    $subcategory = trim((string)($in['subcategory'] ?? ''));
    $item_type = strtoupper(trim((string)($in['item_type'] ?? 'FOOD')));
    if (!in_array($item_type, ['FOOD', 'DRINK', 'OTHER'], true)) $item_type = 'FOOD';
    $description = trim((string)($in['description'] ?? ''));
    $price = round((float)($in['price'] ?? 0), 2);
    $allowed = ['FOOD_BEVERAGE', 'HOUSEKEEPING', 'SERVICE', 'LAUNDRY', 'MINIBAR', 'OTHER', 'BAR', 'MAINTENANCE', 'VALET', 'PARKING'];

    if ($name === '' || strlen($name) > 120 || !in_array($category, $allowed, true) || $price < 0) {
        out(['error' => 'Enter a valid item, category, and non-negative price.'], 400);
    }

    try {
        if ($id) {
            $q = $pdo->prepare('UPDATE service_catalog SET name=?, category=?, subcategory=?, item_type=?, description=?, price=? WHERE id=?');
            $q->execute([$name, $category, $subcategory ?: null, $item_type, $description ?: null, $price, $id]);
        } else {
            $q = $pdo->prepare('INSERT INTO service_catalog(name, category, subcategory, item_type, description, price) VALUES(?, ?, ?, ?, ?, ?)');
            $q->execute([$name, $category, $subcategory ?: null, $item_type, $description ?: null, $price]);
            $id = (int)$pdo->lastInsertId();
        }

        audit($pdo, $u['id'], $in['id'] ? 'UPDATE_MENU_ITEM' : 'CREATE_MENU_ITEM', 'service_catalog', $id, ['name' => $name, 'category' => $category, 'price' => $price]);
        $itemStmt = $pdo->prepare('SELECT id, name, category, subcategory, item_type, description, price, active FROM service_catalog WHERE id=?');
        $itemStmt->execute([$id]);
        $catItem = $itemStmt->fetch();

        if ($catItem) {
            // Mirror food & drink items to menu_items
            if (in_array($category, ['FOOD_BEVERAGE', 'BAR'], true) && $subcategory) {
                $menuType = ($item_type === 'DRINK' || $category === 'BAR') ? 'Drinks' : 'Food';
                $mc = $pdo->prepare("SELECT id FROM menu_categories WHERE category_name=?");
                $mc->execute([$subcategory]);
                $mcId = $mc->fetchColumn();
                if (!$mcId) {
                    try {
                        $pdo->prepare("INSERT INTO menu_categories (category_name, menu_type) VALUES (?, ?)")
                            ->execute([$subcategory, $menuType]);
                        $mcId = (int)$pdo->lastInsertId();
                    } catch (Throwable $e) {}
                }
                if ($mcId) {
                    $mi = $pdo->prepare("SELECT id FROM menu_items WHERE item_name=?");
                    $mi->execute([$name]);
                    $miId = $mi->fetchColumn();
                    if ($miId) {
                        $pdo->prepare("UPDATE menu_items SET category_id=?, description=?, price=? WHERE id=?")
                            ->execute([(int)$mcId, $description ?: '', $price, (int)$miId]);
                    } else {
                        $pdo->prepare("INSERT INTO menu_items (category_id, item_name, description, price, availability_status) VALUES (?, ?, ?, ?, 'Available')")
                            ->execute([(int)$mcId, $name, $description ?: '', $price]);
                    }
                }
            }

            ws_broadcast('CATALOG_UPDATED', [
                'id' => (int)$catItem['id'],
                'name' => $catItem['name'],
                'category' => $catItem['category'],
                'subcategory' => $catItem['subcategory'] ?? '',
                'item_type' => $catItem['item_type'] ?? 'FOOD',
                'description' => $catItem['description'] ?? '',
                'price' => (float)$catItem['price'],
                'active' => (int)$catItem['active'],
                'is_new' => !$in['id'],
                'updated_by' => $u['username'] ?? 'Staff',
                'actor_id' => (int)$u['id']
            ], null, null, null, true);
        }
        out(['ok' => true, 'id' => $id]);
    } catch (PDOException $e) {
        out(['error' => 'An item with that name already exists in this category.'], 400);
    }
}

/**
 * Toggles the active status of a service catalog item (available/unavailable).
 */
if ($action === 'service_catalog_toggle') {
    require_role(['admin', 'manager', 'frontdesk', 'restaurant', 'bar']);
    $id = (int)($in['id'] ?? 0);
    $active = (int)($in['active'] ?? 0) === 1 ? 1 : 0;

    $q = $pdo->prepare('UPDATE service_catalog SET active=? WHERE id=?');
    $q->execute([$active, $id]);

    $itemStmt = $pdo->prepare('SELECT id, name, category, description, price, active FROM service_catalog WHERE id=?');
    $itemStmt->execute([$id]);
    $catItem = $itemStmt->fetch();

    audit($pdo, $u['id'], 'TOGGLE_MENU_ITEM', 'service_catalog', $id, ['active' => $active]);

    if ($catItem) {
        $status = ($active === 1) ? 'Available' : 'Unavailable';
        $pdo->prepare("UPDATE menu_items SET availability_status=? WHERE item_name=?")
            ->execute([$status, $catItem['name']]);

        ws_broadcast('CATALOG_ITEM_TOGGLED', [
            'id' => (int)$catItem['id'],
            'name' => $catItem['name'],
            'category' => $catItem['category'],
            'description' => $catItem['description'] ?? '',
            'price' => (float)$catItem['price'],
            'active' => (int)$catItem['active'],
            'updated_by' => $u['username'] ?? 'Staff',
            'actor_id' => (int)$u['id']
        ], null, null, null, true);
    }
    out(['ok' => true, 'item' => $catItem]);
}

// ============================================================================
// DEPARTMENT INVENTORY & ANALYTICS REPORTS
// ============================================================================

/**
 * Retrieves department inventory items.
 */
if ($action === 'inventory_list') {
    $dept = trim((string)($in['department'] ?? $_GET['department'] ?? ''));
    if ($dept === '') {
        $dept = 'restaurant';
    }
    $normDept = normalize_department($dept);

    $stmt = $pdo->prepare("SELECT id, department, item_name, category, quantity, unit, reorder_level, cost_price, updated_at FROM department_inventory WHERE department=? ORDER BY category, item_name");
    $stmt->execute([$normDept]);
    $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

    out(['inventory' => $items]);
}

/**
 * Creates or updates an inventory item for a department.
 */
if ($action === 'inventory_save') {
    $id = (int)($in['id'] ?? 0);
    $dept = trim((string)($in['department'] ?? 'restaurant'));
    $name = trim((string)($in['item_name'] ?? ''));
    $cat = trim((string)($in['category'] ?? 'General')) ?: 'General';
    $qty = (int)($in['quantity'] ?? 0);
    $unit = trim((string)($in['unit'] ?? 'pcs')) ?: 'pcs';
    $reorder = max(0, (int)($in['reorder_level'] ?? 5));
    $cost = round((float)($in['cost_price'] ?? 0), 2);

    if ($name === '' || strlen($name) > 120) {
        out(['error' => 'Item name is required (max 120 characters).'], 400);
    }
    $normDept = normalize_department($dept);

    if ($id > 0) {
        $stmt = $pdo->prepare("UPDATE department_inventory SET department=?, item_name=?, category=?, quantity=?, unit=?, reorder_level=?, cost_price=? WHERE id=?");
        $stmt->execute([$normDept, $name, $cat, $qty, $unit, $reorder, $cost, $id]);
    } else {
        $stmt = $pdo->prepare("INSERT INTO department_inventory (department, item_name, category, quantity, unit, reorder_level, cost_price) VALUES (?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([$normDept, $name, $cat, $qty, $unit, $reorder, $cost]);
        $id = (int)$pdo->lastInsertId();
    }

    audit($pdo, $u['id'], $id ? 'UPDATE_INVENTORY' : 'CREATE_INVENTORY', 'department_inventory', $id, [
        'dept' => $normDept, 'item' => $name, 'qty' => $qty
    ]);

    ws_broadcast('INVENTORY_UPDATED', [
        'id' => $id,
        'department' => $normDept,
        'item_name' => $name,
        'quantity' => $qty,
        'unit' => $unit
    ], null, $normDept, null, true);

    out(['ok' => true, 'id' => $id, 'message' => 'Inventory item saved.']);
}

/**
 * Deletes an inventory record.
 */
if ($action === 'inventory_delete') {
    $id = (int)($in['id'] ?? 0);
    if ($id <= 0) {
        out(['error' => 'Invalid inventory ID.'], 400);
    }
    $stmt = $pdo->prepare("SELECT item_name, department FROM department_inventory WHERE id=?");
    $stmt->execute([$id]);
    $item = $stmt->fetch();
    if ($item) {
        $pdo->prepare("DELETE FROM department_inventory WHERE id=?")->execute([$id]);
        audit($pdo, $u['id'], 'DELETE_INVENTORY', 'department_inventory', $id, ['item' => $item['item_name']]);
        ws_broadcast('INVENTORY_DELETED', ['id' => $id, 'department' => $item['department']], null, $item['department'], null, true);
    }
    out(['ok' => true, 'message' => 'Item deleted.']);
}

/**
 * Returns daily, weekly, and monthly analytics reports for a department.
 */
if ($action === 'department_reports') {
    $dept = trim((string)($in['department'] ?? $_GET['department'] ?? 'restaurant'));
    $normDept = normalize_department($dept);

    // Summary KPIs
    $sumStmt = $pdo->prepare("SELECT 
        COUNT(*) AS total_all_time,
        SUM(CASE WHEN status IN ('COMPLETED','FULFILLED','SERVED') THEN 1 ELSE 0 END) AS completed_all_time,
        SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) AS requests_today,
        COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() AND status!='CANCELLED' THEN price ELSE 0 END), 0) AS revenue_today,
        SUM(CASE WHEN status IN ('PENDING','ASSIGNED','IN_PROGRESS') THEN 1 ELSE 0 END) AS active_queue_count,
        COALESCE(SUM(CASE WHEN status!='CANCELLED' THEN price ELSE 0 END), 0) AS revenue_all_time
    FROM service_requests WHERE assigned_department = ?");
    $sumStmt->execute([$normDept]);
    $summary = $sumStmt->fetch(PDO::FETCH_ASSOC) ?: [];

    // Daily breakdown (last 14 days)
    $dailyStmt = $pdo->prepare("SELECT 
        DATE(created_at) AS date_label,
        COUNT(*) AS total_orders,
        SUM(CASE WHEN status IN ('COMPLETED','FULFILLED','SERVED') THEN 1 ELSE 0 END) AS completed_orders,
        COALESCE(SUM(CASE WHEN status!='CANCELLED' THEN price ELSE 0 END), 0) AS revenue
    FROM service_requests 
    WHERE assigned_department = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 14 DAY)
    GROUP BY DATE(created_at)
    ORDER BY DATE(created_at) DESC");
    $dailyStmt->execute([$normDept]);
    $daily = $dailyStmt->fetchAll(PDO::FETCH_ASSOC);

    // Weekly breakdown (last 8 weeks)
    $weeklyStmt = $pdo->prepare("SELECT 
        YEARWEEK(created_at, 1) AS week_code,
        CONCAT('Week ', WEEK(created_at, 1), ', ', YEAR(created_at)) AS week_label,
        COUNT(*) AS total_orders,
        SUM(CASE WHEN status IN ('COMPLETED','FULFILLED','SERVED') THEN 1 ELSE 0 END) AS completed_orders,
        COALESCE(SUM(CASE WHEN status!='CANCELLED' THEN price ELSE 0 END), 0) AS revenue
    FROM service_requests 
    WHERE assigned_department = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 8 WEEK)
    GROUP BY YEARWEEK(created_at, 1), week_label
    ORDER BY YEARWEEK(created_at, 1) DESC");
    $weeklyStmt->execute([$normDept]);
    $weekly = $weeklyStmt->fetchAll(PDO::FETCH_ASSOC);

    // Monthly breakdown (last 6 months)
    $monthlyStmt = $pdo->prepare("SELECT 
        DATE_FORMAT(created_at, '%Y-%m') AS month_code,
        DATE_FORMAT(created_at, '%M %Y') AS month_label,
        COUNT(*) AS total_orders,
        SUM(CASE WHEN status IN ('COMPLETED','FULFILLED','SERVED') THEN 1 ELSE 0 END) AS completed_orders,
        COALESCE(SUM(CASE WHEN status!='CANCELLED' THEN price ELSE 0 END), 0) AS revenue
    FROM service_requests 
    WHERE assigned_department = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
    GROUP BY month_code, month_label
    ORDER BY month_code DESC");
    $monthlyStmt->execute([$normDept]);
    $monthly = $monthlyStmt->fetchAll(PDO::FETCH_ASSOC);

    out([
        'summary' => $summary,
        'daily' => $daily,
        'weekly' => $weekly,
        'monthly' => $monthly
    ]);
}

/**
 * Returns menu categories for department order taking and catalog management.
 */
if ($action === 'menu_categories') {
    $dept = trim((string)($in['department'] ?? $_GET['department'] ?? ''));
    $categories = [];

    // Query from menu_item_categories
    if ($dept !== '') {
        $stmt = $pdo->prepare("SELECT id, name, department, type FROM menu_item_categories WHERE department=? ORDER BY name");
        $stmt->execute([$dept]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } else {
        $rows = $pdo->query("SELECT id, name, department, type FROM menu_item_categories ORDER BY department, name")->fetchAll(PDO::FETCH_ASSOC);
    }

    $existingNames = [];
    foreach ($rows as $r) {
        $categories[] = [
            'id' => (int)$r['id'],
            'name' => $r['name'],
            'department' => $r['department'],
            'type' => $r['type']
        ];
        $existingNames[strtolower(trim($r['name']))] = true;
    }

    // Include categories from menu_categories
    $mcRows = $pdo->query("SELECT id, category_name, menu_type FROM menu_categories ORDER BY category_name")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($mcRows as $mc) {
        $key = strtolower(trim($mc['category_name']));
        if (!isset($existingNames[$key])) {
            $categories[] = [
                'id' => (int)$mc['id'],
                'name' => $mc['category_name'],
                'department' => ($mc['menu_type'] === 'Drinks' ? 'bar' : 'restaurant'),
                'type' => ($mc['menu_type'] === 'Drinks' ? 'DRINK' : 'FOOD')
            ];
            $existingNames[$key] = true;
        }
    }

    out(['categories' => $categories]);
}

/**
 * Saves a menu category from department management.
 */
if ($action === 'menu_category_save') {
    $name = trim((string)($in['name'] ?? $in['category_name'] ?? ''));
    $dept = trim((string)($in['department'] ?? 'restaurant'));
    $type = strtoupper(trim((string)($in['type'] ?? 'FOOD')));
    if (!in_array($type, ['FOOD', 'DRINK', 'SERVICE'], true)) $type = 'FOOD';

    if ($name === '' || strlen($name) > 100) {
        out(['error' => 'Category name is required (max 100 characters).'], 400);
    }

    // Insert into menu_item_categories
    $chk = $pdo->prepare("SELECT id FROM menu_item_categories WHERE name=? AND department=?");
    $chk->execute([$name, $dept]);
    $existingId = $chk->fetchColumn();

    if ($existingId) {
        $catId = (int)$existingId;
    } else {
        $stmt = $pdo->prepare("INSERT INTO menu_item_categories (name, department, type) VALUES (?, ?, ?)");
        $stmt->execute([$name, $dept, $type]);
        $catId = (int)$pdo->lastInsertId();
    }

    // Mirror to menu_categories for restaurant dashboard
    $menuType = ($type === 'DRINK') ? 'Drinks' : 'Food';
    $mcChk = $pdo->prepare("SELECT id FROM menu_categories WHERE category_name=?");
    $mcChk->execute([$name]);
    if (!$mcChk->fetch()) {
        try {
            $pdo->prepare("INSERT INTO menu_categories (category_name, menu_type) VALUES (?, ?)")
                ->execute([$name, $menuType]);
        } catch (Throwable $e) {}
    }

    audit($pdo, $u['id'], 'CREATE_MENU_CATEGORY', 'menu_item_categories', $catId, ['name' => $name, 'dept' => $dept, 'type' => $type]);

    ws_broadcast('MENU_CATEGORY_CREATED', [
        'id' => $catId,
        'name' => $name,
        'department' => $dept,
        'type' => $type
    ], null, null, null, true);

    ws_broadcast('RESTAURANT_CATEGORY_CREATED', [
        'id' => $catId,
        'category_name' => $name,
        'menu_type' => $menuType
    ], null, null, null, true);

    out(['ok' => true, 'id' => $catId, 'message' => "Category '{$name}' created successfully."]);
}

/**
 * Deletes a menu category.
 */
if ($action === 'menu_category_delete') {
    $id = (int)($in['id'] ?? 0);
    if ($id <= 0) {
        out(['error' => 'Invalid category ID.'], 400);
    }

    $c = $pdo->prepare("SELECT name, department FROM menu_item_categories WHERE id=?");
    $c->execute([$id]);
    $cat = $c->fetch();

    if ($cat) {
        $pdo->prepare("DELETE FROM menu_item_categories WHERE id=?")->execute([$id]);
        $pdo->prepare("DELETE FROM menu_categories WHERE category_name=?")->execute([$cat['name']]);
        audit($pdo, $u['id'], 'DELETE_MENU_CATEGORY', 'menu_item_categories', $id, ['name' => $cat['name']]);
    }

    out(['ok' => true, 'message' => 'Category deleted.']);
}

// ============================================================================
// GUEST STAYS & FRONT DESK OPERATIONS
// ============================================================================

/**
 * Retrieves all currently active stays with guest details, charges, and payment totals.
 */
if ($action === 'active_stays') {
    $q = $pdo->query("SELECT s.id, s.stay_code, s.guest_count, s.checkin_at, s.planned_checkout, s.room_id, r.room_number, f.id AS folio_id, f.folio_number, f.status AS folio_status, c.customer_id, c.first_name, c.middle_name, c.last_name, c.contact_number, c.email, TRIM(CONCAT_WS(' ', c.first_name, NULLIF(c.middle_name, ''), c.last_name)) AS guest_name, (SELECT COALESCE(SUM(amount),0) FROM charges WHERE folio_id=f.id) AS charges_total, (SELECT COALESCE(SUM(amount),0) FROM payments WHERE folio_id=f.id) AS paid_total FROM stays s JOIN rooms r ON r.id=s.room_id JOIN folios f ON f.stay_id=s.id LEFT JOIN customers c ON c.customer_id=s.customer_id WHERE s.status='ACTIVE' AND f.status='OPEN' ORDER BY s.checkin_at DESC");
    $stays = $q->fetchAll();
    $vatRate = htl103_vat_rate($pdo);
    foreach ($stays as &$s) {
        $fid = (int)$s['folio_id'];
        $qDis = $pdo->prepare("SELECT COALESCE(SUM(amount),0) FROM applied_discounts WHERE folio_id=? AND status IN ('APPLIED','APPROVED')");
        $qDis->execute([$fid]);
        $dis = (float)$qDis->fetchColumn();

        $charges = (float)$s['charges_total'];
        $paid = (float)$s['paid_total'];
        $net = max(0, $charges - $dis);
        $vat = round($net * $vatRate, 2);
        $final = round($net + $vat, 2);
        $bal = max(0, round($final - $paid, 2));

        $qRoom = $pdo->prepare("SELECT COALESCE(SUM(amount),0) FROM charges WHERE folio_id=? AND category='ROOM'");
        $qRoom->execute([$fid]);
        $roomCharges = (float)$qRoom->fetchColumn();

        $qAdd = $pdo->prepare("SELECT COALESCE(SUM(amount),0) FROM charges WHERE folio_id=? AND category!='ROOM'");
        $qAdd->execute([$fid]);
        $additionalCharges = (float)$qAdd->fetchColumn();

        $s['room_charges'] = money($roomCharges);
        $s['additional_charges'] = money($additionalCharges);
        $s['discount_total'] = money($dis);
        $s['net_total'] = money($net);
        $s['vat_total'] = money($vat);
        $s['final_total'] = money($final);
        $s['balance_due'] = money($bal);
        $s['is_settled'] = $bal <= 0.009;
    }
    unset($s);
    out(['stays' => $stays]);
}

/**
 * Processes guest check-in: creates stay, opens folio, posts room charge, updates room to OCCUPIED,
 * generates guest portal token, and triggers real-time alerts.
 */
if ($action === 'checkin') {
    require_role(['admin', 'manager', 'frontdesk']);
    $room = (int)($in['room_id'] ?? 0);
    $guests = max(1, (int)($in['guests'] ?? 1));
    $nights = max(1, min(90, (int)($in['nights'] ?? 1)));
    $firstName = trim((string)($in['first_name'] ?? ''));
    $lastName = trim((string)($in['last_name'] ?? ''));
    $contact = trim((string)($in['contact_number'] ?? ''));
    $email = trim((string)($in['email'] ?? ''));
    $discountGross = round((float)($in['discount_amount'] ?? 0), 2);
    $discountCategory = strtoupper(trim((string)($in['discount_category'] ?? '')));
    $discountReason = trim((string)($in['discount_reason'] ?? ''));
    $discountCategories = [
        'SENIOR_CITIZEN' => 'Senior Citizen',
        'PWD' => 'PWD',
        'OTHER' => 'Other'
    ];

    if ($firstName === '' || strlen($firstName) > 100) {
        out(['error' => 'Guest first name is required.'], 400);
    }
    if ($lastName === '' || strlen($lastName) > 100) {
        out(['error' => 'Guest last name is required.'], 400);
    }
    if ($contact !== '' && strlen($contact) > 30) {
        out(['error' => 'Contact number is too long.'], 400);
    }
    if ($email !== '' && (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 150)) {
        out(['error' => 'Enter a valid email address or leave it empty.'], 400);
    }
    if ($discountGross < 0) {
        out(['error' => 'Discount cannot be negative.'], 400);
    }
    if ($discountGross > 0 && !hotel_user_can($u, 'discounts.apply', $pdo)) {
        out(['error' => 'You do not have permission to apply a check-in discount.'], 403);
    }
    if ($discountGross > 0 && $discountReason === '') {
        out(['error' => 'Give a reason or reference for the discount.'], 400);
    }
    if ($discountGross > 0 && !isset($discountCategories[$discountCategory])) {
        out(['error' => 'Choose Senior Citizen, PWD, or Other as the discount type.'], 400);
    }

    htl_ensure_checkin_payments($pdo);
    $pdo->beginTransaction();
    try {
        $q = $pdo->prepare("SELECT r.*, rt.nightly_rate, rt.capacity FROM rooms r JOIN room_types rt ON rt.id=r.room_type_id WHERE r.id=? FOR UPDATE");
        $q->execute([$room]);
        $r = $q->fetch();
        if (!$r || $r['status'] !== 'AVAILABLE') {
            throw new RuntimeException('Room is not available.');
        }
        if ($guests > (int)$r['capacity']) {
            throw new RuntimeException('Guest count exceeds room capacity.');
        }

        $cStmt = $pdo->prepare("INSERT INTO customers (first_name, middle_name, last_name, contact_number, email, emergency_contact, address, id_number, nationality, id_type, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)");
        $cStmt->execute([$firstName, '', $lastName, $contact ?: '', $email ?: '', '', '', '', 'Filipino', '']);
        $customerId = (int)$pdo->lastInsertId();

        $code = 'ST' . strtoupper(bin2hex(random_bytes(5)));
        $checkout = (new DateTimeImmutable('today'))->modify("+$nights days")->format('Y-m-d');

        $q = $pdo->prepare("INSERT INTO stays(stay_code, room_id, customer_id, guest_count, checkin_at, planned_checkout, status, created_by) VALUES(?, ?, ?, ?, NOW(), ?, 'PENDING_PAYMENT', ?)");
        $q->execute([$code, $room, $customerId, $guests, $checkout, $u['id']]);
        $sid = (int)$pdo->lastInsertId();

        $folio = 'F' . date('ymd') . strtoupper(bin2hex(random_bytes(3)));
        $q = $pdo->prepare('INSERT INTO folios(stay_id, folio_number) VALUES(?, ?)');
        $q->execute([$sid, $folio]);
        $fid = (int)$pdo->lastInsertId();

        $rate = (float)$r['nightly_rate'];
        $q = $pdo->prepare("INSERT INTO charges(folio_id, category, description, quantity, unit_price, amount, created_by) VALUES(?, 'ROOM', ?, ?, ?, ?, ?)");
        $q->execute([$fid, 'Accommodation - ' . $nights . ' night(s)', $nights, $rate, $rate * $nights, $u['id']]);

        // FOR PAYMENT record for the Cashier queue.
        // Stays of 5 nights or more settle a 60% downpayment at check-in, and
        // the remaining 40% balance passes to the folio ("5 days above" rule).
        // Stays under 5 nights settle 100% full payment at check-in.
        $roomTotal = round($rate * $nights, 2);
        $vatRate = htl103_vat_rate($pdo);
        $vatAmount = round($roomTotal * $vatRate, 2);
        $grossTotal = round($roomTotal + $vatAmount, 2);
        $totalAmount = $grossTotal;

        if ($discountGross > 0) {
            if ($discountGross >= $totalAmount) {
                throw new RuntimeException('Discount must be less than the total bill.');
            }
            $discountNet = round($discountGross / (1 + $vatRate), 2);
            $discountName = ($discountCategories[$discountCategory] ?? 'Discount') . ' (' . ($discountReason ?: 'Applied at Check-in') . ')';
            $pdo->prepare("INSERT INTO applied_discounts(folio_id, policy_id, name, category, discount_type, discount_value, amount, status, reason, applied_by, approved_by, approved_at) VALUES(?, NULL, ?, ?, 'FIXED', ?, ?, 'APPROVED', ?, ?, ?, NOW())")
                ->execute([$fid, $discountName, $discountCategory, $discountNet, $discountNet, $discountReason, $u['id'], $u['id']]);
            $totalAmount = round($totalAmount - $discountGross, 2);
            audit($pdo, $u['id'], 'CHECKIN_PAYMENT_DISCOUNT', 'stay', $sid, ['discount' => $discountGross, 'category' => $discountCategory, 'discount_pre_vat' => $discountNet, 'reason' => $discountReason, 'gross_total' => $grossTotal, 'new_total' => $totalAmount]);
        }

        $isFiveDaysAbove = ($nights > 5);
        $requiredPercent = $isFiveDaysAbove ? 60 : 100;
        $requiredAmount = round($totalAmount * $requiredPercent / 100, 2);
        $balanceAmount = round($totalAmount - $requiredAmount, 2);

        $q = $pdo->prepare("INSERT INTO checkin_payments(stay_id, folio_id, subject, nights, gross_amount, discount_amount, discount_type, discount_reason, total_amount, required_percent, required_amount, balance_amount, status, created_by) VALUES(?, ?, 'CHECK-IN PAYMENT', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'FOR_PAYMENT', ?)");
        $q->execute([$sid, $fid, $nights, $grossTotal, $discountGross, $discountCategory ?: 'NONE', $discountReason ?: null, $totalAmount, $requiredPercent, $requiredAmount, $balanceAmount, $u['id']]);
        $checkinPaymentId = (int)$pdo->lastInsertId();

        $pdo->prepare("UPDATE rooms SET status='OCCUPIED' WHERE id=?")->execute([$room]);

        $token = bin2hex(random_bytes(32));
        $pdo->prepare('INSERT INTO portal_tokens(stay_id, token_hash, expires_at) VALUES(?, ?, ?)')
            ->execute([$sid, hash('sha256', $token), $checkout . ' 23:59:59']);

        audit($pdo, $u['id'], 'CHECK_IN', 'stay', $sid, ['room' => $r['room_number'], 'nights' => $nights, 'customer_id' => $customerId, 'guest_name' => trim($firstName . ' ' . $lastName), 'checkin_payment_id' => $checkinPaymentId, 'required_amount' => $requiredAmount, 'required_percent' => $requiredPercent, 'discount_amount' => $discountGross]);
        $pdo->commit();

        ws_broadcast('ROOM_STATUS_CHANGED', ['room_id' => $room, 'room_number' => $r['room_number'], 'status' => 'OCCUPIED'], null, null, null, true);
        ws_broadcast('STAY_CHECKIN', [
            'stay_id' => $sid,
            'stay_code' => $code,
            'room_id' => $room,
            'room_number' => $r['room_number'],
            'folio_number' => $folio,
            'guest_name' => trim($firstName . ' ' . $lastName)
        ], null, 'frontdesk');
        ws_broadcast('CHECKIN_PAYMENT_CREATED', [
            'checkin_payment_id' => $checkinPaymentId,
            'stay_id' => $sid,
            'stay_code' => $code,
            'room_id' => $room,
            'room_number' => $r['room_number'],
            'folio_number' => $folio,
            'guest_name' => trim($firstName . ' ' . $lastName),
            'nights' => $nights,
            'gross_amount' => $grossTotal,
            'discount_amount' => $discountGross,
            'discount_type' => $discountCategory,
            'discount_reason' => $discountReason,
            'total_amount' => $totalAmount,
            'required_percent' => $requiredPercent,
            'required_amount' => $requiredAmount,
            'balance_amount' => $balanceAmount,
            'is_five_days_above' => $isFiveDaysAbove,
            'actor_id' => (int)$u['id']
        ], null, 'cashier');

        out([
            'ok' => true,
            'stay_code' => $code,
            'folio_number' => $folio,
            'guest_portal_url' => '/portal.php?t=' . $token,
            'customer_id' => $customerId,
            'guest_name' => trim($firstName . ' ' . $lastName),
            'stay_status' => 'PENDING_PAYMENT',
            'checkin_payment_id' => $checkinPaymentId,
            'nights' => $nights,
            'gross_amount' => money($grossTotal),
            'discount_amount' => money($discountGross),
            'discount_type' => $discountCategory,
            'discount_reason' => $discountReason,
            'total_amount' => money($totalAmount),
            'required_percent' => $requiredPercent,
            'required_amount' => money($requiredAmount),
            'balance_amount' => money($balanceAmount),
            'is_five_days_above' => $isFiveDaysAbove
        ]);
    } catch (Throwable $e) {
        $pdo->rollBack();
        out(['error' => $e->getMessage()], 400);
    }
}

/**
 * Creates or updates the guest profile attached to an active stay (staff-side).
 * First and last name are required; middle name, contact number, and email are
 * optional. Used to attach details to a stay or correct a name after check-in.
 */
if ($action === 'update_stay_guest') {
    require_role(['admin', 'manager', 'frontdesk']);
    $sid = (int)($in['stay_id'] ?? 0);
    $firstName = trim((string)($in['first_name'] ?? ''));
    $middleName = trim((string)($in['middle_name'] ?? ''));
    $lastName = trim((string)($in['last_name'] ?? ''));
    $contact = trim((string)($in['contact_number'] ?? ''));
    $email = trim((string)($in['email'] ?? ''));

    if ($sid < 1) {
        out(['error' => 'Choose a valid stay.'], 400);
    }
    if ($firstName === '' || strlen($firstName) > 100) {
        out(['error' => 'Guest first name is required.'], 400);
    }
    if ($lastName === '' || strlen($lastName) > 100) {
        out(['error' => 'Guest last name is required.'], 400);
    }
    if (strlen($middleName) > 100) {
        out(['error' => 'Middle name is too long.'], 400);
    }
    if ($contact !== '' && strlen($contact) > 30) {
        out(['error' => 'Contact number is too long.'], 400);
    }
    if ($email !== '' && (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 150)) {
        out(['error' => 'Enter a valid email address or leave it empty.'], 400);
    }

    $pdo->beginTransaction();
    try {
        $q = $pdo->prepare("SELECT s.id, s.stay_code, s.customer_id, r.room_number FROM stays s JOIN rooms r ON r.id=s.room_id WHERE s.id=? AND s.status='ACTIVE' FOR UPDATE");
        $q->execute([$sid]);
        $stay = $q->fetch();
        if (!$stay) {
            throw new RuntimeException('Active stay not found.');
        }

        $customerId = (int)($stay['customer_id'] ?? 0);
        if ($customerId > 0) {
            $cStmt = $pdo->prepare("UPDATE customers SET first_name=?, middle_name=?, last_name=?, contact_number=?, email=? WHERE customer_id=?");
            $cStmt->execute([$firstName, $middleName ?: '', $lastName, $contact ?: '', $email ?: '', $customerId]);
        } else {
            $cStmt = $pdo->prepare("INSERT INTO customers (first_name, middle_name, last_name, contact_number, email, emergency_contact, address, id_number, nationality, id_type, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)");
            $cStmt->execute([$firstName, $middleName ?: '', $lastName, $contact ?: '', $email ?: '', '', '', '', 'Filipino', '']);
            $customerId = (int)$pdo->lastInsertId();
            $pdo->prepare("UPDATE stays SET customer_id=? WHERE id=?")->execute([$customerId, $sid]);
        }

        $guestName = trim($firstName . ' ' . ($middleName !== '' ? $middleName . ' ' : '') . $lastName);
        audit($pdo, $u['id'], 'GUEST_DETAILS_UPDATED', 'stay', $sid, ['stay_code' => $stay['stay_code'], 'customer_id' => $customerId, 'guest_name' => $guestName]);
        $pdo->commit();

        ws_broadcast('GUEST_REGISTERED', [
            'stay_id' => $sid,
            'stay_code' => $stay['stay_code'],
            'room_number' => $stay['room_number'],
            'customer_id' => $customerId,
            'guest_name' => $guestName,
            'first_name' => $firstName,
            'last_name' => $lastName,
            'contact_number' => $contact,
            'email' => $email,
            'actor_id' => (int)$u['id']
        ], null, 'frontdesk', $stay['stay_code']);

        out(['ok' => true, 'customer_id' => $customerId, 'guest_name' => $guestName]);
    } catch (Throwable $e) {
        $pdo->rollBack();
        out(['error' => $e->getMessage()], 400);
    }
}

/**
 * Lists the check-in payment queue: FOR PAYMENT records first, then recent
 * approvals/cancellations, with guest, room, folio, and receipt details.
 */
if ($action === 'checkin_payments') {
    htl_ensure_checkin_payments($pdo);
    $q = $pdo->query("SELECT cp.*, s.stay_code, s.status AS stay_status, s.guest_count, s.checkin_at, s.planned_checkout, r.room_number, f.folio_number, TRIM(CONCAT_WS(' ', c.first_name, NULLIF(c.middle_name, ''), c.last_name)) AS guest_name, c.contact_number, uc.username AS created_by_name, ua.username AS approved_by_name, ucf.username AS confirmed_by_name, p.receipt_number FROM checkin_payments cp JOIN stays s ON s.id=cp.stay_id JOIN rooms r ON r.id=s.room_id JOIN folios f ON f.id=cp.folio_id LEFT JOIN customers c ON c.customer_id=s.customer_id LEFT JOIN users uc ON uc.id=cp.created_by LEFT JOIN users ua ON ua.id=cp.approved_by LEFT JOIN users ucf ON ucf.id=cp.confirmed_by LEFT JOIN payments p ON p.id=cp.payment_id ORDER BY CASE cp.status WHEN 'FOR_PAYMENT' THEN 0 WHEN 'APPROVED' THEN 1 ELSE 2 END, cp.created_at DESC LIMIT 100");
    out(['checkin_payments' => $q->fetchAll()]);
}

/**
 * Lists stays still waiting for the Cashier to approve their check-in
 * payment, with the amount the guest must settle.
 */
if ($action === 'pending_checkins') {
    htl_ensure_checkin_payments($pdo);
    $q = $pdo->query("SELECT s.id, s.stay_code, s.guest_count, s.checkin_at, s.planned_checkout, s.room_id, r.room_number, f.id AS folio_id, f.folio_number, c.customer_id, c.first_name, c.middle_name, c.last_name, c.contact_number, c.email, TRIM(CONCAT_WS(' ', c.first_name, NULLIF(c.middle_name, ''), c.last_name)) AS guest_name, cp.id AS checkin_payment_id, cp.nights AS payment_nights, COALESCE(NULLIF(cp.gross_amount, 0), cp.total_amount + cp.discount_amount) AS gross_amount, cp.discount_amount, cp.discount_type, cp.discount_reason, cp.total_amount, cp.required_percent, cp.required_amount, COALESCE(NULLIF(cp.balance_amount, 0), ROUND(GREATEST(0, cp.total_amount - cp.required_amount), 2)) AS balance_amount, cp.status AS payment_status, cp.created_at AS payment_created_at FROM stays s JOIN rooms r ON r.id=s.room_id JOIN folios f ON f.stay_id=s.id LEFT JOIN customers c ON c.customer_id=s.customer_id LEFT JOIN checkin_payments cp ON cp.stay_id=s.id AND cp.status='FOR_PAYMENT' WHERE s.status='PENDING_PAYMENT' ORDER BY s.checkin_at DESC");
    out(['stays' => $q->fetchAll()]);
}

/**
 * Approves a check-in payment. CASHIER ONLY: the role is checked exactly, so
 * front desk, manager, and admin accounts can view the queue but can never
 * approve. Approval posts the required amount as a real folio payment with an
 * official receipt, activates the stay (PENDING_PAYMENT -> ACTIVE), and
 * notifies Front Desk and the guest portal in realtime.
 */
if ($action === 'approve_checkin_payment') {
    $uRoleClean = strtolower(trim((string)($u['role'] ?? '')));
    if ($uRoleClean !== 'cashier') {
        out(['error' => 'Only the Cashier can approve a check-in payment.'], 403);
    }
    htl_ensure_checkin_payments($pdo);
    htl_ensure_billing_schema($pdo);
    $cpId = (int)($in['checkin_payment_id'] ?? 0);
    $method = (string)($in['method'] ?? 'CASH');
    $received = round((float)($in['amount_received'] ?? 0), 2);
    $allowedMethods = ['CASH', 'BANK_TRANSFER', 'GCASH', 'MAYA', 'QR_PH', 'CARD', 'OTHER'];
    if ($cpId < 1 || !in_array($method, $allowedMethods, true)) {
        out(['error' => 'Choose a valid check-in payment and payment method.'], 400);
    }
    if (round((float)($in['discount_amount'] ?? 0), 2) !== 0.0) {
        out(['error' => 'Check-in discounts must be applied by Front Desk before payment.'], 400);
    }

    $pdo->beginTransaction();
    try {
        $q = $pdo->prepare("SELECT cp.*, s.stay_code, s.status AS stay_status, s.room_id, r.room_number, f.folio_number, TRIM(CONCAT_WS(' ', c.first_name, NULLIF(c.middle_name, ''), c.last_name)) AS guest_name FROM checkin_payments cp JOIN stays s ON s.id=cp.stay_id JOIN rooms r ON r.id=s.room_id JOIN folios f ON f.id=cp.folio_id LEFT JOIN customers c ON c.customer_id=s.customer_id WHERE cp.id=? FOR UPDATE");
        $q->execute([$cpId]);
        $cp = $q->fetch();
        if (!$cp) {
            throw new RuntimeException('Check-in payment not found.');
        }
        if ($cp['status'] !== 'FOR_PAYMENT') {
            throw new RuntimeException('This check-in payment was already processed.');
        }
        // '' is the legacy stranded state from databases whose stays.status
        // ENUM predates PENDING_PAYMENT (repaired by htl_ensure_checkin_payments).
        if (!in_array($cp['stay_status'], ['PENDING_PAYMENT', ''], true)) {
            throw new RuntimeException('This check-in is no longer pending payment.');
        }

        $fid = (int)$cp['folio_id'];
        $required = round((float)$cp['required_amount'], 2);
        if ($received < $required - 0.001) {
            throw new RuntimeException('Amount received is below the required ' . ($cp['required_percent'] === 100 || (int)$cp['required_percent'] === 100 ? 'full payment' : 'downpayment') . ' of ' . money($required) . '.');
        }

        // Folio due right now. Any amount the guest pays ABOVE the required
        // downpayment is applied to the bill (it proceeds against the
        // balance); only the excess above the total due is handed back as
        // change.
        $q = $pdo->prepare('SELECT COALESCE(SUM(amount),0) n FROM charges WHERE folio_id=?');
        $q->execute([$fid]);
        $chargesTotal = (float)$q->fetch()['n'];
        $q = $pdo->prepare("SELECT COALESCE(SUM(amount),0) n FROM applied_discounts WHERE folio_id=? AND status IN ('APPLIED','APPROVED')");
        $q->execute([$fid]);
        $discountsTotal = (float)$q->fetch()['n'];
        $net = max(0, $chargesTotal - $discountsTotal);
        $vat = round($net * htl103_vat_rate($pdo), 2);
        $q = $pdo->prepare('SELECT COALESCE(SUM(amount),0) n FROM payments WHERE folio_id=?');
        $q->execute([$fid]);
        $paidTotal = (float)$q->fetch()['n'];
        $q = $pdo->prepare("SELECT COALESCE(SUM(amount),0) n FROM refunds WHERE folio_id=? AND status='COMPLETED'");
        $q->execute([$fid]);
        $refundsTotal = (float)$q->fetch()['n'];
        $due = round(max(0, $net + $vat - $paidTotal + $refundsTotal), 2);

        $applied = round(min($received, $due), 2);
        if ($applied <= 0) {
            throw new RuntimeException('Nothing is due on this folio.');
        }
        if ($method !== 'CASH' && abs($received - $applied) > 0.009) {
            throw new RuntimeException('Non-cash payment cannot include cash change. Enter the exact amount to apply or use CASH for tender and change.');
        }
        $change = $method === 'CASH' ? round($received - $applied, 2) : 0.0;
        $remaining = round(max(0, $due - $applied), 2);

        $receipt = 'OR' . date('ymd') . strtoupper(bin2hex(random_bytes(3)));
        $idem = hash('sha256', 'checkin-payment:' . $cpId);
        $q = $pdo->prepare('INSERT INTO payments(folio_id, receipt_number, method, amount, received_amount, change_amount, reference_note, received_by, idempotency_key, idempotency_part) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 0)');
        $q->execute([$fid, $receipt, $method, $applied, $received, $change, 'Check-in payment (' . (int)$cp['required_percent'] . '% of total)', $u['id'], $idem]);
        $paymentId = (int)$pdo->lastInsertId();

        $pdo->prepare("UPDATE checkin_payments SET status='APPROVED', approved_by=?, approved_at=NOW(), payment_id=? WHERE id=?")
            ->execute([$u['id'], $paymentId, $cpId]);
        $pdo->prepare("UPDATE stays SET status='ACTIVE' WHERE id=?")->execute([(int)$cp['stay_id']]);

        audit($pdo, $u['id'], 'CHECKIN_PAYMENT_APPROVED', 'stay', (int)$cp['stay_id'], ['checkin_payment_id' => $cpId, 'payment_id' => $paymentId, 'receipt_number' => $receipt, 'amount' => $required, 'applied' => $applied, 'received' => $received, 'change' => $change, 'method' => $method, 'guest_name' => $cp['guest_name'], 'room' => $cp['room_number']]);
        $pdo->commit();

        $payload = [
            'checkin_payment_id' => $cpId,
            'stay_id' => (int)$cp['stay_id'],
            'stay_code' => $cp['stay_code'],
            'room_number' => $cp['room_number'],
            'folio_number' => $cp['folio_number'],
            'guest_name' => $cp['guest_name'],
            'amount' => $applied,
            'receipt_number' => $receipt,
            'approved_by' => $u['username'],
            'remaining_balance' => $remaining,
            'actor_id' => (int)$u['id']
        ];
        ws_broadcast('CHECKIN_PAYMENT_APPROVED', $payload, null, 'frontdesk', $cp['stay_code']);
        ws_broadcast('FOLIO_UPDATED', ['folio_id' => $fid, 'stay_code' => $cp['stay_code'], 'type' => 'PAYMENT_RECORDED', 'amount' => $applied, 'remaining_balance' => $remaining], null, 'frontdesk', $cp['stay_code']);
        ws_broadcast('STAY_CHECKIN', ['stay_id' => (int)$cp['stay_id'], 'stay_code' => $cp['stay_code'], 'room_id' => (int)$cp['room_id'], 'room_number' => $cp['room_number'], 'folio_number' => $cp['folio_number'], 'guest_name' => $cp['guest_name']], null, 'frontdesk');

        out([
            'ok' => true,
            'payment_id' => $paymentId,
            'receipt_number' => $receipt,
            'amount_paid' => money($applied),
            'received_amount' => money($received),
            'change' => money($change),
            'remaining_balance' => money($remaining),
            'method' => $method,
            'stay_id' => (int)$cp['stay_id'],
            'stay_code' => $cp['stay_code'],
            'folio_id' => $fid,
            'folio_number' => $cp['folio_number'],
            'room_number' => $cp['room_number'],
            'guest_name' => $cp['guest_name'],
            'cashier_name' => $u['username'],
            'stay_status' => 'ACTIVE'
        ]);
    } catch (Throwable $e) {
        $pdo->rollBack();
        out(['error' => $e->getMessage()], 400);
    }
}

/**
 * Front Desk confirmation of a cashier-approved check-in payment. This is
 * the closing step of the check-in payment loop: Front Desk acknowledges the
 * verified payment, and the Cashier is notified with a realtime pop-up on
 * the Payments page / dashboard. The Cashier cannot confirm their own
 * approvals (the action is mapped to the front-desk stays.checkin
 * permission, which the cashier role does not hold).
 */
if ($action === 'confirm_checkin_payment') {
    require_role(['admin', 'manager', 'frontdesk']);
    htl_ensure_checkin_payments($pdo);
    $cpId = (int)($in['checkin_payment_id'] ?? 0);
    if ($cpId < 1) {
        out(['error' => 'Choose a valid check-in payment.'], 400);
    }

    $pdo->beginTransaction();
    try {
        $q = $pdo->prepare("SELECT cp.*, s.stay_code, r.room_number, f.folio_number, TRIM(CONCAT_WS(' ', c.first_name, NULLIF(c.middle_name, ''), c.last_name)) AS guest_name, p.receipt_number FROM checkin_payments cp JOIN stays s ON s.id=cp.stay_id JOIN rooms r ON r.id=s.room_id JOIN folios f ON f.id=cp.folio_id LEFT JOIN customers c ON c.customer_id=s.customer_id LEFT JOIN payments p ON p.id=cp.payment_id WHERE cp.id=? FOR UPDATE");
        $q->execute([$cpId]);
        $cp = $q->fetch();
        if (!$cp) {
            throw new RuntimeException('Check-in payment not found.');
        }
        if ($cp['status'] !== 'APPROVED') {
            throw new RuntimeException('Only an approved check-in payment can be confirmed.');
        }
        if (!empty($cp['confirmed_at'])) {
            throw new RuntimeException('This payment was already confirmed.');
        }

        $pdo->prepare("UPDATE checkin_payments SET confirmed_by=?, confirmed_at=NOW() WHERE id=?")
            ->execute([$u['id'], $cpId]);

        audit($pdo, $u['id'], 'CHECKIN_PAYMENT_CONFIRMED', 'stay', (int)$cp['stay_id'], ['checkin_payment_id' => $cpId, 'receipt_number' => $cp['receipt_number'], 'guest_name' => $cp['guest_name'], 'room' => $cp['room_number']]);
        $pdo->commit();

        ws_broadcast('CHECKIN_PAYMENT_CONFIRMED', [
            'checkin_payment_id' => $cpId,
            'stay_id' => (int)$cp['stay_id'],
            'stay_code' => $cp['stay_code'],
            'room_number' => $cp['room_number'],
            'folio_number' => $cp['folio_number'],
            'guest_name' => $cp['guest_name'],
            'receipt_number' => $cp['receipt_number'],
            'confirmed_by' => $u['username'],
            'actor_id' => (int)$u['id']
        ], null, 'cashier');

        out(['ok' => true]);
    } catch (Throwable $e) {
        $pdo->rollBack();
        out(['error' => $e->getMessage()], 400);
    }
}

/**
 * Cancels a check-in that is still pending payment (guest never settled):
 * releases the room, closes the folio, and marks the queue record CANCELLED.
 */
if ($action === 'cancel_pending_checkin') {
    require_role(['admin', 'manager', 'frontdesk']);
    htl_ensure_checkin_payments($pdo);
    $sid = (int)($in['stay_id'] ?? 0);
    if ($sid < 1) {
        out(['error' => 'Choose a valid stay.'], 400);
    }

    $pdo->beginTransaction();
    try {
        $q = $pdo->prepare("SELECT s.id, s.stay_code, s.room_id, r.room_number FROM stays s JOIN rooms r ON r.id=s.room_id WHERE s.id=? AND s.status='PENDING_PAYMENT' FOR UPDATE");
        $q->execute([$sid]);
        $stay = $q->fetch();
        if (!$stay) {
            throw new RuntimeException('Pending check-in not found.');
        }

        $pdo->prepare("UPDATE checkin_payments SET status='CANCELLED' WHERE stay_id=? AND status='FOR_PAYMENT'")->execute([$sid]);
        $pdo->prepare("UPDATE folios SET status='CANCELLED' WHERE stay_id=?")->execute([$sid]);
        $pdo->prepare("UPDATE stays SET status='CANCELLED' WHERE id=?")->execute([$sid]);
        $pdo->prepare("UPDATE rooms SET status='AVAILABLE' WHERE id=?")->execute([(int)$stay['room_id']]);

        audit($pdo, $u['id'], 'CHECKIN_PAYMENT_CANCELLED', 'stay', $sid, ['stay_code' => $stay['stay_code'], 'room' => $stay['room_number']]);
        $pdo->commit();

        ws_broadcast('CHECKIN_PAYMENT_CANCELLED', ['stay_id' => $sid, 'stay_code' => $stay['stay_code'], 'room_number' => $stay['room_number'], 'actor_id' => (int)$u['id']], null, 'frontdesk', $stay['stay_code']);
        ws_broadcast('ROOM_STATUS_CHANGED', ['room_id' => (int)$stay['room_id'], 'room_number' => $stay['room_number'], 'status' => 'AVAILABLE'], null, null, null, true);

        out(['ok' => true]);
    } catch (Throwable $e) {
        $pdo->rollBack();
        out(['error' => $e->getMessage()], 400);
    }
}

/**
 * Transfers an active stay to another available room, updates room statuses,
 * logs room transfer history, and posts rate adjustment charges if rates differ.
 */
if ($action === 'transfer') {
    require_role(['admin', 'manager', 'frontdesk']);
    $sid = (int)($in['stay_id'] ?? 0);
    $to = (int)($in['to_room_id'] ?? 0);
    $reason = trim((string)($in['reason'] ?? ''));

    if ($reason === '') {
        out(['error' => 'Transfer reason is required'], 400);
    }

    $pdo->beginTransaction();
    try {
        $q = $pdo->prepare("SELECT s.*, r.room_number AS from_room, rt.nightly_rate AS old_rate FROM stays s JOIN rooms r ON r.id=s.room_id JOIN room_types rt ON rt.id=r.room_type_id WHERE s.id=? AND s.status='ACTIVE' FOR UPDATE");
        $q->execute([$sid]);
        $s = $q->fetch();

        $q = $pdo->prepare('SELECT r.*, rt.nightly_rate AS new_rate FROM rooms r JOIN room_types rt ON rt.id=r.room_type_id WHERE r.id=? FOR UPDATE');
        $q->execute([$to]);
        $r = $q->fetch();

        if (!$s || !$r || $r['status'] !== 'AVAILABLE' || (int)$s['room_id'] === $to) {
            throw new RuntimeException('Stay or destination room is invalid.');
        }

        $effective = (new DateTimeImmutable('today'))->format('Y-m-d');
        $q = $pdo->prepare('INSERT INTO room_transfers(stay_id, from_room_id, to_room_id, effective_date, old_rate, new_rate, reason, authorized_by) VALUES(?, ?, ?, ?, ?, ?, ?, ?)');
        $q->execute([$sid, $s['room_id'], $to, $effective, $s['old_rate'], $r['new_rate'], $reason, $u['id']]);

        $pdo->prepare("UPDATE rooms SET status='AVAILABLE' WHERE id=?")->execute([$s['room_id']]);
        $pdo->prepare("UPDATE rooms SET status='OCCUPIED' WHERE id=?")->execute([$to]);
        $pdo->prepare('UPDATE stays SET room_id=? WHERE id=?')->execute([$to, $sid]);

        $q = $pdo->prepare('SELECT id FROM folios WHERE stay_id=?');
        $q->execute([$sid]);
        $fid = (int)$q->fetch()['id'];

        $remaining = max(0, (new DateTimeImmutable($s['planned_checkout']))->diff(new DateTimeImmutable($effective))->days);
        $delta = round((float)$r['new_rate'] - (float)$s['old_rate'], 2);

        if ($remaining > 0 && abs($delta) > 0.001) {
            $desc = ($delta > 0 ? 'Room rate increase from ' : 'Room rate credit from ') . $effective;
            $pdo->prepare("INSERT INTO charges(folio_id, category, description, quantity, unit_price, amount, created_by) VALUES(?, 'ADJUSTMENT', ?, ?, ?, ?, ?)")
                ->execute([$fid, $desc, $remaining, $delta, $remaining * $delta, $u['id']]);
        }

        $code = 'RQ' . strtoupper(bin2hex(random_bytes(4)));
        // This row is the audit record of a transfer that has ALREADY been
        // executed above, so it is born COMPLETED. (As IN_PROGRESS it stayed
        // "open" forever and the checkout guard then blocked the stay.)
        $pdo->prepare("INSERT INTO service_requests(stay_id, request_code, service_type, request_kind, requested_room_id, description, status) VALUES(?, ?, 'FRONT_DESK', 'ROOM_TRANSFER', ?, ?, 'COMPLETED')")
            ->execute([$sid, $code, $to, 'Front desk initiated room transfer from room ' . $s['from_room'] . ' to ' . $r['room_number'] . '. Transfer effective immediately.']);

        $pdo->commit();

        audit($pdo, $u['id'], 'ROOM_TRANSFER', 'stay', $sid, ['from' => $s['from_room'], 'to' => $r['room_number'], 'effective' => $effective]);
        ws_broadcast('ROOM_STATUS_CHANGED', ['room_id' => (int)$s['room_id'], 'room_number' => $s['from_room'], 'status' => 'AVAILABLE'], null, null, null, true);
        ws_broadcast('ROOM_STATUS_CHANGED', ['room_id' => $to, 'room_number' => $r['room_number'], 'status' => 'OCCUPIED'], null, null, null, true);
        ws_broadcast('STAY_UPDATED', ['stay_id' => $sid, 'stay_code' => $s['stay_code'], 'room_id' => $to, 'room_number' => $r['room_number']], null, 'frontdesk', $s['stay_code']);

        out(['ok' => true, 'effective_date' => $effective]);
    } catch (Throwable $e) {
        $pdo->rollBack();
        out(['error' => $e->getMessage()], 400);
    }
}

/**
 * Finalizes guest departure / checkout: validates zero remaining balance,
 * creates immutable checkout record, marks stay checked out, sets room to CLEANING,
 * revokes guest portal tokens, and triggers real-time updates.
 */
if ($action === 'checkout') {
    require_role(['admin', 'frontdesk', 'cashier']);
    $sid = (int)($in['stay_id'] ?? 0);

    $pdo->beginTransaction();
    try {
        $q = $pdo->prepare("SELECT s.*, f.id AS folio_id, f.status AS folio_status, r.id AS room_id, r.room_number FROM stays s JOIN folios f ON f.stay_id=s.id JOIN rooms r ON r.id=s.room_id WHERE s.id=? AND s.status='ACTIVE' FOR UPDATE");
        $q->execute([$sid]);
        $s = $q->fetch();
        if (!$s) {
            throw new RuntimeException('Active stay not found.');
        }

        $q = $pdo->prepare("SELECT id, status FROM early_checkout_requests WHERE stay_id=? AND status IN ('REQUESTED','APPROVED') ORDER BY created_at DESC LIMIT 1 FOR UPDATE");
        $q->execute([$sid]);
        $pendingEarly = $q->fetch();
        if ($pendingEarly) {
            $state = $pendingEarly['status'] === 'REQUESTED' ? 'waiting for manager approval' : 'approved but not yet finalized';
            throw new RuntimeException('Checkout is blocked: an early checkout request is ' . $state . '. Open Early Checkout Approvals, resolve and finalize the request, then settle the folio before checkout.');
        }

        $q = $pdo->prepare('SELECT COALESCE(SUM(amount),0) n FROM charges WHERE folio_id=?');
        $q->execute([$s['folio_id']]);
        $total = (float)$q->fetch()['n'];

        $q = $pdo->prepare("SELECT COALESCE(SUM(amount),0) n FROM applied_discounts WHERE folio_id=? AND status IN ('APPLIED','APPROVED')");
        $q->execute([$s['folio_id']]);
        $discounts = (float)$q->fetch()['n'];

        $q = $pdo->prepare('SELECT COALESCE(SUM(amount),0) n FROM payments WHERE folio_id=?');
        $q->execute([$s['folio_id']]);
        $paid = (float)$q->fetch()['n'];

        $net = max(0, $total - $discounts);
        $vat = round($net * htl103_vat_rate($pdo), 2);

        $q = $pdo->prepare("SELECT COALESCE(SUM(amount),0) n FROM refunds WHERE folio_id=? AND status='COMPLETED'");
        $q->execute([$s['folio_id']]);
        $refunds = (float)$q->fetch()['n'];

        if (max(0, $net + $vat + $refunds) - $paid > 0.009) {
            throw new RuntimeException('Settle the discounted folio balance including VAT before checkout.');
        }
        if ($paid - $refunds - ($net + $vat) > 0.009) {
            $overpaid = round($paid - $refunds - ($net + $vat), 2);
            throw new RuntimeException('The folio is overpaid by ₱' . number_format($overpaid, 2) . '. Submit, approve, and complete a refund of that amount before final checkout.');
        }

        $q = $pdo->prepare("SELECT COUNT(*) n FROM service_requests WHERE stay_id=? AND status IN ('NEW','PENDING','ASSIGNED','ACKNOWLEDGED','ACCEPTED','IN_PROGRESS','ON_HOLD')");
        $q->execute([$sid]);
        if ((int)$q->fetch()['n'] > 0) {
            throw new RuntimeException('Complete or cancel open service requests before checkout.');
        }

        $checkinDate = new DateTimeImmutable($s['checkin_at']);
        $plannedDate = new DateTimeImmutable($s['planned_checkout']);
        $actualDate = new DateTimeImmutable('now');
        $nightsStayed = max(1, (int)$checkinDate->setTime(0, 0)->diff($actualDate->setTime(0, 0))->format('%a'));
        $plannedNights = max(1, (int)$checkinDate->setTime(0, 0)->diff($plannedDate)->format('%a'));

        $pdo->prepare('INSERT INTO checkout_records(stay_id, folio_id, scheduled_checkout_at, actual_checkout_at, nights_stayed, unused_nights, charges_total, discount_total, vat_amount, final_amount, payments_received, refunds_completed, finalized_by) VALUES(?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            ->execute([$sid, $s['folio_id'], $s['planned_checkout'], $nightsStayed, max(0, $plannedNights - $nightsStayed), $total, $discounts, $vat, $net + $vat, $paid, $refunds, $u['id']]);

        $pdo->prepare("UPDATE stays SET status='CHECKED_OUT', actual_checkout=NOW() WHERE id=?")->execute([$sid]);
        $pdo->prepare("UPDATE folios SET status='PAID' WHERE id=?")->execute([$s['folio_id']]);
        $pdo->prepare("UPDATE rooms SET status='CLEANING' WHERE id=?")->execute([$s['room_id']]);
        $pdo->prepare('UPDATE portal_tokens SET revoked_at=NOW() WHERE stay_id=? AND revoked_at IS NULL')->execute([$sid]);

        audit($pdo, $u['id'], 'CHECK_OUT', 'stay', $sid);
        $pdo->commit();

        ws_broadcast('ROOM_STATUS_CHANGED', ['room_id' => (int)$s['room_id'], 'room_number' => $s['room_number'] ?? '', 'status' => 'CLEANING', 'actor_id' => (int)$u['id']], null, null, null, true);
        ws_broadcast('STAY_CHECKOUT', ['stay_id' => $sid, 'stay_code' => $s['stay_code'], 'room_id' => (int)$s['room_id'], 'room_number' => $s['room_number'] ?? '', 'actor_id' => (int)$u['id']], null, 'frontdesk');

        out(['ok' => true, 'message' => 'Checked out. Room moved to CLEANING.']);
    } catch (Throwable $e) {
        $pdo->rollBack();
        out(['error' => $e->getMessage()], 400);
    }
}

// ============================================================================
// BILLING, CHARGES & FOLIO MANAGEMENT
// ============================================================================

/**
 * Retrieves detailed folio statement including charges, payments, discounts,
 * completed refunds, VAT calculation, and remaining balance due.
 */
if ($action === 'folio') {
    $id = (int)($in['folio_id'] ?? 0);
    $q = $pdo->prepare('SELECT f.*, s.stay_code, s.status AS stay_status, s.planned_checkout, s.customer_id, r.room_number, c.first_name, c.middle_name, c.last_name, c.contact_number, c.email, TRIM(CONCAT_WS(" ", c.first_name, NULLIF(c.middle_name, ""), c.last_name)) AS guest_name FROM folios f JOIN stays s ON s.id=f.stay_id JOIN rooms r ON r.id=s.room_id LEFT JOIN customers c ON c.customer_id=s.customer_id WHERE f.id=?');
    $q->execute([$id]);
    $f = $q->fetch();
    if (!$f) {
        out(['error' => 'Folio not found'], 404);
    }

    $q = $pdo->prepare('SELECT * FROM charges WHERE folio_id=? ORDER BY created_at, id');
    $q->execute([$id]);
    $charges = $q->fetchAll();

    $q = $pdo->prepare('SELECT * FROM payments WHERE folio_id=? ORDER BY created_at, id');
    $q->execute([$id]);
    $payments = $q->fetchAll();

    $total = array_sum(array_column($charges, 'amount'));
    $paid = array_sum(array_column($payments, 'amount'));

    $q = $pdo->prepare("SELECT ad.*, u.username AS applied_by_username, u.role AS applied_by_role FROM applied_discounts ad LEFT JOIN users u ON u.id=ad.applied_by WHERE ad.folio_id=? AND ad.status IN ('APPLIED','APPROVED','PENDING') ORDER BY ad.created_at, ad.id");
    $q->execute([$id]);
    $discounts = $q->fetchAll();
    $discountTotal = array_sum(array_map(fn($d) => in_array($d['status'], ['APPLIED', 'APPROVED'], true) ? (float)$d['amount'] : 0, $discounts));

    $q = $pdo->prepare("SELECT * FROM refunds WHERE folio_id=? ORDER BY created_at, id");
    $q->execute([$id]);
    $refunds = $q->fetchAll();
    $refundTotal = array_sum(array_map(fn($r) => $r['status'] === 'COMPLETED' ? (float)$r['amount'] : 0, $refunds));

    $netTotal = max(0, $total - $discountTotal);
    $vatRate = htl103_vat_rate($pdo);
    $vat = round($netTotal * $vatRate, 2);
    $grandTotal = round($netTotal + $vat, 2);

    out([
        'folio' => $f,
        'charges' => $charges,
        'payments' => $payments,
        'discounts' => $discounts,
        'refunds' => $refunds,
        'total' => money($total),
        'discount_total' => money($discountTotal),
        'net_total' => money($netTotal),
        'vat_rate' => round($vatRate * 100, 2),
        'vat' => money($vat),
        'grand_total' => money($grandTotal),
        'paid' => money($paid),
        'refund_total' => money($refundTotal),
        'balance' => money(max(0, $grandTotal - $paid + $refundTotal)),
        'overpaid' => money(max(0, $paid - $refundTotal - $grandTotal))
    ]);
}

/**
 * Posts an incidental charge (Food, Minibar, Laundry, Service, Damage, etc.) to an open folio.
 */
if ($action === 'add_charge') {
    require_role(['admin', 'manager', 'frontdesk', 'cashier']);
    $fid = (int)($in['folio_id'] ?? 0);
    $desc = trim((string)($in['description'] ?? ''));
    $qty = round((float)($in['quantity'] ?? 1), 2);
    $price = round((float)($in['unit_price'] ?? 0), 2);
    $cat = (string)($in['category'] ?? 'OTHER');
    $itemId = (int)($in['catalog_item_id'] ?? 0);
    $idem = trim((string)($in['idempotency_key'] ?? ''));

    if ($qty <= 0 || $qty > 10000 || $price < 0 || $price > 10000000) {
        out(['error' => 'Quantity or unit price is outside the allowed range.'], 400);
    }
    if ($idem !== '' && strlen($idem) > 100) {
        out(['error' => 'Invalid charge submission reference.'], 400);
    }
    if ($idem !== '') {
        $iq = $pdo->prepare('SELECT id FROM charges WHERE idempotency_key=? LIMIT 1');
        $iq->execute([$idem]);
        if ($iq->fetch()) {
            out(['ok' => true, 'duplicate' => true, 'message' => 'This charge was already recorded.']);
        }
    }

    if ($itemId > 0) {
        $cq = $pdo->prepare('SELECT name, category, price FROM service_catalog WHERE id=? AND active=1');
        $cq->execute([$itemId]);
        $item = $cq->fetch();
        if (!$item) {
            out(['error' => 'Selected menu item is unavailable. Refresh the menu and try again.'], 400);
        }
        $desc = $item['name'];
        $price = (float)$item['price'];
        $cat = [
            'FOOD_BEVERAGE' => 'FOOD',
            'HOUSEKEEPING' => 'SERVICE',
            'SERVICE' => 'SERVICE',
            'LAUNDRY' => 'LAUNDRY',
            'MINIBAR' => 'MINIBAR',
            'OTHER' => 'OTHER'
        ][$item['category']] ?? 'OTHER';
    }

    if (!in_array($cat, ['FOOD', 'LAUNDRY', 'MINIBAR', 'SERVICE', 'OTHER', 'ADJUSTMENT', 'DAMAGE', 'MISSING_ITEM', 'EXTRA_PERSON', 'LATE_CHECKOUT', 'ROOM_SERVICE'], true) || $desc === '' || strlen($desc) > 255) {
        out(['error' => 'Invalid charge details'], 400);
    }
    if (in_array($cat, ['DAMAGE', 'MISSING_ITEM'], true) && strlen($desc) < 12) {
        out(['error' => 'Damage or missing-item charges require a detailed description and supporting reference in the remarks.'], 400);
    }

    $q = $pdo->prepare("SELECT f.id FROM folios f JOIN stays s ON s.id=f.stay_id WHERE f.id=? AND f.status='OPEN' AND s.status='ACTIVE'");
    $q->execute([$fid]);
    if (!$q->fetch()) {
        out(['error' => 'Folio is not open for an active stay'], 400);
    }

    $q = $pdo->prepare('INSERT INTO charges(folio_id, category, description, quantity, unit_price, amount, created_by, idempotency_key) VALUES(?, ?, ?, ?, ?, ?, ?, ?)');
    $q->execute([$fid, $cat, $desc, $qty, $price, round($qty * $price, 2), $u['id'], $idem ?: null]);

    audit($pdo, $u['id'], 'ADD_CHARGE', 'folio', $fid, ['category' => $cat, 'amount' => $qty * $price]);

    $stayQ = $pdo->prepare('SELECT s.stay_code FROM folios f JOIN stays s ON s.id=f.stay_id WHERE f.id=?');
    $stayQ->execute([$fid]);
    $sCode = $stayQ->fetchColumn() ?: null;

    ws_broadcast('FOLIO_UPDATED', [
        'folio_id' => $fid,
        'stay_code' => $sCode,
        'type' => 'CHARGE_ADDED',
        'category' => $cat,
        'amount' => round($qty * $price, 2)
    ], null, 'frontdesk', $sCode);

    out(['ok' => true]);
}

/**
 * Records a payment against an open folio with support for split payments,
 * change calculation, idempotency protection, and official receipt numbering.
 */
if ($action === 'pay') {
    require_role(['admin', 'manager', 'cashier']);
    htl_ensure_billing_schema($pdo);
    $fid = (int)($in['folio_id'] ?? 0);
    $amount = round((float)($in['amount'] ?? 0), 2);
    $allocations = $in['allocations'] ?? null;
    $received = round((float)($in['received_amount'] ?? $amount), 2);
    $idempotencyKey = strtolower(trim((string)($in['idempotency_key'] ?? '')));

    if (!preg_match('/^[a-f0-9]{64}$/', $idempotencyKey)) {
        out(['error' => 'A valid payment request key is required.'], 400);
    }

    $allowed = ['CASH', 'BANK_TRANSFER', 'GCASH', 'MAYA', 'QR_PH', 'CARD', 'OTHER'];
    $parts = [];

    if (is_array($allocations) && count($allocations) > 0) {
        if (count($allocations) > 7) {
            out(['error' => 'Too many payment methods in one transaction.'], 400);
        }
        foreach ($allocations as $a) {
            $method = (string)($a['method'] ?? '');
            $partAmount = round((float)($a['amount'] ?? 0), 2);
            $partReceived = round((float)($a['received_amount'] ?? $partAmount), 2);
            if (!in_array($method, $allowed, true) || $partAmount <= 0) {
                out(['error' => 'Each split payment needs a valid method and positive amount.'], 400);
            }
            $parts[] = ['method' => $method, 'amount' => $partAmount, 'received' => $partReceived, 'note' => substr((string)($a['reference_note'] ?? ''), 0, 120)];
        }
        if (abs(round(array_sum(array_column($parts, 'amount')), 2) - $amount) > 0.009) {
            out(['error' => 'Split payment amounts must add up to the amount applied.'], 400);
        }
    } else {
        $method = (string)($in['method'] ?? 'CASH');
        if (!in_array($method, $allowed, true)) {
            out(['error' => 'Invalid payment method.'], 400);
        }
        $parts[] = ['method' => $method, 'amount' => $amount, 'received' => $received, 'note' => substr((string)($in['reference_note'] ?? ''), 0, 120)];
    }

    if ($amount <= 0 || $received < $amount) {
        out(['error' => 'Invalid payment amount.'], 400);
    }
    foreach ($parts as $part) {
        if ($part['received'] < $part['amount']) {
            out(['error' => 'Received amount cannot be less than applied amount.'], 400);
        }
        if ($part['method'] !== 'CASH' && abs($part['received'] - $part['amount']) > 0.009) {
            out(['error' => 'Non-cash payment received amount must equal the amount applied; cash change is only supported for CASH.'], 400);
        }
    }

    $pdo->beginTransaction();
    try {
        $q = $pdo->prepare("SELECT f.id FROM folios f JOIN stays s ON s.id=f.stay_id WHERE f.id=? AND f.status='OPEN' AND s.status='ACTIVE' FOR UPDATE");
        $q->execute([$fid]);
        if (!$q->fetch()) {
            throw new RuntimeException('Folio is not open.');
        }

        $q = $pdo->prepare('SELECT idempotency_part, folio_id, receipt_number, method, amount, received_amount, change_amount, reference_note FROM payments WHERE idempotency_key=? ORDER BY idempotency_part');
        $q->execute([$idempotencyKey]);
        $existing = $q->fetchAll();

        if ($existing) {
            if (count($existing) !== count($parts)) {
                $pdo->rollBack();
                out(['error' => 'This payment request key was already used for a different transaction.'], 409);
            }
            foreach ($parts as $i => $part) {
                $row = $existing[$i];
                if ((int)$row['idempotency_part'] !== $i || (int)$row['folio_id'] !== $fid || $row['method'] !== $part['method'] || abs((float)$row['amount'] - $part['amount']) > 0.001 || abs((float)$row['received_amount'] - $part['received']) > 0.001 || ($row['reference_note'] ?? '') !== ($part['note'] ?? '')) {
                    $pdo->rollBack();
                    out(['error' => 'This payment request key was already used for a different transaction.'], 409);
                }
            }
            $receipts = array_column($existing, 'receipt_number');
            $change = array_sum(array_column($existing, 'change_amount'));
            $pdo->commit();
            out(['ok' => true, 'idempotent_replay' => true, 'receipt_number' => implode(', ', $receipts), 'receipts' => $receipts, 'change' => money($change), 'split_count' => count($parts), 'completed' => false, 'message' => 'Payment was already recorded.']);
        }

        $q = $pdo->prepare('SELECT COALESCE(SUM(amount),0) n FROM charges WHERE folio_id=?');
        $q->execute([$fid]);
        $total = (float)$q->fetch()['n'];

        $q = $pdo->prepare("SELECT COALESCE(SUM(amount),0) n FROM applied_discounts WHERE folio_id=? AND status IN ('APPLIED','APPROVED')");
        $q->execute([$fid]);
        $discounts = (float)$q->fetch()['n'];

        $q = $pdo->prepare('SELECT COALESCE(SUM(amount),0) n FROM payments WHERE folio_id=?');
        $q->execute([$fid]);
        $paid = (float)$q->fetch()['n'];

        $net = max(0, $total - $discounts);
        $vat = round($net * htl103_vat_rate($pdo), 2);

        $q = $pdo->prepare("SELECT COALESCE(SUM(amount),0) n FROM refunds WHERE folio_id=? AND status='COMPLETED'");
        $q->execute([$fid]);
        $refunds = (float)$q->fetch()['n'];

        $due = round(max(0, $net + $vat - $paid + $refunds), 2);
        if ($amount > $due + 0.001) {
            throw new RuntimeException('Payment exceeds current balance.');
        }

        $receipts = [];
        $change = 0;
        foreach ($parts as $i => $part) {
            $receipt = 'OR' . date('ymd') . strtoupper(bin2hex(random_bytes(3)));
            $partChange = $part['method'] === 'CASH' ? round($part['received'] - $part['amount'], 2) : 0.0;
            $q = $pdo->prepare('INSERT INTO payments(folio_id, receipt_number, method, amount, received_amount, change_amount, reference_note, received_by, idempotency_key, idempotency_part) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            $q->execute([$fid, $receipt, $part['method'], $part['amount'], $part['received'], $partChange, $part['note'], $u['id'], $idempotencyKey, $i]);
            $receipts[] = $receipt;
            $change += $partChange;
        }

        audit($pdo, $u['id'], 'PAYMENT', 'folio', $fid, ['amount' => $amount, 'receipts' => $receipts, 'split_count' => count($parts)]);
        $remaining = round(max(0, $net + $vat - ($paid + $amount) + $refunds), 2);
        $pdo->commit();

        $stayQ = $pdo->prepare('SELECT s.id AS stay_id, s.stay_code FROM folios f JOIN stays s ON s.id=f.stay_id WHERE f.id=?');
        $stayQ->execute([$fid]);
        $stayRow = $stayQ->fetch();
        $sCode = $stayRow['stay_code'] ?? null;
        $sId = (int)($stayRow['stay_id'] ?? 0);

        ws_broadcast('FOLIO_UPDATED', [
            'folio_id' => $fid,
            'stay_code' => $sCode,
            'type' => 'PAYMENT_RECORDED',
            'amount' => $amount,
            'remaining_balance' => $remaining
        ], null, 'frontdesk', $sCode);

        $custQ = $pdo->prepare("SELECT TRIM(CONCAT_WS(' ', c.first_name, NULLIF(c.middle_name, ''), c.last_name)) AS guest_name, r.room_number, f.folio_number FROM folios f JOIN stays s ON s.id=f.stay_id JOIN rooms r ON r.id=s.room_id LEFT JOIN customers c ON c.customer_id=s.customer_id WHERE f.id=?");
        $custQ->execute([$fid]);
        $custRow = $custQ->fetch();

        out([
            'ok' => true,
            'stay_id' => $sId,
            'folio_id' => $fid,
            'folio_number' => $custRow['folio_number'] ?? '',
            'stay_code' => $sCode,
            'room_number' => $custRow['room_number'] ?? '',
            'guest_name' => $custRow['guest_name'] ?? 'In-House Guest',
            'cashier_name' => $u['username'],
            'amount_paid' => money($amount),
            'received_amount' => money($received),
            'receipt_number' => implode(', ', $receipts),
            'receipts' => $receipts,
            'change' => money($change),
            'split_count' => count($parts),
            'completed' => false,
            'remaining_balance' => money($remaining),
            'is_settled' => ($remaining <= 0.009),
            'message' => $remaining <= 0.009 ? 'Payment recorded in full. Stay remains active; use Checkout to finalize departure.' : 'Payment recorded. Remaining balance is still open.'
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        out(['error' => $e->getMessage()], 400);
    }
}

/**
 * Previews final checkout settlement for a stay, showing proration, discounts, VAT,
 * payments received, refunds issued, and final delta (refund due or additional payment due).
 */
if ($action === 'final_bill_preview') {
    require_role(['admin', 'manager', 'frontdesk', 'cashier']);
    $sid = (int)($in['stay_id'] ?? 0);
    if ($sid < 1) {
        out(['error' => 'Choose a valid stay.'], 400);
    }

    $q = $pdo->prepare("SELECT s.id, s.stay_code, s.checkin_at, s.planned_checkout, s.actual_checkout, s.status AS stay_status, r.room_number, rt.nightly_rate, f.id AS folio_id, f.folio_number, f.status AS folio_status, c.customer_id, c.first_name, c.middle_name, c.last_name, c.contact_number, c.email, TRIM(CONCAT_WS(' ', c.first_name, NULLIF(c.middle_name, ''), c.last_name)) AS guest_name FROM stays s JOIN rooms r ON r.id=s.room_id JOIN room_types rt ON rt.id=r.room_type_id JOIN folios f ON f.stay_id=s.id LEFT JOIN customers c ON c.customer_id=s.customer_id WHERE s.id=?");
    $q->execute([$sid]);
    $stay = $q->fetch();
    if (!$stay) {
        out(['error' => 'Stay not found.'], 404);
    }

    $pendingEarlyQ = $pdo->prepare("SELECT id, status, request_type FROM early_checkout_requests WHERE stay_id=? AND status IN ('REQUESTED','APPROVED') ORDER BY created_at DESC LIMIT 1");
    $pendingEarlyQ->execute([$sid]);
    $pendingEarly = $pendingEarlyQ->fetch() ?: null;

    $fid = (int)$stay['folio_id'];
    $q = $pdo->prepare('SELECT id, category, description, quantity, unit_price, amount, created_at FROM charges WHERE folio_id=? ORDER BY created_at, id');
    $q->execute([$fid]);
    $charges = $q->fetchAll();

    $q = $pdo->prepare('SELECT COALESCE(SUM(amount),0) FROM payments WHERE folio_id=?');
    $q->execute([$fid]);
    $paid = (float)$q->fetchColumn();

    $q = $pdo->prepare("SELECT COALESCE(SUM(amount),0) FROM refunds WHERE folio_id=? AND status='COMPLETED'");
    $q->execute([$fid]);
    $refunded = (float)$q->fetchColumn();

    $q = $pdo->prepare("SELECT COALESCE(SUM(amount),0) FROM applied_discounts WHERE folio_id=? AND status IN ('APPLIED','APPROVED')");
    $q->execute([$fid]);
    $discount = (float)$q->fetchColumn();

    $chargesTotal = array_sum(array_map(fn($c) => (float)$c['amount'], $charges));
    $net = max(0, $chargesTotal - $discount);
    $vat = round($net * htl103_vat_rate($pdo), 2);
    $final = round($net + $vat, 2);
    $settlement = round($paid - $refunded - $final, 2);

    $checkin = new DateTimeImmutable($stay['checkin_at']);
    $planned = new DateTimeImmutable($stay['planned_checkout']);
    $actual = new DateTimeImmutable('now');
    $stayNights = max(1, (int)$checkin->setTime(0, 0)->diff($actual->setTime(0, 0))->format('%a'));
    $plannedNights = max(1, (int)$checkin->setTime(0, 0)->diff($planned)->format('%a'));
    $originalRoomAmount = array_sum(array_map(fn($c) => (string)$c['category'] === 'ROOM' ? (float)$c['amount'] : 0.0, $charges));

    out([
        'stay' => $stay,
        'charges' => $charges,
        'pending_early_checkout_request' => $pendingEarly,
        'original_room_amount' => money($originalRoomAmount),
        'nightly_rate' => money($plannedNights ? $originalRoomAmount / $plannedNights : 0),
        'nights_stayed' => $stayNights,
        'unused_nights' => max(0, $plannedNights - $stayNights),
        'charges_total' => money($chargesTotal),
        'discount_total' => money($discount),
        'vat_rate' => round(htl103_vat_rate($pdo) * 100, 2),
        'vat' => money($vat),
        'final_amount' => money($final),
        'payments_received' => money($paid),
        'refunds_completed' => money($refunded),
        'settlement_delta' => money($settlement),
        'settlement_status' => $settlement > 0.009 ? 'REFUND_DUE' : ($settlement < -0.009 ? 'ADDITIONAL_PAYMENT_DUE' : 'FULLY_SETTLED')
    ]);
}

// ============================================================================
// SERVICE REQUESTS & DEPARTMENT WORKFLOWS
// ============================================================================

/**
 * Retrieves department service requests filtered strictly by role authorization.
 * Front Desk/Management view all; Department staff view assigned department tasks.
 */

/**
 * Creates a service request / food & drink order on behalf of an active guest room.
 */
if ($action === 'request_create') {
    require_role(['admin', 'manager', 'frontdesk', 'restaurant', 'bar', 'housekeeping', 'maintenance', 'laundry', 'valet', 'service']);
    $stayId = (int)($in['stay_id'] ?? 0);
    $dept = trim((string)($in['department'] ?? 'restaurant'));
    $desc = trim((string)($in['description'] ?? ''));
    $catalogItemId = (int)($in['catalog_item_id'] ?? 0);
    $qty = max(1, (int)($in['quantity'] ?? 1));
    $unitPrice = round((float)($in['unit_price'] ?? 0), 2);
    $notes = trim((string)($in['notes'] ?? ''));

    if ($stayId <= 0 && !empty($in['room_id'])) {
        $st = $pdo->prepare("SELECT id FROM stays WHERE room_id=? AND status='ACTIVE' LIMIT 1");
        $st->execute([(int)$in['room_id']]);
        $stayId = (int)$st->fetchColumn();
    }
    if ($stayId <= 0 && !empty($in['stay_code'])) {
        $st = $pdo->prepare("SELECT id FROM stays WHERE stay_code=? AND status='ACTIVE' LIMIT 1");
        $st->execute([trim((string)$in['stay_code'])]);
        $stayId = (int)$st->fetchColumn();
    }

    if ($stayId <= 0) {
        out(['error' => 'Please select an active guest room.'], 400);
    }

    $stq = $pdo->prepare("SELECT s.id, s.stay_code, r.room_number FROM stays s JOIN rooms r ON r.id=s.room_id WHERE s.id=? AND s.status='ACTIVE'");
    $stq->execute([$stayId]);
    $stayRow = $stq->fetch();
    if (!$stayRow) {
        out(['error' => 'Selected stay is no longer active.'], 400);
    }

    $normDept = normalize_department($dept);
    $serviceTypeMap = [
        'restaurant' => 'FOOD_BEVERAGE',
        'bar' => 'FOOD_BEVERAGE',
        'housekeeping' => 'HOUSEKEEPING',
        'laundry' => 'HOUSEKEEPING',
        'maintenance' => 'MAINTENANCE',
        'valet' => 'OTHER',
        'service' => 'OTHER'
    ];
    $serviceType = $serviceTypeMap[$normDept] ?? 'OTHER';

    if ($catalogItemId > 0) {
        $mi = $pdo->prepare('SELECT name, category, price, subcategory FROM service_catalog WHERE id=? AND active=1');
        $mi->execute([$catalogItemId]);
        $item = $mi->fetch();
        if ($item) {
            $unitPrice = (float)$item['price'];
            $fullDesc = ($qty > 1 ? "{$qty}x " : "") . $item['name'] . ($notes ? " ({$notes})" : "");
        } else {
            $fullDesc = $desc ?: 'Order item';
        }
    } else {
        $fullDesc = ($qty > 1 ? "{$qty}x " : "") . ($desc ?: 'Service request') . ($notes ? " ({$notes})" : "");
    }

    $totalPrice = round($qty * $unitPrice, 2);
    $chargeable = $totalPrice > 0 ? 1 : 0;
    $code = 'RQ' . strtoupper(bin2hex(random_bytes(4)));

    $q = $pdo->prepare("INSERT INTO service_requests (stay_id, request_code, service_type, assigned_department, status, description, chargeable, price) VALUES (?, ?, ?, ?, 'PENDING', ?, ?, ?)");
    $q->execute([$stayId, $code, $serviceType, $normDept, $fullDesc, $chargeable, $totalPrice]);
    $reqId = (int)$pdo->lastInsertId();

    try {
        $pdo->prepare("INSERT INTO service_request_history (request_id, from_status, to_status, assigned_department, notes) VALUES (?, NULL, 'PENDING', ?, ?)")
            ->execute([$reqId, $normDept, 'Created by staff: ' . ($u['username'] ?? 'Staff')]);
    } catch (Exception $e) {}

    audit($pdo, $u['id'], 'CREATE_STAFF_ORDER', 'service_request', $reqId, [
        'dept' => $normDept,
        'stay_code' => $stayRow['stay_code'],
        'room' => $stayRow['room_number'],
        'price' => $totalPrice
    ]);

    ws_broadcast('REQUEST_CREATED', [
        'id' => $reqId,
        'request_code' => $code,
        'stay_code' => $stayRow['stay_code'],
        'room_number' => $stayRow['room_number'],
        'service_type' => $serviceType,
        'assigned_department' => $normDept,
        'status' => 'PENDING',
        'description' => $fullDesc,
        'chargeable' => $chargeable,
        'price' => $totalPrice
    ], null, $normDept, $stayRow['stay_code']);

    out(['ok' => true, 'id' => $reqId, 'request_code' => $code, 'message' => 'Order created and sent to ' . ucfirst($normDept) . ' queue.']);
}

if ($action === 'requests') {
    $_deptTypes = get_role_department_types($u['role']);
    $_isServiceRole = !in_array($u['role'], ['admin', 'manager', 'frontdesk', 'cashier'], true);

    $_baseQ = "SELECT sr.*, s.stay_code, r.room_number, rr.room_number AS requested_room_number,
                      u_assigned.username AS assigned_to_username,
                      u_ack.username AS acknowledged_by_username,
                      u_comp.username AS completed_by_username,
                      TRIM(CONCAT_WS(' ', c.first_name, NULLIF(c.middle_name, ''), c.last_name)) AS guest_name,
                      c.contact_number AS guest_contact
               FROM service_requests sr
               JOIN stays s ON s.id=sr.stay_id
               JOIN rooms r ON r.id=s.room_id
               JOIN folios f ON f.stay_id=s.id
               LEFT JOIN customers c ON c.customer_id=s.customer_id
               LEFT JOIN rooms rr ON rr.id=sr.requested_room_id
               LEFT JOIN users u_assigned ON u_assigned.id=sr.assigned_to
               LEFT JOIN users u_ack ON u_ack.id=sr.acknowledged_by
               LEFT JOIN users u_comp ON u_comp.id=sr.completed_by
               WHERE s.status='ACTIVE' AND f.status='OPEN'";

    $_params = [];
    if ($_isServiceRole) {
        $_normRole = normalize_department($u['role']);
        $conds = ["sr.assigned_department = ?"];
        $_params[] = $_normRole;
        if ($_deptTypes) {
            $placeholders = implode(',', array_fill(0, count($_deptTypes), '?'));
            $conds[] = "(sr.assigned_department IS NULL AND sr.service_type IN ($placeholders))";
            $_params = array_merge($_params, $_deptTypes);
        }
        $_baseQ .= " AND (" . implode(' OR ', $conds) . ")";
        $_baseQ .= " AND sr.status IN ('PENDING','ASSIGNED','ACKNOWLEDGED','IN_PROGRESS','ON_HOLD')";
    }
    $_baseQ .= " ORDER BY sr.created_at" . ($_isServiceRole ? ' ASC' : ' DESC LIMIT 250');

    $q = $pdo->prepare($_baseQ);
    $q->execute($_params);
    out(['requests' => $q->fetchAll()]);
}

/**
 * Assigns or reassigns a guest service request to a specific department or staff member.
 */
if ($action === 'request_assign') {
    // Access is governed by the service_requests.assign permission (held by
    // front desk by default); a hard admin/manager role gate here silently
    // overrode Staff Accounts grants and broke the front-desk assign flow.
    $id = (int)($in['request_id'] ?? 0);
    $department = normalize_department((string)($in['department'] ?? ''));
    $assignedTo = !empty($in['assigned_to']) ? (int)$in['assigned_to'] : null;
    $notes = trim((string)($in['notes'] ?? ''));

    if ($id < 1 || empty($department)) {
        out(['error' => 'Please select a valid request and target department.'], 400);
    }

    $pdo->beginTransaction();
    try {
        $q = $pdo->prepare('SELECT sr.*, s.stay_code, r.room_number FROM service_requests sr JOIN stays s ON s.id=sr.stay_id JOIN rooms r ON r.id=s.room_id WHERE sr.id=? FOR UPDATE');
        $q->execute([$id]);
        $req = $q->fetch();
        if (!$req) {
            throw new RuntimeException('Service request not found.');
        }

        $oldStatus = $req['status'];
        $oldDept = $req['assigned_department'];
        $newStatus = 'ASSIGNED';

        $stmt = $pdo->prepare("UPDATE service_requests 
                               SET assigned_department = ?, assigned_to = ?, assigned_at = NOW(), status = ? 
                               WHERE id = ?");
        $stmt->execute([$department, $assignedTo, $newStatus, $id]);

        $histNotes = $oldDept ? "Reassigned from " . ucfirst($oldDept) . " to " . ucfirst($department) : "Assigned to " . ucfirst($department);
        if ($notes) {
            $histNotes .= " · Note: " . $notes;
        }

        $pdo->prepare("INSERT INTO service_request_history (request_id, from_status, to_status, changed_by_user_id, changed_by_role, assigned_department, notes) 
                       VALUES (?, ?, ?, ?, ?, ?, ?)")
            ->execute([$id, $oldStatus, $newStatus, $u['id'], $u['role'], $department, $histNotes]);

        audit($pdo, $u['id'], 'REQUEST_ASSIGN', 'service_request', $id, ['from_dept' => $oldDept, 'to_dept' => $department]);
        $pdo->commit();

        $eventData = [
            'id' => $id,
            'request_code' => $req['request_code'],
            'stay_code' => $req['stay_code'],
            'room_number' => $req['room_number'],
            'service_type' => $req['service_type'],
            'description' => $req['description'],
            'price' => $req['price'],
            'chargeable' => $req['chargeable'],
            'status' => $newStatus,
            'assigned_department' => $department,
            'assigned_by' => $u['username'],
            'actor_id' => (int)$u['id']
        ];
        ws_broadcast('REQUEST_ASSIGNED', $eventData, null, $department, $req['stay_code']);

        out(['ok' => true, 'message' => "Request {$req['request_code']} successfully assigned to " . ucfirst($department) . "."]);
    } catch (Throwable $e) {
        $pdo->rollBack();
        out(['error' => $e->getMessage()], 400);
    }
}

/**
 * Updates status of a service request through lifecycle (ACKNOWLEDGED -> IN_PROGRESS -> COMPLETED / ON_HOLD / REJECTED).
 * Automatically posts charges to folio upon completion if chargeable.
 */
if ($action === 'request_status') {
    require_role(['admin', 'manager', 'service', 'housekeeping', 'bar', 'restaurant', 'parkingvalet', 'parking_valet', 'valet', 'parking', 'laundry', 'maintenance', 'other']);
    $id = (int)($in['request_id'] ?? 0);
    $status = strtoupper(trim((string)($in['status'] ?? '')));
    $reason = trim((string)($in['reason'] ?? ''));

    if (strtolower(trim($u['role'])) === 'frontdesk') {
        out(['error' => 'Front Desk role is restricted to monitoring and viewing request history only.'], 403);
    }

    $validStatuses = ['ASSIGNED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED', 'REJECTED'];
    if (!in_array($status, $validStatuses, true)) {
        out(['error' => 'Invalid status transition.'], 400);
    }

    $pdo->beginTransaction();
    try {
        $q = $pdo->prepare('SELECT sr.*, s.stay_code, s.planned_checkout, r.room_number FROM service_requests sr JOIN stays s ON s.id=sr.stay_id JOIN rooms r ON r.id=s.room_id WHERE sr.id=? FOR UPDATE');
        $q->execute([$id]);
        $req = $q->fetch();
        if (!$req) {
            throw new RuntimeException('Request not found.');
        }

        $userRole = strtolower(trim($u['role']));
        $reqDept = normalize_department((string)($req['assigned_department'] ?: $req['service_type']));
        $userDept = normalize_department($userRole);
        $isSupervisory = in_array($userRole, ['admin', 'manager'], true);
        $isFrontdesk = ($userRole === 'frontdesk');

        // Role-based workflow authorization enforcement
        if ($status === 'COMPLETED' || $status === 'IN_PROGRESS' || $status === 'ACKNOWLEDGED' || $status === 'ON_HOLD') {
            if ($isFrontdesk && ($req['request_kind'] ?? 'SERVICE') !== 'ROOM_TRANSFER') {
                throw new RuntimeException('Front Desk routes and monitors requests. Department staff must acknowledge and fulfill their assigned services.');
            }
            if (!$isSupervisory && !$isFrontdesk && $userDept !== $reqDept) {
                throw new RuntimeException("Access Denied: This request is assigned to " . ucfirst($reqDept) . ", not " . ucfirst($userDept) . ".");
            }
        }

        if ($status === 'REJECTED') {
            if (!$isSupervisory && !$isFrontdesk && $userDept !== $reqDept) {
                throw new RuntimeException("Access Denied: Only assigned department staff can reject this request.");
            }
            if (empty($reason)) {
                throw new RuntimeException("A rejection reason is required.");
            }
        }

        if ($status === 'ON_HOLD' && empty($reason)) {
            $reason = 'Temporarily on hold pending parts, ingredients, or room availability.';
        }

        $oldStatus = $req['status'];
        $fulfilled = ($status === 'COMPLETED') ? date('Y-m-d H:i:s') : null;
        $ackAt = ($status === 'ACKNOWLEDGED' && empty($req['acknowledged_at'])) ? date('Y-m-d H:i:s') : null;
        $ackBy = ($status === 'ACKNOWLEDGED' && empty($req['acknowledged_by'])) ? $u['id'] : null;

        $transferAdjustment = 0.0;
        $transferNights = 0;
        $transferEffective = null;

        if (($req['request_kind'] ?? 'SERVICE') === 'ROOM_TRANSFER' && $status === 'IN_PROGRESS' && $req['status'] !== 'IN_PROGRESS') {
            if (!$isFrontdesk && !$isSupervisory) {
                throw new RuntimeException('Only Front Desk or Management can execute room transfers.');
            }
            $sid = (int)$req['stay_id'];
            $to = (int)$req['requested_room_id'];

            $q = $pdo->prepare("SELECT s.*, r.room_number AS from_room, rt.nightly_rate AS old_rate FROM stays s JOIN rooms r ON r.id=s.room_id JOIN room_types rt ON rt.id=r.room_type_id WHERE s.id=? AND s.status='ACTIVE' FOR UPDATE");
            $q->execute([$sid]);
            $stay = $q->fetch();

            $q = $pdo->prepare('SELECT r.*, rt.nightly_rate AS new_rate FROM rooms r JOIN room_types rt ON rt.id=r.room_type_id WHERE r.id=? FOR UPDATE');
            $q->execute([$to]);
            $dest = $q->fetch();

            if (!$stay || !$dest || $dest['status'] !== 'AVAILABLE' || (int)$stay['room_id'] === $to) {
                throw new RuntimeException('Requested room is no longer available.');
            }

            $effective = (new DateTimeImmutable('today'))->format('Y-m-d');
            $transferEffective = $effective;

            $pdo->prepare('INSERT INTO room_transfers(stay_id, from_room_id, to_room_id, effective_date, old_rate, new_rate, reason, authorized_by) VALUES(?, ?, ?, ?, ?, ?, ?, ?)')
                ->execute([$sid, $stay['room_id'], $to, $effective, $stay['old_rate'], $dest['new_rate'], 'Guest portal transfer ' . $req['request_code'], $u['id']]);

            $pdo->prepare("UPDATE rooms SET status='AVAILABLE' WHERE id=?")->execute([$stay['room_id']]);
            $pdo->prepare("UPDATE rooms SET status='OCCUPIED' WHERE id=?")->execute([$to]);
            $pdo->prepare('UPDATE stays SET room_id=? WHERE id=?')->execute([$to, $sid]);

            $q = $pdo->prepare('SELECT id FROM folios WHERE stay_id=?');
            $q->execute([$sid]);
            $fid = (int)$q->fetch()['id'];

            $remaining = max(0, (new DateTimeImmutable($stay['planned_checkout']))->diff(new DateTimeImmutable($effective))->days);
            $delta = round((float)$dest['new_rate'] - (float)$stay['old_rate'], 2);
            $transferNights = $remaining;
            $transferAdjustment = round($remaining * $delta, 2);

            if ($remaining > 0 && abs($delta) > 0.001) {
                $label = $delta > 0 ? 'Room rate increase from ' : 'Room rate credit from ';
                $pdo->prepare("INSERT IGNORE INTO charges(folio_id, category, description, quantity, unit_price, amount, service_request_id, idempotency_key, created_by) VALUES(?, 'ADJUSTMENT', ?, ?, ?, ?, ?, ?, ?)")
                    ->execute([$fid, $label . $effective, $remaining, $delta, $transferAdjustment, $id, 'room-transfer-request-' . $id, $u['id']]);
            }
        }

        $stmt = $pdo->prepare("UPDATE service_requests SET 
                                 status = ?, 
                                 fulfilled_at = COALESCE(?, fulfilled_at),
                                 completed_by = CASE WHEN ?='COMPLETED' THEN ? ELSE completed_by END,
                                 acknowledged_at = COALESCE(?, acknowledged_at),
                                 acknowledged_by = COALESCE(?, acknowledged_by),
                                 on_hold_reason = CASE WHEN ?='ON_HOLD' THEN ? ELSE on_hold_reason END,
                                 rejection_reason = CASE WHEN ?='REJECTED' THEN ? ELSE rejection_reason END
                               WHERE id = ?");
        $stmt->execute([
            $status,
            $fulfilled,
            $status, $u['id'],
            $ackAt,
            $ackBy,
            $status, $reason ?: null,
            $status, $reason ?: null,
            $id
        ]);

        $postedCharge = null;
        if ($status === 'COMPLETED' && (int)$req['chargeable'] === 1 && (float)$req['price'] > 0 && ($req['request_kind'] ?? 'SERVICE') !== 'ROOM_TRANSFER') {
            $q = $pdo->prepare('SELECT id FROM folios WHERE stay_id=? AND status="OPEN"');
            $q->execute([$req['stay_id']]);
            $f = $q->fetch();
            if (!$f) {
                throw new RuntimeException('No open folio found for this stay.');
            }
            // Restaurant orders and their mirrored service request must share
            // the same charge identity so both completion handlers cannot post
            // independent folio charges for the same order.
            $isRestaurantOrder = in_array(strtoupper($req['service_type']), ['FOOD_BEVERAGE', 'RESTAURANT', 'FOOD'], true);
            $key = $isRestaurantOrder ? ('order-charge-' . $req['request_code']) : ('service-request-' . $id);
            $cat = 'SERVICE';
            if ($isRestaurantOrder) {
                $cat = 'FOOD';
            } elseif (in_array(strtoupper($req['service_type']), ['BAR', 'MINIBAR'], true)) {
                $cat = 'MINIBAR';
            } elseif (strtoupper($req['service_type']) === 'LAUNDRY') {
                $cat = 'LAUNDRY';
            }

            $insCharge = $pdo->prepare("INSERT IGNORE INTO charges(folio_id, category, description, quantity, unit_price, amount, service_request_id, idempotency_key, created_by) VALUES(?, ?, ?, 1, ?, ?, ?, ?, ?)");
            $insCharge->execute([$f['id'], $cat, $req['description'], $req['price'], $req['price'], $id, $key, $u['id']]);
            if ($insCharge->rowCount() > 0) {
                $postedCharge = ['amount' => (float)$req['price'], 'category' => $cat, 'folio_id' => $f['id']];
            }
        }

        $pdo->prepare("INSERT INTO service_request_history (request_id, from_status, to_status, changed_by_user_id, changed_by_role, assigned_department, notes) 
                       VALUES (?, ?, ?, ?, ?, ?, ?)")
            ->execute([$id, $oldStatus, $status, $u['id'], $u['role'], $req['assigned_department'], $reason ?: null]);

        audit($pdo, $u['id'], 'SERVICE_STATUS', 'service_request', $id, ['from' => $oldStatus, 'to' => $status, 'kind' => $req['request_kind'] ?? 'SERVICE']);
        $pdo->commit();

        $eventData = [
            'id' => $id,
            'request_code' => $req['request_code'],
            'stay_code' => $req['stay_code'],
            'room_number' => $req['room_number'],
            'service_type' => $req['service_type'],
            'description' => $req['description'],
            'status' => $status,
            'price' => $req['price'],
            'chargeable' => $req['chargeable'],
            'posted_charge' => $postedCharge,
            'reason' => $reason,
            'updated_by' => $u['username'],
            'updated_by_role' => $u['role'],
            'actor_id' => (int)$u['id']
        ];
        ws_broadcast('REQUEST_STATUS_CHANGED', $eventData, null, $reqDept, $req['stay_code']);

        if (($req['request_kind'] ?? 'SERVICE') === 'ROOM_TRANSFER' && $status === 'IN_PROGRESS' && isset($stay, $dest)) {
            ws_broadcast('ROOM_STATUS_CHANGED', ['room_id' => (int)$stay['room_id'], 'room_number' => $stay['from_room'], 'status' => 'AVAILABLE', 'actor_id' => (int)$u['id']], null, null, null, true);
            ws_broadcast('ROOM_STATUS_CHANGED', ['room_id' => $to, 'room_number' => $dest['room_number'], 'status' => 'OCCUPIED', 'actor_id' => (int)$u['id']], null, null, null, true);
            ws_broadcast('STAY_UPDATED', ['stay_id' => $sid, 'stay_code' => $stay['stay_code'], 'room_id' => $to, 'room_number' => $dest['room_number'], 'actor_id' => (int)$u['id']], null, 'frontdesk', $stay['stay_code']);
            if (isset($fid) && $transferAdjustment != 0.0) {
                ws_broadcast('FOLIO_UPDATED', ['folio_id' => $fid, 'stay_code' => $stay['stay_code'], 'type' => 'ROOM_TRANSFER_ADJUSTMENT', 'amount' => $transferAdjustment], null, 'frontdesk', $stay['stay_code']);
            }
        }

        if ($postedCharge) {
            ws_broadcast('FOLIO_UPDATED', ['folio_id' => (int)$postedCharge['folio_id'], 'stay_code' => $req['stay_code'], 'type' => 'CHARGE_ADDED', 'amount' => (float)$postedCharge['amount']], null, 'frontdesk', $req['stay_code']);
        }

        out([
            'ok' => true,
            'status' => $status,
            'posted_charge' => $postedCharge,
            'room_transfer' => ($req['request_kind'] ?? 'SERVICE') === 'ROOM_TRANSFER' && $status === 'IN_PROGRESS',
            'transfer_adjustment' => $transferAdjustment,
            'transfer_nights' => $transferNights,
            'effective_date' => $transferEffective,
            'message' => $status === 'COMPLETED' ? ($postedCharge ? "Request fulfilled and ₱" . number_format((float)$postedCharge['amount'], 2) . " charge posted to folio." : "Request marked completed.") : "Request status updated to {$status}."
        ]);
    } catch (Throwable $e) {
        $pdo->rollBack();
        out(['error' => $e->getMessage()], 400);
    }
}

/**
 * Retrieves audit lifecycle transition history for a specific service request.
 */
if ($action === 'request_history') {
    $id = (int)($in['request_id'] ?? $_GET['request_id'] ?? 0);
    if ($id < 1) {
        out(['error' => 'Valid request ID required.'], 400);
    }

    $q = $pdo->prepare("SELECT h.*, u.username AS changed_by_username 
                        FROM service_request_history h 
                        LEFT JOIN users u ON u.id=h.changed_by_user_id 
                        WHERE h.request_id=? 
                        ORDER BY h.created_at ASC, h.id ASC");
    $q->execute([$id]);
    out(['history' => $q->fetchAll()]);
}

// ============================================================================
// EARLY CHECKOUT POLICIES & REQUEST PROCESSING
// ============================================================================

/**
 * Retrieves configured early-checkout billing policies (Hourly, Fixed Fee, Exceptions).
 */
if ($action === 'early_checkout_policies') {
    require_role(['admin', 'manager', 'frontdesk']);
    $q = $pdo->query('SELECT id, policy_key, name, description, minimum_hours, minimum_nights, fixed_fee, requires_manager, active, updated_at FROM early_checkout_policy_configs ORDER BY id');
    out(['policies' => $q->fetchAll()]);
}

/**
 * Updates early checkout policy parameters (minimum hours, nights, fixed fee, manager approval flag).
 */
if ($action === 'early_checkout_policy_save') {
    require_role(['admin', 'manager']);
    $id = (int)($in['id'] ?? 0);
    $name = trim((string)($in['name'] ?? ''));
    $description = trim((string)($in['description'] ?? ''));
    $hours = (float)($in['minimum_hours'] ?? 0);
    $nights = (int)($in['minimum_nights'] ?? 0);
    $fee = round((float)($in['fixed_fee'] ?? 0), 2);
    $manager = (int)($in['requires_manager'] ?? 0) === 1 ? 1 : 0;
    $active = (int)($in['active'] ?? 0) === 1 ? 1 : 0;

    if ($id < 1 || $name === '' || $hours < 0 || $hours > 720 || $nights < 0 || $nights > 90 || $fee < 0) {
        out(['error' => 'Invalid policy settings.'], 400);
    }

    $q = $pdo->prepare('UPDATE early_checkout_policy_configs SET name=?, description=?, minimum_hours=?, minimum_nights=?, fixed_fee=?, requires_manager=?, active=?, updated_by=?, updated_at=NOW() WHERE id=?');
    $q->execute([$name, $description ?: null, $hours, $nights, $fee, $manager, $active, $u['id'], $id]);

    audit($pdo, $u['id'], 'UPDATE_EARLY_CHECKOUT_POLICY', 'early_checkout_policy', $id, ['name' => $name, 'active' => $active]);
    out(['ok' => true]);
}

/**
 * Creates an early checkout recalculation request based on selected policy rules.
 */
if ($action === 'early_checkout_request') {
    require_role(['admin', 'manager', 'frontdesk']);
    $sid = (int)($in['stay_id'] ?? 0);
    $reason = trim((string)($in['reason'] ?? ''));
    $type = (string)($in['request_type'] ?? 'EARLY_CHECKOUT');
    $policyId = (int)($in['policy_id'] ?? 0);
    $departure = trim((string)($in['requested_departure_at'] ?? date('Y-m-d H:i:s')));
    $departureTs = strtotime($departure);

    if ($reason === '' || !in_array($type, ['EARLY_CHECKOUT', 'CANCEL_AFTER_CHECKIN'], true) || $policyId < 1 || $departureTs === false) {
        out(['error' => 'Enter a reason and choose a configured policy.'], 400);
    }

    $pdo->beginTransaction();
    try {
        $q = $pdo->prepare('SELECT * FROM early_checkout_policy_configs WHERE id=? AND active=1 FOR UPDATE');
        $q->execute([$policyId]);
        $cfg = $q->fetch();
        if (!$cfg) {
            throw new RuntimeException('Selected policy is inactive or unavailable.');
        }

        $requiresManager = ((int)$cfg['requires_manager'] === 1);
        $policy = $cfg['policy_key'];
        $q = $pdo->prepare("SELECT s.*, f.id AS folio_id, r.id AS room_id, rt.nightly_rate FROM stays s JOIN folios f ON f.stay_id=s.id JOIN rooms r ON r.id=s.room_id JOIN room_types rt ON rt.id=r.room_type_id WHERE s.id=? AND s.status='ACTIVE' AND f.status='OPEN' FOR UPDATE");
        $q->execute([$sid]);
        $s = $q->fetch();
        if (!$s) {
            throw new RuntimeException('Active stay not found.');
        }

        if ($departureTs < strtotime($s['checkin_at'])) {
            throw new RuntimeException('Departure cannot be earlier than the check-in timestamp.');
        }
        if ($departureTs > time() + 86400) {
            throw new RuntimeException('Departure time is too far in the future; record the intended departure time.');
        }

        $q = $pdo->prepare("SELECT id FROM early_checkout_requests WHERE stay_id=? AND status IN ('REQUESTED','APPROVED')");
        $q->execute([$sid]);
        if ($q->fetch()) {
            throw new RuntimeException('An early checkout request is already pending.');
        }

        $hourly = round((float)$s['nightly_rate'] / 24, 2);
        $minimumHours = (float)$cfg['minimum_hours'];
        $minimumNights = (int)$cfg['minimum_nights'];
        $fee = round((float)$cfg['fixed_fee'], 2);
        $elapsed = max(1, (strtotime($departure) - strtotime($s['checkin_at'])) / 3600);

        $roomCharge = match ($policy) {
            'PRORATED_HOURLY' => round(max($minimumHours, $elapsed) * $hourly, 2),
            'HOURLY_PLUS_FEE' => round(max($minimumHours, $elapsed) * $hourly + $fee, 2),
            'MANAGER_EXCEPTION' => 0.0,
            default => round(max(1, $minimumNights) * (float)$s['nightly_rate'], 2)
        };

        $requestStatus = $requiresManager ? 'REQUESTED' : 'APPROVED';
        $approvedBy = $requiresManager ? null : $u['id'];
        $q = $pdo->prepare('INSERT INTO early_checkout_requests(stay_id, folio_id, request_type, checkin_at, requested_departure_at, reason, policy, hourly_rate, minimum_hours, minimum_nights, fixed_fee, proposed_room_charge, status, requested_by, approved_by, approved_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, IF(? = "APPROVED", NOW(), NULL))');
        $q->execute([$sid, $s['folio_id'], $type, $s['checkin_at'], $departure, $reason, $policy, $hourly, $minimumHours, $minimumNights, $fee, $roomCharge, $requestStatus, $u['id'], $approvedBy, $requestStatus]);
        $id = (int)$pdo->lastInsertId();

        audit($pdo, $u['id'], 'EARLY_CHECKOUT_REQUEST', 'stay', $sid, ['request_id' => $id, 'policy' => $policy, 'policy_config_id' => $policyId, 'proposed_room_charge' => $roomCharge]);
        $pdo->commit();

        out(['ok' => true, 'request_id' => $id, 'proposed_room_charge' => money($roomCharge), 'message' => 'Request recorded. It must be approved and finalized before the room is released.']);
    } catch (Throwable $e) {
        $pdo->rollBack();
        out(['error' => $e->getMessage()], 400);
    }
}

/**
 * Retrieves all early checkout requests with status, requester, and approver details.
 */
if ($action === 'early_checkout_requests') {
    require_role(['admin', 'manager', 'frontdesk']);
    $q = $pdo->query("SELECT e.id, e.stay_id, e.folio_id, e.request_type, e.requested_departure_at, e.actual_departure_at, e.reason, e.policy, e.proposed_room_charge, e.status, e.created_at, e.updated_at, s.stay_code, r.room_number, f.folio_number, ur.username AS requested_by_name, ua.username AS approved_by_name FROM early_checkout_requests e JOIN stays s ON s.id=e.stay_id JOIN rooms r ON r.id=s.room_id JOIN folios f ON f.id=e.folio_id LEFT JOIN users ur ON ur.id=e.requested_by LEFT JOIN users ua ON ua.id=e.approved_by ORDER BY CASE e.status WHEN 'REQUESTED' THEN 0 WHEN 'APPROVED' THEN 1 WHEN 'REJECTED' THEN 2 ELSE 3 END, e.created_at DESC");
    out(['requests' => $q->fetchAll()]);
}

/**
 * Records manager decision (APPROVE or REJECT) on a pending early checkout request.
 */
if ($action === 'early_checkout_decision') {
    require_role(['admin', 'manager']);
    $id = (int)($in['request_id'] ?? 0);
    $decision = (string)($in['decision'] ?? '');
    $note = trim((string)($in['note'] ?? ''));

    if ($id < 1 || !in_array($decision, ['APPROVE', 'REJECT'], true)) {
        out(['error' => 'Choose approve or reject for a valid request.'], 400);
    }

    $pdo->beginTransaction();
    try {
        $q = $pdo->prepare('SELECT * FROM early_checkout_requests WHERE id=? FOR UPDATE');
        $q->execute([$id]);
        $e = $q->fetch();
        if (!$e) {
            throw new RuntimeException('Early checkout request not found.');
        }
        if ($e['status'] !== 'REQUESTED') {
            throw new RuntimeException('Only pending requests can be approved or rejected.');
        }
        if ($decision === 'APPROVE' && (int)$e['requested_by'] === (int)$u['id']) {
            throw new RuntimeException('You cannot approve your own early checkout request.');
        }

        $status = $decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
        $pdo->prepare("UPDATE early_checkout_requests SET status=?, approved_by=?, approved_at=IF(?='APPROVED', NOW(), approved_at), updated_at=CURRENT_TIMESTAMP WHERE id=?")
            ->execute([$status, $u['id'], $status, $id]);

        audit($pdo, $u['id'], 'EARLY_CHECKOUT_' . $status, 'stay', (int)$e['stay_id'], ['request_id' => $id, 'note' => $note]);
        $pdo->commit();

        ws_broadcast('EARLY_CHECKOUT_UPDATED', ['request_id' => $id, 'status' => $status, 'stay_id' => (int)$e['stay_id']], null, 'frontdesk');
        out(['ok' => true, 'status' => $status, 'message' => $status === 'APPROVED' ? 'Early checkout approved. You may now finalize it.' : 'Early checkout request rejected.']);
    } catch (Throwable $x) {
        $pdo->rollBack();
        out(['error' => $x->getMessage()], 400);
    }
}

/**
 * Finalizes an approved early checkout request: updates room accommodation charge
 * to the recalculated amount without adding phantom fee lines, ready for checkout.
 */
if ($action === 'early_checkout_finalize') {
    require_role(['admin', 'manager', 'frontdesk']);
    $id = (int)($in['request_id'] ?? 0);
    $actual = trim((string)($in['actual_departure_at'] ?? date('Y-m-d H:i:s')));

    $pdo->beginTransaction();
    try {
        $q = $pdo->prepare("SELECT e.*, s.room_id, s.status AS stay_status FROM early_checkout_requests e JOIN stays s ON s.id=e.stay_id WHERE e.id=? FOR UPDATE");
        $q->execute([$id]);
        $e = $q->fetch();
        if (!$e || $e['stay_status'] !== 'ACTIVE') {
            throw new RuntimeException('Active early checkout request not found.');
        }
        if ($e['status'] !== 'APPROVED') {
            throw new RuntimeException('Request must be explicitly approved before finalization.');
        }
        if ($e['policy'] === 'MANAGER_EXCEPTION' && $e['approved_by'] === null) {
            throw new RuntimeException('Manager exception requires explicit approval.');
        }

        $q = $pdo->prepare("SELECT id, amount, description FROM charges WHERE folio_id=? AND category='ROOM' ORDER BY id LIMIT 1 FOR UPDATE");
        $q->execute([$e['folio_id']]);
        $roomCharge = $q->fetch();
        if (!$roomCharge) {
            throw new RuntimeException('The folio has no room charge to recalculate. No billing change was made.');
        }

        $oldAmount = (float)$roomCharge['amount'];
        $newAmount = round((float)$e['proposed_room_charge'], 2);
        $newDescription = 'Accommodation recalculated under ' . $e['policy'] . ' policy · Request #' . $id;

        $pdo->prepare("UPDATE charges SET description=?, quantity=1, unit_price=?, amount=? WHERE id=?")
            ->execute([$newDescription, $newAmount, $newAmount, $roomCharge['id']]);

        $pdo->prepare("UPDATE early_checkout_requests SET status='FINALIZED', actual_departure_at=?, approved_by=COALESCE(approved_by, ?), updated_at=CURRENT_TIMESTAMP WHERE id=?")
            ->execute([$actual, $u['id'], $id]);

        audit($pdo, $u['id'], 'EARLY_CHECKOUT_ROOM_CHARGE_RECALCULATED', 'stay', (int)$e['stay_id'], [
            'request_id' => $id,
            'folio_id' => $e['folio_id'],
            'policy' => $e['policy'],
            'previous_room_charge' => $oldAmount,
            'recalculated_room_charge' => $newAmount,
            'separate_fee_charge_created' => false
        ]);
        $pdo->commit();

        ws_broadcast('EARLY_CHECKOUT_UPDATED', ['request_id' => $id, 'status' => 'FINALIZED', 'stay_id' => (int)$e['stay_id'], 'folio_id' => (int)$e['folio_id']], null, 'frontdesk');
        ws_broadcast('FOLIO_UPDATED', ['folio_id' => (int)$e['folio_id'], 'type' => 'ROOM_CHARGE_RECALCULATED', 'amount' => $newAmount], null, 'frontdesk');

        out([
            'ok' => true,
            'folio_id' => (int)$e['folio_id'],
            'previous_room_charge' => money($oldAmount),
            'recalculated_room_charge' => money($newAmount),
            'message' => 'Room charge recalculated according to the approved early-checkout policy. No separate early-checkout fee was added. Review the folio and settle any resulting balance or refund before checkout.'
        ]);
    } catch (Throwable $x) {
        $pdo->rollBack();
        out(['error' => $x->getMessage()], 400);
    }
}

// ============================================================================
// DISCOUNT POLICY & APPROVAL MANAGEMENT
// ============================================================================

/**
 * Retrieves list of all discount policies for administrative configuration.
 */
if ($action === 'discount_policy_admin_list') {
    require_role(['admin', 'manager']);
    $q = $pdo->query('SELECT * FROM discount_policies ORDER BY active DESC, category, name');
    out(['discounts' => $q->fetchAll()]);
}

/**
 * Creates or updates a discount policy rule (category, percentage/fixed, limits, manager requirement).
 */
if ($action === 'discount_policy_save') {
    require_role(['admin', 'manager']);
    $id = (int)($in['id'] ?? 0);
    $name = trim((string)($in['name'] ?? ''));
    $category = (string)($in['category'] ?? 'PROMOTIONAL');
    $type = (string)($in['discount_type'] ?? 'PERCENT');
    $value = round((float)($in['discount_value'] ?? 0), 2);
    $applies = (string)($in['applies_to'] ?? 'ROOM');
    $min = round((float)($in['min_amount'] ?? 0), 2);
    $max = ($in['max_discount'] ?? '') === '' ? null : round((float)$in['max_discount'], 2);
    $active = (int)($in['active'] ?? 0) === 1 ? 1 : 0;
    $combinable = (int)($in['combinable'] ?? 0) === 1 ? 1 : 0;
    $manager = (int)($in['requires_manager'] ?? 0) === 1 ? 1 : 0;
    $starts = trim((string)($in['starts_at'] ?? '')) ?: null;
    $expires = trim((string)($in['expires_at'] ?? '')) ?: null;

    $categories = ['SENIOR_CITIZEN', 'PWD', 'PROMOTIONAL', 'LOYALTY', 'CORPORATE', 'LONG_STAY', 'EARLY_BOOKING', 'LAST_MINUTE', 'PACKAGE', 'MANAGER_COURTESY', 'GROUP', 'OTHER'];
    if ($name === '' || !in_array($category, $categories, true) || !in_array($type, ['PERCENT', 'FIXED'], true) || !in_array($applies, ['ROOM', 'FOOD', 'LAUNDRY', 'MINIBAR', 'SERVICE', 'OTHER', 'ALL'], true) || $value < 0 || ($type === 'PERCENT' && $value > 100) || $min < 0 || ($max !== null && $max < 0)) {
        out(['error' => 'Invalid discount policy settings.'], 400);
    }

    if ($id) {
        $q = $pdo->prepare('UPDATE discount_policies SET name=?, category=?, discount_type=?, discount_value=?, applies_to=?, starts_at=?, expires_at=?, min_amount=?, max_discount=?, combinable=?, requires_manager=?, active=? WHERE id=?');
        $q->execute([$name, $category, $type, $value, $applies, $starts, $expires, $min, $max, $combinable, $manager, $active, $id]);
    } else {
        $q = $pdo->prepare('INSERT INTO discount_policies(name, category, discount_type, discount_value, applies_to, starts_at, expires_at, min_amount, max_discount, combinable, requires_manager, active, created_by) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $q->execute([$name, $category, $type, $value, $applies, $starts, $expires, $min, $max, $combinable, $manager, $active, $u['id']]);
        $id = (int)$pdo->lastInsertId();
    }

    audit($pdo, $u['id'], 'SAVE_DISCOUNT_POLICY', 'discount_policy', $id, ['name' => $name, 'active' => $active]);
    out(['ok' => true, 'id' => $id]);
}

/**
 * Deactivates or removes a discount policy rule preserving history if previously applied.
 */
if ($action === 'discount_policy_delete') {
    require_role(['admin', 'manager']);
    $id = (int)($in['id'] ?? 0);
    if ($id < 1) {
        out(['error' => 'Invalid discount policy.'], 400);
    }

    $q = $pdo->prepare('SELECT COUNT(*) n FROM applied_discounts WHERE policy_id=?');
    $q->execute([$id]);
    if ((int)$q->fetch()['n'] > 0) {
        $q = $pdo->prepare('UPDATE discount_policies SET active=0 WHERE id=?');
        $q->execute([$id]);
        $message = 'Discount deactivated to preserve bill history.';
    } else {
        $q = $pdo->prepare('DELETE FROM discount_policies WHERE id=?');
        $q->execute([$id]);
        $message = 'Discount deleted.';
    }

    audit($pdo, $u['id'], 'DELETE_DISCOUNT_POLICY', 'discount_policy', $id, ['message' => $message]);
    out(['ok' => true, 'message' => $message]);
}

/**
 * Retrieves currently active, non-expired discount policies for cashier selection.
 */
if ($action === 'discount_policies') {
    require_role(['admin', 'manager', 'cashier']);
    $q = $pdo->query("SELECT id, name, discount_type, discount_value, applies_to, starts_at, expires_at, min_amount, max_discount, combinable, requires_manager FROM discount_policies WHERE active=1 AND (starts_at IS NULL OR starts_at<=NOW()) AND (expires_at IS NULL OR expires_at>=NOW()) ORDER BY name");
    out(['discounts' => $q->fetchAll()]);
}

/**
 * Applies a discount policy to an open folio, checking eligibility, minimum spends,
 * combinability, and queuing for manager approval if required.
 */
if ($action === 'apply_discount') {
    require_role(['admin', 'frontdesk']);
    $fid = (int)($in['folio_id'] ?? 0);
    $pid = (int)($in['policy_id'] ?? 0);
    $reason = trim((string)($in['reason'] ?? ''));

    $pdo->beginTransaction();
    try {
        $q = $pdo->prepare("SELECT f.id FROM folios f JOIN stays s ON s.id=f.stay_id WHERE f.id=? AND f.status='OPEN' AND s.status='ACTIVE' FOR UPDATE");
        $q->execute([$fid]);
        if (!$q->fetch()) {
            throw new RuntimeException('Bill is not open for an active stay.');
        }

        $q = $pdo->prepare("SELECT * FROM discount_policies WHERE id=? AND active=1 AND (starts_at IS NULL OR starts_at<=NOW()) AND (expires_at IS NULL OR expires_at>=NOW()) FOR UPDATE");
        $q->execute([$pid]);
        $d = $q->fetch();
        if (!$d) {
            throw new RuntimeException('Discount is inactive, expired, or unavailable.');
        }

        $q = $pdo->prepare("SELECT COALESCE(SUM(amount),0) n FROM charges WHERE folio_id=? AND (?='ALL' OR category=?)");
        $q->execute([$fid, $d['applies_to'], $d['applies_to']]);
        $eligible = (float)$q->fetch()['n'];

        $q = $pdo->prepare("SELECT COALESCE(SUM(amount),0) n FROM applied_discounts WHERE folio_id=? AND status IN ('APPLIED','APPROVED')");
        $q->execute([$fid]);
        $already = (float)$q->fetch()['n'];

        if ($eligible < (float)$d['min_amount']) {
            throw new RuntimeException('Bill does not meet the discount minimum.');
        }

        $amount = $d['discount_type'] === 'PERCENT' ? $eligible * (float)$d['discount_value'] / 100 : (float)$d['discount_value'];
        if ($d['max_discount'] !== null) {
            $amount = min($amount, (float)$d['max_discount']);
        }
        $amount = round(min(max(0, $amount), max(0, $eligible - $already)), 2);

        if ($amount <= 0) {
            throw new RuntimeException('No eligible amount remains for this discount.');
        }
        if (!(int)$d['combinable'] && $already > 0) {
            throw new RuntimeException('This discount cannot be combined with another discount.');
        }

        $status = ((int)$d['requires_manager'] === 1) ? 'PENDING' : 'APPLIED';
        $q = $pdo->prepare('INSERT INTO applied_discounts(folio_id, policy_id, name, discount_type, discount_value, amount, status, reason, applied_by, approved_by) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $q->execute([$fid, $pid, $d['name'], $d['discount_type'], $d['discount_value'], $amount, $status, $reason ?: null, $u['id'], ($status === 'APPLIED') ? $u['id'] : null]);
        $id = (int)$pdo->lastInsertId();

        audit($pdo, $u['id'], 'APPLY_DISCOUNT', 'folio', $fid, ['discount_id' => $id, 'amount' => $amount, 'status' => $status]);
        $pdo->commit();

        ws_broadcast('DISCOUNT_UPDATED', ['folio_id' => $fid, 'discount_id' => $id, 'amount' => $amount, 'status' => $status], null, 'frontdesk');
        ws_broadcast('FOLIO_UPDATED', ['folio_id' => $fid, 'type' => 'DISCOUNT_APPLIED', 'amount' => $amount], null, 'frontdesk');

        out(['ok' => true, 'discount_id' => $id, 'amount' => money($amount), 'status' => $status]);
    } catch (Throwable $e) {
        $pdo->rollBack();
        out(['error' => $e->getMessage()], 400);
    }
}

/**
 * Retrieves all discount requests awaiting manager approval.
 */
if ($action === 'pending_discounts') {
    require_role(['admin', 'manager']);
    $q = $pdo->query("SELECT d.id, d.folio_id, d.name, d.amount, d.reason, d.applied_by, d.created_at, u.username, f.folio_number, s.stay_code FROM applied_discounts d JOIN users u ON u.id=d.applied_by JOIN folios f ON f.id=d.folio_id JOIN stays s ON s.id=f.stay_id WHERE d.status='PENDING' ORDER BY d.created_at");
    out(['discounts' => $q->fetchAll()]);
}

/**
 * Records manager approval or rejection on a pending discount request.
 */
if ($action === 'discount_status') {
    require_role(['admin', 'manager']);
    $id = (int)($in['discount_id'] ?? 0);
    $decision = (string)($in['decision'] ?? '');

    if ($id < 1 || !in_array($decision, ['APPROVE', 'REJECT'], true)) {
        out(['error' => 'Choose approve or reject for a valid discount request.'], 400);
    }

    $pdo->beginTransaction();
    try {
        $q = $pdo->prepare('SELECT id, folio_id, status, applied_by FROM applied_discounts WHERE id=? FOR UPDATE');
        $q->execute([$id]);
        $discount = $q->fetch();

        if (!$discount || $discount['status'] !== 'PENDING') {
            throw new RuntimeException('Only pending discounts can be decided.');
        }
        if ($decision === 'APPROVE' && (int)$discount['applied_by'] === (int)$u['id']) {
            $pdo->rollBack();
            out(['error' => 'You cannot approve your own discount request.'], 403);
        }

        $status = $decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
        $q = $pdo->prepare("UPDATE applied_discounts SET status=?, approved_by=?, approved_at=IF(?='APPROVED', NOW(), approved_at) WHERE id=?");
        $q->execute([$status, $decision === 'APPROVE' ? $u['id'] : null, $status, $id]);

        audit($pdo, $u['id'], 'DISCOUNT_' . $status, 'folio', (int)$discount['folio_id'], ['discount_id' => $id]);
        $pdo->commit();

        ws_broadcast('DISCOUNT_UPDATED', ['folio_id' => (int)$discount['folio_id'], 'discount_id' => $id, 'status' => $status], null, 'frontdesk');
        ws_broadcast('FOLIO_UPDATED', ['folio_id' => (int)$discount['folio_id'], 'type' => 'DISCOUNT_STATUS_CHANGED', 'status' => $status], null, 'frontdesk');

        out(['ok' => true, 'status' => $status]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        out(['error' => $e->getMessage()], 400);
    }
}

// ============================================================================
// REFUNDS & SETTLEMENT MANAGEMENT
// ============================================================================

/**
 * Requests or records a refund against an existing payment, checking max refundable limit.
 */
if ($action === 'refund_request') {
    require_role(['admin', 'manager', 'cashier', 'frontdesk']);
    $payment = (int)($in['payment_id'] ?? 0);
    $amount = round((float)($in['amount'] ?? 0), 2);
    $reason = trim((string)($in['reason'] ?? ''));
    $method = (string)($in['method'] ?? 'CASH');
    $allowed = ['CASH', 'CARD', 'GCASH', 'BANK_TRANSFER', 'MAYA', 'QR_PH', 'OTHER'];

    if ($amount <= 0 || $reason === '' || !in_array($method, $allowed, true)) {
        out(['error' => 'Enter a valid amount, reason, and refund method.'], 400);
    }

    $pdo->beginTransaction();
    try {
        $q = $pdo->prepare('SELECT * FROM payments WHERE id=? FOR UPDATE');
        $q->execute([$payment]);
        $p = $q->fetch();
        if (!$p) {
            throw new RuntimeException('Original payment not found.');
        }

        $q = $pdo->prepare("SELECT COALESCE(SUM(amount),0) n FROM refunds WHERE payment_id=? AND status IN ('REQUESTED','APPROVED','PROCESSING','COMPLETED')");
        $q->execute([$payment]);
        $used = (float)$q->fetch()['n'];

        if ($amount > (float)$p['amount'] - $used + 0.001) {
            throw new RuntimeException('Refund exceeds the remaining refundable amount.');
        }

        $number = 'RF' . date('ymd') . strtoupper(bin2hex(random_bytes(3)));
        $status = 'REQUESTED';

        $q = $pdo->prepare('INSERT INTO refunds(folio_id, payment_id, refund_number, amount, method, reason, status, requested_by, approved_by) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $q->execute([$p['folio_id'], $payment, $number, $amount, $method, $reason, $status, $u['id'], null]);
        $id = (int)$pdo->lastInsertId();

        audit($pdo, $u['id'], 'REFUND_REQUEST', 'payment', $payment, ['refund_id' => $id, 'amount' => $amount, 'status' => $status]);
        $pdo->commit();

        ws_broadcast('REFUND_UPDATED', ['refund_id' => $id, 'folio_id' => $p['folio_id'], 'status' => $status, 'amount' => $amount], null, 'frontdesk');
        ws_broadcast('FOLIO_UPDATED', ['folio_id' => $p['folio_id'], 'type' => 'REFUND_REQUESTED', 'amount' => $amount], null, 'frontdesk');

        out(['ok' => true, 'refund_id' => $id, 'refund_number' => $number, 'status' => $status]);
    } catch (Throwable $e) {
        $pdo->rollBack();
        out(['error' => $e->getMessage()], 400);
    }
}

/**
 * Retrieves list of all refunds ordered by status priority and timestamp.
 */
if ($action === 'refund_list') {
    require_role(['admin', 'manager', 'cashier']);
    $q = $pdo->query("SELECT r.*, p.receipt_number, p.method AS original_payment_method, s.stay_code, rm.room_number, f.folio_number, ur.username AS requested_by_name, ua.username AS approved_by_name 
                      FROM refunds r 
                      JOIN payments p ON p.id=r.payment_id 
                      JOIN folios f ON f.id=r.folio_id 
                      JOIN stays s ON s.id=f.stay_id 
                      JOIN rooms rm ON rm.id=s.room_id 
                      LEFT JOIN users ur ON ur.id=r.requested_by 
                      LEFT JOIN users ua ON ua.id=r.approved_by 
                      ORDER BY CASE r.status WHEN 'REQUESTED' THEN 0 WHEN 'APPROVED' THEN 1 WHEN 'PROCESSING' THEN 2 WHEN 'FAILED' THEN 3 ELSE 4 END, r.created_at DESC LIMIT 500");
    out(['refunds' => $q->fetchAll()]);
}

/**
 * Updates refund status (APPROVED, PROCESSING, COMPLETED, FAILED, REJECTED)
 * with mandatory transaction reference upon completion.
 */
if ($action === 'refund_status') {
    require_role(['admin', 'manager']);
    $id = (int)($in['refund_id'] ?? 0);
    $status = (string)($in['status'] ?? '');

    if (!in_array($status, ['APPROVED', 'REJECTED', 'PROCESSING', 'COMPLETED', 'FAILED'], true)) {
        out(['error' => 'Invalid refund status.'], 400);
    }

    $pdo->beginTransaction();
    $q = $pdo->prepare('SELECT * FROM refunds WHERE id=? FOR UPDATE');
    $q->execute([$id]);
    $r = $q->fetch();
    if (!$r) {
        out(['error' => 'Refund not found.'], 404);
    }

    if ($status === 'APPROVED' && ((int)$r['requested_by'] === (int)$u['id'] || !in_array($u['role'], ['admin', 'manager'], true))) {
        out(['error' => 'A different authorized manager must approve this refund.'], 403);
    }
    if ($status === 'COMPLETED' && !in_array($r['status'], ['APPROVED', 'PROCESSING'], true)) {
        out(['error' => 'Only approved or processing refunds can be completed.'], 400);
    }

    $reference = trim((string)($in['transaction_reference'] ?? ''));
    if ($status === 'COMPLETED' && $reference === '') {
        out(['error' => 'Enter the confirmed cash voucher or payment-provider refund reference before marking a refund completed.'], 400);
    }
    if ($status === 'PROCESSING' && !in_array($r['status'], ['APPROVED', 'FAILED', 'PROCESSING'], true)) {
        out(['error' => 'Only approved or failed refunds can enter processing.'], 400);
    }
    if ($status === 'FAILED' && !in_array($r['status'], ['APPROVED', 'PROCESSING'], true)) {
        out(['error' => 'Only approved or processing refunds can be marked failed.'], 400);
    }

    $pdo->prepare("UPDATE refunds SET status=?, transaction_reference=IF(?<>'', ?, transaction_reference), approved_by=IF(?='APPROVED', ?, approved_by), approved_at=IF(?='APPROVED', NOW(), approved_at), processed_by=IF(? IN ('COMPLETED','FAILED','PROCESSING'), ?, processed_by), completed_at=IF(?='COMPLETED', NOW(), NULL) WHERE id=?")
        ->execute([$status, $reference, $reference, $status, $u['id'], $status, $status, $u['id'], $status, $id]);

    if (in_array($status, ['PROCESSING', 'COMPLETED', 'FAILED'], true)) {
        $q = $pdo->prepare('SELECT COALESCE(MAX(attempt_number),0)+1 FROM refund_transactions WHERE refund_id=?');
        $q->execute([$id]);
        $attempt = (int)$q->fetchColumn();
        $txStatus = in_array($status, ['COMPLETED', 'FAILED'], true) ? $status : 'PROCESSING';
        $pdo->prepare('INSERT INTO refund_transactions(refund_id, attempt_number, provider, transaction_reference, status, amount, result_message, processed_by) VALUES(?, ?, ?, ?, ?, ?, ?, ?)')
            ->execute([$id, $attempt, 'MANUAL', $reference ?: null, $txStatus, $r['amount'], $status === 'COMPLETED' ? 'Completion confirmed by authorized staff' : ($status === 'FAILED' ? 'Refund attempt failed' : 'Refund processing started'), $u['id']]);
    }

    audit($pdo, $u['id'], 'REFUND_STATUS', 'refund', $id, ['status' => $status, 'transaction_reference' => $reference ?: null]);
    $pdo->commit();

    ws_broadcast('REFUND_UPDATED', ['refund_id' => $id, 'folio_id' => (int)$r['folio_id'], 'status' => $status], null, 'frontdesk');
    ws_broadcast('FOLIO_UPDATED', ['folio_id' => (int)$r['folio_id'], 'type' => 'REFUND_STATUS_CHANGED', 'status' => $status], null, 'frontdesk');

    out([
        'ok' => true,
        'status' => $status,
        'message' => $status === 'COMPLETED' ? 'Refund marked completed with confirmation reference.' : 'Refund status updated.'
    ]);
}

// ============================================================================
// FINANCIAL REPORTING & AUDIT LOGGING
// ============================================================================

/**
 * Compiles financial reports including 30-day payment trends, early checkout charges,
 * refund summaries, and revenue breakdown by charge category.
 */
if ($action === 'reports') {
    require_role(['admin', 'manager', 'cashier']);
    $q = $pdo->query("SELECT DATE(created_at) AS day, COUNT(*) AS payments_count, SUM(amount) AS revenue FROM payments WHERE created_at>=DATE_SUB(CURDATE(), INTERVAL 30 DAY) GROUP BY DATE(created_at) ORDER BY day DESC");
    $daily = $q->fetchAll();

    $summary = [];
    $summary['early_checkout_count'] = (int)$pdo->query("SELECT COUNT(*) FROM early_checkout_requests WHERE status='FINALIZED'")->fetchColumn();
    $summary['early_checkout_charges'] = (float)$pdo->query("SELECT COALESCE(SUM(amount),0) FROM charges WHERE description LIKE 'EARLY CHECKOUT CHARGE %'")->fetchColumn();
    $summary['refunds_pending_approval'] = (int)$pdo->query("SELECT COUNT(*) FROM refunds WHERE status='REQUESTED'")->fetchColumn();

    foreach (['COMPLETED', 'REJECTED', 'FAILED'] as $st) {
        $q = $pdo->prepare('SELECT COUNT(*) FROM refunds WHERE status=?');
        $q->execute([$st]);
        $summary['refunds_' . strtolower($st)] = (int)$q->fetchColumn();
    }

    $q = $pdo->query("SELECT COALESCE(SUM(amount),0) FROM refunds WHERE status='COMPLETED' AND created_at>=DATE_SUB(CURDATE(), INTERVAL 30 DAY)");
    $summary['refunds_issued_30d'] = (float)$q->fetchColumn();

    $q = $pdo->query("SELECT c.category, COUNT(*) AS charges_count, SUM(c.amount) AS amount FROM charges c WHERE c.created_at>=DATE_SUB(CURDATE(), INTERVAL 30 DAY) GROUP BY c.category ORDER BY amount DESC");
    $summary['additional_charges_by_category'] = $q->fetchAll();

    out(['daily_payments' => $daily, 'billing_summary' => $summary]);
}

/**
 * Retrieves payment history records with receipt numbers, methods, and folio references.
 */
if ($action === 'payment_history') {
    require_role(['admin', 'manager', 'cashier']);
    $q = $pdo->query("SELECT p.id, p.created_at, p.receipt_number, p.method, p.amount, p.received_amount, p.change_amount, p.reference_note, f.id AS folio_id, f.folio_number, f.status AS folio_status, s.stay_code, s.status AS stay_status, r.room_number, TRIM(CONCAT_WS(' ', c.first_name, NULLIF(c.middle_name, ''), c.last_name)) AS guest_name, u.username AS received_by_name FROM payments p JOIN folios f ON f.id=p.folio_id JOIN stays s ON s.id=f.stay_id JOIN rooms r ON r.id=s.room_id LEFT JOIN customers c ON c.customer_id=s.customer_id LEFT JOIN users u ON u.id=p.received_by ORDER BY p.created_at DESC LIMIT 200");
    out(['payments' => $q->fetchAll()]);
}

/**
 * Retrieves full receipt details for printing and official voucher presentation.
 */
if ($action === 'receipt_details') {
    require_role(['admin', 'manager', 'cashier', 'frontdesk']);
    $receiptNo = trim((string)($in['receipt_number'] ?? ''));
    $paymentId = (int)($in['payment_id'] ?? 0);
    if ($receiptNo === '' && $paymentId < 1) {
        out(['error' => 'A valid receipt number or payment ID is required.'], 400);
    }
    $where = $paymentId > 0 ? 'p.id=?' : 'p.receipt_number=?';
    $param = $paymentId > 0 ? $paymentId : $receiptNo;
    $q = $pdo->prepare("SELECT p.*, f.folio_number, f.status AS folio_status, s.stay_code, s.checkin_at, s.planned_checkout, s.actual_checkout, s.guest_count, r.room_number, rt.name AS room_type, TRIM(CONCAT_WS(' ', c.first_name, NULLIF(c.middle_name, ''), c.last_name)) AS guest_name, c.contact_number, c.email, u.username AS cashier_name FROM payments p JOIN folios f ON f.id=p.folio_id JOIN stays s ON s.id=f.stay_id JOIN rooms r ON r.id=s.room_id JOIN room_types rt ON rt.id=r.room_type_id LEFT JOIN customers c ON c.customer_id=s.customer_id LEFT JOIN users u ON u.id=p.received_by WHERE $where LIMIT 1");
    $q->execute([$param]);
    $receipt = $q->fetch();
    if (!$receipt) {
        out(['error' => 'Receipt not found.'], 404);
    }
    $fid = (int)$receipt['folio_id'];
    $charges = (float)$pdo->query("SELECT COALESCE(SUM(amount),0) FROM charges WHERE folio_id=$fid")->fetchColumn();
    $discounts = (float)$pdo->query("SELECT COALESCE(SUM(amount),0) FROM applied_discounts WHERE folio_id=$fid AND status IN ('APPLIED','APPROVED')")->fetchColumn();
    $net = max(0, $charges - $discounts);
    $vat = round($net * htl103_vat_rate($pdo), 2);
    $totalBill = $net + $vat;
    $allPaid = (float)$pdo->query("SELECT COALESCE(SUM(amount),0) FROM payments WHERE folio_id=$fid")->fetchColumn();
    $refunds = (float)$pdo->query("SELECT COALESCE(SUM(amount),0) FROM refunds WHERE folio_id=$fid AND status='COMPLETED'")->fetchColumn();
    $balance = round(max(0, $totalBill - $allPaid + $refunds), 2);

    out([
        'ok' => true,
        'receipt' => $receipt,
        'folio_summary' => [
            'charges_total' => money($charges),
            'discounts_total' => money($discounts),
            'net_amount' => money($net),
            'vat_amount' => money($vat),
            'total_bill' => money($totalBill),
            'paid_total' => money($allPaid),
            'balance_remaining' => money($balance),
            'is_settled' => ($balance <= 0.009)
        ]
    ]);
}

/**
 * Retrieves all payment transactions recorded on a specific calendar day.
 */
if ($action === 'report_transactions') {
    require_role(['admin', 'manager', 'cashier']);
    $day = (string)($in['day'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $day)) {
        out(['error' => 'Invalid report date.'], 400);
    }
    $q = $pdo->prepare('SELECT p.id, p.created_at, p.receipt_number, p.method, p.amount, p.received_amount, p.change_amount, p.reference_note, f.folio_number, f.status AS folio_status, s.stay_code, s.status AS stay_status, r.room_number FROM payments p JOIN folios f ON f.id=p.folio_id JOIN stays s ON s.id=f.stay_id JOIN rooms r ON r.id=s.room_id WHERE DATE(p.created_at)=? ORDER BY p.created_at DESC');
    $q->execute([$day]);
    out(['transactions' => $q->fetchAll()]);
}

/**
 * Retrieves the system-wide security audit trail showing administrative and financial actions.
 */
if ($action === 'audit_logs') {
    require_role(['admin', 'manager']);
    $q = $pdo->query('SELECT a.created_at, u.username, a.action, a.entity_type, a.entity_id, a.details FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 300');
    out(['logs' => $q->fetchAll()]);
}

/**
 * Allows the currently logged-in user to change their account password.
 */
if ($action === 'change_password') {
    $old = (string)($in['old_password'] ?? '');
    $new = (string)($in['new_password'] ?? '');

    if (strlen($new) < 6) {
        out(['error' => 'New password must be at least 6 characters.'], 400);
    }

    $q = $pdo->prepare('SELECT password_hash FROM users WHERE id=?');
    $q->execute([$u['id']]);
    $stored = $q->fetchColumn();

    if (!$stored || !password_verify($old, $stored)) {
        out(['error' => 'Current password is incorrect.'], 400);
    }

    $pdo->prepare('UPDATE users SET password_hash=?, session_version=session_version+1 WHERE id=?')
        ->execute([password_hash($new, PASSWORD_DEFAULT), $u['id']]);

    $q = $pdo->prepare('SELECT session_version FROM users WHERE id=?');
    $q->execute([$u['id']]);

    session_regenerate_id(true);
    $_SESSION['_session_version'] = (int)$q->fetchColumn();
    $_SESSION['csrf'] = bin2hex(random_bytes(32));

    audit($pdo, $u['id'], 'PASSWORD_CHANGE', 'user', $u['id']);
    out(['ok' => true, 'csrf' => $_SESSION['csrf']]);
}

// Fallback for unrecognized action names
out(['error' => 'Unknown action'], 404);
