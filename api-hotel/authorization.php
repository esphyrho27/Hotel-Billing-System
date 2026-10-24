<?php
declare(strict_types=1);

/**
 * Default fallback permissions for each role.
 * Used when no custom permissions have been saved in the database yet.
 */
const HOTEL_ROLE_PERMISSIONS = [
    'admin' => ['*'],
    'manager' => [
        'dashboard.view',
        'stays.checkin',
        'stays.view',
        'rooms.view',
        'rooms.status',
        'rooms.transfer',
        'service_catalog.view',
        'service_requests.view',
        'service_requests.fulfill',
        'restaurant.manage',
        'service_catalog.manage',
        'billing.view',
        'charges.create',
        'payments.process',
        'discounts.view',
        'discounts.apply',
        'discounts.approve',
        'early_checkout.view',
        'early_checkout.request',
        'early_checkout.approve',
        'refunds.request',
        'refunds.view',
        'refunds.approve',
        'reports.financial.view',
        'transactions.view',
        'audit_logs.view',
        'account.password.change',
        'settings.manage',
        'users.view',
        'users.update',
        'users.deactivate',
        'roles.assign',
    ],
    'frontdesk' => [
        'dashboard.view',
        'stays.checkin',
        'stays.view',
        'stays.checkout',
        'rooms.view',
        'rooms.status',
        'rooms.transfer',
        'service_requests.view',
        'service_requests.assign',
        'billing.view',
        'charges.create',
        'discounts.view',
        'discounts.apply',
        'early_checkout.view',
        'early_checkout.request',
        'refunds.request',
        'account.password.change',
    ],
    'cashier' => [
        'dashboard.view',
        'stays.view',
        'stays.checkout',
        'billing.view',
        'payments.process',
        'charges.create',
        'discounts.view',
        'refunds.request',
        'refunds.view',
        'account.password.change',
    ],
    'restaurant' => [
        'dashboard.view',
        'stays.view',
        'rooms.view',
        'service_catalog.view',
        'service_catalog.manage',
        'restaurant.manage',
        'service_requests.view',
        'service_requests.fulfill',
        'charges.create',
        'account.password.change',
    ],
    'food_beverage' => [
        'dashboard.view',
        'service_requests.view',
        'service_requests.fulfill',
        'account.password.change',
    ],
    'bar' => [
        'dashboard.view',
        'stays.view',
        'rooms.view',
        'service_catalog.view',
        'service_catalog.manage',
        'restaurant.manage',
        'service_requests.view',
        'service_requests.fulfill',
        'charges.create',
        'account.password.change',
    ],
    'minibar' => [
        'dashboard.view',
        'service_requests.view',
        'service_requests.fulfill',
        'account.password.change',
    ],
    'housekeeping' => [
        'dashboard.view',
        'rooms.view',
        'rooms.status',
        'service_requests.view',
        'service_requests.fulfill',
        'account.password.change',
    ],
    'laundry' => [
        'dashboard.view',
        'service_requests.view',
        'service_requests.fulfill',
        'account.password.change',
    ],
    'maintenance' => [
        'dashboard.view',
        'rooms.view',
        'rooms.status',
        'service_requests.view',
        'service_requests.fulfill',
        'account.password.change',
    ],
    'valet' => [
        'dashboard.view',
        'service_requests.view',
        'service_requests.fulfill',
        'account.password.change',
    ],
    'parking' => [
        'dashboard.view',
        'service_requests.view',
        'service_requests.fulfill',
        'account.password.change',
    ],
    'parking_valet' => [
        'dashboard.view',
        'service_requests.view',
        'service_requests.fulfill',
        'account.password.change',
    ],
    'parkingvalet' => [
        'dashboard.view',
        'service_requests.view',
        'service_requests.fulfill',
        'account.password.change',
    ],
    'service' => [
        'dashboard.view',
        'service_requests.view',
        'service_requests.fulfill',
        'account.password.change',
    ],
    'other' => [
        'dashboard.view',
        'service_requests.view',
        'service_requests.fulfill',
        'account.password.change',
    ],
];

/**
 * Master catalog of all permissions with human-readable labels,
 * descriptions, categories, and bound UI modules.
 */
