<?php
declare(strict_types=1);

require_once __DIR__ . '/vat_service.php';
require_once __DIR__ . '/restaurant_schema.php';
$config = require __DIR__ . '/config.php';
date_default_timezone_set($config['timezone'] ?: 'Asia/Manila');
$isSecure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => $isSecure,
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('X-Frame-Options: DENY');
header('Cache-Control: no-store');

function portal_escape(mixed $value): string {
    return htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function portal_redirect(string $token, string $notice): never {
    $_SESSION['portal_notice'] = $notice;
    header('Location: portal.php?t=' . rawurlencode($token), true, 303);
    exit;
}

function portal_broadcast(string $event, array $data, ?string $department, ?string $stayCode): void {
    $payload = json_encode([
        'event' => $event,
        'data' => $data,
        'targetRole' => null,
        'targetDept' => $department,
        'targetStay' => $stayCode,
        'isPublic' => false,
    ], JSON_UNESCAPED_SLASHES);
    if ($payload === false) {
        error_log('Guest portal event could not be encoded: ' . $event);
        return;
    }
    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/json\r\n",
            'content' => $payload,
            'timeout' => 0.5,
            'ignore_errors' => true,
        ],
    ]);
    $response = @file_get_contents('http://127.0.0.1:8086/broadcast', false, $context);
    if ($response === false) {
        error_log('Guest portal event could not reach the WebSocket bridge: ' . $event);
    }
}

// Guest-facing menu artwork, shared by the menu grid and the live order feed so
// the two can never drift apart. Patterns are matched against the item name in
// order; returns the /assets-relative path or null when nothing matches.
$portalMenuPhotoRules = [
    '/chicken wings?|wings/i' => '/assets/menu/chicken-wings.png',
    '/french fries?|fries/i' => '/assets/menu/french-fries.png',
    '/kare.?kare/i' => '/assets/menu/beef-kare-kare.png',
    '/cappuccino|espresso|brewed coffee|americano/i' => '/assets/menu/cappuccino.png',
    '/caesar|salad/i' => '/assets/menu/chicken-caesar-salad.png',
    '/club sandwich|sandwich/i' => '/assets/menu/club-sandwich.png',
    '/salmon|grilled fish/i' => '/assets/menu/grilled-salmon.png',
    '/iced latte|cafe latte|latte/i' => '/assets/menu/iced-latte.png',
    '/mango shake|mango smoothie|shake/i' => '/assets/menu/mango-shake.png',
    '/spaghetti|carbonara|pasta/i' => '/assets/menu/spaghetti-carbonara.png',
    '/nachos|nacho/i' => '/assets/menu/nachos.png',
    '/chocolate cake|choco cake|chocolate dessert/i' => '/assets/menu/chocolate-cake.png',
    '/garlic bread/i' => '/assets/menu/garlic-bread.png',
    '/lumpia shanghai|lumpia/i' => '/assets/menu/lumpia-shanghai.png',
    '/halo-halo/i' => '/assets/menu/halo-halo.png',
    '/ice cream|gelato/i' => '/assets/menu/ice-cream.png',
    '/leche flan|flan/i' => '/assets/menu/leche-flan.png',
    '/beef steak|steak/i' => '/assets/menu/beef-steak.png',
    '/adobo/i' => '/assets/menu/chicken-adobo.png',
    '/chicken inasal|inasal/i' => '/assets/menu/chicken-inasal.png',
    '/grilled bangus|bangus/i' => '/assets/menu/grilled-bangus.png',
    '/pork sinigang|sinigang/i' => '/assets/menu/pork-sinigang.png',
    '/bottled water|mineral water/i' => '/assets/menu/bottled-water.png',
    '/fresh orange juice|orange juice/i' => '/assets/menu/fresh-orange-juice.png',
    '/ice coffee|iced coffee/i' => '/assets/menu/iced-coffee.png',
    '/iced tea|ice tea/i' => '/assets/menu/iced-tea.png',
    '/freshly brewed coffee|coffee|cafe/i' => '/assets/menu/brewed-coffeee.png',
    '/hot chocolate|chocolate drink/i' => '/assets/menu/hot-chocolate.png',
    '/hot tea|tea/i' => '/assets/menu/hot-tea.png',
    '/tanduay/i' => '/assets/menu/tanduay.png',
    '/Redhorse|beer/i' => '/assets/menu/redhorse.png',
];

function portal_menu_photo_match(string $itemName): ?string {
    global $portalMenuPhotoRules;
    foreach ($portalMenuPhotoRules as $pattern => $imagePath) {
        if (preg_match($pattern, $itemName)) {
            return $imagePath;
        }
    }
    return null;
}

$token = trim((string)($_GET['t'] ?? $_POST['t'] ?? ''));
$stay = null;
$folio = null;
$pageError = '';
$notice = (string)($_SESSION['portal_notice'] ?? '');
unset($_SESSION['portal_notice']);
$services = [];
$housekeepingServices = [];
$menuItems = [];
$transferRooms = [];
$currentNightlyRate = 0.0;
$transferRemainingNights = 0;
$hasPendingTransfer = false;
$pendingExtension = null;
$latestRejectedExtension = null;
// The app may be served with either the repository root or public/ as document root.
// Resolve the URL prefix from the actual deployed public asset location.
$documentRoot = rtrim((string)($_SERVER['DOCUMENT_ROOT'] ?? ''), DIRECTORY_SEPARATOR);
if ($documentRoot !== '' && is_file($documentRoot . '/assets/food-placeholder.svg')) {
    $publicAssetUrlPrefix = '/assets';
} elseif ($documentRoot !== '' && is_file($documentRoot . '/public/assets/food-placeholder.svg')) {
    $publicAssetUrlPrefix = '/public/assets';
} else {
    $publicAssetUrlPrefix = '/assets';
}
$requests = [];
$orders = [];
$charges = [];
$payments = [];
$discounts = [];
$balance = 0.0;
$totalCharges = 0.0;
$totalPayments = 0.0;
$discountTotal = 0.0;
$creditBalance = 0.0;
$vatAmount = 0.0;
$vatableSales = 0.0;
$vatExemptSales = 0.0;
$finalTotal = 0.0;
$hasEstimatedReadyAt = false;
$estimatedReadyAtSelect = 'DATE_ADD(created_at, INTERVAL 20 MINUTE) AS estimated_ready_at';

try {
    $pdo = new PDO(
        "mysql:host={$config['host']};dbname={$config['name']};charset=utf8mb4",
        $config['user'],
        $config['pass'],
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );
    htl_ensure_guest_order_ids($pdo);
    $estimatedReadyAtColumn = $pdo->query(
        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'restaurant_orders'
           AND COLUMN_NAME = 'estimated_ready_at'"
    );
    $hasEstimatedReadyAt = (int)$estimatedReadyAtColumn->fetchColumn() > 0;
    if ($hasEstimatedReadyAt) {
        $estimatedReadyAtSelect = 'estimated_ready_at';
    }

    if ($token !== '' && preg_match('/\A[a-f0-9]{64}\z/i', $token)) {
        $stayQuery = $pdo->prepare(
            "SELECT s.id, s.room_id, s.guest_count, s.stay_code, s.status, s.checkin_at, s.planned_checkout, s.actual_checkout,
                    r.room_number, c.first_name, c.last_name
             FROM portal_tokens pt
             JOIN stays s ON s.id = pt.stay_id
             JOIN rooms r ON r.id = s.room_id
             LEFT JOIN customers c ON c.customer_id = s.customer_id
             WHERE pt.token_hash = ? AND pt.revoked_at IS NULL AND pt.expires_at > NOW()
             LIMIT 1"
        );
        $stayQuery->execute([hash('sha256', $token)]);
        $stay = $stayQuery->fetch() ?: null;
    }

    // Private, token-scoped polling endpoint used by the guest portal for live progress.
    // This reuses the same validated stay token as the page and returns no guest PII.
    if (isset($_GET['portal_live'])) {
        header('Content-Type: application/json; charset=utf-8');
        if (!$stay) {
            http_response_code(404);
            echo json_encode(['ok' => false, 'message' => 'Guest stay not found or portal link expired.']);
            exit;
        }
        try {
            $liveOrdersQuery = $pdo->prepare(
                "SELECT id, order_code, order_status, payment_status, total_amount,
                        {$estimatedReadyAtSelect}, created_at
                 FROM restaurant_orders WHERE stay_id = ? ORDER BY created_at DESC LIMIT 15"
            );
            $liveOrdersQuery->execute([(int)$stay['id']]);
            $liveOrders = $liveOrdersQuery->fetchAll();
            if ($liveOrders) {
                $orderIds = array_values(array_map(static fn(array $order): int => (int)$order['id'], $liveOrders));
                $orderPlaceholders = implode(',', array_fill(0, count($orderIds), '?'));
                $liveItemsQuery = $pdo->prepare(
                    "SELECT order_id, item_id, item_name, quantity
                     FROM restaurant_order_items
                     WHERE order_id IN ($orderPlaceholders)
                     ORDER BY order_id, item_name"
                );
                $liveItemsQuery->execute($orderIds);
                $itemsByOrder = [];
                foreach ($liveItemsQuery->fetchAll() as $item) {
                    $orderId = (int)$item['order_id'];
                    $itemsByOrder[$orderId][] = [
                        'item_id' => (int)$item['item_id'],
                        'name' => (string)$item['item_name'],
                        'quantity' => (int)$item['quantity'],
                    ];
                }
                foreach ($liveOrders as &$liveOrder) {
                    $liveOrder['items'] = $itemsByOrder[(int)$liveOrder['id']] ?? [];
                }
                unset($liveOrder);
                // Status-dialog photo: the resolved artwork of the order's first item,
                // using the same shared name rules as the menu grid. When no pattern
                // matches, fall back to the drink/food artwork only when the item's
                // menu type can be determined; otherwise leave it empty and the
                // dialog keeps its generic icon.
                $liveFirstItemIds = [];
                foreach ($liveOrders as $liveOrder) {
                    $liveFirstItem = $liveOrder['items'][0] ?? null;
                    if ($liveFirstItem && !empty($liveFirstItem['item_id'])) {
                        $liveFirstItemIds[] = (int)$liveFirstItem['item_id'];
                    }
                }
                $liveMenuTypes = [];
                if ($liveFirstItemIds) {
                    $liveMenuTypePlaceholders = implode(',', array_fill(0, count($liveFirstItemIds), '?'));
                    $liveMenuTypeQuery = $pdo->prepare(
                        "SELECT m.id, c.menu_type FROM menu_items m
                         JOIN menu_categories c ON c.id = m.category_id
                         WHERE m.id IN ($liveMenuTypePlaceholders)"
                    );
                    $liveMenuTypeQuery->execute($liveFirstItemIds);
                    foreach ($liveMenuTypeQuery->fetchAll() as $liveMenuTypeRow) {
                        $liveMenuTypes[(int)$liveMenuTypeRow['id']] = (string)$liveMenuTypeRow['menu_type'];
                    }
                }
                foreach ($liveOrders as &$liveOrder) {
                    $liveOrder['photo'] = '';
                    $liveFirstItem = $liveOrder['items'][0] ?? null;
                    if ($liveFirstItem) {
                        $liveMatchedPhoto = portal_menu_photo_match((string)$liveFirstItem['name']);
                        if ($liveMatchedPhoto !== null) {
                            $liveOrder['photo'] = $publicAssetUrlPrefix . substr($liveMatchedPhoto, strlen('/assets'));
                        } elseif (isset($liveFirstItem['item_id']) && isset($liveMenuTypes[(int)$liveFirstItem['item_id']])) {
                            $liveMenuType = strtolower($liveMenuTypes[(int)$liveFirstItem['item_id']]);
                            $liveFallbackPhoto = str_contains($liveMenuType, 'drink')
                                ? '/assets/menu/menu-drink.svg'
                                : '/assets/menu/menu-food.svg';
                            $liveOrder['photo'] = $publicAssetUrlPrefix . substr($liveFallbackPhoto, strlen('/assets'));
                        }
                    }
                }
                unset($liveOrder);
            }
            $liveRequestsQuery = $pdo->prepare(
                'SELECT sr.request_code, sr.status, sr.description, sr.chargeable, sr.price, sr.created_at,
                        sr.request_kind, sr.service_type, sr.assigned_department, rr.room_number AS requested_room_number
                 FROM service_requests sr
                 LEFT JOIN rooms rr ON rr.id=sr.requested_room_id
                 WHERE sr.stay_id = ? ORDER BY sr.created_at DESC LIMIT 30'
            );
            $liveRequestsQuery->execute([(int)$stay['id']]);
            $liveExtensions = [];
            try {
                $liveExtensionsQuery = $pdo->prepare(
                    "SELECT id, current_checkout, requested_checkout, extra_nights, nightly_rate, proposed_charge, reason, review_note, status, created_at
                     FROM stay_extension_requests WHERE stay_id=? ORDER BY created_at DESC, id DESC LIMIT 30"
                );
                $liveExtensionsQuery->execute([(int)$stay['id']]);
                $liveExtensions = $liveExtensionsQuery->fetchAll();
            } catch (Throwable $liveExtensionError) {
                // Stay-extension table not migrated yet: live updates still work.
                $liveExtensions = [];
            }
            $liveFolioQuery = $pdo->prepare('SELECT id FROM folios WHERE stay_id=? LIMIT 1');
            $liveFolioQuery->execute([(int)$stay['id']]);
            $liveFolioId = (int)$liveFolioQuery->fetchColumn();
            $liveBilling = [
                'charges' => [],
                'discounts' => [],
                'payments' => [],
                'totals' => ['charges' => 0, 'discounts' => 0, 'vat' => 0, 'payments' => 0, 'balance' => 0, 'credit_balance' => 0],
            ];
            $liveCheckinPayment = null;
            if ($liveFolioId > 0) {
                $liveChargeQuery = $pdo->prepare('SELECT description, quantity, amount, created_at FROM charges WHERE folio_id=? ORDER BY created_at DESC, id DESC');
                $liveChargeQuery->execute([$liveFolioId]);
                $liveBilling['charges'] = $liveChargeQuery->fetchAll();
                $liveDiscountQuery = $pdo->prepare("SELECT name, category, discount_type, discount_value, amount, created_at FROM applied_discounts WHERE folio_id=? AND status IN ('APPLIED','APPROVED') ORDER BY created_at DESC, id DESC");
                $liveDiscountQuery->execute([$liveFolioId]);
                $liveBilling['discounts'] = $liveDiscountQuery->fetchAll();
                $livePaymentQuery = $pdo->prepare('SELECT amount, method AS payment_method, receipt_number, created_at FROM payments WHERE folio_id=? ORDER BY created_at DESC, id DESC');
                $livePaymentQuery->execute([$liveFolioId]);
                $liveBilling['payments'] = $livePaymentQuery->fetchAll();
                $liveTax = htl_vat_inclusive_breakdown($liveBilling['charges'], $liveBilling['discounts'], htl_vat_rate_basis_points($pdo));
                $liveBilling['totals']['charges'] = $liveTax['charges_total_cents'] / 100;
                $liveBilling['totals']['discounts'] = $liveTax['discount_total_cents'] / 100;
                $liveBilling['totals']['payments'] = array_sum(array_map(static fn(array $row): float => (float)$row['amount'], $liveBilling['payments']));
                $liveBilling['totals']['vatable_sales'] = $liveTax['vatable_sales_cents'] / 100;
                $liveBilling['totals']['vat_exempt_sales'] = $liveTax['vat_exempt_sales_cents'] / 100;
                $liveBilling['totals']['vat'] = $liveTax['vat_amount_cents'] / 100;
                $liveBillTotal = $liveTax['total_amount_cents'] / 100;
                $liveBilling['totals']['total'] = $liveBillTotal;
                $liveBilling['totals']['balance'] = max(0, round($liveBillTotal - $liveBilling['totals']['payments'], 2));
                $liveBilling['totals']['credit_balance'] = max(0, round($liveBilling['totals']['payments'] - $liveBillTotal, 2));
                $liveCheckinQuery = $pdo->prepare('SELECT status, required_amount, discount_amount, discount_type, discount_reason, approved_at, confirmed_at FROM checkin_payments WHERE stay_id=? ORDER BY id DESC LIMIT 1');
                $liveCheckinQuery->execute([(int)$stay['id']]);
                $liveCheckinPayment = $liveCheckinQuery->fetch() ?: null;
            }
            echo json_encode([
                'ok' => true,
                'server_time' => date(DATE_ATOM),
                'stay' => [
                    'status' => $stay['status'],
                    'checkin_at' => $stay['checkin_at'],
                    'planned_checkout' => $stay['planned_checkout'],
                    'actual_checkout' => $stay['actual_checkout'],
                    'room_number' => $stay['room_number'],
                ],
                'checkin_payment' => $liveCheckinPayment,
                'billing' => $liveBilling,
                'orders' => $liveOrders,
                'requests' => $liveRequestsQuery->fetchAll(),
                'extensions' => $liveExtensions,
            ], JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
        } catch (Throwable $liveError) {
            error_log('[guest-portal-live] ' . $liveError->getMessage());
            http_response_code(503);
            echo json_encode(['ok' => false, 'message' => 'Live order updates are temporarily unavailable.']);
        }
        exit;
    }

    if ($stay && empty($_SESSION['portal_csrf'])) {
        $_SESSION['portal_csrf'] = bin2hex(random_bytes(32));
    }
    $csrf = (string)($_SESSION['portal_csrf'] ?? '');

    if ($stay && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $submittedToken = (string)($_POST['t'] ?? '');
        $submittedCsrf = (string)($_POST['csrf'] ?? '');
        $sessionCsrf = (string)($_SESSION['portal_csrf'] ?? '');
        if (!hash_equals($token, $submittedToken) || $sessionCsrf === '' || !hash_equals($sessionCsrf, $submittedCsrf)) {
            http_response_code(400);
            $pageError = 'Your session expired. Refresh this page and try again.';
        } elseif ($stay['status'] !== 'ACTIVE') {
            http_response_code(409);
            $pageError = 'Requests and room-service orders are available during an active stay only.';
        } else {
            $action = (string)($_POST['portal_action'] ?? '');
            if ($action === 'service_request' && ($_POST['service_type'] ?? '') === 'ROOM_TRANSFER') {
                $destinationValue = $_POST['requested_room_id'] ?? null;
                $destinationId = is_scalar($destinationValue)
                    ? filter_var((string)$destinationValue, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]])
                    : false;
                $reasonValue = $_POST['description'] ?? null;
                $reason = is_scalar($reasonValue) ? trim((string)$reasonValue) : '';
                if ($destinationId === false || $reason === '' || mb_strlen($reason) > 400
                    || ($_POST['accept_rate_change'] ?? '') !== '1') {
                    http_response_code(422);
                    $pageError = 'Choose a destination room, provide a short reason, and acknowledge the possible rate adjustment.';
                } else {
                    $pdo->beginTransaction();
                    try {
                        $currentStayQuery = $pdo->prepare(
                            "SELECT s.id, s.room_id, s.guest_count, s.status, s.planned_checkout, r.room_number AS current_room,
                                    rt.nightly_rate AS current_rate
                             FROM stays s
                             JOIN rooms r ON r.id=s.room_id
                             JOIN room_types rt ON rt.id=r.room_type_id
                             WHERE s.id=? FOR UPDATE"
                        );
                        $currentStayQuery->execute([(int)$stay['id']]);
                        $currentStay = $currentStayQuery->fetch();
                        $destinationQuery = $pdo->prepare(
                            'SELECT r.id, r.room_number, r.capacity, r.status, rt.nightly_rate
                             FROM rooms r JOIN room_types rt ON rt.id=r.room_type_id
                             WHERE r.id=? FOR UPDATE'
                        );
                        $destinationQuery->execute([(int)$destinationId]);
                        $destination = $destinationQuery->fetch();

                        if (!$currentStay || $currentStay['status'] !== 'ACTIVE') {
                            throw new RuntimeException('Your stay is no longer active. Please contact the front desk.');
                        }
                        if (!$destination || $destination['status'] !== 'AVAILABLE'
                            || (int)$destination['id'] === (int)$currentStay['room_id']) {
                            throw new RuntimeException('That room is no longer available. Choose another room.');
                        }
                        if ((int)$destination['capacity'] < (int)$currentStay['guest_count']) {
                            throw new RuntimeException('That room cannot accommodate everyone on this stay. Choose another room.');
                        }

                        $today = new DateTimeImmutable('today');
                        $checkout = new DateTimeImmutable((string)$currentStay['planned_checkout']);
                        $remainingNights = max(0, (int)$today->diff($checkout)->format('%r%a'));
                        $rateDelta = round((float)$destination['nightly_rate'] - (float)$currentStay['current_rate'], 2);
                        $estimatedAdjustment = round($remainingNights * $rateDelta, 2);

                        $duplicateQuery = $pdo->prepare(
                            "SELECT COUNT(*) FROM service_requests
                             WHERE stay_id=? AND request_kind='ROOM_TRANSFER'
                               AND status IN ('NEW','PENDING','ASSIGNED','ACKNOWLEDGED','IN_PROGRESS','ON_HOLD')"
                        );
                        $duplicateQuery->execute([(int)$currentStay['id']]);
                        if ((int)$duplicateQuery->fetchColumn() > 0) {
                            throw new RuntimeException('You already have a room-change request awaiting staff action.');
                        }
                        $destinationRequestQuery = $pdo->prepare(
                            "SELECT COUNT(*) FROM service_requests
                             WHERE requested_room_id=? AND request_kind='ROOM_TRANSFER'
                               AND status IN ('NEW','PENDING','ASSIGNED','ACKNOWLEDGED','IN_PROGRESS','ON_HOLD')"
                        );
                        $destinationRequestQuery->execute([(int)$destination['id']]);
                        if ((int)$destinationRequestQuery->fetchColumn() > 0) {
                            throw new RuntimeException('That room is already requested by another guest. Choose another room.');
                        }
                        $conflictQuery = $pdo->prepare(
                            "SELECT id FROM stays
                             WHERE room_id=? AND status IN ('ACTIVE','PENDING_PAYMENT')
                               AND DATE(checkin_at) < ? AND planned_checkout > ?
                             LIMIT 1 FOR UPDATE"
                        );
                        $conflictQuery->execute([
                            (int)$destination['id'],
                            $currentStay['planned_checkout'],
                            $today->format('Y-m-d'),
                        ]);
                        if ($conflictQuery->fetch()) {
                            throw new RuntimeException('That room has a conflicting reservation. Choose another room.');
                        }

                        $requestCode = 'RT' . strtoupper(bin2hex(random_bytes(4)));
                        $requestDescription = 'Requested room ' . $destination['room_number'] . ': ' . $reason;
                        $insertTransfer = $pdo->prepare(
                            "INSERT INTO service_requests
                                (stay_id, request_code, service_type, assigned_department, request_kind,
                                 requested_room_id, status, description, chargeable, price)
                             VALUES (?, ?, 'FRONT_DESK', 'frontdesk', 'ROOM_TRANSFER', ?, 'PENDING', ?, 0, 0)"
                        );
                        $insertTransfer->execute([
                            (int)$currentStay['id'],
                            $requestCode,
                            (int)$destination['id'],
                            $requestDescription,
                        ]);
                        $requestId = (int)$pdo->lastInsertId();
                        $history = $pdo->prepare(
                            "INSERT INTO service_request_history
                                (request_id, from_status, to_status, assigned_department, notes)
                             VALUES (?, NULL, 'PENDING', 'frontdesk', ?)"
                        );
                        $history->execute([
                            $requestId,
                            'Guest requested room ' . $destination['room_number']
                                . '; estimated rate adjustment ' . number_format($estimatedAdjustment, 2, '.', '')
                                . ' for ' . $remainingNights . ' remaining night(s). Manager approval required.',
                        ]);
                        $pdo->commit();
                    } catch (Throwable $error) {
                        if ($pdo->inTransaction()) {
                            $pdo->rollBack();
                        }
                        throw $error;
                    }
                    portal_broadcast('REQUEST_CREATED', [
                        'id' => $requestId,
                        'request_code' => $requestCode,
                        'stay_code' => $stay['stay_code'],
                        'room_number' => $stay['room_number'],
                        'service_type' => 'FRONT_DESK',
                        'request_kind' => 'ROOM_TRANSFER',
                        'requested_room_number' => $destination['room_number'],
                        'assigned_department' => 'frontdesk',
                        'status' => 'PENDING',
                        'description' => $requestDescription,
                        'chargeable' => 0,
                        'price' => 0,
                    ], 'frontdesk', $stay['stay_code']);
                    portal_redirect($token, 'service');
                }
            } elseif ($action === 'extend_stay') {
                $requestedValue = $_POST['requested_checkout'] ?? null;
                $reasonValue = $_POST['reason'] ?? null;
                $requestedCheckout = is_scalar($requestedValue) ? trim((string)$requestedValue) : '';
                $reason = is_scalar($reasonValue) ? trim((string)$reasonValue) : '';
                $parsedCheckout = $requestedCheckout !== ''
                    ? DateTimeImmutable::createFromFormat('!Y-m-d', $requestedCheckout)
                    : false;
                if ($parsedCheckout === false || $parsedCheckout->format('Y-m-d') !== $requestedCheckout
                    || mb_strlen($reason) > 500) {
                    http_response_code(422);
                    $pageError = 'Choose a valid new checkout date and keep the reason under 500 characters.';
                } else {
                    $pdo->beginTransaction();
                    try {
                        $extendStayQuery = $pdo->prepare(
                            "SELECT s.id, s.room_id, s.status, s.planned_checkout,
                                    rt.nightly_rate AS current_rate
                             FROM stays s
                             JOIN rooms r ON r.id=s.room_id
                             JOIN room_types rt ON rt.id=r.room_type_id
                             WHERE s.id=? FOR UPDATE"
                        );
                        $extendStayQuery->execute([(int)$stay['id']]);
                        $extendStay = $extendStayQuery->fetch();
                        if (!$extendStay || $extendStay['status'] !== 'ACTIVE') {
                            throw new RuntimeException('Your stay is no longer active. Please contact the front desk.');
                        }
                        $currentCheckout = (string)$extendStay['planned_checkout'];
                        if ($requestedCheckout <= $currentCheckout) {
                            throw new RuntimeException('The new checkout date must be after your current checkout date.');
                        }
                        $duplicateQuery = $pdo->prepare(
                            "SELECT COUNT(*) FROM stay_extension_requests
                             WHERE stay_id=? AND status='REQUESTED'"
                        );
                        $duplicateQuery->execute([(int)$extendStay['id']]);
                        if ((int)$duplicateQuery->fetchColumn() > 0) {
                            throw new RuntimeException('You already have a stay extension request awaiting staff action.');
                        }
                        $conflictQuery = $pdo->prepare(
                            "SELECT id FROM stays
                             WHERE room_id=? AND status IN ('ACTIVE','PENDING_PAYMENT')
                               AND DATE(checkin_at) < ? AND planned_checkout > ?
                             LIMIT 1 FOR UPDATE"
                        );
                        $conflictQuery->execute([(int)$extendStay['room_id'], $requestedCheckout, $currentCheckout]);
                        if ($conflictQuery->fetch()) {
                            throw new RuntimeException('Your room is already booked past your current checkout date. Please contact the front desk.');
                        }
                        $extendFolioQuery = $pdo->prepare('SELECT id FROM folios WHERE stay_id=? LIMIT 1 FOR UPDATE');
                        $extendFolioQuery->execute([(int)$extendStay['id']]);
                        $extendFolio = $extendFolioQuery->fetch();
                        if (!$extendFolio) {
                            throw new RuntimeException('Your folio could not be found. Please contact the front desk.');
                        }
                        $extraNights = (int)(new DateTimeImmutable($currentCheckout))->diff(new DateTimeImmutable($requestedCheckout))->format('%a');
                        if ($extraNights < 1) {
                            throw new RuntimeException('The new checkout date must add at least one night.');
                        }
                        $nightlyRate = round((float)$extendStay['current_rate'], 2);
                        $proposedCharge = round($extraNights * $nightlyRate, 2);
                        $insertExtension = $pdo->prepare(
                            "INSERT INTO stay_extension_requests
                                (stay_id, folio_id, current_checkout, requested_checkout, extra_nights,
                                 nightly_rate, proposed_charge, reason, status, requested_by)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'REQUESTED', NULL)"
                        );
                        $insertExtension->execute([
                            (int)$extendStay['id'],
                            (int)$extendFolio['id'],
                            $currentCheckout,
                            $requestedCheckout,
                            $extraNights,
                            $nightlyRate,
                            $proposedCharge,
                            $reason !== '' ? $reason : null,
                        ]);
                        $extensionRequestId = (int)$pdo->lastInsertId();
                        $pdo->commit();
                    } catch (Throwable $error) {
                        if ($pdo->inTransaction()) {
                            $pdo->rollBack();
                        }
                        throw $error;
                    }
                    portal_broadcast('EXTENSION_REQUESTED', [
                        'id' => $extensionRequestId,
                        'stay_code' => $stay['stay_code'],
                        'room_number' => $stay['room_number'],
                        'current_checkout' => $currentCheckout,
                        'requested_checkout' => $requestedCheckout,
                        'extra_nights' => $extraNights,
                        'proposed_charge' => $proposedCharge,
                        'status' => 'REQUESTED',
                    ], 'frontdesk', $stay['stay_code']);
                    portal_redirect($token, 'extension');
                }
            } elseif ($action === 'service_request') {
                $description = trim((string)($_POST['description'] ?? ''));
                $type = (string)($_POST['service_type'] ?? 'FRONT_DESK');
                $isHousekeeping = $type === 'HOUSEKEEPING';
                $allowedTypes = [
                    'HOUSEKEEPING' => 'housekeeping',
                    'MAINTENANCE' => 'maintenance',
                    'FRONT_DESK' => 'frontdesk',
                    'OTHER' => 'service',
                ];
                $department = $allowedTypes[$type] ?? '';
                $housekeepingItem = trim((string)($_POST['housekeeping_item'] ?? ''));
                $housekeepingItems = [
                    'Extra towels',
                    'Pillow',
                    'Blanket',
                    'Bed sheets',
                    'Toiletries',
                ];
                $housekeepingQuantity = filter_var(
                    $_POST['housekeeping_quantity'] ?? null,
                    FILTER_VALIDATE_INT,
                    ['options' => ['min_range' => 1, 'max_range' => 20]]
                );
                if (!isset($allowedTypes[$type])
                    || (!$isHousekeeping && $description === '')
                    || mb_strlen($description) > 500
                    || ($isHousekeeping && (!in_array($housekeepingItem, $housekeepingItems, true)
                        || $housekeepingQuantity === false))) {
                    http_response_code(422);
                    $pageError = $isHousekeeping
                        ? 'Choose an available housekeeping item and select a quantity from 1 to 20.'
                        : 'Choose a request type and enter a short description.';
                } else {
                    $quantity = $isHousekeeping ? (int)$housekeepingQuantity : 1;
                    $price = 0.0;
                    if ($isHousekeeping) {
                        $serviceQuery = $pdo->prepare(
                            "SELECT name, category, price FROM service_catalog
                             WHERE name = ? AND active = 1 AND category = 'HOUSEKEEPING'
                             LIMIT 1"
                        );
                        $serviceQuery->execute([$housekeepingItem]);
                        $service = $serviceQuery->fetch();
                        if (!$service) {
                            http_response_code(422);
                            $pageError = 'A price has not been configured for that housekeeping item yet. Please contact the front desk.';
                        } else {
                            $description = $service['name'] . ' (quantity: ' . $quantity . ')'
                                . ($description !== '' ? ' — ' . $description : '');
                            $price = round((float)$service['price'] * $quantity, 2);
                        }
                    } else {
                        $serviceId = filter_input(INPUT_POST, 'service_id', FILTER_VALIDATE_INT) ?: 0;
                    }
                    if (!$isHousekeeping && $serviceId > 0) {
                        $serviceQuery = $pdo->prepare(
                            "SELECT name, category, price FROM service_catalog
                             WHERE id = ? AND active = 1 AND category <> 'FOOD_BEVERAGE'"
                        );
                        $serviceQuery->execute([$serviceId]);
                        $service = $serviceQuery->fetch();
                        if (!$service) {
                            http_response_code(422);
                            $pageError = 'That service is no longer available. Refresh and try again.';
                        } elseif ($isHousekeeping && $service['category'] !== 'HOUSEKEEPING') {
                            http_response_code(422);
                            $pageError = 'That housekeeping item is no longer available. Refresh and try again.';
                        } else {
                            if ($isHousekeeping) {
                                $description = $service['name'] . ' (quantity: ' . $quantity . ')'
                                    . ($description !== '' ? ' — ' . $description : '');
                                $price = round((float)$service['price'] * $quantity, 2);
                            } else {
                                $description = $service['name'] . ' — ' . $description;
                                $price = (float)$service['price'];
                            }
                            $serviceRouting = [
                                'HOUSEKEEPING' => ['HOUSEKEEPING', 'housekeeping'],
                                'LAUNDRY' => ['HOUSEKEEPING', 'laundry'],
                                'MAINTENANCE' => ['MAINTENANCE', 'maintenance'],
                                'MINIBAR' => ['FOOD_BEVERAGE', 'restaurant'],
                                'SERVICE' => ['OTHER', 'service'],
                                'OTHER' => ['OTHER', 'service'],
                            ];
                            if (isset($serviceRouting[$service['category']])) {
                                $type = $serviceRouting[$service['category']][0];
                                $department = $serviceRouting[$service['category']][1];
                            }
                            if (mb_strlen($description) > 500) {
                                http_response_code(422);
                                $pageError = 'Please shorten the service description and try again.';
                            }
                        }
                    }
                    if ($pageError === '' && mb_strlen($description) > 500) {
                        http_response_code(422);
                        $pageError = 'Please shorten the service description and try again.';
                    }
                    if ($pageError === '') {
                        $requestCode = 'RQ' . strtoupper(bin2hex(random_bytes(4)));
                        $pdo->beginTransaction();
                        try {
                            $insert = $pdo->prepare(
                                "INSERT INTO service_requests
                                    (stay_id, request_code, service_type, assigned_department, status, description, chargeable, price)
                                 VALUES (?, ?, ?, ?, 'PENDING', ?, ?, ?)"
                            );
                            $insert->execute([
                                (int)$stay['id'],
                                $requestCode,
                                $type,
                                $department,
                                $description,
                                $price > 0 ? 1 : 0,
                                $price,
                            ]);
                            $requestId = (int)$pdo->lastInsertId();
                            $history = $pdo->prepare(
                                "INSERT INTO service_request_history
                                    (request_id, from_status, to_status, assigned_department, notes)
                                 VALUES (?, NULL, 'PENDING', ?, ?)"
                            );
                            $history->execute([$requestId, $department, 'Created by guest through the guest portal.']);
                            $pdo->commit();
                        } catch (Throwable $error) {
                            if ($pdo->inTransaction()) {
                                $pdo->rollBack();
                            }
                            throw $error;
                        }
                        portal_broadcast('REQUEST_CREATED', [
                            'id' => $requestId,
                            'request_code' => $requestCode,
                            'stay_code' => $stay['stay_code'],
                            'room_number' => $stay['room_number'],
                            'service_type' => $type,
                            'assigned_department' => $department,
                            'status' => 'PENDING',
                            'description' => $description,
                            'chargeable' => $price > 0 ? 1 : 0,
                            'price' => $price,
                        ], $department, $stay['stay_code']);
                        portal_redirect($token, 'service');
                    }
                }
            } elseif ($action === 'food_order') {
                $quantities = $_POST['quantity'] ?? [];
                $notes = trim((string)($_POST['notes'] ?? ''));
                if (!is_array($quantities) || mb_strlen($notes) > 500) {
                    http_response_code(422);
                    $pageError = 'Review the order details and try again.';
                } else {
                    $lines = [];
                    $total = 0.0;
                    $itemQuery = $pdo->prepare(
                        "SELECT m.id, m.item_name, m.price, c.category_name, c.menu_type
                         FROM menu_items m
                         JOIN menu_categories c ON c.id = m.category_id
                         WHERE m.id = ? AND m.availability_status = 'Available'"
                    );
                    foreach ($quantities as $rawId => $rawQuantity) {
                        if (!is_scalar($rawId) || !is_scalar($rawQuantity)) {
                            http_response_code(422);
                            $pageError = 'Review the selected menu quantities and try again.';
                            break;
                        }
                        $itemId = filter_var((string)$rawId, FILTER_VALIDATE_INT);
                        $quantity = filter_var((string)$rawQuantity, FILTER_VALIDATE_INT);
                        if ($rawQuantity === '' || $rawQuantity === '0' || $rawQuantity === 0) {
                            continue;
                        }
                        if ($itemId === false || $itemId < 0 || !$quantity || $quantity < 1 || $quantity > 20) {
                            http_response_code(422);
                            $pageError = 'Choose a quantity from 1 to 20 for each selected item.';
                            break;
                        }
                        $itemQuery->execute([$itemId]);
                        $item = $itemQuery->fetch();
                        if (!$item) {
                            http_response_code(422);
                            $pageError = 'A selected menu item is unavailable. Refresh the menu and try again.';
                            break;
                        }
                        $unitPrice = (float)$item['price'];
                        $subtotal = round($unitPrice * $quantity, 2);
                        $total += $subtotal;
                        $lines[] = [
                            'id' => (int)$item['id'],
                            'name' => $item['item_name'],
                            'category' => $item['category_name'],
                            'menu_type' => $item['menu_type'],
                            'quantity' => $quantity,
                            'price' => $unitPrice,
                            'subtotal' => $subtotal,
                        ];
                    }
                    if ($pageError === '' && !$lines) {
                        http_response_code(422);
                        $pageError = 'Add at least one item to your order.';
                    }
                    if ($pageError === '') {
                        $orderDepartment = count(array_filter($lines, static fn($line) => $line['menu_type'] !== 'Drinks')) === 0
                            ? 'bar'
                            : 'restaurant';
                        $pdo->beginTransaction();
                        try {
                            $orderCode = 'RO-' . date('Ymd') . '-' . strtoupper(bin2hex(random_bytes(3)));
                            if ($hasEstimatedReadyAt) {
                                $insertOrder = $pdo->prepare(
                                    "INSERT INTO restaurant_orders
                                        (order_code, customer_id, stay_id, room_number, order_type, notes, total_amount,
                                         order_status, payment_status, estimated_ready_at)
                                     SELECT ?, s.customer_id, s.id, r.room_number, 'Room Service', ?, ?,
                                            'Pending', 'Unpaid', DATE_ADD(NOW(), INTERVAL 20 MINUTE)
                                     FROM stays s JOIN rooms r ON r.id = s.room_id WHERE s.id = ? AND s.status = 'ACTIVE'"
                                );
                            } else {
                                $insertOrder = $pdo->prepare(
                                    "INSERT INTO restaurant_orders
                                        (order_code, customer_id, stay_id, room_number, order_type, notes, total_amount,
                                         order_status, payment_status)
                                     SELECT ?, s.customer_id, s.id, r.room_number, 'Room Service', ?, ?,
                                            'Pending', 'Unpaid'
                                     FROM stays s JOIN rooms r ON r.id = s.room_id WHERE s.id = ? AND s.status = 'ACTIVE'"
                                );
                            }
                            $insertOrder->execute([$orderCode, $notes ?: null, $total, (int)$stay['id']]);
                            if ($insertOrder->rowCount() !== 1) {
                                throw new RuntimeException('The stay is no longer active.');
                            }
                            $orderId = (int)$pdo->lastInsertId();
                            $insertLine = $pdo->prepare(
                                'INSERT INTO restaurant_order_items
                                    (order_id, item_id, item_name, category_name, quantity, unit_price, subtotal)
                                 VALUES (?, ?, ?, ?, ?, ?, ?)'
                            );
                            $descriptions = [];
                            foreach ($lines as $line) {
                                $insertLine->execute([
                                    $orderId,
                                    $line['id'],
                                    $line['name'],
                                    $line['category'],
                                    $line['quantity'],
                                    $line['price'],
                                    $line['subtotal'],
                                ]);
                                $descriptions[] = $line['quantity'] . 'x ' . $line['name'];
                            }
                            $description = implode(', ', $descriptions);
                            if ($notes !== '') {
                                $description .= ' (Note: ' . $notes . ')';
                            }
                            $description = mb_substr($description, 0, 500);
                            $insertRequest = $pdo->prepare(
                                "INSERT INTO service_requests
                                    (stay_id, request_code, service_type, assigned_department, status, description, chargeable, price)
                                 VALUES (?, ?, 'FOOD_BEVERAGE', ?, 'PENDING', ?, 1, ?)"
                            );
                            $insertRequest->execute([(int)$stay['id'], $orderCode, $orderDepartment, $description, $total]);
                            $insertHistory = $pdo->prepare(
                                "INSERT INTO service_request_history
                                    (request_id, from_status, to_status, assigned_department, notes)
                                 SELECT id, NULL, 'PENDING', assigned_department, 'Created with room-service order from the guest portal.'
                                 FROM service_requests WHERE request_code=?"
                            );
                            $insertHistory->execute([$orderCode]);
                            $pdo->commit();
                            portal_broadcast('RESTAURANT_ORDER_CREATED', [
                                'id' => $orderId,
                                'order_code' => $orderCode,
                                'room_number' => $stay['room_number'],
                                'order_type' => 'Room Service',
                                'total_amount' => round($total, 2),
                                'order_status' => 'Pending',
                                'items_count' => count($lines),
                                'estimated_ready_at' => date('Y-m-d H:i:s', time() + 1200),
                                'items_summary' => implode(', ', $descriptions),
                            ], $orderDepartment, $stay['stay_code']);
                            portal_redirect($token, 'order');
                        } catch (Throwable $error) {
                            if ($pdo->inTransaction()) {
                                $pdo->rollBack();
                            }
                            throw $error;
                        }
                    }
                }
            } else {
                http_response_code(400);
                $pageError = 'That request could not be processed.';
            }
        }
    }

    if ($stay) {
        $folioQuery = $pdo->prepare('SELECT id, folio_number FROM folios WHERE stay_id = ? LIMIT 1');
        $folioQuery->execute([(int)$stay['id']]);
        $folio = $folioQuery->fetch() ?: null;

        if ($folio) {
            $chargeQuery = $pdo->prepare('SELECT description, quantity, amount, created_at FROM charges WHERE folio_id = ? ORDER BY created_at DESC, id DESC');
            $chargeQuery->execute([(int)$folio['id']]);
            $charges = $chargeQuery->fetchAll();
            $paymentQuery = $pdo->prepare('SELECT amount, method AS payment_method, receipt_number, created_at FROM payments WHERE folio_id = ? ORDER BY created_at DESC, id DESC');
            $paymentQuery->execute([(int)$folio['id']]);
            $payments = $paymentQuery->fetchAll();
            $discountQuery = $pdo->prepare("SELECT name, category, discount_type, discount_value, amount FROM applied_discounts WHERE folio_id=? AND status IN ('APPLIED','APPROVED') ORDER BY created_at, id");
            $discountQuery->execute([(int)$folio['id']]);
            $discounts = $discountQuery->fetchAll();
            $totalPayments = array_sum(array_map(static fn(array $row): float => (float)$row['amount'], $payments));
            $tax = htl_vat_inclusive_breakdown($charges, $discounts, htl_vat_rate_basis_points($pdo));
            $totalCharges = $tax['charges_total_cents'] / 100;
            $discountTotal = $tax['discount_total_cents'] / 100;
            $vatableSales = $tax['vatable_sales_cents'] / 100;
            $vatExemptSales = $tax['vat_exempt_sales_cents'] / 100;
            $vatAmount = $tax['vat_amount_cents'] / 100;
            $finalTotal = $tax['total_amount_cents'] / 100;
            $balance = max(0, round($finalTotal - $totalPayments, 2));
            $creditBalance = max(0, round($totalPayments - $finalTotal, 2));
        }

        $serviceQuery = $pdo->query(
            "SELECT id, name, category, description, price
             FROM service_catalog WHERE active = 1 AND category <> 'FOOD_BEVERAGE'
             ORDER BY category, name"
        );
        $services = $serviceQuery->fetchAll();

        $housekeepingQuery = $pdo->query(
            "SELECT id, name, price
             FROM service_catalog
             WHERE active = 1 AND category = 'HOUSEKEEPING'
             ORDER BY name"
        );
        $housekeepingServices = $housekeepingQuery->fetchAll();
        $housekeepingPrices = [];
        foreach ($housekeepingServices as $housekeepingService) {
            $housekeepingPrices[$housekeepingService['name']] = (float)$housekeepingService['price'];
        }

        $menuQuery = $pdo->query(
            "            SELECT m.id, m.item_name, m.description, m.price, m.image_path, c.category_name, c.menu_type
             FROM menu_items m
             JOIN menu_categories c ON c.id = m.category_id
             WHERE m.availability_status = 'Available'
             ORDER BY c.menu_type, c.category_name, m.item_name"
        );
        $menuItems = $menuQuery->fetchAll();

        // Keep guest-facing menu artwork in public/assets/menu (never api-hotel/assets).
        // Artwork resolves from the item name via the shared rules above, so stale/broken
        // database paths cannot keep the guest portal stuck on its placeholder.
        foreach ($menuItems as &$menuItem) {
            $matchedImage = portal_menu_photo_match((string)($menuItem['item_name'] ?? ''));
            if ($matchedImage !== null) {
                $menuItem['image_path'] = $matchedImage;
            } else {
                $menuType = strtolower((string)($menuItem['menu_type'] ?? ''));
                $menuItem['image_path'] = str_contains($menuType, 'drink')
                    ? '/assets/menu/menu-drink.svg'
                    : '/assets/menu/menu-food.svg';
            }
        }
        unset($menuItem);
        // Apply the detected public URL prefix to all auto-selected artwork.
        foreach ($menuItems as &$menuItem) {
            $menuItem['image_path'] = $publicAssetUrlPrefix . substr((string)$menuItem['image_path'], strlen('/assets'));
        }
        unset($menuItem);

        $requestQuery = $pdo->prepare(
            'SELECT sr.request_code, sr.service_type, sr.description, sr.status, sr.price, sr.chargeable,
                    sr.created_at, sr.request_kind, rr.room_number AS requested_room_number
             FROM service_requests sr
             LEFT JOIN rooms rr ON rr.id=sr.requested_room_id
             WHERE sr.stay_id = ? ORDER BY sr.created_at DESC LIMIT 30'
        );
        $requestQuery->execute([(int)$stay['id']]);
        $requests = $requestQuery->fetchAll();
        $pendingTransferQuery = $pdo->prepare(
            "SELECT COUNT(*) FROM service_requests
             WHERE stay_id=? AND request_kind='ROOM_TRANSFER'
               AND status IN ('NEW','PENDING','ASSIGNED','ACKNOWLEDGED','IN_PROGRESS','ON_HOLD')"
        );
        $pendingTransferQuery->execute([(int)$stay['id']]);
        $hasPendingTransfer = (int)$pendingTransferQuery->fetchColumn() > 0;
        try {
            $pendingExtensionQuery = $pdo->prepare(
                "SELECT id, current_checkout, requested_checkout, extra_nights, nightly_rate, proposed_charge, reason, review_note, status, created_at
                 FROM stay_extension_requests
                 WHERE stay_id=? AND status='REQUESTED'
                 ORDER BY created_at DESC LIMIT 1"
            );
            $pendingExtensionQuery->execute([(int)$stay['id']]);
            $pendingExtension = $pendingExtensionQuery->fetch() ?: null;
            if (!$pendingExtension) {
                $rejectedExtensionQuery = $pdo->prepare(
                    "SELECT id, current_checkout, requested_checkout, extra_nights, nightly_rate, proposed_charge, reason, review_note, status, created_at
                     FROM stay_extension_requests
                     WHERE stay_id=? AND status='REJECTED'
                     ORDER BY created_at DESC LIMIT 1"
                );
                $rejectedExtensionQuery->execute([(int)$stay['id']]);
                $latestRejectedExtension = $rejectedExtensionQuery->fetch() ?: null;
            }
        } catch (Throwable $extensionQueryError) {
            // Stay-extension table not migrated yet: the portal still loads.
            $pendingExtension = null;
            $latestRejectedExtension = null;
        }
        $extensionRequests = [];
        try {
            $extensionListQuery = $pdo->prepare(
                "SELECT id, current_checkout, requested_checkout, extra_nights, nightly_rate, proposed_charge, reason, review_note, status, created_at
                 FROM stay_extension_requests
                 WHERE stay_id=? ORDER BY created_at DESC, id DESC"
            );
            $extensionListQuery->execute([(int)$stay['id']]);
            $extensionRequests = $extensionListQuery->fetchAll();
        } catch (Throwable $extensionListError) {
            // Stay-extension table not migrated yet: the portal still loads.
            $extensionRequests = [];
        }
        $recentActivity = [];
        foreach ($requests as $request) {
            $recentActivity[] = ['kind' => 'request', 'created_at' => (string)$request['created_at'], 'data' => $request];
        }
        foreach ($extensionRequests as $extensionRow) {
            $recentActivity[] = ['kind' => 'extension', 'created_at' => (string)$extensionRow['created_at'], 'data' => $extensionRow];
        }
        usort($recentActivity, static fn(array $a, array $b): int => strcmp((string)$b['created_at'], (string)$a['created_at']));
        $recentActivity = array_slice($recentActivity, 0, 3);
        if ($stay['status'] === 'ACTIVE') {
            $rateQuery = $pdo->prepare(
                'SELECT rt.nightly_rate FROM stays s JOIN rooms r ON r.id=s.room_id JOIN room_types rt ON rt.id=r.room_type_id WHERE s.id=?'
            );
            $rateQuery->execute([(int)$stay['id']]);
            $currentNightlyRate = (float)$rateQuery->fetchColumn();
            $today = new DateTimeImmutable('today');
            $checkout = new DateTimeImmutable((string)$stay['planned_checkout']);
            $transferRemainingNights = max(0, (int)$today->diff($checkout)->format('%r%a'));
            if (!$hasPendingTransfer) {
                $availableRoomQuery = $pdo->prepare(
                    "SELECT r.id, r.room_number, r.capacity, rt.name AS room_type, rt.nightly_rate
                     FROM rooms r
                     JOIN room_types rt ON rt.id=r.room_type_id
                     WHERE r.status='AVAILABLE' AND r.id<>?
                       AND r.capacity >= (SELECT guest_count FROM stays WHERE id=?)
                       AND NOT EXISTS (
                           SELECT 1 FROM service_requests pending_transfer
                           WHERE pending_transfer.requested_room_id=r.id
                             AND pending_transfer.request_kind='ROOM_TRANSFER'
                             AND pending_transfer.status IN ('NEW','PENDING','ASSIGNED','ACKNOWLEDGED','IN_PROGRESS','ON_HOLD')
                       )
                       AND NOT EXISTS (
                           SELECT 1 FROM stays occupied
                           WHERE occupied.room_id=r.id
                             AND occupied.status IN ('ACTIVE','PENDING_PAYMENT')
                             AND DATE(occupied.checkin_at) < ?
                             AND occupied.planned_checkout > ?
                       )
                     ORDER BY r.room_number"
                );
                $availableRoomQuery->execute([
                    (int)$stay['room_id'],
                    (int)$stay['id'],
                    $stay['planned_checkout'],
                    $today->format('Y-m-d'),
                ]);
                $transferRooms = $availableRoomQuery->fetchAll();
            }
        }

        $orderQuery = $pdo->prepare(
            "SELECT id, order_code, order_status, payment_status, total_amount, {$estimatedReadyAtSelect}, created_at
             FROM restaurant_orders WHERE stay_id = ? ORDER BY created_at DESC LIMIT 15"
        );
        $orderQuery->execute([(int)$stay['id']]);
        $orders = $orderQuery->fetchAll();
        $orderLines = $pdo->prepare(
            'SELECT item_name, quantity, subtotal FROM restaurant_order_items WHERE order_id = ? ORDER BY id'
        );
        foreach ($orders as &$order) {
            $orderLines->execute([(int)$order['id']]);
            $order['items'] = $orderLines->fetchAll();
        }
        unset($order);
    }
} catch (Throwable $error) {
    error_log('[guest-portal] ' . get_class($error) . ': ' . $error->getMessage());
    if (!$stay) {
        http_response_code(503);
        $pageError = 'The guest portal is temporarily unavailable. Please contact the front desk.';
    } elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
        http_response_code(503);
        $pageError = 'Your request could not be completed. Please try again or contact the front desk.';
    } elseif ($pageError === '') {
        http_response_code(503);
        $pageError = 'We could not load your stay information. Please refresh or contact the front desk.';
    }
}