const HOTEL_ALL_PERMISSIONS = [
    [
        'category' => 'Front Desk & Stays',
        'key' => 'dashboard.view',
        'label' => 'Operations Dashboard',
        'description' => 'View operations summary, statistics, quick shortcuts, and balance card',
        'module' => 'dashboard'
    ],
    [
        'category' => 'Front Desk & Stays',
        'key' => 'stays.checkin',
        'label' => 'Walk-In Check-In',
        'description' => 'Register walk-in guests, assign rooms, and create stay folios',
        'module' => 'dashboard'
    ],
    [
        'category' => 'Front Desk & Stays',
        'key' => 'stays.view',
        'label' => 'Active Stays & Folios',
        'description' => 'View current active stays, guest QR passes, and guest records',
        'module' => 'active-stays'
    ],
    [
        'category' => 'Front Desk & Stays',
        'key' => 'stays.checkout',
        'label' => 'Guest Check-Out',
        'description' => 'Process guest checkout, settle balances, and vacate rooms',
        'module' => 'active-stays'
    ],
    [
        'category' => 'Front Desk & Stays',
        'key' => 'rooms.transfer',
        'label' => 'Room Transfers',
        'description' => 'Initiate and authorize room transfers for active guests',
        'module' => 'active-stays'
    ],
    [
        'category' => 'Room Management',
        'key' => 'rooms.view',
        'label' => 'Room Status Board',
        'description' => 'View room inventory board, floor occupancy, and conditions',
        'module' => 'rooms'
    ],
    [
        'category' => 'Room Management',
        'key' => 'rooms.status',
        'label' => 'Update Room Condition',
        'description' => 'Change room condition (Available, Cleaning, Maintenance)',
        'module' => 'rooms'
    ],
    [
        'category' => 'Catalog & Menu',
        'key' => 'service_catalog.view',
        'label' => 'Room Types & Service Catalog',
        'description' => 'View and manage room types, rates, amenities, and service prices',
        'module' => 'catalog'
    ],
    [
        'category' => 'Billing & Payments',
        'key' => 'billing.view',
        'label' => 'View Bills & Folios',
        'description' => 'Inspect itemized charges, VAT calculations, and balances due',
        'module' => 'payments'
    ],
    [
        'category' => 'Billing & Payments',
        'key' => 'charges.create',
        'label' => 'Post Charges to Folio',
        'description' => 'Post service items, dining, minibar, and incidental room charges',
        'module' => 'payments'
    ],
    [
        'category' => 'Billing & Payments',
        'key' => 'payments.process',
        'label' => 'Process Payments & Settlement',
        'description' => 'Accept cash, cards, and digital payments, print official receipts',
        'module' => 'payments'
    ],
    [
        'category' => 'Billing & Payments',
        'key' => 'reports.financial.view',
        'label' => 'Financial Reports & Analytics',
        'description' => 'View daily collections, 30-day revenue summaries, and payment records',
        'module' => 'reports'
    ],
    [
        'category' => 'Discounts & Approvals',
        'key' => 'discounts.apply',
        'label' => 'Apply Discounts',
        'description' => 'Submit discount policy requests for guest folios',
        'module' => 'payments'
    ],
    [
        'category' => 'Discounts & Approvals',
        'key' => 'discounts.approve',
        'label' => 'Discount Approvals',
        'description' => 'Review and approve/reject manager discount requests',
        'module' => 'discount-approvals'
    ],
    [
        'category' => 'Discounts & Approvals',
        'key' => 'early_checkout.view',
        'label' => 'View Early Checkout Policies',
        'description' => 'View early departure policies and requests',
        'module' => 'early-checkouts'
    ],
    [
        'category' => 'Discounts & Approvals',
        'key' => 'early_checkout.request',
        'label' => 'Request Early Departure',
        'description' => 'Submit guest requests to check out before planned date',
        'module' => 'active-stays'
    ],
    [
        'category' => 'Discounts & Approvals',
        'key' => 'early_checkout.approve',
        'label' => 'Early Checkout Approvals',
        'description' => 'Approve, adjust, or waive early checkout fees and penalties',
        'module' => 'early-checkouts'
    ],
    [
        'category' => 'Refunds',
        'key' => 'refunds.request',
        'label' => 'Request Refunds',
        'description' => 'Initiate guest payment refund requests',
        'module' => 'payments'
    ],
    [
        'category' => 'Refunds',
        'key' => 'refunds.view',
        'label' => 'View Refund Records',
        'description' => 'Review historical refund vouchers and transaction logs',
        'module' => 'payments'
    ],
    [
        'category' => 'Refunds',
        'key' => 'refunds.approve',
        'label' => 'Approve & Settle Refunds',
        'description' => 'Authorize and finalize payment refunds with reference number',
        'module' => 'payments'
    ],
    [
        'category' => 'Department Services',
        'key' => 'service_requests.view',
        'label' => 'Department Requests Queue',
        'description' => 'View assigned department tasks, orders, and repair requests',
        'module' => 'service-requests'
    ],
    [
        'category' => 'Department Services',
        'key' => 'service_requests.fulfill',
        'label' => 'Fulfill Requests & Repair Tasks',
        'description' => 'Acknowledge, start work, place on hold, or complete assigned tasks',
        'module' => 'service-requests'
    ],
    [
        'category' => 'Department Services',
        'key' => 'service_requests.assign',
        'label' => 'Route & Assign Requests',
        'description' => 'Dispatch guest requests to specific service departments',
        'module' => 'service-requests'
    ],
    [
        'category' => 'Administration & Security',
        'key' => 'audit_logs.view',
        'label' => 'Security Audit Logs',
        'description' => 'Inspect staff actions, room changes, and security trail',
        'module' => 'audit-logs'
    ],
    [
        'category' => 'Administration & Security',
        'key' => 'users.view',
        'label' => 'View Staff Accounts',
        'description' => 'View staff member accounts and active statuses',
        'module' => 'users'
    ],
    [
        'category' => 'Administration & Security',
        'key' => 'users.update',
        'label' => 'Manage Staff Accounts',
        'description' => 'Create, edit, reset passwords, or deactivate staff members',
        'module' => 'users'
    ],
    [
        'category' => 'Administration & Security',
        'key' => 'roles.assign',
        'label' => 'Manage Role Permissions',
        'description' => 'Check/uncheck permissions for user roles with database persistence',
        'module' => 'users'
    ],
    [
        'category' => 'Administration & Security',
        'key' => 'settings.manage',
        'label' => 'Manage System Settings',
        'description' => 'Configure discount policies, early checkout rules, room types',
        'module' => 'settings'
    ],
    [
        'category' => 'Account',
        'key' => 'account.password.change',
        'label' => 'Change Personal Password',
        'description' => 'Update own account password in settings',
        'module' => 'settings'
    ]
];

const HOTEL_ACTION_PERMISSIONS = [
    'dashboard' => 'dashboard.view',
    'rooms' => 'rooms.view',
    'room_types' => 'rooms.view',
    'room_type_save' => 'settings.manage',
    'room_save' => 'settings.manage',
    'service_catalog' => 'service_catalog.view',
    'service_catalog_save' => 'service_catalog.manage',
    'service_catalog_toggle' => 'service_catalog.manage',
    'active_stays' => 'stays.view',
    'checkin' => 'stays.checkin',
    'update_stay_guest' => 'stays.checkin',
    'checkin_payments' => 'stays.view',
    'pending_checkins' => 'stays.view',
    'approve_checkin_payment' => 'payments.process',
    'confirm_checkin_payment' => 'stays.checkin',
    'cancel_pending_checkin' => 'stays.checkin',
    'folio' => 'billing.view',
    'add_charge' => 'charges.create',
    'pay' => 'payments.process',
    'transfer' => 'rooms.transfer',
    'requests' => 'service_requests.view',
    'request_assign' => 'service_requests.assign',
    'request_status' => 'service_requests.fulfill',
    'request_history' => 'service_requests.view',
    'early_checkout_policies' => 'early_checkout.view',
    'early_checkout_policy_save' => 'settings.manage',
    'discount_policy_admin_list' => 'settings.manage',
    'discount_policy_save' => 'settings.manage',
    'discount_policy_delete' => 'settings.manage',
    'discount_policies' => 'discounts.apply',
    'pending_discounts' => 'discounts.approve',
    'apply_discount' => 'discounts.apply',
    'discount_status' => 'discounts.approve',
    'final_bill_preview' => 'billing.view',
    'early_checkout_request' => 'early_checkout.request',
    'early_checkout_requests' => 'early_checkout.view',
    'early_checkout_decision' => 'early_checkout.approve',
    'early_checkout_finalize' => 'early_checkout.view',
    'refund_request' => 'refunds.request',
    'refund_list' => 'refunds.view',
    'refund_status' => 'refunds.approve',
    'checkout' => 'stays.checkout',
    'room_status' => 'rooms.status',
    'reports' => 'reports.financial.view',
    'payment_history' => 'billing.view',
    'report_transactions' => 'reports.financial.view',
    'audit_logs' => 'audit_logs.view',
    'change_password' => 'account.password.change',
    'users' => 'users.view',
    'user_save' => 'users.update',
    'user_deactivate' => 'users.update',
    'permissions_get' => 'roles.assign',
    'permissions_save' => 'roles.assign',
    'my_permissions' => 'account.password.change',
    'inventory_list' => 'service_requests.view',
    'inventory_save' => 'service_requests.view',
    'inventory_delete' => 'service_requests.view',
    'menu_categories' => 'service_catalog.view',
    'menu_category_save' => 'service_catalog.manage',
    'menu_category_delete' => 'service_catalog.manage',
    'request_create' => 'service_requests.view',
    'department_reports' => 'service_requests.view',
    'restaurant_dashboard_stats' => 'dashboard.view',
    'restaurant_menu_list' => 'dashboard.view',
    'restaurant_item_save' => 'dashboard.view',
    'restaurant_item_toggle' => 'dashboard.view',
    'restaurant_category_save' => 'dashboard.view',
    'restaurant_orders_list' => 'dashboard.view',
    'restaurant_order_status' => 'dashboard.view',
    'restaurant_order_pay' => 'dashboard.view',
    'restaurant_order_create' => 'dashboard.view',
    'customer_place_order' => 'dashboard.view',
    'customer_cancel_order' => 'dashboard.view',
];