$firstName = trim((string)($stay['first_name'] ?? ''));
$isActive = $stay && $stay['status'] === 'ACTIVE';
$openRequests = count(array_filter($requests, static fn(array $request): bool =>
    in_array($request['status'], ['NEW', 'PENDING', 'ASSIGNED', 'ACKNOWLEDGED', 'ACCEPTED', 'IN_PROGRESS', 'ON_HOLD'], true)
));
?><!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#102a43">
  <title>Guest Portal | Shesh Dev Hotel</title>
  <style>
    :root{color-scheme:light;--navy:#102a43;--navy-2:#173b5c;--ink:#172b45;--muted:#718198;--line:#e4eaf1;--canvas:#f3f6f9;--gold:#e9b65f;--green:#16734b;--shadow:0 16px 44px rgba(20,43,68,.08)}
    *,*::before,*::after{box-sizing:border-box}
    [hidden]{display:none!important}
    html{min-height:100%;-webkit-text-size-adjust:100%;scroll-behavior:smooth}
    body{min-height:100vh;margin:0;background:radial-gradient(ellipse at 10% 0,rgba(233,182,95,.1),transparent 30rem),var(--canvas);color:var(--ink);font-family:"Segoe UI",Arial,sans-serif}
    button,input,select,textarea{font:inherit}
    button{cursor:pointer}
    a{color:inherit}
    .shell{width:min(1180px,calc(100% - 36px));margin:28px auto 56px;padding:0 0 28px;background:#fff;border:1px solid #e5eaf0;border-radius:24px;overflow:hidden;box-shadow:var(--shadow)}
    .hero{position:relative;display:flex;flex-direction:column;align-items:stretch;justify-content:space-between;gap:34px;min-height:390px;padding:24px clamp(24px,5vw,58px) 42px;color:#fff;background-image:linear-gradient(90deg,rgba(5,20,34,.90) 0%,rgba(7,25,39,.74) 34%,rgba(10,34,48,.24) 72%,rgba(10,34,48,.12) 100%),linear-gradient(0deg,rgba(7,24,39,.25),transparent 52%),url("/assets/hero.jpg");background-color:#102a43;background-size:cover;background-position:center 58%;background-repeat:no-repeat}.hero-top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-bottom:16px;border-bottom:1px solid rgba(255,255,255,.22)}.hero-brand{display:flex;align-items:center;gap:10px;color:#fff;font-size:13px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}.hero-brand-mark{display:grid;width:38px;height:38px;place-items:center;border:1px solid rgba(233,182,95,.7);border-radius:50%;color:#f1c878;font-size:21px}.hero-brand small{display:block;margin-top:3px;color:rgba(255,255,255,.7);font-size:9px;font-weight:600;letter-spacing:.22em}.hero-copy{max-width:700px;padding:0 0 3px}.hero .eyebrow{margin:0 0 13px;color:#f1c878;font-size:11px;font-weight:800;letter-spacing:.22em;text-transform:uppercase}.hero h1{margin:0 0 14px;font:600 clamp(38px,5.4vw,64px)/1.04 Georgia,"Times New Roman",serif;letter-spacing:-.04em;text-wrap:balance}.hero p{max-width:560px;margin:0;color:rgba(245,248,252,.9);font-size:15px;line-height:1.7}.hero-actions{display:flex;flex-wrap:wrap;gap:11px;margin-top:24px}.hero-link{display:inline-flex;min-height:48px;align-items:center;justify-content:center;gap:10px;padding:12px 19px;border:1px solid rgba(255,255,255,.8);border-radius:12px;background:rgba(13,35,51,.42);color:#fff;font-size:13px;font-weight:750;text-decoration:none;backdrop-filter:blur(8px);transition:transform .18s,background .18s}.hero-link:hover{transform:translateY(-1px);background:rgba(13,35,51,.72)}.hero-link.primary{border-color:#e9b65f;background:#e9b65f;color:#102a43}.hero-link.primary:hover{background:#f3c875}.hero-link[aria-disabled="true"]{opacity:.72;cursor:default}
    .hero-copy{max-width:700px}.eyebrow{margin:0 0 11px;color:#f1c878;font-size:10px;font-weight:800;letter-spacing:.19em;text-transform:uppercase}
    h1,h2,h3,p{margin-top:0}.hero h1{margin:0 0 10px;font:600 clamp(34px,5vw,54px)/1.07 Georgia,"Times New Roman",serif;letter-spacing:-.035em}
    .hero p{max-width:600px;margin:0;color:rgba(245,248,252,.85);font-size:14px;line-height:1.65}
    .stay-badge{flex:none;padding:9px 14px;border:1px solid rgba(198,234,211,.38);border-radius:999px;background:rgba(22,115,75,.23);color:#e1f5e8;font-size:12px;font-weight:700;backdrop-filter:blur(8px)}
    .content{padding:26px clamp(18px,4vw,44px) 0}
    .stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0 0 18px}
    .journey{display:flex;align-items:center;gap:0;margin:0 0 18px;padding:18px 20px;border:1px solid var(--line);border-radius:15px;background:linear-gradient(145deg,#fff,#fafbfd);box-shadow:0 5px 18px rgba(23,43,69,.035)}
    .journey-point{display:flex;align-items:center;gap:12px;min-width:0}
    .journey-dot{flex:none;width:14px;height:14px;border:3px solid #e9b65f;border-radius:50%;background:#102a43}
    .journey-point.is-done .journey-dot{background:#16734b}
    .journey-label{display:block;color:var(--muted);font-size:9px;font-weight:800;letter-spacing:.13em;text-transform:uppercase}
    .journey-value{display:block;color:var(--ink);font-size:14px;font-weight:750;white-space:nowrap}
    .journey-line{flex:1;display:flex;align-items:center;gap:10px;min-width:90px;margin:0 16px}
    .journey-line::before,.journey-line::after{content:"";flex:1;height:2px;background:linear-gradient(90deg,#e9b65f,#f1c878)}
    .journey-nights{flex:none;padding:5px 11px;border-radius:999px;background:#fdf6e7;color:#8a6a1f;font-size:11px;font-weight:800;white-space:nowrap}
    @media(max-width:640px){.journey{flex-wrap:wrap}.journey-point{flex:1 1 100%}.journey-line{flex:1 1 100%;margin:14px 0 0 26px}}
    .extend-row{margin:-6px 0 18px}
    .extend-btn{display:inline-flex;min-height:44px;align-items:center;justify-content:center;padding:10px 18px;border:1px solid #e9b65f;border-radius:12px;background:#e9b65f;color:#102a43;font-size:13px;font-weight:800;cursor:pointer}
    .extend-btn:disabled{border-color:#d4dee8;background:#eef2f6;color:#64748b;cursor:default}
    .extend-status{margin:8px 0 0;color:var(--muted);font-size:12px;line-height:1.5}
    .stat,.card{min-width:0;border:1px solid var(--line);border-radius:15px;background:linear-gradient(145deg,#fff,#fafbfd);box-shadow:0 5px 18px rgba(23,43,69,.035)}
    .stat{padding:17px 19px}.stat-label{color:var(--muted);font-size:9px;font-weight:800;letter-spacing:.13em;text-transform:uppercase}
    .stat-value{margin:8px 0 3px;color:var(--ink);font-size:23px;font-weight:800;letter-spacing:-.035em;overflow-wrap:anywhere}
    .stat-note{margin:0;color:var(--muted);font-size:11px;line-height:1.45}
    .balance-card{position:relative;overflow:hidden;margin-bottom:22px;padding:23px 25px;border:1px solid rgba(233,182,95,.35);border-radius:17px;color:#fff;background:radial-gradient(ellipse at 100% 0,rgba(233,182,95,.18),transparent 45%),linear-gradient(115deg,#10243b,#1b3b57);box-shadow:0 13px 30px rgba(16,36,59,.14)}
    .balance-title{margin:0;color:#d7e1ec;font-size:12px}.balance-amount{margin:5px 0;color:#fff;font-size:clamp(32px,5vw,42px);font-weight:800;letter-spacing:-.04em}.balance-caption{margin:0;color:#c4d1df;font-size:12px;line-height:1.5}
    .section-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin:25px 0 13px}
    .section-heading .eyebrow{margin-bottom:5px;color:#a66c20}.section-heading h2{margin:0;color:var(--ink);font:600 clamp(23px,3vw,30px)/1.15 Georgia,"Times New Roman",serif;letter-spacing:-.025em}
    .section-heading p{margin:5px 0 0;color:var(--muted);font-size:12px}
    .actions{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
    .action-card{display:flex;min-height:164px;flex-direction:column;align-items:flex-start;padding:16px;border:1px solid var(--line);border-radius:15px;background:linear-gradient(145deg,#fff,#fafbfd);color:var(--ink);text-align:left;box-shadow:0 4px 13px rgba(23,43,69,.035);transition:transform .18s,border-color .18s,box-shadow .18s}
    .action-card:hover,.action-card:focus-visible{transform:translateY(-2px);border-color:#c4d1df;box-shadow:0 10px 22px rgba(23,43,69,.09)}
    .action-card.food{border-color:#eddfc6;background:linear-gradient(145deg,#fffaf1,#fff)}
    .action-icon{display:grid;width:42px;height:42px;place-items:center;margin-bottom:14px;border:1px solid #e6ebf1;border-radius:13px;background:#f2f5f8;font-size:20px}
    .action-card strong{font-size:14px}.action-card span:last-child{margin-top:6px;color:var(--muted);font-size:11px;line-height:1.45}
    .card{padding:18px;background:#fff}.request-list,.order-list,.bill-list{display:grid;gap:10px}
    .record{padding:13px;border:1px solid #e8edf2;border-radius:12px;background:#fff}
    .record-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.record-title{margin:0;color:var(--ink);font-size:13px;font-weight:750;overflow-wrap:anywhere}
    .record-meta{margin:5px 0 0;color:var(--muted);font-size:11px;line-height:1.5}.record-price{flex:none;color:var(--ink);font-size:12px;font-weight:750}
    .status{display:inline-flex;padding:5px 9px;border-radius:999px;background:#eef3f8;color:#425c76;font-size:9px;font-weight:800;letter-spacing:.04em;text-transform:uppercase}
    .empty{padding:23px 12px;color:var(--muted);font-size:13px;text-align:center}
    .notice{margin-bottom:16px;padding:12px 14px;border:1px solid #cde5d7;border-radius:11px;background:#f0faf4;color:#226444;font-size:13px;line-height:1.5}
    .notice.error{border-color:#f1caca;background:#fff5f5;color:#a43131}
    .dialog{width:min(720px,calc(100% - 32px));max-width:720px;max-height:min(88dvh,860px);margin:auto;padding:0;overflow:hidden;border:1px solid rgba(255,255,255,.7);border-radius:20px;background:#f7f9fb;color:var(--ink);box-shadow:0 28px 90px rgba(3,14,28,.32)}
    .dialog::backdrop{background:rgba(8,21,36,.63);backdrop-filter:blur(6px)}
    .dialog.wide{width:min(900px,calc(100% - 32px));max-width:900px}
    .dialog-frame{display:flex;max-height:min(88dvh,860px);flex-direction:column;min-height:0}
    .dialog-head{position:sticky;top:0;z-index:2;display:flex;flex:none;align-items:flex-start;justify-content:space-between;gap:16px;padding:19px 21px;border-bottom:1px solid var(--line);background:rgba(255,255,255,.97)}
    .dialog-head .eyebrow{margin-bottom:5px}.dialog-head h2{margin:0;color:var(--ink);font:600 24px/1.15 Georgia,"Times New Roman",serif}
    .dialog-head p{margin:5px 0 0;color:var(--muted);font-size:12px}
    .dialog-close{display:grid;flex:none;width:40px;height:40px;place-items:center;padding:0;border:1px solid #e1e7ee;border-radius:50%;background:#f8fafc;color:#334a62;font-size:23px;line-height:1}
    .dialog-close:hover{background:#edf2f7}.dialog-body{min-height:0;overflow:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:18px 21px}
    .dialog-frame>form{display:flex;min-height:0;flex:1;flex-direction:column}
    .dialog-frame>form>.dialog-body{flex:1}
    .dialog-body form{display:grid;gap:14px}
    .service-intro{display:flex;align-items:center;gap:12px;margin:0 0 2px}.service-intro p{margin:0;color:var(--muted);font-size:12px;line-height:1.5}.service-room-chip{flex:none;padding:8px 10px;border:1px solid #e5d7b5;border-radius:999px;background:#fbf7ed;color:#765c26;font-size:11px;font-weight:800;white-space:nowrap}
    .service-choice-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.service-choice{display:grid;grid-template-columns:38px 1fr;align-items:center;gap:2px 10px;min-height:88px;padding:12px;text-align:left;border:1px solid #dce4eb;border-radius:13px;background:#fff;color:var(--ink);cursor:pointer;transition:border-color .16s,background .16s,box-shadow .16s}.service-choice:hover{border-color:#b8a16a;background:#fdfbf6}.service-choice.is-selected{border-color:#b08b3c;background:#fbf7ed;box-shadow:inset 0 0 0 1px #b08b3c}.service-choice-icon{grid-row:1 / span 2;display:grid;width:38px;height:38px;place-items:center;border-radius:11px;background:#edf2f6;color:#17344e;font-size:20px}.service-choice.is-selected .service-choice-icon{background:#e9dfc8;color:#765c26}.service-choice strong{font-size:13px}.service-choice>span:last-child{color:var(--muted);font-size:11px;line-height:1.4}.service-type-fallback{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}.service-assurance{display:flex;gap:10px;align-items:flex-start;padding:12px;border:1px solid #e7e2d5;border-radius:12px;background:#faf8f2;color:#4e5b65}.service-assurance>span{display:grid;flex:none;width:23px;height:23px;place-items:center;border-radius:50%;background:#e7ddc3;color:#6f5625;font-weight:800}.service-assurance p{margin:0;font-size:11px;line-height:1.55}.service-assurance strong{color:var(--ink);font-size:12px}.service-dialog-footer .button{gap:9px;background:#17344e}.service-dialog-footer .button:hover{background:#244a69}
    .stay-activity-intro{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:15px;padding:13px 14px;border:1px solid #e6dcc5;border-radius:13px;background:linear-gradient(120deg,#fbf7ed,#fff)}.stay-activity-intro strong{display:block;color:var(--ink);font:600 17px Georgia,"Times New Roman",serif}.stay-activity-intro p{margin:4px 0 0;color:var(--muted);font-size:11px}.stay-room-tag{flex:none;padding:7px 10px;border-radius:999px;background:#e9dfc8;color:#705723;font-size:10px;font-weight:800}.activity-tabs{display:flex;gap:7px;margin:0 0 16px;padding:4px;overflow-x:auto;border:1px solid #e6ebf0;border-radius:12px;background:#edf1f5}.activity-tab{flex:1;min-height:38px;padding:8px 10px;border:1px solid transparent;border-radius:9px;background:transparent;color:#52657a;font-size:11px;font-weight:750;white-space:nowrap;cursor:pointer}.activity-tab[aria-pressed="true"]{border-color:#e8dfca;background:#fff;color:#17344e;box-shadow:0 2px 5px rgba(23,43,69,.06)}.activity-section{margin-top:18px}.activity-section-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:9px}.activity-section-heading h3{margin:0;color:var(--ink);font-size:13px;font-weight:800}.activity-count{display:inline-grid;min-width:25px;height:25px;place-items:center;padding:0 7px;border-radius:999px;background:#eef2f6;color:#53677c;font-size:10px;font-weight:800}.activity-record{border-color:#e1e7ed;box-shadow:0 3px 10px rgba(23,43,69,.025)}.activity-record .record-top{align-items:center}.activity-record .status{flex:none;max-width:45%;white-space:normal;text-align:center;line-height:1.4}.activity-record .record-title{font-size:13px;line-height:1.45}.activity-record[data-kind="order"]{border-left:3px solid #b08b3c}.activity-record[data-kind="request"]{border-left:3px solid #b8c7d5}.activity-record[data-kind="extension"],.record[data-kind="extension"]{border-left:3px solid #16734b}.activity-empty{padding:24px 16px;border:1px dashed #d6dfe7;border-radius:13px;background:#fff;text-align:center}.activity-empty-icon{display:grid;width:42px;height:42px;place-items:center;margin:0 auto 10px;border-radius:13px;background:#f2f5f8;color:#765c26;font-size:20px}.activity-empty strong{display:block;color:var(--ink);font-size:13px}.activity-empty p{margin:5px 0 0;color:var(--muted);font-size:11px;line-height:1.5}
    .folio-intro{margin-bottom:15px}.folio-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:17px}.folio-metric{min-width:0;padding:13px;border:1px solid #e3e9ef;border-radius:13px;background:#fff}.folio-metric-label{display:block;color:var(--muted);font-size:10px;font-weight:750;letter-spacing:.04em;text-transform:uppercase}.folio-metric-value{display:block;margin-top:7px;color:var(--ink);font-size:18px;font-weight:850;overflow-wrap:anywhere}.folio-metric.balance-due{grid-column:1/-1;padding:18px;border-color:#e4d7b7;background:linear-gradient(125deg,#142d46,#1c3b57);color:#fff}.folio-metric.balance-due .folio-metric-label{color:#e3d2a7}.folio-metric.balance-due .folio-metric-value{margin-top:5px;color:#fff;font-size:clamp(27px,6vw,35px);letter-spacing:-.03em}.folio-settled-note{display:flex;align-items:center;gap:7px;margin-top:10px;color:#d9e9df;font-size:11px}.folio-settled-note.is-due{color:#f2ddb0}.folio-section{margin-top:19px}.folio-section-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:9px}.folio-section-heading h3{margin:0;color:var(--ink);font-size:13px;font-weight:800}.folio-section-heading span{color:var(--muted);font-size:10px}.folio-record{padding:13px;border-color:#e1e7ed}.folio-record .record-top{align-items:center}.folio-record .record-title{font-size:12px;line-height:1.45}.folio-record .record-price{font-size:13px;white-space:nowrap}.folio-record.payment-record{border-left:3px solid #7da68e}.folio-record.charge-record{border-left:3px solid #b08b3c}.folio-note{margin-top:16px;padding:12px;border:1px solid #e4eaf0;border-radius:11px;background:#f1f5f8;color:#53677c;font-size:11px;line-height:1.55}.folio-note strong{color:var(--ink)}
    .field{display:grid;gap:7px;color:#3b5066;font-size:12px;font-weight:700}
    .field input,.field select,.field textarea{width:100%;min-height:46px;padding:11px 12px;border:1px solid #d6e0e9;border-radius:10px;background:#fff;color:var(--ink);font-size:16px}
    .field textarea{min-height:94px;resize:vertical;line-height:1.5}
    .field input:focus,.field select:focus,.field textarea:focus{outline:3px solid rgba(51,116,164,.17);border-color:#7799b5}
    .menu-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .menu-item{min-width:0;overflow:hidden;border:1px solid #e5eaf0;border-radius:14px;background:#fff;box-shadow:0 3px 10px rgba(23,43,69,.025)}
    .menu-photo{position:relative;display:grid;width:100%;aspect-ratio:4/3;place-items:center;overflow:hidden;padding:8px;background:linear-gradient(135deg,#f6f7f8,#fff 52%,#f3eee5);color:#718198}
    .menu-photo img{display:block;width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 5px 8px rgba(23,43,69,.12))}
    .menu-photo-placeholder{display:grid;place-items:center;gap:6px;color:#738398;font-size:11px;font-weight:700;letter-spacing:.04em}
    .menu-photo-placeholder span:first-child{font-size:28px;opacity:.72}
    .menu-item-info{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px;padding:12px}
    .menu-item h3{margin:0;color:var(--ink);font-size:13px}.menu-item p{margin:4px 0;color:var(--muted);font-size:11px;line-height:1.45}
    .menu-item-details{min-width:0}.menu-item .menu-category{color:#a66c20!important;font-size:9px!important;font-weight:800;letter-spacing:.1em;text-transform:uppercase}
    .menu-item .menu-price{color:var(--ink);font-size:12px;font-weight:800}
    .quantity-stepper{display:flex;align-items:center;gap:5px}
    .quantity-stepper button{display:grid;width:36px;height:40px;place-items:center;padding:0;border:1px solid #d7e0e9;border-radius:9px;background:#f7f9fb;color:#263f58;font-size:21px;font-weight:600;line-height:1}
    .quantity-stepper button:hover{border-color:#a9bacb;background:#edf2f7}
    .quantity-stepper input{width:42px;height:40px;padding:4px;border:1px solid #d7e0e9;border-radius:9px;background:#fff;color:var(--ink);font-size:16px;text-align:center}
    .order-total{color:var(--ink);font-size:13px;font-weight:800;white-space:nowrap}
    .order-review-list{display:grid;gap:10px}
    .order-review-item{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border:1px solid #e5eaf0;border-radius:12px;background:#fff}
    .order-review-details{min-width:0;flex:1}
    .order-review-name{margin:0;color:var(--ink);font-size:13px;font-weight:750;overflow-wrap:anywhere}
    .order-review-detail{margin:4px 0 0;color:var(--muted);font-size:11px}
    .order-review-price{flex:none;color:var(--ink);font-size:12px;font-weight:800}
    .order-review-remove{display:inline-flex;align-items:center;justify-content:center;flex:none;width:36px;height:36px;border:1px solid #fecaca;border-radius:10px;background:#fff1f2;color:#be123c;cursor:pointer;transition:background .15s ease,transform .15s ease}
    .order-review-remove:hover{background:#ffe4e6;transform:translateY(-1px)}
    .order-review-remove:focus-visible{outline:3px solid #fda4af;outline-offset:2px}
    .order-review-remove svg{width:17px;height:17px;pointer-events:none}
    .order-review-empty{padding:20px 12px;text-align:center;color:var(--muted);font-size:13px}
    .order-review-notes{margin-top:14px;padding:12px;border-radius:11px;background:#eef3f7;color:#455b70;font-size:12px;line-height:1.5;overflow-wrap:anywhere}
    .order-review-total{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px;padding-top:14px;border-top:1px solid var(--line);color:var(--ink);font-size:14px;font-weight:800}
    .menu-filter{display:flex;gap:7px;margin-bottom:12px;overflow:auto}
    .menu-filter button{flex:none;min-height:38px;padding:8px 12px;border:1px solid #dfe6ed;border-radius:999px;background:#fff;color:#53677c;font-size:11px;font-weight:750}
    .menu-filter button[aria-pressed="true"]{border-color:var(--navy);background:var(--navy);color:#fff}
    .menu-item h3{margin:0;color:var(--ink);font-size:13px}.menu-item p{margin:4px 0;color:var(--muted);font-size:11px;line-height:1.45}
    .menu-category{color:#a66c20!important;font-size:9px!important;font-weight:800;letter-spacing:.1em;text-transform:uppercase}
    .menu-price{color:var(--ink);font-size:12px;font-weight:800}.quantity{width:64px;min-height:40px;padding:6px;border:1px solid #d6e0e9;border-radius:8px;font-size:16px}
    .dialog-footer{position:sticky;bottom:0;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 21px calc(13px + env(safe-area-inset-bottom));border-top:1px solid var(--line);background:rgba(255,255,255,.97)}
    .button{display:inline-flex;min-height:44px;align-items:center;justify-content:center;padding:10px 15px;border:1px solid transparent;border-radius:10px;background:var(--navy);color:#fff;font-size:13px;font-weight:750;text-decoration:none}
    .button:hover{background:#1b3b57}.button.secondary{border-color:#d9e2eb;background:#fff;color:#40566d}
    .button:focus-visible,.action-card:focus-visible,.dialog-close:focus-visible{outline:3px solid rgba(51,116,164,.3);outline-offset:2px}
    .code-entry{width:min(480px,100%);margin:52px auto;padding:clamp(22px,5vw,38px);border:1px solid var(--line);border-radius:20px;background:#fff;box-shadow:var(--shadow);text-align:center}
    .code-entry .brand-icon{display:grid;width:54px;height:54px;place-items:center;margin:0 auto 17px;border-radius:17px;background:#eef3f7;color:var(--navy);font-size:24px}
    .code-entry h1{margin:0 0 8px;color:var(--ink);font:600 28px Georgia,"Times New Roman",serif}.code-entry p{margin:0 0 18px;color:var(--muted);font-size:13px;line-height:1.55}
    .code-entry input{width:100%;min-height:48px;margin-bottom:10px;padding:10px 12px;border:1px solid #d5dee8;border-radius:10px;font-size:16px}
    .footer-note{margin:26px 0 0;color:#8a98a9;font-size:11px;text-align:center}
    @media(max-width:760px){.hero{min-height:330px;background-position:center 55%;padding:22px 22px 28px;gap:30px}.hero-top{padding-bottom:13px}.hero-brand{font-size:11px}.hero-brand-mark{width:34px;height:34px}.hero-copy{padding:0}.hero h1{font-size:clamp(34px,9vw,46px)}.hero p{font-size:13px}.hero-actions{gap:8px;margin-top:20px}.hero-link{min-height:44px;padding:10px 12px;font-size:12px}.shell{width:calc(100% - 20px);margin:10px auto 24px;border-radius:18px}.hero{align-items:stretch;flex-direction:column;gap:24px;padding:22px 20px 28px}.content{padding:18px 14px 0}.actions{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.action-card{min-height:145px;padding:13px}.action-icon{width:38px;height:38px;margin-bottom:11px}.stats{gap:7px}.stat{padding:12px 9px;border-radius:12px}.stat-label{font-size:8px;letter-spacing:.08em}.stat-value{font-size:clamp(16px,5vw,21px)}.stat-note{font-size:9px}.balance-card{padding:19px;border-radius:14px}.section-heading{align-items:flex-start;flex-direction:column}.dialog,.dialog.wide{width:100%;max-width:none;max-height:min(94vh,860px);max-height:min(94dvh,860px);margin:auto 0 0;border-right:0;border-bottom:0;border-left:0;border-radius:20px 20px 0 0}.dialog-frame{max-height:min(94vh,860px);max-height:min(94dvh,860px)}.dialog-head{padding:15px 16px}.dialog-head h2{font-size:22px}.dialog-body{padding:14px 14px calc(12px + env(safe-area-inset-bottom))}.dialog-body form>.dialog-footer{margin:0 -14px -14px!important}.dialog-footer{padding:11px 14px calc(11px + env(safe-area-inset-bottom))}.menu-grid{grid-template-columns:1fr}.menu-item{padding:0}.menu-item-info{padding:11px}.quantity-stepper{gap:4px}.quantity-stepper button{width:40px;height:44px}.quantity-stepper input{width:44px;height:44px}.record{padding:11px}.code-entry{margin:30px auto}.footer-note{margin-top:20px}}
    @media(max-width:480px){.service-choice-grid{gap:8px}.service-choice{grid-template-columns:32px 1fr;gap:2px 8px;min-height:94px;padding:10px}.service-choice-icon{width:32px;height:32px}.service-intro{align-items:flex-start;flex-direction:column;gap:6px}.service-dialog-footer .stat-note{max-width:45%}}
    @media(max-width:380px){.shell{width:calc(100% - 12px)}.content{padding-right:10px;padding-left:10px}.hero{padding:22px 16px}.stats{grid-template-columns:1fr}.stat{display:grid;grid-template-columns:1fr auto;align-items:center;gap:4px 8px}.stat-value{grid-column:2;grid-row:1 / span 2;margin:0;text-align:right}.stat-note{grid-column:1}.dialog-close{width:42px;height:42px}.action-card{min-height:136px}.dialog-footer .button{flex:1}}
    @media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;transition:none!important}}

    /* Force the live-stay dialog into the viewport center across browsers. */
    dialog.live-stay-dialog{
      position:fixed;
      inset:0;
      margin:auto;
      width:min(780px,calc(100vw - 28px));
      max-width:780px;
      max-height:calc(100dvh - 28px);
      height:max-content;
      overflow:auto;
      overscroll-behavior:contain;
    }
    dialog.live-stay-dialog[open]{
      display:block;
      position:fixed;
      top:50%;
      left:50%;
      right:auto;
      bottom:auto;
      transform:translate(-50%,-50%);
    }
    @media(max-width:520px){
      dialog.live-stay-dialog[open]{top:50%;left:50%;max-height:calc(100dvh - 24px)}
    }
    .live-stay-dialog{width:min(780px,calc(100vw - 28px));max-width:780px;padding:0;border:1px solid #dce3e9;border-radius:20px;overflow:hidden;background:#fff;color:#17191c;box-shadow:0 24px 80px rgba(3,14,28,.34)}
    .live-stay-dialog::backdrop{background:rgba(10,25,40,.54);backdrop-filter:blur(2px)}
    .live-stay-frame{display:flex;flex-direction:column}
    .live-stay-header{display:flex;align-items:center;gap:12px;min-height:80px;padding:18px 20px;background:#102a43;color:#fff}
    .live-stay-bell{font-size:23px;color:#f5c76b;flex:0 0 auto}
    .live-stay-heading{flex:1;min-width:0}
    .live-stay-eyebrow{margin:0 0 7px;color:#f5c76b;font-size:11px;font-weight:800;letter-spacing:.04em}
    .live-stay-heading h2{margin:0;color:#fff;font-size:clamp(17px,2.8vw,22px);line-height:1.25}
    .live-stay-live{display:flex;align-items:center;gap:5px;padding:5px 8px;border-radius:999px;background:#063e31;color:#3fe0a0;font-size:11px;font-weight:800}
    .live-stay-live i{width:6px;height:6px;border-radius:50%;background:currentColor}
    .live-stay-close{color:#fff!important;align-self:flex-start;margin-left:0}
    .live-stay-content{padding:16px}
    .live-stay-item{display:flex;align-items:center;gap:13px}
    .live-stay-food-icon{display:grid;place-items:center;flex:0 0 100px;height:100px;border-radius:13px;background:linear-gradient(145deg,#fff1d5,#f2e2c4);font-size:43px;overflow:hidden}
    .live-stay-food-icon img{width:100%;height:100%;object-fit:cover;border-radius:13px}
    .live-stay-item-copy{min-width:0;display:flex;align-items:flex-start;flex-direction:column;gap:5px}
    .live-stay-item-copy>strong{font-size:16px;line-height:1.4;overflow-wrap:anywhere}
    .live-stay-item-copy p{margin:0;color:#646b73;font-size:13px;overflow-wrap:anywhere}
    .live-stay-item-copy p:nth-of-type(2){color:#20252b}
    .live-stay-status{display:inline-flex;padding:4px 8px;border-radius:999px;background:#e1efff;color:#2672e8;font-size:12px;font-weight:700}
    .live-stay-divider{height:1px;margin:16px 0 24px;background:#e9edf0}
    .live-stay-estimate{display:flex;align-items:center;gap:10px;margin-bottom:28px}
    .live-stay-clock{color:#26965e;font-size:25px;line-height:1}
    .live-stay-estimate strong,.live-stay-progress>strong{font-size:15px;font-weight:650}
    .live-stay-estimate p{margin:7px 0 0;color:#686d73;font-size:13px}
    .live-stay-progress{padding:0 12px}
    .live-stay-progress>strong{display:block;margin-bottom:8px}
    .live-stay-progress-bars{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px}
    .live-stay-progress-bars>div{min-width:0;color:#747a80}
    .live-stay-progress-bars>div>span{display:block;height:5px;margin-bottom:6px;border-radius:999px;background:#d8dee5}
    .live-stay-progress-bars>div small{font-size:11px}
    .live-stay-progress-bars>div.is-done>span,.live-stay-progress-bars>div.is-current>span{background:#279762}
    .live-stay-progress-bars>div.is-current{color:#18894f}
    .live-stay-message{margin:18px 0 0;color:#5d646b;font-size:12px;line-height:1.5}
    .live-stay-footer{padding:0 16px 16px}
    .live-stay-footer .button{width:100%;min-height:48px;background:#102a43;color:#fff;border:0;border-radius:12px;font-weight:750}
    @media(max-width:520px){.live-stay-header{padding:15px 13px;gap:8px}.live-stay-content{padding:13px}.live-stay-food-icon{flex-basis:76px;height:76px;font-size:34px}.live-stay-item-copy>strong{font-size:14px}.live-stay-close{display:none}.live-stay-footer{padding:0 13px 13px}.live-stay-progress{padding:0 3px}}
    .live-update-toast{position:fixed;z-index:1200;right:20px;bottom:20px;display:flex;align-items:flex-start;gap:12px;width:min(420px,calc(100vw - 28px));padding:16px;border:1px solid #b9d9c7;border-radius:16px;background:#f2fbf5;color:#183b2a;box-shadow:0 16px 44px rgba(16,42,67,.22);animation:liveToastIn .2s ease-out}
    .live-update-toast[hidden]{display:none}
    .live-update-icon{display:grid;place-items:center;flex:0 0 30px;height:30px;border-radius:50%;background:#d7f1e1;color:#17633a;font-weight:800}
    .live-update-copy{display:grid;gap:4px;min-width:0;flex:1;font-size:14px;line-height:1.45}
    .live-update-copy strong{font-size:14px}
    .live-update-copy span{overflow-wrap:anywhere}
    #live-update-toast-dismiss{border:0;background:transparent;color:inherit;font-size:24px;line-height:1;cursor:pointer;padding:0 2px}
    @keyframes liveToastIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
    @media(max-width:520px){.live-update-toast{right:12px;bottom:12px}}

    /* Guest portal refinement: preserve the established navy-and-gold identity. */
    :root{--portal-radius:18px}
    .shell{border-color:#e1e7ee;box-shadow:0 22px 60px rgba(16,42,67,.10)}
    .hero{background-image:linear-gradient(90deg,rgba(5,20,34,.90) 0%,rgba(7,25,39,.74) 34%,rgba(10,34,48,.24) 72%,rgba(10,34,48,.12) 100%),linear-gradient(0deg,rgba(7,24,39,.25),transparent 52%),url("/assets/hero.jpg")}
    .stat,.action-card,.card,.menu-item{transition:border-color .18s ease,box-shadow .18s ease,transform .18s ease}
    .stat:hover,.menu-item:hover{border-color:#d4dee8;box-shadow:0 9px 24px rgba(23,43,69,.07)}
    .action-card{min-height:170px;border-radius:var(--portal-radius);padding:18px}
    .action-card:active{transform:translateY(0)}
    .action-icon{border-color:rgba(233,182,95,.28);background:linear-gradient(145deg,#fff8e9,#f3f6f9)}
    .action-card.food .action-icon{border-color:rgba(233,182,95,.5);background:#fff3d9}
    .menu-grid{grid-template-columns:repeat(3,minmax(0,1fr));align-items:stretch;gap:14px}
    .menu-item{display:flex;flex-direction:column;border-radius:16px}
    .menu-photo{aspect-ratio:16/10;isolation:isolate}
    .menu-photo img{transition:transform .35s ease}
    .menu-item:hover .menu-photo img{transform:scale(1.035)}
    .menu-item-info{flex:1;grid-template-columns:minmax(0,1fr);align-items:start;gap:12px;padding:14px}
    .menu-item-details h3{font-size:14px;line-height:1.35}
    .menu-item-details>p:not(.menu-category){min-height:2.8em}
    .menu-item-info>.quantity-stepper{justify-content:space-between;padding-top:10px;border-top:1px solid #edf1f5}
    .menu-item-info>.quantity-stepper input{flex:1;max-width:72px}
    .menu-price{display:inline-block;margin-top:5px;font-size:14px}
    .menu-filter{padding:2px 0 5px;scrollbar-width:thin}
    .menu-filter button{min-height:40px;padding-inline:15px}
    .field input[type=search]{min-height:48px}
    .button,.quantity-stepper button,.menu-filter button,.dialog-close{transition:background .16s ease,border-color .16s ease,transform .16s ease}
    .button:disabled{cursor:not-allowed;opacity:.55}
    .dialog{box-shadow:0 30px 100px rgba(3,14,28,.36)}
    .dialog-head{padding-top:21px;padding-bottom:20px}
    .dialog-head .eyebrow,.section-heading .eyebrow{letter-spacing:.16em}
    @media(min-width:761px) and (max-width:1020px){
      .shell{width:calc(100% - 28px);margin-top:18px}
      .content{padding-right:26px;padding-left:26px}
      .actions{grid-template-columns:repeat(2,minmax(0,1fr))}
      .action-card{min-height:145px}
      .menu-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
    }
    @media(max-width:760px){
      .action-card{min-height:145px;padding:14px}
      .menu-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .menu-item-info{padding:11px}
      .menu-item-details h3{font-size:13px}
      .menu-item-details>p:not(.menu-category){min-height:0}
      .menu-item-info>.quantity-stepper{gap:5px}
      .menu-item-info>.quantity-stepper button{width:38px;height:42px}
      .menu-item-info>.quantity-stepper input{max-width:none;min-width:0;width:40px;height:42px}
      .menu-photo{aspect-ratio:4/3}
      .dialog-head{padding-top:14px;padding-bottom:14px}
    }
    @media(max-width:420px){
      .menu-grid{grid-template-columns:1fr}
      .menu-item{display:grid;grid-template-columns:112px minmax(0,1fr);min-height:138px}
      .menu-photo{height:100%;min-height:138px;aspect-ratio:auto}
      .menu-photo img{position:absolute;inset:0}
      .menu-item-info{padding:10px;gap:8px}
      .menu-item-details>p:not(.menu-category){font-size:10px}
      .menu-item-info>.quantity-stepper{padding-top:7px}
      .menu-item-info>.quantity-stepper button{width:34px;height:38px}
      .menu-item-info>.quantity-stepper input{height:38px}
      .action-card{min-height:136px}
      .dialog-footer{gap:8px}
      .dialog-footer .button{padding-inline:11px}
    }
    @media(prefers-reduced-motion:reduce){
      .menu-photo img{transition:none}
      .menu-item:hover .menu-photo img{transform:none}
    }

  </style>
</head>
<body>
<?php if (!$stay): ?>
  <main class="code-entry">
    <div class="brand-icon" aria-hidden="true">⌂</div>
    <p class="eyebrow">Shesh Dev Hotel</p>
    <h1>Guest service portal</h1>
    <p>Open your personal guest link from the check-in pass to review your stay, request assistance, order room service, and view your folio.</p>
    <?php if ($pageError !== ''): ?><div class="notice error" role="alert"><?=portal_escape($pageError)?></div><?php endif; ?>
    <p class="footer-note">Agora, Lapasan · Cagayan de Oro</p>
  </main>
<?php else: ?>
  <main class="shell">
    <header class="hero">
      <div class="hero-top">
        <div class="hero-brand"><span class="hero-brand-mark" aria-hidden="true">✳</span><span>Shesh Dev<small>Hotel &amp; Resort</small></span></div>
        <span class="stay-badge" data-live-stay-status><?= $isActive ? '● Active stay' : portal_escape(str_replace('_', ' ', $stay['status'])) ?></span>
      </div>
      <div class="hero-copy">
        <p class="eyebrow">Welcome to your stay</p>
        <h1><?= $firstName !== '' ? 'Relax, ' . portal_escape($firstName) . '. We’ve got you.' : 'Relax. We’ve got you.' ?></h1>
        <p>Enjoy a seamless stay with dining, room service, and personalized assistance — all at your fingertips.</p>
        <div class="hero-actions">
          <a class="hero-link primary" href="#actions-title">✦ &nbsp; Explore Guest Services <span aria-hidden="true">›</span></a>
          <a class="hero-link" href="#recent-title">◷ &nbsp; View My Requests <span aria-hidden="true">›</span></a>
        </div>
      </div>
    </header>

    <div class="content">
      <?php if ($notice === 'service'): ?><div class="notice" role="status">Your request has been sent to the hotel team.</div><?php endif; ?>
      <?php if ($notice === 'order'): ?><div class="notice" role="status">Your room-service order has been submitted to the restaurant.</div><?php endif; ?>
      <?php if ($notice === 'extension'): ?><div class="notice" role="status">Your stay extension request has been sent to the front desk.</div><?php endif; ?>
      <?php if ($pageError !== ''): ?><div class="notice error" role="alert"><?=portal_escape($pageError)?></div><?php endif; ?>

      <?php
        $journeyCheckinAt = (string)($stay['checkin_at'] ?? '');
        $journeyCheckoutRaw = (string)(($stay['actual_checkout'] ?? '') !== '' ? $stay['actual_checkout'] : ($stay['planned_checkout'] ?? ''));
        $journeyCheckedOut = ($stay['actual_checkout'] ?? '') !== '';
        $journeyNights = null;
        if ($journeyCheckinAt !== '' && $journeyCheckoutRaw !== '') {
          $journeyNights = max(0, (int)(new DateTimeImmutable(date('Y-m-d', strtotime($journeyCheckinAt))))->diff(new DateTimeImmutable(date('Y-m-d', strtotime($journeyCheckoutRaw))))->format('%a'));
        }
        $journeyCheckoutLabel = '';
        if ($journeyCheckoutRaw !== '') {
          $journeyCheckoutLabel = date('M j, Y', strtotime($journeyCheckoutRaw));
          $journeyCheckoutLabel .= ($journeyCheckedOut || date('H:i:s', strtotime($journeyCheckoutRaw)) !== '00:00:00') ? ' · ' . date('g:i A', strtotime($journeyCheckoutRaw)) : ' · 12:00 PM';
        }
      ?>
      <?php if ($journeyCheckinAt !== '' && $journeyCheckoutRaw !== ''): ?>
      <section class="journey" aria-label="Stay dates">
        <div class="journey-point"><span class="journey-dot" aria-hidden="true"></span><div><span class="journey-label">Check-in</span><strong class="journey-value"><?=portal_escape(date('M j, Y · g:i A', strtotime($journeyCheckinAt)))?></strong></div></div>
        <div class="journey-line" aria-hidden="true"><span class="journey-nights"><?=$journeyNights === 1 ? '1 night' : $journeyNights . ' nights'?></span></div>
        <div class="journey-point<?= $journeyCheckedOut ? ' is-done' : '' ?>"><span class="journey-dot" aria-hidden="true"></span><div><span class="journey-label"><?= $journeyCheckedOut ? 'Checked out' : 'Check-out' ?></span><strong class="journey-value"><?=portal_escape($journeyCheckoutLabel)?></strong></div></div>
      </section>
      <?php endif; ?>
      <?php if ($isActive && $journeyCheckinAt !== '' && $journeyCheckoutRaw !== ''): ?>
      <div class="extend-row">
        <?php if ($pendingExtension): ?>
          <button class="extend-btn" type="button" disabled>Extension requested — waiting for front desk</button>
          <p class="extend-status">Requested new check-out: <?=portal_escape(date('M j, Y', strtotime($pendingExtension['requested_checkout'])))?> · <?=(int)$pendingExtension['extra_nights'] === 1 ? '1 night' : (int)$pendingExtension['extra_nights'] . ' nights'?> · ₱<?=number_format((float)$pendingExtension['proposed_charge'], 2)?> — waiting for front desk approval.</p>
        <?php else: ?>
          <button class="extend-btn" type="button" data-open="extend-dialog">Extend stay</button>
          <?php if ($latestRejectedExtension): ?>
            <p class="extend-status">Previous extension request declined<?= $latestRejectedExtension['review_note'] !== null && $latestRejectedExtension['review_note'] !== '' ? ': ' . portal_escape($latestRejectedExtension['review_note']) : '' ?>.</p>
          <?php endif; ?>
        <?php endif; ?>
      </div>
      <?php endif; ?>

      <section class="stats" aria-label="Stay summary">
        <article class="stat"><div class="stat-label">Your room</div><div class="stat-value"><?=portal_escape($stay['room_number'])?></div><p class="stat-note">Assigned room</p></article>
        <article class="stat"><div class="stat-label">Stay reference</div><div class="stat-value"><?=portal_escape($stay['stay_code'])?></div><p class="stat-note">For front desk assistance</p></article>
        <article class="stat"><div class="stat-label">Open requests</div><div class="stat-value"><?=portal_escape($openRequests)?></div><p class="stat-note">Requests being handled</p></article>
      </section>

      <section class="balance-card" aria-label="Current folio balance">
        <p class="balance-title"><?= $isActive ? 'Current outstanding balance' : 'Final account balance' ?></p>
        <p class="balance-amount" data-live-balance>₱<?=number_format($balance, 2)?></p>
        <p class="balance-caption">Posted charges and payments recorded on your room folio.</p>
      </section>

      <section aria-labelledby="actions-title">
        <div class="section-heading">
          <div><p class="eyebrow">Here for you</p><h2 id="actions-title">How can we help?</h2><p>Choose a service to get started.</p></div>
        </div>
        <div class="actions">
          <button class="action-card food" type="button" data-open="food-dialog"><span class="action-icon" aria-hidden="true">🍽</span><strong>Food &amp; drinks</strong><span>Browse the menu and order to your room</span></button>
          <button class="action-card" type="button" data-open="service-dialog"><span class="action-icon" aria-hidden="true">✦</span><strong>Request a service</strong><span>Ask housekeeping or hotel staff for help</span></button>
          <button class="action-card" type="button" data-open="requests-dialog"><span class="action-icon" aria-hidden="true">☷</span><strong>My requests</strong><span>Review request and order progress</span></button>
          <button class="action-card" type="button" data-open="billing-dialog"><span class="action-icon" aria-hidden="true">▤</span><strong>Billing &amp; balance</strong><span>See posted charges and payments</span></button>
        </div>
      </section>

      <section aria-labelledby="recent-title">
        <div class="section-heading"><div><p class="eyebrow">Stay activity</p><h2 id="recent-title">Recent requests</h2></div></div>
        <div class="card request-list">
          <?php if (!$recentActivity): ?><div class="empty">No requests yet. Hotel assistance is just a tap away.</div><?php endif; ?>
          <?php foreach ($recentActivity as $activityItem): ?>
            <?php if ($activityItem['kind'] === 'extension'): $extension = $activityItem['data']; ?>
            <article class="record" data-kind="extension">
              <div class="record-top"><div><h3 class="record-title">Stay extension to <?=portal_escape(date('M j, Y', strtotime($extension['requested_checkout'])))?></h3><p class="record-meta"><?=portal_escape((int)$extension['extra_nights'])?> night(s) · ₱<?=number_format((float)$extension['proposed_charge'], 2)?> · requested <?=portal_escape(date('M j, g:i A', strtotime($extension['created_at'])))?></p></div><span class="status"><?= $extension['status'] === 'APPROVED' ? 'Approved' : ($extension['status'] === 'REJECTED' ? 'Declined' : 'Pending') ?></span></div>
              <?php if ($extension['status'] === 'REJECTED' && ($extension['review_note'] ?? '') !== ''): ?><p class="record-meta">Declined: <?=portal_escape($extension['review_note'])?></p><?php endif; ?>
            </article>
            <?php else: $request = $activityItem['data']; ?>
            <article class="record">
              <div class="record-top"><div><h3 class="record-title"><?=portal_escape($request['description'])?></h3><p class="record-meta"><?=portal_escape($request['request_code'])?> · <?=portal_escape(date('M j, g:i A', strtotime($request['created_at'])))?></p></div><span class="status"><?=portal_escape($request['status'])?></span></div>
            </article>
            <?php endif; ?>
          <?php endforeach; ?>
        </div>
      </section>
      <p class="footer-note">Shesh Dev Hotel · Agora, Lapasan, Cagayan de Oro</p>
    </div>
  </main>

  <dialog class="dialog wide" id="food-dialog" aria-labelledby="food-title">
    <div class="dialog-frame">
      <header class="dialog-head"><div><p class="eyebrow">Room service</p><h2 id="food-title">Food &amp; drinks</h2><p>Choose quantities, then send your order to the restaurant.</p></div><button class="dialog-close" type="button" data-close aria-label="Close food and drinks dialog">×</button></header>
      <form id="food-order-form" method="post" action="portal.php?t=<?=rawurlencode($token)?>">
        <input type="hidden" name="t" value="<?=portal_escape($token)?>"><input type="hidden" name="csrf" value="<?=portal_escape($csrf)?>"><input type="hidden" name="portal_action" value="food_order">
        <div class="dialog-body">
          <?php if (!$isActive): ?><p class="notice">Ordering is available during an active stay.</p><?php elseif (!$menuItems): ?><p class="empty">The menu is currently unavailable. Please contact the front desk.</p><?php else: ?>
            <div class="menu-filter" role="group" aria-label="Filter menu">
              <button type="button" data-menu-filter="All" aria-pressed="true">All</button>
              <button type="button" data-menu-filter="Food" aria-pressed="false">Food</button>
              <button type="button" data-menu-filter="Drinks" aria-pressed="false">Drinks</button>
            </div>
            <label class="field" style="margin-bottom:12px">Search menu<input type="search" data-menu-search placeholder="Search dishes and drinks"></label>
            <div class="menu-grid" data-menu-grid>
              <?php foreach ($menuItems as $item): ?>
                <article class="menu-item" data-menu-type="<?=portal_escape($item['menu_type'])?>" data-menu-name="<?=portal_escape(mb_strtolower($item['item_name'] . ' ' . $item['category_name']))?>">
                  <div class="menu-photo"><img src="<?=portal_escape($item['image_path'] ?: ($publicAssetUrlPrefix . '/food-placeholder.svg'))?>" alt="<?=portal_escape($item['item_name'])?>" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><div class="menu-photo-placeholder" hidden><span aria-hidden="true">▧</span><span>Food photo placeholder</span></div></div>
                  <div class="menu-item-info">
                    <div class="menu-item-details"><p class="menu-category"><?=portal_escape($item['menu_type'])?> · <?=portal_escape($item['category_name'])?></p><h3><?=portal_escape($item['item_name'])?></h3><p><?=portal_escape($item['description'] ?: 'Freshly prepared by our kitchen.')?></p><span class="menu-price">₱<?=number_format((float)$item['price'], 2)?></span></div>
                    <div class="quantity-stepper" role="group" aria-label="Quantity for <?=portal_escape($item['item_name'])?>">
                      <button type="button" data-quantity-change="-1" aria-label="Decrease <?=portal_escape($item['item_name'])?> quantity">−</button>
                      <input type="number" name="quantity[<?= (int)$item['id'] ?>]" min="0" max="20" step="1" value="0" inputmode="numeric" data-quantity data-price="<?=portal_escape((string)$item['price'])?>" aria-label="Quantity for <?=portal_escape($item['item_name'])?>">
                      <button type="button" data-quantity-change="1" aria-label="Increase <?=portal_escape($item['item_name'])?> quantity">+</button>
                    </div>
                  </div>
                </article>
              <?php endforeach; ?>
            </div>
            <label class="field" style="margin-top:14px">Order notes <textarea name="notes" maxlength="500" placeholder="Allergies or special instructions (optional)"></textarea></label>
          <?php endif; ?>
        </div>
        <?php if ($isActive && $menuItems): ?><footer class="dialog-footer"><span><span class="stat-note" data-order-count>0 items</span><br><strong class="order-total" data-order-total>₱0.00</strong></span><button class="button" type="button" data-order-submit disabled>Review order</button></footer><?php endif; ?>
      </form>
    </div>
  </dialog>

  <dialog class="dialog" id="order-review-dialog" aria-labelledby="order-review-title">
    <div class="dialog-frame">
      <header class="dialog-head"><div><p class="eyebrow">Before you place it</p><h2 id="order-review-title">Review your order</h2><p>Check your items and total before sending the order.</p></div><button class="dialog-close" type="button" data-close aria-label="Close order review">×</button></header>
      <div class="dialog-body">
        <p class="record-meta">Delivery to room <?=portal_escape($stay['room_number'])?></p>
        <div class="order-review-list" data-review-items aria-live="polite"></div>
        <p class="order-review-notes" data-review-notes hidden></p>
        <div class="order-review-total"><span>Total</span><strong data-review-total>₱0.00</strong></div>
      </div>
      <footer class="dialog-footer"><button class="button secondary" type="button" data-review-back>Back to menu</button><button class="button" type="button" data-confirm-order>Confirm &amp; place order</button></footer>
    </div>
  </dialog>

  <dialog class="dialog" id="service-dialog" aria-labelledby="service-title">
    <div class="dialog-frame">
      <header class="dialog-head"><div><p class="eyebrow">Hotel assistance</p><h2 id="service-title">Request a service</h2><p>Tell us what you need and our team will follow up.</p></div><button class="dialog-close" type="button" data-close aria-label="Close service request dialog">×</button></header>
      <div class="dialog-body">
        <?php if (!$isActive): ?><p class="notice">Service requests are available during an active stay.</p><?php else: ?>
          <form method="post" action="portal.php?t=<?=rawurlencode($token)?>">
            <input type="hidden" name="t" value="<?=portal_escape($token)?>"><input type="hidden" name="csrf" value="<?=portal_escape($csrf)?>"><input type="hidden" name="portal_action" value="service_request">
            <div class="service-intro">
              <span class="service-room-chip">Room <?=portal_escape($stay['room_number'] ?? '')?></span>
              <p>Choose the team that can help. We’ll send your request directly to the right department.</p>
            </div>
            <div class="service-choice-grid" role="group" aria-label="Choose a service department">
              <button class="service-choice is-selected" type="button" data-service-choice="FRONT_DESK" aria-pressed="true"><span class="service-choice-icon" aria-hidden="true">✦</span><strong>Front desk</strong><span>Questions and guest assistance</span></button>
              <button class="service-choice" type="button" data-service-choice="HOUSEKEEPING" aria-pressed="false"><span class="service-choice-icon" aria-hidden="true">⌂</span><strong>Housekeeping</strong><span>Towels, pillows and essentials</span></button>
              <button class="service-choice" type="button" data-service-choice="MAINTENANCE" aria-pressed="false"><span class="service-choice-icon" aria-hidden="true">⚒</span><strong>Maintenance</strong><span>Something needs fixing</span></button>
              <button class="service-choice" type="button" data-service-choice="OTHER" aria-pressed="false"><span class="service-choice-icon" aria-hidden="true">⋯</span><strong>Other assistance</strong><span>Anything else we can help with</span></button>
              <button class="service-choice" type="button" data-service-choice="ROOM_TRANSFER" aria-pressed="false" <?= $hasPendingTransfer || !$transferRooms ? 'disabled' : '' ?>><span class="service-choice-icon" aria-hidden="true">⇄</span><strong>Request a room change</strong><span><?= $hasPendingTransfer ? 'A request is already awaiting staff action' : ($transferRooms ? 'Ask the front desk to move you' : 'No rooms are currently available') ?></span></button>
            </div>
            <label class="field service-type-fallback">Department
              <select name="service_type" data-service-type required><option value="FRONT_DESK">Front desk</option><option value="HOUSEKEEPING">Housekeeping</option><option value="MAINTENANCE">Maintenance</option><option value="OTHER">Other assistance</option><?php if (!$hasPendingTransfer && $transferRooms): ?><option value="ROOM_TRANSFER">Request a room change</option><?php endif; ?></select>
            </label>
            <div class="field" data-transfer-fields hidden>
              <?php if ($hasPendingTransfer): ?>
                <p class="notice">A room-change request is already awaiting staff action. You can submit another request after it is approved or rejected.</p>
              <?php elseif (!$transferRooms): ?>
                <p class="notice">No other rooms are currently available. Please contact the front desk for assistance.</p>
              <?php else: ?>
                <label class="field" style="margin:0">Requested destination room
                  <select name="requested_room_id" data-transfer-room disabled required>
                    <option value="">Choose an available room</option>
                    <?php foreach ($transferRooms as $room): ?>
                      <?php $estimate = round($transferRemainingNights * ((float)$room['nightly_rate'] - $currentNightlyRate), 2); ?>
                      <option value="<?= (int)$room['id'] ?>" data-rate="<?=portal_escape((string)$room['nightly_rate'])?>" data-adjustment="<?=portal_escape((string)$estimate)?>">
                        Room <?=portal_escape($room['room_number'])?> · <?=portal_escape($room['room_type'])?> · ₱<?=number_format((float)$room['nightly_rate'], 2)?>/night
                      </option>
                    <?php endforeach; ?>
                  </select>
                </label>
                <p class="stat-note" data-transfer-estimate>Select a destination to see the estimated remaining-stay rate adjustment.</p>
                <label class="field" style="margin:8px 0 0">Reason for the change
                  <textarea name="description" data-transfer-reason maxlength="400" disabled placeholder="Tell the front desk why you are requesting a room change."></textarea>
                </label>
                <label class="field" style="display:flex;align-items:flex-start;gap:9px;margin:10px 0 0">
                  <input type="checkbox" name="accept_rate_change" value="1" data-transfer-accept disabled required style="width:auto;margin-top:3px">
                  <span>I understand the room rate may change. A manager must approve this request before I am moved, and hotel staff will confirm the final adjustment.</span>
                </label>
              <?php endif; ?>
            </div>
            <div class="field" data-housekeeping-fields hidden>
              <label class="field" style="margin:0">Housekeeping item
                <select name="housekeeping_item" data-housekeeping-item required disabled>
                  <option value="">Choose an item</option>
                  <?php foreach (['Extra towels', 'Pillow', 'Blanket', 'Bed sheets', 'Toiletries'] as $itemName): ?>
                    <?php $itemPrice = $housekeepingPrices[$itemName] ?? null; ?>
                    <option value="<?=portal_escape($itemName)?>" data-price="<?= $itemPrice === null ? '' : portal_escape((string)$itemPrice) ?>"><?=portal_escape($itemName)?> — <?= $itemPrice === null ? 'Price not set' : '₱' . number_format($itemPrice, 2) . ' each' ?></option>
                  <?php endforeach; ?>
                </select>
              </label>
              <span class="stat-note">The estimated total updates when you change the item or quantity.</span>
              <div class="quantity-stepper" role="group" aria-label="Housekeeping item quantity">
                <button type="button" data-service-quantity-change="-1" aria-label="Decrease quantity">−</button>
                <input type="number" name="housekeeping_quantity" min="1" max="20" step="1" value="1" inputmode="numeric" data-service-quantity disabled aria-label="Quantity">
                <button type="button" data-service-quantity-change="1" aria-label="Increase quantity">+</button>
              </div>
              <div class="order-review-total" style="margin-top:0;padding-top:10px">
                <span><span class="stat-note">Unit price</span><br><strong data-housekeeping-unit-price>₱0.00</strong></span>
                <span style="text-align:right"><span class="stat-note">Estimated total</span><br><strong data-housekeeping-total>₱0.00</strong></span>
              </div>
            </div>
            <label class="field" data-general-description-fields>Anything else we should know?<textarea name="description" data-service-description maxlength="500" required placeholder="Describe what you need and any helpful details."></textarea><span class="stat-note" data-service-description-hint>Include details that will help our team assist you.</span></label>
            <div class="service-assurance"><span aria-hidden="true">✓</span><p><strong>Before you send</strong><br>We’ll route this to the right team. Any applicable charge is shown for housekeeping items before submission.</p></div>
            <footer class="dialog-footer service-dialog-footer" style="margin:0 -21px -18px"><span class="stat-note">Usually reviewed by hotel staff shortly.</span><button class="button" type="submit">Send request <span aria-hidden="true">→</span></button></footer>
          </form>
        <?php endif; ?>
      </div>
    </div>
  </dialog>

  <dialog class="dialog" id="extend-dialog" aria-labelledby="extend-title">
    <div class="dialog-frame">
      <header class="dialog-head"><div><p class="eyebrow">Stay longer</p><h2 id="extend-title">Extend your stay</h2><p>Choose a new checkout date. The extra nights are added to your folio and settled at checkout.</p></div><button class="dialog-close" type="button" data-close aria-label="Close extend stay dialog">×</button></header>
      <div class="dialog-body">
        <?php if (!$isActive): ?><p class="notice">Stay extensions are available during an active stay.</p><?php else: ?>
          <form method="post" action="portal.php?t=<?=rawurlencode($token)?>">
            <input type="hidden" name="t" value="<?=portal_escape($token)?>"><input type="hidden" name="csrf" value="<?=portal_escape($csrf)?>"><input type="hidden" name="portal_action" value="extend_stay">
            <div class="service-intro">
              <span class="service-room-chip">Room <?=portal_escape($stay['room_number'] ?? '')?></span>
              <p>Current check-out: <?=portal_escape(date('M j, Y', strtotime($stay['planned_checkout'])))?> · ₱<?=number_format((float)($currentNightlyRate ?? 0), 2)?>/night</p>
            </div>
            <label class="field">New checkout date
              <input type="date" name="requested_checkout" data-extend-date required min="<?=portal_escape(date('Y-m-d', strtotime($stay['planned_checkout'] . ' +1 day')))?>" data-current-checkout="<?=portal_escape($stay['planned_checkout'])?>" data-nightly-rate="<?=portal_escape((string)($currentNightlyRate ?? 0))?>">
            </label>
            <p class="stat-note" data-extend-preview>Choose a new checkout date to see the added cost.</p>
            <label class="field">Reason (optional)
              <textarea name="reason" maxlength="500" placeholder="Tell the front desk why you are extending your stay."></textarea>
            </label>
            <footer class="dialog-footer"><span class="stat-note">A manager must approve this request before your checkout date moves.</span><button class="button" type="submit" data-extend-submit disabled>Request extension</button></footer>
          </form>
        <?php endif; ?>
      </div>
    </div>
  </dialog>
  <dialog class="dialog" id="requests-dialog" aria-labelledby="requests-title">
    <div class="dialog-frame">
      <header class="dialog-head"><div><p class="eyebrow">Your stay, at a glance</p><h2 id="requests-title">My requests</h2><p>Follow your service requests and room-service orders.</p></div><button class="dialog-close" type="button" data-close aria-label="Close requests dialog">×</button></header>
      <div class="dialog-body">
        <div class="stay-activity-intro"><div><strong>Your stay activity</strong><p>Updates refresh automatically while this page is open.</p></div><span class="stay-room-tag">ROOM <?=portal_escape($stay['room_number'] ?? '')?></span></div>
        <div class="activity-tabs" role="group" aria-label="Filter stay activity">
          <button class="activity-tab" type="button" data-activity-filter="all" aria-pressed="true">All activity</button>
          <button class="activity-tab" type="button" data-activity-filter="request" aria-pressed="false">Service requests</button>
          <button class="activity-tab" type="button" data-activity-filter="order" aria-pressed="false">Room service</button>
        </div>
        <section class="activity-section" data-activity-section="request">
          <div class="activity-section-heading"><h3>Service requests</h3><span class="activity-count"><?=count($requests)?></span></div>
          <div class="request-list">
            <?php if (!$requests): ?><div class="activity-empty"><span class="activity-empty-icon" aria-hidden="true">✦</span><strong>No service requests yet</strong><p>Need towels, assistance, or something fixed? Send a request and track it here.</p></div><?php endif; ?>
            <?php foreach ($requests as $request): ?><article class="record activity-record" data-kind="request" data-live-request="<?=portal_escape($request['request_code'])?>"><div class="record-top"><div><h3 class="record-title"><?=portal_escape($request['description'])?></h3><p class="record-meta">Reference <?=portal_escape($request['request_code'])?><br><?=portal_escape(date('M j, Y · g:i A', strtotime($request['created_at'])))?></p></div><span class="status" data-live-status><?=portal_escape($request['status'])?></span></div><?php if ((int)$request['chargeable']): ?><p class="record-meta">Charge: ₱<?=number_format((float)$request['price'], 2)?></p><?php endif; ?></article><?php endforeach; ?>
          </div>
        </section>
        <section class="activity-section" data-activity-section="order">
          <div class="activity-section-heading"><h3>Room-service orders</h3><span class="activity-count"><?=count($orders)?></span></div>
          <div class="order-list">
            <?php if (!$orders): ?><div class="activity-empty"><span class="activity-empty-icon" aria-hidden="true">♨</span><strong>No room-service orders yet</strong><p>Browse food and drinks to place an order. Its status and serving estimate will appear here.</p></div><?php endif; ?>
            <?php foreach ($orders as $order): ?><article class="record activity-record" data-kind="order" data-live-order="<?=portal_escape($order['id'])?>"><div class="record-top"><div><h3 class="record-title"><?=portal_escape($order['order_code'])?></h3><p class="record-meta"><?php foreach ($order['items'] as $line): ?><?=portal_escape($line['quantity'])?>× <?=portal_escape($line['item_name'])?><br><?php endforeach; ?><?=portal_escape(date('M j, Y · g:i A', strtotime($order['created_at'])))?></p></div><span class="status" data-live-status><?=portal_escape($order['order_status'])?></span></div><p class="record-meta">₱<?=number_format((float)$order['total_amount'], 2)?> · <?=portal_escape($order['payment_status'])?></p><p class="record-meta" data-ready-estimate data-ready-at="<?=portal_escape($order['estimated_ready_at'] ?? '')?>">Estimated serving time: <strong data-ready-label>Calculating…</strong></p></article><?php endforeach; ?>
          </div>
        </section>
        <section class="activity-section" data-activity-section="extension">
          <div class="activity-section-heading"><h3>Stay extensions</h3><span class="activity-count"><?=count($extensionRequests)?></span></div>
          <div class="extension-list">
            <?php if (!$extensionRequests): ?><div class="activity-empty"><span class="activity-empty-icon" aria-hidden="true">◷</span><strong>No stay extensions yet</strong><p>Extend your stay from the journey timeline and track the request here.</p></div><?php endif; ?>
            <?php foreach ($extensionRequests as $extension): ?><article class="record activity-record" data-kind="extension" data-live-extension="<?=portal_escape($extension['id'])?>"><div class="record-top"><div><h3 class="record-title">Stay extension to <?=portal_escape(date('M j, Y', strtotime($extension['requested_checkout'])))?></h3><p class="record-meta"><?=portal_escape((int)$extension['extra_nights'])?> night(s) · ₱<?=number_format((float)$extension['proposed_charge'], 2)?> · requested <?=portal_escape(date('M j, Y · g:i A', strtotime($extension['created_at'])))?></p></div><span class="status" data-live-status><?= $extension['status'] === 'APPROVED' ? 'Approved' : ($extension['status'] === 'REJECTED' ? 'Declined' : 'Pending') ?></span></div><?php if ($extension['status'] === 'REJECTED' && ($extension['review_note'] ?? '') !== ''): ?><p class="record-meta extension-decline-note">Declined: <?=portal_escape($extension['review_note'])?></p><?php endif; ?></article><?php endforeach; ?>
          </div>
        </section>
      </div>
    </div>
  </dialog>

  <dialog class="dialog" id="billing-dialog" aria-labelledby="billing-title">
    <div class="dialog-frame">
      <header class="dialog-head"><div><p class="eyebrow">Your hotel folio</p><h2 id="billing-title">Billing &amp; balance</h2><p>A clear summary of charges and payments posted to your stay.</p></div><button class="dialog-close" type="button" data-close aria-label="Close billing dialog">×</button></header>
      <div class="dialog-body">
        <div class="folio-intro"><p class="record-meta" style="margin:0">Room <?=portal_escape($stay['room_number'] ?? '')?> · Your account summary</p></div>
        <section class="folio-summary" aria-label="Account totals">
          <div class="folio-metric balance-due"><span class="folio-metric-label">Outstanding balance</span><strong class="folio-metric-value" data-live-total="balance">₱<?=number_format($balance, 2)?></strong><span class="folio-settled-note <?= $balance > 0 ? 'is-due' : '' ?>" data-live-balance-note><?= $balance > 0 ? '● Balance remaining on your account' : '✓ Your posted account balance is settled' ?></span></div>
          <div class="folio-metric"><span class="folio-metric-label">Total charges (VAT-inclusive)</span><strong class="folio-metric-value" data-live-total="charges">₱<?=number_format($totalCharges, 2)?></strong></div>
          <div class="folio-metric"><span class="folio-metric-label">Discounts applied</span><strong class="folio-metric-value" data-live-total="discounts">− ₱<?=number_format($discountTotal, 2)?></strong></div>
          <div class="folio-metric"><span class="folio-metric-label">VATable sales</span><strong class="folio-metric-value" data-live-total="vatable_sales">₱<?=number_format($vatableSales, 2)?></strong></div>
          <div class="folio-metric"><span class="folio-metric-label">VAT</span><strong class="folio-metric-value" data-live-total="vat">₱<?=number_format($vatAmount, 2)?></strong></div>
          <div class="folio-metric"><span class="folio-metric-label">VAT-exempt sales</span><strong class="folio-metric-value" data-live-total="vat_exempt_sales">₱<?=number_format($vatExemptSales, 2)?></strong></div>
          <div class="folio-metric"><span class="folio-metric-label">Total amount due</span><strong class="folio-metric-value" data-live-total="total">₱<?=number_format($finalTotal, 2)?></strong></div>
          <div class="folio-metric"><span class="folio-metric-label">Payments received</span><strong class="folio-metric-value" data-live-total="payments">₱<?=number_format($totalPayments, 2)?></strong></div>
          <div class="folio-metric"><span class="folio-metric-label">Unrefunded credit</span><strong class="folio-metric-value" data-live-total="credit_balance">₱<?=number_format($creditBalance, 2)?></strong></div>
        </section>
        <section class="folio-section">
          <div class="folio-section-heading"><h3>Discounts applied</h3><span data-live-count="discounts"><?=count($discounts)?> entries</span></div>
          <div class="bill-list" data-live-list="discounts"><?php foreach ($discounts as $discount): $discountName = (string)($discount['name'] ?: $discount['category'] ?: 'Discount'); $discountRate = (float)($discount['discount_value'] ?? 0); if (strtoupper((string)$discount['discount_type']) === 'PERCENT' && !preg_match('/\d+(?:\.\d+)?\s*%/', $discountName)) { $discountName .= ' (' . rtrim(rtrim(number_format($discountRate, 2, '.', ''), '0'), '.') . '%)'; } ?><article class="record folio-record payment-record"><div class="record-top"><div><h3 class="record-title"><?=portal_escape($discountName)?></h3><p class="record-meta"><?=portal_escape($discount['category'] ?? 'Discount')?></p></div><span class="record-price">− ₱<?=number_format((float)$discount['amount'], 2)?></span></div></article><?php endforeach; ?></div>
        </section>
        <section class="folio-section">
          <div class="folio-section-heading"><h3>Posted charges</h3><span data-live-count="charges"><?=count($charges)?> entries</span></div>
          <div class="bill-list" data-live-list="charges"><?php if (!$charges): ?><div class="activity-empty"><span class="activity-empty-icon" aria-hidden="true">▤</span><strong>No posted charges yet</strong><p>Charges will appear here once they have been posted to your stay.</p></div><?php endif; ?><?php foreach ($charges as $charge): ?><article class="record folio-record charge-record"><div class="record-top"><div><h3 class="record-title"><?=portal_escape($charge['description'])?></h3><p class="record-meta">Quantity <?=portal_escape($charge['quantity'])?> · <?=portal_escape(date('M j, Y · g:i A', strtotime($charge['created_at'])))?></p></div><span class="record-price">₱<?=number_format((float)$charge['amount'], 2)?></span></div></article><?php endforeach; ?></div>
        </section>
        <section class="folio-section">
          <div class="folio-section-heading"><h3>Payments received</h3><span data-live-count="payments"><?=count($payments)?> entries</span></div>
          <div class="bill-list" data-live-list="payments"><?php if (!$payments): ?><div class="activity-empty"><span class="activity-empty-icon" aria-hidden="true">✓</span><strong>No payments recorded yet</strong><p>Payments will be listed here once recorded by the hotel.</p></div><?php endif; ?><?php foreach ($payments as $payment): ?><article class="record folio-record payment-record"><div class="record-top"><div><h3 class="record-title"><?=portal_escape($payment['payment_method'] ?: 'Payment')?></h3><p class="record-meta"><?=portal_escape($payment['receipt_number'] ?: 'Receipt not provided')?> · <?=portal_escape(date('M j, Y · g:i A', strtotime($payment['created_at'])))?></p></div><span class="record-price">− ₱<?=number_format((float)$payment['amount'], 2)?></span></div></article><?php endforeach; ?></div>
        </section>
        <p class="folio-note"><strong>Billing information</strong><br>This summary includes charges, discounts, payments, and any unrefunded credit currently recorded for your stay. For questions about an entry or your final bill, please contact the front desk.</p>
      </div>
    </div>
  </dialog>

  <aside id="live-update-toast" class="live-update-toast" role="status" aria-live="polite" aria-atomic="true" hidden>
    <span class="live-update-icon" aria-hidden="true">✓</span>
    <span class="live-update-copy"><strong id="live-update-toast-title">Stay update</strong><span id="live-update-toast-message"></span></span>
    <button type="button" id="live-update-toast-dismiss" aria-label="Dismiss notification">×</button>
  </aside>

  <dialog class="dialog live-stay-dialog" id="live-order-alert" aria-labelledby="live-order-alert-title">
    <div class="dialog-frame live-stay-frame">
      <header class="live-stay-header">
        <span class="live-stay-bell" aria-hidden="true">♧</span>
        <div class="live-stay-heading"><p class="live-stay-eyebrow">LIVE STAY UPDATE</p><h2 id="live-order-alert-title">Your order status changed</h2></div>
        <span class="live-stay-live"><i></i> LIVE</span>
        <button class="dialog-close live-stay-close" type="button" data-close aria-label="Close notification">×</button>
      </header>
      <div class="live-stay-content">
        <section class="live-stay-item">
          <div class="live-stay-food-icon" aria-hidden="true">🍽</div>
          <div class="live-stay-item-copy"><strong id="live-order-alert-items">Your room-service order</strong><p id="live-order-alert-code">Order reference</p><p id="live-order-alert-quantity"></p><span class="live-stay-status" id="live-order-alert-status">Preparing</span></div>
        </section>
        <div class="live-stay-divider"></div>
        <section class="live-stay-estimate"><span class="live-stay-clock" aria-hidden="true">◷</span><div><strong>Estimated ready time</strong><p id="live-order-alert-estimate">We'll update you when we have an estimate.</p></div></section>
        <section class="live-stay-progress" aria-label="Order progress"><strong>Order progress</strong><div class="live-stay-progress-bars"><div data-progress-step="confirmed"><span></span><small>Confirmed</small></div><div data-progress-step="preparing"><span></span><small>Preparing</small></div><div data-progress-step="ready"><span></span><small>Ready</small></div></div></section>
        <p class="live-stay-message" id="live-order-alert-message" role="status" aria-live="polite">Your order status has changed.</p>
      </div>
      <footer class="live-stay-footer"><button class="button" type="button" data-close>Got it</button></footer>
    </div>
  </dialog>

  <script>
    (() => {
      const dialog = document.getElementById("requests-dialog");
      if (!(dialog instanceof HTMLDialogElement)) return;
      const filters = dialog.querySelectorAll("[data-activity-filter]");
      const sections = dialog.querySelectorAll("[data-activity-section]");
      const applyFilter = (filter) => {
        const value = filter.dataset.activityFilter || "all";
        filters.forEach((button) => button.setAttribute("aria-pressed", String(button === filter)));
        sections.forEach((section) => {
          section.hidden = value !== "all" && section.dataset.activitySection !== value;
        });
      };
      filters.forEach((filter) => filter.addEventListener("click", () => applyFilter(filter)));
      applyFilter(dialog.querySelector('[data-activity-filter="all"]') || filters[0]);
    })();

    const extendDate = document.querySelector("[data-extend-date]");
    if (extendDate instanceof HTMLInputElement) {
      const preview = document.querySelector("[data-extend-preview]");
      const submit = document.querySelector("[data-extend-submit]");
      const currentCheckout = extendDate.dataset.currentCheckout || "";
      const nightlyRate = Number(extendDate.dataset.nightlyRate || 0);
      const fmt = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
      const update = () => {
        const start = currentCheckout ? new Date(currentCheckout + "T00:00:00") : null;
        const end = extendDate.value ? new Date(extendDate.value + "T00:00:00") : null;
        const nights = start && end ? Math.round((end - start) / 86400000) : 0;
        if (nights >= 1 && nightlyRate > 0) {
          if (preview) preview.textContent = `${nights} extra night${nights === 1 ? "" : "s"} × ${fmt.format(nightlyRate)} = ${fmt.format(nights * nightlyRate)}. This will be added to your folio and settled at checkout.`;
          if (submit) submit.disabled = false;
        } else {
          if (preview) preview.textContent = "Choose a new checkout date after your current checkout date to see the added cost.";
          if (submit) submit.disabled = true;
        }
      };
      extendDate.addEventListener("change", update);
      extendDate.addEventListener("input", update);
      update();
    }

    document.querySelectorAll("[data-open]").forEach((button) => {
      button.addEventListener("click", () => {
        const dialog = document.getElementById(button.dataset.open);
        if (dialog instanceof HTMLDialogElement && !dialog.open) dialog.showModal();
      });
    });
    document.querySelectorAll("dialog[data-dialog], dialog").forEach((dialog) => {
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close();
      });
      dialog.querySelectorAll("[data-close]").forEach((button) => {
        button.addEventListener("click", () => dialog.close());
      });
    });
    document.querySelectorAll("[data-quantity-change]").forEach((button) => {
      button.addEventListener("click", () => {
        const input = button.parentElement?.querySelector("[data-quantity]");
        if (!(input instanceof HTMLInputElement)) return;
        const current = Number.parseInt(input.value, 10) || 0;
        const change = Number.parseInt(button.dataset.quantityChange || "0", 10);
        input.value = String(Math.max(0, Math.min(20, current + change)));
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    });
    const foodForm = document.querySelector('form input[name="portal_action"][value="food_order"]')?.form;
    if (foodForm) {
      const inputs = [...foodForm.querySelectorAll("[data-quantity]")];
      const totalElement = foodForm.querySelector("[data-order-total]");
      const countElement = foodForm.querySelector("[data-order-count]");
      const submitButton = foodForm.querySelector("[data-order-submit]");
      const reviewDialog = document.getElementById("order-review-dialog");
      const reviewButton = foodForm.querySelector("[data-order-submit]");
      const confirmButton = reviewDialog?.querySelector("[data-confirm-order]");
      const reviewItems = reviewDialog?.querySelector("[data-review-items]");
      const reviewNotes = reviewDialog?.querySelector("[data-review-notes]");
      const reviewTotal = reviewDialog?.querySelector("[data-review-total]");
      let orderConfirmed = false;
      const currency = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
      const updateTotal = () => {
        const selected = inputs.reduce((result, input) => {
          const quantity = Number.parseInt(input.value, 10) || 0;
          const unitPrice = Number.parseFloat(input.dataset.price || "0") || 0;
          result.count += quantity;
          result.total += quantity * unitPrice;
          return result;
        }, { count: 0, total: 0 });
        if (totalElement) totalElement.textContent = currency.format(selected.total);
        if (countElement) countElement.textContent = `${selected.count} ${selected.count === 1 ? "item" : "items"}`;
        if (submitButton instanceof HTMLButtonElement) submitButton.disabled = selected.count === 0;
      };
      const showOrderReview = () => {
        if (!(reviewDialog instanceof HTMLDialogElement) || !(reviewItems instanceof HTMLElement)) return;
        reviewItems.replaceChildren();
        let total = 0;
        let itemCount = 0;
        inputs.forEach((input) => {
          const quantity = Number.parseInt(input.value, 10) || 0;
          if (quantity < 1) return;
          const card = input.closest(".menu-item");
          const name = card?.querySelector("h3")?.textContent?.trim() || "Menu item";
          const unitPrice = Number.parseFloat(input.dataset.price || "0") || 0;
          const subtotal = quantity * unitPrice;
          total += subtotal;
          itemCount += quantity;
          const row = document.createElement("article");
          row.className = "order-review-item";
          const details = document.createElement("div");
          details.className = "order-review-details";
          const title = document.createElement("p");
          title.className = "order-review-name";
          title.textContent = name;
          const quantityPrice = document.createElement("p");
          quantityPrice.className = "order-review-detail";
          quantityPrice.textContent = `${quantity} × ${currency.format(unitPrice)}`;
          details.append(title, quantityPrice);
          const lineTotal = document.createElement("strong");
          lineTotal.className = "order-review-price";
          lineTotal.textContent = currency.format(subtotal);
          const removeButton = document.createElement("button");
          removeButton.type = "button";
          removeButton.className = "order-review-remove";
          removeButton.dataset.removeOrderItem = input.name;
          removeButton.setAttribute("aria-label", `Remove ${name} from order`);
          removeButton.title = `Remove ${name}`;
          removeButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>';
          row.append(details, lineTotal, removeButton);
          reviewItems.append(row);
        });
        if (itemCount === 0) {
          const emptyMessage = document.createElement("p");
          emptyMessage.className = "order-review-empty";
          emptyMessage.textContent = "Your order is empty. Go back to the menu and add something delicious!";
          reviewItems.append(emptyMessage);
        }
        const notes = foodForm.querySelector('textarea[name="notes"]');
        const noteText = notes instanceof HTMLTextAreaElement ? notes.value.trim() : "";
        if (reviewNotes instanceof HTMLElement) {
          reviewNotes.hidden = noteText === "";
          reviewNotes.textContent = noteText === "" ? "" : `Order notes: ${noteText}`;
        }
        if (reviewTotal instanceof HTMLElement) reviewTotal.textContent = currency.format(total);
        if (confirmButton instanceof HTMLButtonElement) confirmButton.disabled = itemCount === 0;
        if (!reviewDialog.open) {
          reviewDialog.showModal();
          confirmButton instanceof HTMLButtonElement && confirmButton.focus();
        }
      };
      inputs.forEach((input) => {
        input.addEventListener("input", () => {
          const quantity = Number.parseInt(input.value, 10);
          if (!Number.isFinite(quantity)) input.value = "0";
          else input.value = String(Math.max(0, Math.min(20, quantity)));
          updateTotal();
        });
      });
      updateTotal();
      const menuFilters = [...foodForm.querySelectorAll("[data-menu-filter]")];
      const searchInput = foodForm.querySelector("[data-menu-search]");
      const menuCards = [...foodForm.querySelectorAll(".menu-item")];
      const filterMenu = () => {
        const selectedType = menuFilters.find((filter) => filter.getAttribute("aria-pressed") === "true")?.dataset.menuFilter || "All";
        const search = searchInput instanceof HTMLInputElement ? searchInput.value.trim().toLocaleLowerCase() : "";
        menuCards.forEach((card) => {
          const matchesType = selectedType === "All" || card.dataset.menuType === selectedType;
          const matchesSearch = (card.dataset.menuName || "").includes(search);
          card.hidden = !(matchesType && matchesSearch);
        });
      };
      menuFilters.forEach((filter) => {
        filter.addEventListener("click", () => {
          menuFilters.forEach((button) => button.setAttribute("aria-pressed", String(button === filter)));
          filterMenu();
        });
      });
      searchInput?.addEventListener("input", filterMenu);
      reviewButton?.addEventListener("click", showOrderReview);
      reviewItems?.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const removeButton = target.closest("button[data-remove-order-item]");
        if (!(removeButton instanceof HTMLButtonElement)) return;
        const inputName = removeButton.dataset.removeOrderItem;
        const input = inputs.find((candidate) => candidate.name === inputName);
        if (!(input instanceof HTMLInputElement)) return;
        input.value = "0";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        showOrderReview();
      });
      reviewDialog?.querySelector("[data-review-back]")?.addEventListener("click", () => reviewDialog.close());
      confirmButton?.addEventListener("click", () => {
        orderConfirmed = true;
        foodForm.requestSubmit();
      });
      foodForm.addEventListener("submit", (event) => {
        if (inputs.every((input) => (Number.parseInt(input.value, 10) || 0) === 0)) {
          event.preventDefault();
          inputs[0]?.focus();
          return;
        }
        if (!orderConfirmed) {
          event.preventDefault();
          showOrderReview();
          return;
        }
        if (confirmButton instanceof HTMLButtonElement) {
          confirmButton.disabled = true;
          confirmButton.textContent = "Sending order…";
        }
        if (submitButton instanceof HTMLButtonElement) {
          submitButton.disabled = true;
          submitButton.textContent = "Sending order…";
        }
      });
    }
    document.querySelectorAll('form input[name="portal_action"][value="service_request"]').forEach((actionInput) => {
      const serviceForm = actionInput.form;
      if (!serviceForm) return;
      const departmentSelect = serviceForm.querySelector("[data-service-type]");
      const serviceChoices = serviceForm.querySelectorAll("[data-service-choice]");
      serviceChoices.forEach((choice) => {
        choice.addEventListener("click", () => {
          if (!(departmentSelect instanceof HTMLSelectElement)) return;
          departmentSelect.value = choice.dataset.serviceChoice || "FRONT_DESK";
          serviceChoices.forEach((candidate) => {
            const selected = candidate === choice;
            candidate.classList.toggle("is-selected", selected);
            candidate.setAttribute("aria-pressed", String(selected));
          });
          departmentSelect.dispatchEvent(new Event("change", { bubbles: true }));
        });
      });
      const housekeepingFields = serviceForm.querySelector("[data-housekeeping-fields]");
      const housekeepingItem = serviceForm.querySelector("[data-housekeeping-item]");
      const housekeepingQuantity = serviceForm.querySelector("[data-service-quantity]");
      const housekeepingUnitPrice = serviceForm.querySelector("[data-housekeeping-unit-price]");
      const housekeepingTotal = serviceForm.querySelector("[data-housekeeping-total]");
      const housekeepingSubmit = serviceForm.querySelector('button[type="submit"]');
      const descriptionField = serviceForm.querySelector("[data-service-description]");
      const descriptionHint = serviceForm.querySelector("[data-service-description-hint]");
      const generalDescriptionFields = serviceForm.querySelector("[data-general-description-fields]");
      const transferFields = serviceForm.querySelector("[data-transfer-fields]");
      const transferRoom = serviceForm.querySelector("[data-transfer-room]");
      const transferReason = serviceForm.querySelector("[data-transfer-reason]");
      const transferAccept = serviceForm.querySelector("[data-transfer-accept]");
      const transferEstimate = serviceForm.querySelector("[data-transfer-estimate]");
      const serviceCurrency = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
      const updateHousekeepingPrice = () => {
        if (!(housekeepingItem instanceof HTMLSelectElement) || !(housekeepingQuantity instanceof HTMLInputElement)) return;
        const selectedOption = housekeepingItem.selectedOptions[0];
        const rawPrice = selectedOption?.dataset.price || "";
        const hasPrice = rawPrice !== "" && Number.isFinite(Number.parseFloat(rawPrice));
        const unitPrice = hasPrice ? Number.parseFloat(rawPrice) : null;
        const quantity = Number.parseInt(housekeepingQuantity.value, 10) || 1;
        if (housekeepingUnitPrice instanceof HTMLElement) {
          housekeepingUnitPrice.textContent = hasPrice ? serviceCurrency.format(unitPrice) : "Price not set";
        }
        if (housekeepingTotal instanceof HTMLElement) {
          housekeepingTotal.textContent = hasPrice ? serviceCurrency.format(unitPrice * quantity) : "Not available";
        }
        if (housekeepingSubmit instanceof HTMLButtonElement) {
          housekeepingSubmit.disabled = departmentSelect instanceof HTMLSelectElement
            && departmentSelect.value === "HOUSEKEEPING"
            && (!selectedOption?.value || !hasPrice || housekeepingItem.disabled);
        }
      };
      const updateHousekeepingFields = () => {
        const isHousekeeping = departmentSelect instanceof HTMLSelectElement && departmentSelect.value === "HOUSEKEEPING";
        const isTransfer = departmentSelect instanceof HTMLSelectElement && departmentSelect.value === "ROOM_TRANSFER";
        if (housekeepingFields instanceof HTMLElement) housekeepingFields.hidden = !isHousekeeping;
        if (transferFields instanceof HTMLElement) transferFields.hidden = !isTransfer;
        if (generalDescriptionFields instanceof HTMLElement) generalDescriptionFields.hidden = isTransfer;
        if (housekeepingItem instanceof HTMLSelectElement) {
          housekeepingItem.disabled = !isHousekeeping;
          housekeepingItem.required = isHousekeeping;
          if (!isHousekeeping) housekeepingItem.value = "";
        }
        if (housekeepingQuantity instanceof HTMLInputElement) housekeepingQuantity.disabled = !isHousekeeping;
        if (transferRoom instanceof HTMLSelectElement) {
          transferRoom.disabled = !isTransfer;
          transferRoom.required = isTransfer;
          if (!isTransfer) transferRoom.value = "";
        }
        if (transferReason instanceof HTMLTextAreaElement) {
          transferReason.disabled = !isTransfer;
          transferReason.required = isTransfer;
          if (!isTransfer) transferReason.value = "";
        }
        if (transferAccept instanceof HTMLInputElement) {
          transferAccept.disabled = !isTransfer;
          transferAccept.required = isTransfer;
          if (!isTransfer) transferAccept.checked = false;
        }
        if (descriptionField instanceof HTMLTextAreaElement) {
          descriptionField.disabled = isTransfer;
          descriptionField.required = !isHousekeeping && !isTransfer;
          descriptionField.placeholder = isHousekeeping
            ? "Optional note, such as where to leave the items."
            : (departmentSelect?.value === "MAINTENANCE"
              ? "Describe the issue and where it is in the room."
              : departmentSelect?.value === "FRONT_DESK"
                ? "Tell us how we can help."
                : "Describe what you need and any helpful details.");
        }
        if (descriptionHint instanceof HTMLElement) {
          descriptionHint.textContent = isHousekeeping
            ? "Optional — add a note about where to leave the items."
            : departmentSelect?.value === "MAINTENANCE"
              ? "If possible, include where the issue is and when it started."
              : "Include details that will help our team assist you.";
        }
        serviceChoices.forEach((choice) => {
          const selected = choice.dataset.serviceChoice === departmentSelect?.value;
          choice.classList.toggle("is-selected", selected);
          choice.setAttribute("aria-pressed", String(selected));
        });
        updateHousekeepingPrice();
      };
      const updateTransferEstimate = () => {
        if (!(transferRoom instanceof HTMLSelectElement) || !(transferEstimate instanceof HTMLElement)) return;
        const option = transferRoom.selectedOptions[0];
        if (!option?.value) {
          transferEstimate.textContent = "Select a destination to see the estimated remaining-stay rate adjustment.";
          return;
        }
        const adjustment = Number.parseFloat(option.dataset.adjustment || "0");
        const rate = Number.parseFloat(option.dataset.rate || "0");
        const amount = serviceCurrency.format(Math.abs(adjustment));
        const adjustmentText = adjustment > 0
          ? `${amount} estimated additional room charges`
          : adjustment < 0
            ? `${amount} estimated room-charge credit`
            : "no estimated room-rate adjustment";
        transferEstimate.textContent = `Destination rate: ${serviceCurrency.format(rate)} per night; ${adjustmentText} for the remaining stay. Staff will confirm the final amount.`;
      };
      departmentSelect?.addEventListener("change", updateHousekeepingFields);
      housekeepingItem?.addEventListener("change", updateHousekeepingPrice);
      transferRoom?.addEventListener("change", updateTransferEstimate);
      updateHousekeepingFields();
      serviceForm.querySelectorAll("[data-service-quantity-change]").forEach((button) => {
        button.addEventListener("click", () => {
          if (!(housekeepingQuantity instanceof HTMLInputElement)) return;
          const current = Number.parseInt(housekeepingQuantity.value, 10) || 1;
          const change = Number.parseInt(button.dataset.serviceQuantityChange || "0", 10);
          housekeepingQuantity.value = String(Math.max(1, Math.min(20, current + change)));
          updateHousekeepingPrice();
        });
      });
      housekeepingQuantity?.addEventListener("input", () => {
        if (!(housekeepingQuantity instanceof HTMLInputElement)) return;
        const quantity = Number.parseInt(housekeepingQuantity.value, 10);
        housekeepingQuantity.value = String(Number.isFinite(quantity) ? Math.max(1, Math.min(20, quantity)) : 1);
        updateHousekeepingPrice();
      });
      serviceForm.addEventListener("submit", () => {
        const submitButton = serviceForm.querySelector('button[type="submit"]');
        if (submitButton instanceof HTMLButtonElement) {
          submitButton.disabled = true;
          submitButton.textContent = "Sending request…";
        }
      });
    });

    // Refresh private stay order/request status every 5 seconds; countdown ticks locally each second.
    (() => {
      const liveUrl = new URL(window.location.href);
      liveUrl.searchParams.set("portal_live", "1");
      const seenOrderStatuses = new Map();
      const seenRequestStatuses = new Map();
      const seenExtensionStatuses = new Map();
      const alertDialog = document.getElementById("live-order-alert");
      const alertTitle = document.getElementById("live-order-alert-title");
      const alertMessage = document.getElementById("live-order-alert-message");
      const alertItems = document.getElementById("live-order-alert-items");
      const alertCode = document.getElementById("live-order-alert-code");
      const alertQuantity = document.getElementById("live-order-alert-quantity");
      const alertStatus = document.getElementById("live-order-alert-status");
      const alertEstimate = document.getElementById("live-order-alert-estimate");
      const alertIcon = alertDialog?.querySelector(".live-stay-food-icon");
      const alertEstimateSection = alertDialog?.querySelector(".live-stay-estimate");
      const alertProgressSection = alertDialog?.querySelector(".live-stay-progress");
      const toast = document.getElementById("live-update-toast");
      const toastTitle = document.getElementById("live-update-toast-title");
      const toastMessage = document.getElementById("live-update-toast-message");
      const toastDismiss = document.getElementById("live-update-toast-dismiss");
      let toastHideTimer = 0;
      let hasBaseline = false;
      let pollInProgress = false;
      let lastLiveFailureNotice = false;
      const pendingAlerts = [];
      let alertShowing = false;
      const requestList = document.querySelector('[data-activity-section="request"] .request-list');
      const orderList = document.querySelector('[data-activity-section="order"] .order-list');
      const extensionList = document.querySelector('[data-activity-section="extension"] .extension-list');
      const recentRequestList = document.querySelector('section[aria-labelledby="recent-title"] .request-list');
      const liveCurrency = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
      let previousBillingState = "";
      let previousStayState = "";
      let previousCheckinStatus = "";

      const normalizeStatus = (status) => String(status || "Pending").trim().replaceAll("_", " ").replace(/\s+/g, " ").toLowerCase();
      const friendlyStatus = (status) => normalizeStatus(status).replace(/\b\w/g, (letter) => letter.toUpperCase());
      const renderBillingList = (name, records) => {
        const list = document.querySelector(`[data-live-list="${name}"]`);
        const count = document.querySelector(`[data-live-count="${name}"]`);
        if (!(list instanceof HTMLElement)) return;
        const rows = Array.isArray(records) ? records : [];
        if (count) count.textContent = `${rows.length} ${rows.length === 1 ? "entry" : "entries"}`;
        list.replaceChildren();
        if (!rows.length) {
          const empty = document.createElement("div");
          empty.className = "activity-empty";
          empty.textContent = name === "payments" ? "No payments recorded yet." : name === "discounts" ? "No discounts applied." : "No posted charges yet.";
          list.append(empty);
          return;
        }
        rows.forEach((record) => {
          const card = document.createElement("article");
          card.className = `record folio-record ${name === "charges" ? "charge-record" : "payment-record"}`;
          const top = document.createElement("div");
          top.className = "record-top";
          const detail = document.createElement("div");
          const title = document.createElement("h3");
          title.className = "record-title";
          const meta = document.createElement("p");
          meta.className = "record-meta";
          const price = document.createElement("span");
          price.className = "record-price";
          if (name === "charges") {
            title.textContent = String(record.description || "Charge");
            meta.textContent = `Quantity ${Number(record.quantity) || 1} · ${formatCreatedAt(record.created_at)}`;
            price.textContent = liveCurrency.format(Number(record.amount) || 0);
          } else if (name === "discounts") {
            const label = String(record.name || record.category || "Discount");
            const rate = Number(record.discount_value);
            title.textContent = String(record.discount_type).toUpperCase() === "PERCENT" && Number.isFinite(rate) && !/\d+(?:\.\d+)?\s*%/.test(label) ? `${label} (${rate}%)` : label;
            meta.textContent = String(record.category || "Discount");
            price.textContent = `− ${liveCurrency.format(Number(record.amount) || 0)}`;
          } else if (name === "payments") {
            title.textContent = String(record.payment_method || "Payment");
            meta.textContent = `${String(record.receipt_number || "Receipt not provided")} · ${formatCreatedAt(record.created_at)}`;
            price.textContent = `− ${liveCurrency.format(Number(record.amount) || 0)}`;
          }
          detail.append(title, meta);
          top.append(detail, price);
          card.append(top);
          list.append(card);
        });
      };
      const updateLiveBilling = (billing) => {
        if (!billing || !billing.totals) return;
        const totals = billing.totals;
        Object.entries(totals).forEach(([name, amount]) => {
          const element = document.querySelector(`[data-live-total="${name}"]`);
          if (element) element.textContent = name === "discounts" ? `− ${liveCurrency.format(Number(amount) || 0)}` : liveCurrency.format(Number(amount) || 0);
        });
        const balance = Number(totals.balance) || 0;
        const balanceLabel = document.querySelector("[data-live-balance-note]");
        if (balanceLabel) {
          balanceLabel.textContent = balance > 0 ? "● Balance remaining on your account" : "✓ Your posted account balance is settled";
          balanceLabel.classList.toggle("is-due", balance > 0);
        }
        const topBalance = document.querySelector("[data-live-balance]");
        if (topBalance) topBalance.textContent = liveCurrency.format(balance);
        renderBillingList("charges", billing.charges);
        renderBillingList("discounts", billing.discounts);
        renderBillingList("payments", billing.payments);
      };
      const formatCreatedAt = (value) => {
        const parsed = parseDate(value);
        return parsed ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(parsed) : "";
      };
      const updateActivityCount = (section, count) => {
        const element = document.querySelector(`[data-activity-section="${section}"] .activity-count`);
        if (element) element.textContent = String(count);
      };
      const updateRecentRequests = (requests) => {
        if (!(recentRequestList instanceof HTMLElement)) return;
        recentRequestList.replaceChildren();
        if (requests.length === 0) {
          const empty = document.createElement("div");
          empty.className = "empty";
          empty.textContent = "No requests yet. Hotel assistance is just a tap away.";
          recentRequestList.append(empty);
          return;
        }
        requests.slice(0, 3).forEach((request) => {
          const card = document.createElement("article");
          card.className = "record";
          const top = document.createElement("div");
          top.className = "record-top";
          const copy = document.createElement("div");
          const title = document.createElement("h3");
          title.className = "record-title";
          const meta = document.createElement("p");
          meta.className = "record-meta";
          const status = document.createElement("span");
          status.className = "status";
          if (request._kind === "extension") {
            card.dataset.kind = "extension";
            title.textContent = `Stay extension to ${formatExtensionDate(request.requested_checkout)}`;
            const nights = Number(request.extra_nights || 0);
            meta.textContent = `${nights} night${nights === 1 ? "" : "s"} · ${liveCurrency.format(Number(request.proposed_charge) || 0)} · requested ${formatCreatedAt(request.created_at)}`;
            status.textContent = extensionStatusLabel(request.status);
          } else {
            title.textContent = String(request.description || "Service request");
            meta.textContent = `${request.request_code || ""} · ${formatCreatedAt(request.created_at)}`;
            status.textContent = friendlyStatus(request.status);
          }
          copy.append(title, meta);
          top.append(copy, status);
          card.append(top);
          if (request._kind === "extension" && String(request.status || "").toUpperCase() === "REJECTED" && request.review_note) {
            const note = document.createElement("p");
            note.className = "record-meta";
            note.textContent = `Declined: ${String(request.review_note)}`;
            card.append(note);
          }
          recentRequestList.append(card);
        });
      };
      const addLiveRequest = (request) => {
        if (!(requestList instanceof HTMLElement)) return null;
        requestList.querySelector(".activity-empty")?.remove();
        const card = document.createElement("article");
        card.className = "record activity-record";
        card.dataset.kind = "request";
        card.dataset.liveRequest = String(request.request_code || "");
        const top = document.createElement("div");
        top.className = "record-top";
        const copy = document.createElement("div");
        const title = document.createElement("h3");
        title.className = "record-title";
        title.textContent = String(request.description || "Service request");
        const meta = document.createElement("p");
        meta.className = "record-meta";
        meta.textContent = `Reference ${request.request_code || ""} · ${formatCreatedAt(request.created_at)}`;
        copy.append(title, meta);
        const badge = document.createElement("span");
        badge.className = "status";
        badge.dataset.liveStatus = "";
        badge.textContent = friendlyStatus(request.status);
        top.append(copy, badge);
        card.append(top);
        if (Number(request.chargeable) > 0) {
          const charge = document.createElement("p");
          charge.className = "record-meta";
          charge.textContent = `Charge: ${liveCurrency.format(Number(request.price) || 0)}`;
          card.append(charge);
        }
        requestList.prepend(card);
        updateActivityCount("request", requestList.querySelectorAll("[data-live-request]").length);
        return card;
      };
      const extensionStatusLabel = (status) => {
        const upper = String(status || "").toUpperCase();
        if (upper === "APPROVED") return "Approved";
        if (upper === "REJECTED") return "Declined";
        return "Pending";
      };
      const formatExtensionDate = (value) => {
        const parts = String(value || "").split("-");
        if (parts.length !== 3) return String(value || "—");
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const month = Number(parts[1]);
        if (!month || month < 1 || month > 12) return String(value);
        return `${months[month - 1]} ${Number(parts[2])}, ${parts[0]}`;
      };
      const addLiveExtension = (extension) => {
        if (!(extensionList instanceof HTMLElement)) return null;
        extensionList.querySelector(".activity-empty")?.remove();
        const card = document.createElement("article");
        card.className = "record activity-record";
        card.dataset.kind = "extension";
        card.dataset.liveExtension = String(extension.id || "");
        const top = document.createElement("div");
        top.className = "record-top";
        const copy = document.createElement("div");
        const title = document.createElement("h3");
        title.className = "record-title";
        title.textContent = `Stay extension to ${formatExtensionDate(extension.requested_checkout)}`;
        const meta = document.createElement("p");
        meta.className = "record-meta";
        const nights = Number(extension.extra_nights || 0);
        meta.textContent = `${nights} night${nights === 1 ? "" : "s"} · ${liveCurrency.format(Number(extension.proposed_charge) || 0)} · requested ${formatCreatedAt(extension.created_at)}`;
        copy.append(title, meta);
        const badge = document.createElement("span");
        badge.className = "status";
        badge.dataset.liveStatus = "";
        badge.textContent = extensionStatusLabel(extension.status);
        top.append(copy, badge);
        card.append(top);
        if (String(extension.status || "").toUpperCase() === "REJECTED" && extension.review_note) {
          const note = document.createElement("p");
          note.className = "record-meta extension-decline-note";
          note.textContent = `Declined: ${String(extension.review_note)}`;
          card.append(note);
        }
        extensionList.prepend(card);
        updateActivityCount("extension", extensionList.querySelectorAll("[data-live-extension]").length);
        return card;
      };
      const addLiveOrder = (order) => {
        if (!(orderList instanceof HTMLElement)) return null;
        orderList.querySelector(".activity-empty")?.remove();
        const card = document.createElement("article");
        card.className = "record activity-record";
        card.dataset.kind = "order";
        card.dataset.liveOrder = String(order.id);
        const top = document.createElement("div");
        top.className = "record-top";
        const copy = document.createElement("div");
        const title = document.createElement("h3");
        title.className = "record-title";
        title.textContent = String(order.order_code || "Room-service order");
        const meta = document.createElement("p");
        meta.className = "record-meta";
        const itemSummary = (Array.isArray(order.items) ? order.items : []).map((item) =>
          `${Number(item.quantity) || 1}× ${String(item.name || "Menu item")}`
        ).join(", ");
        meta.textContent = [itemSummary, formatCreatedAt(order.created_at)].filter(Boolean).join(" · ");
        copy.append(title, meta);
        const badge = document.createElement("span");
        badge.className = "status";
        badge.dataset.liveStatus = "";
        badge.textContent = friendlyStatus(order.order_status);
        top.append(copy, badge);
        const amount = document.createElement("p");
        amount.className = "record-meta";
        amount.dataset.orderAmount = "";
        amount.textContent = `${liveCurrency.format(Number(order.total_amount) || 0)} · ${String(order.payment_status || "Unpaid")}`;
        const estimate = document.createElement("p");
        estimate.className = "record-meta";
        estimate.dataset.readyEstimate = "";
        estimate.dataset.readyAt = String(order.estimated_ready_at || "");
        estimate.append(document.createTextNode("Estimated serving time: "));
        const estimateLabel = document.createElement("strong");
        estimateLabel.dataset.readyLabel = "";
        estimateLabel.textContent = "Calculating…";
        estimate.append(estimateLabel);
        card.append(top, amount, estimate);
        orderList.prepend(card);
        updateActivityCount("order", orderList.querySelectorAll("[data-live-order]").length);
        return card;
      };
      const orderItemNames = (order) => {
        const items = Array.isArray(order.items) ? order.items : [];
        if (items.length === 0) return "your room-service order";
        return items.map((item) => {
          const quantity = Number.parseInt(item.quantity, 10) || 1;
          return (quantity > 1 ? quantity + "× " : "") + String(item.name || "menu item");
        }).join(", ");
      };
      const orderStatusCopy = (order, status) => {
        const lower = normalizeStatus(status);
        const names = orderItemNames(order);
        const code = String(order.order_code || "your order");
        if (["preparing", "in progress", "in preparation", "cooking"].includes(lower)) {
          return { title: "Your order is being prepared!", message: "The kitchen is preparing " + names + " (" + code + ")." };
        }
        if (["ready", "ready for serving", "ready for pickup", "ready for collection"].includes(lower)) {
          return { title: "Your order is ready!", message: names + " (" + code + ") is ready. Please follow the room-service instructions or contact hotel staff if needed." };
        }
        if (["completed", "served", "delivered"].includes(lower)) {
          return { title: "Your order has been served", message: names + " (" + code + ") has been marked " + friendlyStatus(status) + "." };
        }
        if (["cancelled", "canceled", "rejected"].includes(lower)) {
          return { title: "Order status update", message: names + " (" + code + ") has been " + friendlyStatus(status).toLowerCase() + ". Please contact hotel staff if you need assistance." };
        }
        if (["confirmed", "accepted"].includes(lower)) {
          return { title: "Your order is confirmed", message: names + " (" + code + ") has been confirmed by the hotel team." };
        }
        return { title: "Your order status changed", message: names + " (" + code + ") is now " + friendlyStatus(status) + "." };
      };
      // Status-dialog artwork: food orders show the first item's photo, service
      // requests show one icon per service type, stay extensions show a bed. The dialog is reused across
      // alerts, so every render resets the icon box and section visibility
      // first — otherwise a previous alert's photo or icon leaks into the next.
      const serviceIconFor = (serviceType, department, requestKind) => {
        const type = String(serviceType || "").toUpperCase();
        const dept = String(department || "").toUpperCase();
        const kind = String(requestKind || "").toUpperCase();
        if (type === "MAINTENANCE" || dept === "MAINTENANCE") return "🔧";
        if (type === "LAUNDRY" || dept === "LAUNDRY") return "🧺";
        if (type === "HOUSEKEEPING" || dept === "HOUSEKEEPING") return "🧹";
        if (type === "VALET" || dept === "VALET") return "🚗";
        if (type === "FRONT_DESK" || dept === "FRONT_DESK") return "🛎";
        if (type === "ROOM_TRANSFER" || kind === "ROOM_TRANSFER") return "🔑";
        return "✦";
      };
      const setAlertPhoto = (photo) => {
        if (!(alertIcon instanceof HTMLElement)) return;
        alertIcon.textContent = "";
        const img = document.createElement("img");
        img.src = String(photo);
        img.alt = "";
        img.addEventListener("error", () => { if (alertIcon instanceof HTMLElement) alertIcon.textContent = "🍽"; }, { once: true });
        alertIcon.append(img);
      };
      const showNextStatusAlert = () => {
        if (alertShowing || pendingAlerts.length === 0) return;
        if (!(alertDialog instanceof HTMLDialogElement) || !(alertTitle instanceof HTMLElement) || !(alertMessage instanceof HTMLElement)) return;
        const next = pendingAlerts.shift();
        // Full reset first: clear any previous photo/icon and restore the
        // food-order sections before applying this alert's own visuals.
        if (alertIcon instanceof HTMLElement) alertIcon.textContent = "🍽";
        const isServiceAlert = next.kind === "request";
        if (alertEstimateSection instanceof HTMLElement) alertEstimateSection.style.display = isServiceAlert ? "none" : "";
        if (alertProgressSection instanceof HTMLElement) alertProgressSection.style.display = isServiceAlert ? "none" : "";
        alertTitle.textContent = next.title;
        alertMessage.textContent = next.message;
        if (isServiceAlert) {
          if (alertIcon instanceof HTMLElement) alertIcon.textContent = serviceIconFor(next.service_type, next.assigned_department, next.request_kind);
          if (alertItems) alertItems.textContent = next.items || "Service request";
          if (alertCode) alertCode.textContent = next.code ? "Request " + next.code : "Service request";
          if (alertQuantity) alertQuantity.textContent = next.quantity || "";
        } else {
          if (next.kind === "extension") {
            if (alertIcon instanceof HTMLElement) alertIcon.textContent = "🛏";
          } else if (next.photo) setAlertPhoto(next.photo);
          if (alertItems) alertItems.textContent = next.items || "Your room-service order";
          if (alertCode) alertCode.textContent = next.code ? "Order #" + next.code : "Room-service order";
          if (alertQuantity) alertQuantity.textContent = next.quantity || "";
        }
        if (alertStatus) alertStatus.textContent = next.status || "Updated";
        if (alertEstimate) alertEstimate.textContent = next.estimate || "We'll update you when we have an estimate.";
        const currentIndex = ["confirmed","preparing","ready"].indexOf(next.progress || "confirmed");
        document.querySelectorAll("[data-progress-step]").forEach((step) => {
          const index = ["confirmed","preparing","ready"].indexOf(step.getAttribute("data-progress-step"));
          step.classList.toggle("is-done", index >= 0 && index < currentIndex);
          step.classList.toggle("is-current", index === currentIndex);
        });
        alertShowing = true;
        if (!alertDialog.open) alertDialog.showModal();
      };
      const showToast = (title, message) => {
        if (!(toast instanceof HTMLElement) || !(toastTitle instanceof HTMLElement) || !(toastMessage instanceof HTMLElement)) return;
        toastTitle.textContent = title;
        toastMessage.textContent = message;
        toast.hidden = false;
        window.clearTimeout(toastHideTimer);
        toastHideTimer = window.setTimeout(() => { toast.hidden = true; }, 9000);
      };
      toastDismiss?.addEventListener("click", () => {
        if (toast instanceof HTMLElement) toast.hidden = true;
        window.clearTimeout(toastHideTimer);
      });
      const queueStatusAlert = (title, message, details = {}) => {
        showToast(title, message);
        pendingAlerts.push({ title, message, ...details });
        showNextStatusAlert();
      };
      if (alertDialog instanceof HTMLDialogElement) {
        alertDialog.addEventListener("close", () => {
          alertShowing = false;
          showNextStatusAlert();
        });
      };
      const parseDate = (value) => {
        if (!value) return null;
        const parsed = new Date(String(value).replace(" ", "T"));
        return Number.isNaN(parsed.getTime()) ? null : parsed;
      };
      const updateCountdowns = () => {
        document.querySelectorAll("[data-ready-estimate]").forEach((element) => {
          const label = element.querySelector("[data-ready-label]");
          if (!(label instanceof HTMLElement)) return;
          const readyAt = parseDate(element.dataset.readyAt || "");
          const orderCard = element.closest("[data-live-order]");
          const status = orderCard?.querySelector("[data-live-status]")?.textContent?.trim().toLowerCase() || "";
          if (["ready", "ready for serving", "ready for pickup", "ready for collection", "completed", "served"].includes(status)) label.textContent = "Ready to serve";
          else if (["cancelled", "canceled", "rejected"].includes(status)) label.textContent = "Estimate stopped";
          else if (!readyAt) label.textContent = "Time estimate unavailable";
          else {
            const minutes = Math.max(0, Math.ceil((readyAt.getTime() - Date.now()) / 60000));
            if (minutes === 0) label.textContent = "Expected shortly — please check with staff if delayed";
            else label.textContent = minutes === 1 ? "About 1 minute remaining" : "About " + minutes + " minutes remaining";
          }
        });
      };
      const poll = async () => {
        if (pollInProgress || document.visibilityState === "hidden") return;
        pollInProgress = true;
        try {
          const response = await fetch(liveUrl.toString(), { method: "GET", cache: "no-store", credentials: "same-origin", headers: { "Accept": "application/json" } });
          if (!response.ok) throw new Error("Live status request failed");
          const payload = await response.json();
          if (!payload || payload.ok !== true) throw new Error("Live status unavailable");

          const stayState = JSON.stringify(payload.stay || {});
          if (previousStayState && stayState !== previousStayState) {
            const previousStay = JSON.parse(previousStayState);
            const currentStay = payload.stay || {};
            if (previousStay.status !== currentStay.status || previousStay.room_number !== currentStay.room_number) {
              showToast("Stay status updated", `Your stay is now ${friendlyStatus(currentStay.status)}${currentStay.room_number ? ` in room ${currentStay.room_number}` : ""}. Refreshing your portal…`);
              window.setTimeout(() => window.location.reload(), 1200);
              return;
            }
          }
          previousStayState = stayState;

          const checkinStatus = String(payload.checkin_payment?.status || "");
          if (hasBaseline && previousCheckinStatus !== checkinStatus && checkinStatus) {
            showToast("Check-in payment update", `Your check-in payment is now ${friendlyStatus(checkinStatus)}.`);
          }
          previousCheckinStatus = checkinStatus;

          const billing = payload.billing || {};
          const billingState = JSON.stringify([billing.totals, billing.charges, billing.discounts, billing.payments]);
          if (hasBaseline && previousBillingState && billingState !== previousBillingState) {
            const due = Number(billing.totals?.balance) || 0;
            const credit = Number(billing.totals?.credit_balance) || 0;
            showToast("Your hotel folio was updated", `Charges, discounts, payments and account credit are refreshed. Balance: ${liveCurrency.format(due)} · Unrefunded credit: ${liveCurrency.format(credit)}.`);
          }
          previousBillingState = billingState;
          updateLiveBilling(billing);

          (payload.orders || []).forEach((order) => {
            const key = String(order.id);
            const status = String(order.order_status || "Pending");
            const previous = seenOrderStatuses.get(key);
            let card = document.querySelector('[data-live-order="' + CSS.escape(key) + '"]');
            const isNewOrder = hasBaseline && previous === undefined;
            if (!card) card = addLiveOrder(order);
            const badge = card?.querySelector("[data-live-status]");
            if (badge instanceof HTMLElement) badge.textContent = friendlyStatus(status);
            const estimate = card?.querySelector("[data-ready-estimate]");
            if (estimate instanceof HTMLElement) estimate.dataset.readyAt = String(order.estimated_ready_at || "");
            const amount = card?.querySelector("[data-order-amount]");
            if (amount instanceof HTMLElement) {
              amount.textContent = `${liveCurrency.format(Number(order.total_amount) || 0)} · ${String(order.payment_status || "Unpaid")}`;
            }
            if (isNewOrder) {
              const copy = orderStatusCopy(order, status);
              showToast("New room-service order", copy.message);
            }
            if (hasBaseline && previous !== undefined && normalizeStatus(previous) !== normalizeStatus(status)) {
              const copy = orderStatusCopy(order, status);
              const lower = normalizeStatus(status);
              const itemNames = Array.isArray(order.items) ? order.items.map((item) => String(Number.parseInt(item.quantity, 10) > 1 ? Number.parseInt(item.quantity, 10) + "× " : "") + String(item.name || "menu item")).join(", ") : "";
              const progress = ["ready","ready for serving","ready for pickup","ready for collection","completed","served","delivered"].includes(lower) ? "ready" : (["preparing","in progress","in preparation","cooking"].includes(lower) ? "preparing" : "confirmed");
              const estimateDate = estimate instanceof HTMLElement ? parseDate(estimate.dataset.readyAt || "") : parseDate(order.estimated_ready_at || "");
              const remaining = estimateDate ? Math.max(0, Math.ceil((estimateDate.getTime() - Date.now()) / 60000)) : null;
              const estimateText = ["ready","ready for serving","ready for pickup","ready for collection","completed","served","delivered"].includes(lower) ? "Your order is ready now." : (remaining === null ? "Time estimate unavailable" : remaining === 0 ? "Expected shortly — please check with staff if delayed" : "About " + remaining + (remaining === 1 ? " minute remaining" : " minutes remaining"));
              queueStatusAlert(copy.title, copy.message, {
                items: itemNames || "Your room-service order",
                code: String(order.order_code || ""),
                quantity: "",
                status: friendlyStatus(status),
                estimate: estimateText,
                progress,
                photo: String(order.photo || "")
              });
            }
            seenOrderStatuses.set(key, status);
          });

          const liveRequests = payload.requests || [];
          const openRequestStatuses = new Set([
            "new", "pending", "assigned", "acknowledged", "accepted", "in progress", "on hold"
          ]);
          const openRequestCount = liveRequests.filter((request) =>
            openRequestStatuses.has(normalizeStatus(request.status))
          ).length;
          const openRequestValue = document.querySelector(".stats .stat:nth-child(3) .stat-value");
          if (openRequestValue) openRequestValue.textContent = String(openRequestCount);
          const liveExtensions = payload.extensions || [];
          const mergedRecent = [
            ...liveRequests.map((request) => ({ ...request, _kind: "request" })),
            ...liveExtensions.map((extension) => ({ ...extension, _kind: "extension" })),
          ].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
          updateRecentRequests(mergedRecent);

          liveRequests.forEach((request) => {
            const key = String(request.request_code || "");
            const status = String(request.status || "Pending");
            const previous = seenRequestStatuses.get(key);
            let card = document.querySelector('[data-live-request="' + CSS.escape(key) + '"]');
            const isNewRequest = hasBaseline && previous === undefined;
            if (!card) card = addLiveRequest(request);
            const badge = card?.querySelector("[data-live-status]");
            if (badge instanceof HTMLElement) badge.textContent = friendlyStatus(status);
            if (isNewRequest) {
              showToast("New service request", String(request.description || `Request ${key}`));
            }
            if (hasBaseline && previous !== undefined && normalizeStatus(previous) !== normalizeStatus(status)) {
              const description = String(request.description || card?.querySelector(".record-title")?.textContent || "").trim();
              const statusLabel = friendlyStatus(status);
              const lower = normalizeStatus(status);
              const title = ["completed", "complete", "resolved", "done"].includes(lower)
                ? "Your service request is complete"
                : (["rejected", "cancelled", "canceled"].includes(lower) ? "Service request update" : "Service request in progress");
              const details = description ? ' ("' + description + '")' : "";
              queueStatusAlert(title, "Request " + key + details + " is now " + statusLabel + ".", {
                kind: "request",
                items: description || "Service request",
                code: key,
                quantity: "",
                status: statusLabel,
                service_type: String(request.service_type || ""),
                assigned_department: String(request.assigned_department || ""),
                request_kind: String(request.request_kind || "")
              });
            }
            seenRequestStatuses.set(key, status);
          });

          liveExtensions.forEach((extension) => {
            const key = String(extension.id || "");
            const status = String(extension.status || "REQUESTED");
            const previous = seenExtensionStatuses.get(key);
            let card = document.querySelector('[data-live-extension="' + CSS.escape(key) + '"]');
            const isNewExtension = hasBaseline && previous === undefined;
            if (!card) card = addLiveExtension(extension);
            const badge = card?.querySelector("[data-live-status]");
            if (badge instanceof HTMLElement) badge.textContent = extensionStatusLabel(status);
            if (card) {
              card.querySelector(".extension-decline-note")?.remove();
              if (status.toUpperCase() === "REJECTED" && extension.review_note) {
                const note = document.createElement("p");
                note.className = "record-meta extension-decline-note";
                note.textContent = `Declined: ${String(extension.review_note)}`;
                card.append(note);
              }
            }
            if (isNewExtension) {
              showToast("Stay extension requested", `To ${formatExtensionDate(extension.requested_checkout)} · ${Number(extension.extra_nights || 0)} night(s).`);
            }
            if (hasBaseline && previous !== undefined && normalizeStatus(previous) !== normalizeStatus(status)) {
              if (status.toUpperCase() === "APPROVED") {
                queueStatusAlert("Stay extension approved", `Your stay now ends on ${formatExtensionDate(extension.requested_checkout)}. The extra nights were added to your folio.`, { kind: "extension" });
              } else if (status.toUpperCase() === "REJECTED") {
                queueStatusAlert("Stay extension declined", extension.review_note ? `Reason: ${String(extension.review_note)}` : "Contact the front desk for details.", { kind: "extension" });
              }
            }
            seenExtensionStatuses.set(key, status);
          });
          if (extensionList) updateActivityCount("extension", extensionList.querySelectorAll("[data-live-extension]").length);
          hasBaseline = true;
          lastLiveFailureNotice = false;
          updateCountdowns();
        } catch (error) {
          if (!lastLiveFailureNotice) {
            console.warn("Guest portal live updates temporarily unavailable.");
            showToast("Live updates temporarily unavailable", "Your portal is still open, but we could not refresh your order and service statuses. We will try again automatically.");
            lastLiveFailureNotice = true;
          }
        } finally {
          pollInProgress = false;
        }
      };
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") poll();
      });
      poll();
      window.setInterval(poll, 5000);
      updateCountdowns();
      window.setInterval(updateCountdowns, 1000);
    })();
  </script>
<?php endif; ?>
</body>
</html>