/**
 * Retrieve permissions for a role, checking the database first,
 * with fallback to hardcoded defaults if not in DB.
 *
 * @param string $role User role identifier.
 * @param PDO|null $pdo Database connection.
 * @param bool $flush Whether to invalidate cached permissions.
 * @return array List of authorized permission keys.
 */
function hotel_get_role_permissions(string $role, ?PDO $pdo = null, bool $flush = false): array
{
    static $cache = [];
    if ($flush) {
        $cache = [];
    }
    $normalized = strtolower(trim(str_replace([' ', '_', '-'], '', $role)));
    if ($normalized === 'admin') {
        return ['*'];
    }
    if (!$flush && isset($cache[$normalized])) {
        return $cache[$normalized];
    }

    $db = $pdo ?? ($GLOBALS['pdo'] ?? null);
    if ($db instanceof PDO) {
        try {
            // Check if any permission rows exist in the database for this role
            $stmt = $db->prepare('SELECT COUNT(*) FROM role_permissions WHERE role = ?');
            $stmt->execute([$normalized]);
            $hasDbConfig = ((int)$stmt->fetchColumn()) > 0;

            if ($hasDbConfig) {
                $stmt = $db->prepare('SELECT permission FROM role_permissions WHERE role = ?');
                $stmt->execute([$normalized]);
                $rows = $stmt->fetchAll(PDO::FETCH_COLUMN);
                $cache[$normalized] = $rows ?: [];
                return $cache[$normalized];
            }
        } catch (Throwable $e) {
            // Table might not exist yet, fallback to system defaults
        }
    }

    // Fallback to recommended role defaults
    $fallback = HOTEL_ROLE_PERMISSIONS[$normalized] ?? HOTEL_ROLE_PERMISSIONS['service'] ?? [];
    $cache[$normalized] = $fallback;
    return $fallback;
}

/**
 * Check if a user has a specific permission.
 */
function hotel_user_can(array $user, string $permission, ?PDO $pdo = null): bool
{
    $role = strtolower(trim(str_replace([' ', '_', '-'], '', (string)($user['role'] ?? ''))));
    if ($role === 'admin') {
        return true;
    }
    $permissions = hotel_get_role_permissions($role, $pdo);

    return in_array('*', $permissions, true)
        || in_array($permission, $permissions, true);
}

/**
 * Derive the list of allowed UI modules for a role based on its permissions.
 */
function hotel_get_allowed_modules_for_role(string $role, ?PDO $pdo = null): array
{
    $r = strtolower(trim(str_replace([' ', '_', '-'], '', $role)));
    if ($r === 'admin') {
        return [
            'dashboard', 'walkin-checkin', 'active-stays', 'checkout', 'rooms', 'catalog', 'payments',
            'discount-approvals', 'early-checkouts', 'early-checkout-requests', 'service-requests',
            'reports', 'audit-logs', 'users', 'settings'
        ];
    }
    if ($r === 'frontdesk') {
        return [
            'dashboard',
            'walkin-checkin',
            'active-stays',
            'checkout',
            'early-checkout-requests',
            'rooms',
            'service-requests'
        ];
    }
    if ($r === 'cashier') {
        return [
            'dashboard',
            'active-stays',
            'payments'
        ];
    }
    if ($r === 'manager') {
        return [
            'dashboard',
            'active-stays',
            'rooms',
            'catalog',
            'payments',
            'discount-approvals',
            'early-checkouts',
            'reports',
            'audit-logs',
            'users',
            'settings'
        ];
    }

    $perms = hotel_get_role_permissions($r, $pdo);
    $has = fn(string $k): bool => in_array('*', $perms, true) || in_array($k, $perms, true);

    $modules = [];
    if ($has('dashboard.view') || $has('stays.checkin')) {
        $modules[] = 'dashboard';
    }
    $isFoodOrBarRole = in_array($r, ['restaurant', 'foodbeverage', 'food_beverage', 'bar', 'minibar'], true);
    if (!$isFoodOrBarRole) {
        if ($has('stays.view') || $has('stays.checkout') || $has('rooms.transfer')) {
            $modules[] = 'active-stays';
        }
        if ($has('rooms.view') || $has('rooms.status')) {
            $modules[] = 'rooms';
        }
    }
    if ($has('service_catalog.view') || $has('settings.manage')) {
        $modules[] = 'catalog';
    }
    if ($has('billing.view') || $has('payments.process') || $has('charges.create') || $has('refunds.view') || $has('refunds.request')) {
        $modules[] = 'payments';
    }
    if ($has('discounts.approve')) {
        $modules[] = 'discount-approvals';
    }
    if ($has('early_checkout.approve') || $has('early_checkout.view')) {
        $modules[] = 'early-checkouts';
    }
    if ($has('service_requests.view') || $has('service_requests.fulfill') || $has('service_requests.assign')) {
        $modules[] = 'service-requests';
    }
    if ($has('service_requests.view') || $has('reports.financial.view') || $has('dashboard.view')) {
        $modules[] = 'dept-reports';
        $modules[] = 'dept-inventory';
    }
    if ($has('reports.financial.view')) {
        $modules[] = 'reports';
    }
    if ($has('audit_logs.view')) {
        $modules[] = 'audit-logs';
    }
    if ($has('users.view') || $has('users.update') || $has('roles.assign')) {
        $modules[] = 'users';
    }

    // Personal account settings is always available
    $modules[] = 'settings';

    return array_values(array_unique($modules));
}

const ROLE_DEPARTMENT_FILTER = [
    'restaurant'    => ['FOOD_BEVERAGE', 'RESTAURANT', 'FOOD'],
    'food_beverage' => ['FOOD_BEVERAGE', 'RESTAURANT', 'FOOD'],
    'bar'           => ['BAR', 'MINIBAR'],
    'minibar'       => ['BAR', 'MINIBAR'],
    'housekeeping'  => ['HOUSEKEEPING', 'LAUNDRY'],
    'laundry'       => ['LAUNDRY', 'HOUSEKEEPING'],
    'maintenance'   => ['MAINTENANCE'],
    'parkingvalet'  => ['VALET', 'PARKING', 'PARKING_VALET', 'PARKINGVALET'],
    'parking_valet' => ['VALET', 'PARKING', 'PARKING_VALET', 'PARKINGVALET'],
    'valet'         => ['VALET', 'PARKING', 'PARKING_VALET', 'PARKINGVALET'],
    'parking'       => ['PARKING', 'VALET', 'PARKING_VALET', 'PARKINGVALET'],
    'service'       => ['SERVICE', 'OTHER', 'FRONT_DESK'],
    'other'         => ['OTHER', 'SERVICE', 'FRONT_DESK'],
];

/**
 * Retrieves the database service_type categories assigned to a specific department role.
 *
 * @param string $role User role name.
 * @return array|null List of uppercase service types, or null if unconstrained.
 */
function get_role_department_types(string $role): ?array
{
    $normalized = strtolower(trim(str_replace([' ', '_', '-'], '', $role)));
    return ROLE_DEPARTMENT_FILTER[$normalized] ?? null;
}

/**
 * Normalizes department and service type names into canonical department identifiers.
 * Maps variations like FOOD_BEVERAGE, RESTAURANT, FOOD -> 'restaurant'.
 *
 * @param string $deptOrType Raw department or service type string.
 * @return string Canonical department string.
 */
function normalize_department(string $deptOrType): string
{
    $u = strtoupper(trim($deptOrType));
    if (in_array($u, ['FOOD_BEVERAGE', 'RESTAURANT', 'FOOD'], true)) return 'restaurant';
    if (in_array($u, ['BAR', 'MINIBAR'], true)) return 'bar';
    if ($u === 'HOUSEKEEPING') return 'housekeeping';
    if ($u === 'LAUNDRY') return 'laundry';
    if ($u === 'MAINTENANCE') return 'maintenance';
    if (in_array($u, ['VALET', 'PARKING', 'PARKING_VALET', 'PARKINGVALET'], true)) return 'valet';
    if (in_array($u, ['SERVICE', 'FRONT_DESK', 'OTHER'], true)) return 'service';
    return strtolower(trim(str_replace([' ', '_', '-'], '', $deptOrType)));
}
