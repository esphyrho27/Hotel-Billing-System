<?php
declare(strict_types=1);
require file_exists(__DIR__ . '/bootstrap.php') ? __DIR__ . '/bootstrap.php' : __DIR__ . '/api/bootstrap.php';
$token=(string)($_GET['t']??'');
$codeLookup=strtoupper(trim((string)($_GET['code']??$_POST['stay_code']??'')));
$stay=false;
if($token!=='') {
  $q=$pdo->prepare("SELECT pt.id token_id,pt.revoked_at,s.id stay_id,s.stay_code,s.status,s.checkin_at,s.planned_checkout,s.actual_checkout,s.room_id,s.customer_id,r.room_number,c.first_name,c.middle_name,c.last_name,c.email,c.contact_number,c.emergency_contact,c.address,c.id_number,c.nationality,c.id_type FROM portal_tokens pt JOIN stays s ON s.id=pt.stay_id JOIN rooms r ON r.id=s.room_id LEFT JOIN customers c ON c.customer_id=s.customer_id WHERE pt.token_hash=? AND pt.expires_at>NOW()");
  $q->execute([hash('sha256',$token)]);$stay=$q->fetch();
}
if(!$stay && $codeLookup!=='') {
  $q=$pdo->prepare("SELECT s.id stay_id,s.stay_code,s.status,s.checkin_at,s.planned_checkout,s.actual_checkout,s.room_id,s.customer_id,r.room_number,c.first_name,c.middle_name,c.last_name,c.email,c.contact_number,c.emergency_contact,c.address,c.id_number,c.nationality,c.id_type FROM stays s JOIN rooms r ON r.id=s.room_id LEFT JOIN customers c ON c.customer_id=s.customer_id WHERE UPPER(s.stay_code)=? ORDER BY s.id DESC LIMIT 1");
  $q->execute([$codeLookup]);$foundStay=$q->fetch();
  if($foundStay) {
    $newToken=bin2hex(random_bytes(32));
    $checkout=$foundStay['planned_checkout']?:date('Y-m-d',strtotime('+2 days'));
    $pdo->prepare('INSERT INTO portal_tokens(stay_id,token_hash,expires_at) VALUES(?,?,?)')->execute([$foundStay['stay_id'],hash('sha256',$newToken),$checkout.' 23:59:59']);
    header('Location: portal.php?t='.rawurlencode($newToken), true, 303);
    exit;
  }
}
$error='';$success='';

// The restaurant section below queries tables that databases built from the
// original dump do not have yet; create them on first use. The guard never
// throws, and the render queries below are additionally wrapped so the
// portal can never fail over a missing restaurant table.
if (function_exists('htl_ensure_restaurant_schema')) { try { htl_ensure_restaurant_schema($pdo); } catch(Throwable $e) {} }

// RESTAURANT AJAX ENDPOINTS FOR GUEST PORTAL
if ($stay && !empty($_GET['ajax'])) {
    header('Content-Type: application/json; charset=utf-8');
    if ($_GET['ajax'] === 'restaurant_menu') {
        $cats = $pdo->query("SELECT * FROM menu_categories ORDER BY menu_type, id")->fetchAll(PDO::FETCH_ASSOC);
        $items = $pdo->query("SELECT m.*, c.category_name, c.menu_type FROM menu_items m JOIN menu_categories c ON c.id=m.category_id ORDER BY c.menu_type, c.id, m.item_name")->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['ok' => true, 'categories' => $cats, 'items' => $items]);
        exit;
    }
    if ($_GET['ajax'] === 'restaurant_orders') {
        $ordStmt = $pdo->prepare("SELECT * FROM restaurant_orders WHERE stay_id=? ORDER BY created_at DESC");
        $ordStmt->execute([(int)$stay['stay_id']]);
        $orders = $ordStmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($orders as &$ord) {
            $itmStmt = $pdo->prepare("SELECT * FROM restaurant_order_items WHERE order_id=? ORDER BY id ASC");
            $itmStmt->execute([(int)$ord['id']]);
            $ord['items'] = $itmStmt->fetchAll(PDO::FETCH_ASSOC);
        }
        unset($ord);
        echo json_encode(['ok' => true, 'orders' => $orders]);
        exit;
    }
}
$isActive = ($stay && $stay['status']==='ACTIVE');
$isPending = ($stay && $stay['status']==='PENDING_PAYMENT');

$isSkipped = !empty($_GET['skip']) || !empty($_SESSION['skip_reg_' . ($stay ? $stay['stay_id'] : '')]);
if(!empty($_GET['skip']) && $stay) {
  $_SESSION['skip_reg_' . $stay['stay_id']] = true;
}
$showRegistrationFirst = ($stay && $isActive && empty($stay['customer_id']) && !$isSkipped);

if(!empty($_SESSION['portal_flash']) && is_array($_SESSION['portal_flash'])){$success=(string)($_SESSION['portal_flash']['success']??'');$error=(string)($_SESSION['portal_flash']['error']??'');unset($_SESSION['portal_flash']);}
// One-time form tokens prevent browser refresh/retry and rapid double-submit from creating duplicate requests.
if(!isset($_SESSION['portal_form_tokens']) || !is_array($_SESSION['portal_form_tokens'])) $_SESSION['portal_form_tokens']=[];
foreach($_SESSION['portal_form_tokens'] as $k=>$issued){if((int)$issued < time()-3600) unset($_SESSION['portal_form_tokens'][$k]);}
if($_SERVER['REQUEST_METHOD']==='POST' && $stay){
  $submittedNonce=(string)($_POST['portal_form_nonce']??'');
  if($submittedNonce==='' || !isset($_SESSION['portal_form_tokens'][$submittedNonce])) { $_SESSION['portal_flash']=['success'=>'','error'=>'This form was already submitted or expired. Please check your request list before submitting again.']; header('Location: portal.php?t='.rawurlencode($token),true,303); exit; }
  unset($_SESSION['portal_form_tokens'][$submittedNonce]);
  $action=(string)($_POST['portal_action']??'new_request');

  if(!$isActive && !in_array($action, ['register_guest','update_profile'], true)){
    $_SESSION['portal_flash']=['success'=>'','error'=>'This stay is already checked out. New service requests or room transfers cannot be submitted.'];
    header('Location: portal.php?t='.rawurlencode($token), true, 303);
    exit;
  }

    // RESTAURANT ORDER PLACEMENT
  if($action === 'place_restaurant_order') {
    $rawItems = $_POST['items'] ?? '[]';
    $cartItems = is_array($rawItems) ? $rawItems : json_decode((string)$rawItems, true);
    if (!is_array($cartItems) || empty($cartItems)) {
      $error = 'Your order cart is empty. Please select food or drinks to order.';
    } else {
      $orderType = trim((string)($_POST['order_type'] ?? 'Room Service'));
      $orderNotes = trim((string)($_POST['order_notes'] ?? ''));

      // Validate all items against database prices and availability
      $validatedLines = [];
      $totalAmount = 0.0;
      $itemStmt = $pdo->prepare("SELECT m.id, m.item_name, m.price, m.availability_status, c.category_name, c.menu_type FROM menu_items m JOIN menu_categories c ON c.id=m.category_id WHERE m.id=?");

      foreach ($cartItems as $line) {
        $itemId = (int)($line['id'] ?? $line['item_id'] ?? 0);
        $qty = max(1, min(99, (int)($line['quantity'] ?? $line['qty'] ?? 1)));
        if ($itemId <= 0) continue;

        $itemStmt->execute([$itemId]);
        $row = $itemStmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
          $error = "One of the selected items is no longer on the menu.";
          break;
        }
        if ($row['availability_status'] !== 'Available') {
          $error = "Item \"{$row['item_name']}\" is currently unavailable / sold out.";
          break;
        }

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

      if (empty($error) && !empty($validatedLines)) {
        $orderCode = 'RO-' . strtoupper(bin2hex(random_bytes(4)));
        $itemDescriptions = array_map(
          static fn(array $line): string => "{$line['quantity']}x {$line['item_name']}",
          $validatedLines
        );
        $requestDescription = implode(', ', $itemDescriptions) . ($orderNotes ? " (Note: {$orderNotes})" : '');

        try {
          $pdo->beginTransaction();
          $ordStmt = $pdo->prepare("INSERT INTO restaurant_orders (order_code, customer_id, stay_id, room_number, order_type, notes, total_amount, order_status, payment_status) VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending', 'Unpaid')");
          $ordStmt->execute([
            $orderCode,
            !empty($stay['customer_id']) ? (int)$stay['customer_id'] : null,
            (int)$stay['stay_id'],
            $stay['room_number'] ?? null,
            $orderType,
            $orderNotes ?: null,
            $totalAmount
          ]);
          $newOrderId = (int)$pdo->lastInsertId();

          $lineStmt = $pdo->prepare("INSERT INTO restaurant_order_items (order_id, item_id, item_name, category_name, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)");
          foreach ($validatedLines as $vl) {
            $lineStmt->execute([
              $newOrderId,
              $vl['item_id'],
              $vl['item_name'],
              $vl['category_name'],
              $vl['quantity'],
              $vl['unit_price'],
              $vl['subtotal']
            ]);
          }

          $requestStmt = $pdo->prepare("INSERT INTO service_requests (stay_id, request_code, service_type, assigned_department, status, description, chargeable, price) VALUES (?, ?, 'FOOD_BEVERAGE', 'restaurant', 'PENDING', ?, 1, ?)");
          $requestStmt->execute([(int)$stay['stay_id'], $orderCode, $requestDescription, $totalAmount]);
          $requestId = (int)$pdo->lastInsertId();
          $pdo->prepare("INSERT INTO service_request_history (request_id, from_status, to_status, assigned_department, notes) VALUES (?, NULL, 'PENDING', 'restaurant', 'Guest order submitted from guest portal')")
            ->execute([$requestId]);

          audit($pdo, null, 'RESTAURANT_ORDER_PLACED', 'restaurant_order', $newOrderId, [
            'order_code' => $orderCode,
            'total_amount' => $totalAmount,
            'order_type' => $orderType,
            'room_number' => $stay['room_number'] ?? null
          ]);
          $pdo->commit();

          ws_broadcast('RESTAURANT_ORDER_CREATED', [
            'id' => $newOrderId,
            'order_code' => $orderCode,
            'customer_name' => trim(($stay['first_name']??'') . ' ' . ($stay['last_name']??'')) ?: 'In-House Guest',
            'room_number' => $stay['room_number'] ?? null,
            'order_type' => $orderType,
            'total_amount' => $totalAmount,
            'order_status' => 'Pending',
            'items' => $validatedLines,
            'notes' => $orderNotes
          ], 'restaurant', 'restaurant', $stay['stay_code']);

          $success = "Order #{$orderCode} placed successfully! Restaurant staff is preparing it.";
        } catch (Throwable $e) {
          if ($pdo->inTransaction()) {
            $pdo->rollBack();
          }
          error_log('Guest restaurant order failed: ' . $e->getMessage());
          $error = 'We could not submit your order. Please check your order list and try again.';
        }
      }
    }
  }

  // RESTAURANT ORDER CANCELLATION BY GUEST
  if($action === 'cancel_restaurant_order') {
    $cancelOrderId = (int)($_POST['order_id'] ?? 0);
    $chkStmt = $pdo->prepare("SELECT * FROM restaurant_orders WHERE id=? AND stay_id=?");
    $chkStmt->execute([$cancelOrderId, (int)$stay['stay_id']]);
    $orderToCancel = $chkStmt->fetch(PDO::FETCH_ASSOC);

    if (!$orderToCancel) {
      $error = 'Order not found or does not belong to this stay.';
    } elseif (!in_array($orderToCancel['order_status'], ['Pending', 'Confirmed'], true)) {
      $error = "Order cannot be cancelled because its status is already {$orderToCancel['order_status']}. Please contact the restaurant.";
    } else {
      try {
        $pdo->beginTransaction();
        $pdo->prepare("UPDATE restaurant_orders SET order_status='Cancelled', updated_at=NOW() WHERE id=?")->execute([$cancelOrderId]);
        $requestQ = $pdo->prepare("SELECT id, status FROM service_requests WHERE request_code=?");
        $requestQ->execute([$orderToCancel['order_code']]);
        $linkedRequest = $requestQ->fetch(PDO::FETCH_ASSOC);
        if ($linkedRequest) {
          $pdo->prepare("UPDATE service_requests SET status='CANCELLED' WHERE id=?")->execute([(int)$linkedRequest['id']]);
          $pdo->prepare("INSERT INTO service_request_history (request_id, from_status, to_status, assigned_department, notes) VALUES (?, ?, 'CANCELLED', 'restaurant', 'Cancelled by guest via guest portal')")
            ->execute([(int)$linkedRequest['id'], $linkedRequest['status']]);
        }
        audit($pdo, null, 'RESTAURANT_ORDER_CANCELLED', 'restaurant_order', $cancelOrderId, [
          'order_code' => $orderToCancel['order_code'],
          'cancelled_by' => 'Guest'
        ]);
        $pdo->commit();

        ws_broadcast('RESTAURANT_ORDER_STATUS_CHANGED', [
          'id' => $cancelOrderId,
          'order_code' => $orderToCancel['order_code'],
          'order_status' => 'Cancelled',
          'room_number' => $orderToCancel['room_number']
        ], 'restaurant', 'restaurant', $stay['stay_code']);

        $success = "Order #{$orderToCancel['order_code']} has been cancelled.";
      } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
          $pdo->rollBack();
        }
        error_log('Guest restaurant order cancellation failed: ' . $e->getMessage());
        $error = 'We could not cancel your order. Please refresh your order list and try again.';
      }
    }
  }
  if($action==='register_guest' || $action==='update_profile'){
    $firstName=trim((string)($_POST['first_name']??''));
    $middleName=trim((string)($_POST['middle_name']??''));
    $lastName=trim((string)($_POST['last_name']??''));
    $contactNumber=trim((string)($_POST['contact_number']??''));
    $email=trim((string)($_POST['email']??''));
    $nationality=trim((string)($_POST['nationality']??'Filipino'));
    $idType=trim((string)($_POST['id_type']??''));
    $idNumber=trim((string)($_POST['id_number']??''));
    $address=trim((string)($_POST['address']??''));
    $emergencyContact=trim((string)($_POST['emergency_contact']??''));

    if($firstName===''||strlen($firstName)>100){
      $error='Please enter your first name.';
    } elseif($lastName===''||strlen($lastName)>100){
      $error='Please enter your last name.';
    } elseif($contactNumber!=='' && strlen($contactNumber)>30){
      $error='Please enter a valid mobile / contact number or leave it empty.';
    } elseif($email!=='' && (!filter_var($email,FILTER_VALIDATE_EMAIL)||strlen($email)>150)){
      $error='Please enter a valid email address or leave it empty.';
    } else {
      if(!empty($stay['customer_id'])){
        $cStmt=$pdo->prepare("UPDATE customers SET first_name=?, middle_name=?, last_name=?, email=?, contact_number=?, emergency_contact=?, address=?, id_number=?, nationality=?, id_type=? WHERE customer_id=?");
        $cStmt->execute([
          $firstName,
          $middleName?:'',
          $lastName,
          $email?:'',
          $contactNumber?:'',
          $emergencyContact?:'',
          $address?:'',
          $idNumber?:'',
          $nationality?:'Filipino',
          $idType?:'',
          (int)$stay['customer_id']
        ]);
        $customerId=(int)$stay['customer_id'];
        $success='Guest profile updated successfully.';
      } else {
        $cStmt=$pdo->prepare("INSERT INTO customers (first_name, middle_name, last_name, email, contact_number, emergency_contact, address, id_number, nationality, id_type, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)");
        $cStmt->execute([
          $firstName,
          $middleName?:'',
          $lastName,
          $email?:'',
          $contactNumber?:'',
          $emergencyContact?:'',
          $address?:'',
          $idNumber?:'',
          $nationality?:'Filipino',
          $idType?:''
        ]);
        $customerId=(int)$pdo->lastInsertId();
        $pdo->prepare("UPDATE stays SET customer_id=? WHERE id=?")->execute([$customerId, $stay['stay_id']]);
        $stay['customer_id'] = $customerId;
        $success='Your guest profile has been successfully registered. Welcome!';
      }
      $fullName=trim($firstName.' '.($middleName?$middleName.' ':'').$lastName);
      audit($pdo, null, 'GUEST_PROFILE_SAVED', 'stay', (int)$stay['stay_id'], [
        'customer_id' => $customerId,
        'guest_name' => $fullName,
        'contact_number' => $contactNumber,
        'stay_code' => $stay['stay_code']
      ]);
      ws_broadcast('GUEST_REGISTERED', [
        'stay_id' => (int)$stay['stay_id'],
        'stay_code' => $stay['stay_code'],
        'room_number' => $stay['room_number'],
        'customer_id' => $customerId,
        'guest_name' => $fullName,
        'first_name' => $firstName,
        'last_name' => $lastName,
        'contact_number' => $contactNumber,
        'email' => $email
      ], null, 'frontdesk', $stay['stay_code']);
    }
  } elseif($action==='cancel_request'){
    $rid=(int)($_POST['request_id']??0);
    $rq = $pdo->prepare("SELECT * FROM service_requests WHERE id=? AND stay_id=? AND status IN ('PENDING','NEW','ASSIGNED','ACKNOWLEDGED') AND request_kind='SERVICE'");
    $rq->execute([$rid, $stay['stay_id']]);
    $existing = $rq->fetch();
    if($existing){
      $oldStatus = $existing['status'];
      $q=$pdo->prepare("UPDATE service_requests SET status='CANCELLED' WHERE id=?");
      $q->execute([$rid]);
      $dept = normalize_department((string)($existing['assigned_department'] ?: $existing['service_type']));
      $pdo->prepare("INSERT INTO service_request_history (request_id, from_status, to_status, assigned_department, notes) VALUES (?, ?, 'CANCELLED', ?, 'Cancelled by guest via guest portal')")->execute([$rid, $oldStatus, $dept]);
      audit($pdo, null, 'GUEST_CANCEL_REQUEST', 'service_request', $rid, ['stay_code' => $stay['stay_code']]);
      ws_broadcast('REQUEST_CANCELLED', [
        'id' => $rid,
        'request_code' => $existing['request_code'],
        'stay_code' => $stay['stay_code'],
        'room_number' => $stay['room_number'],
        'status' => 'CANCELLED',
        'assigned_department' => $dept,
        'service_type' => $existing['service_type'],
        'description' => $existing['description']
      ], null, $dept, $stay['stay_code']);
      $success='Your request was cancelled.';
    } else {
      $error='This request can no longer be cancelled. Please contact the front desk.';
    }
  } elseif($action==='transfer_request'){
    $to=(int)($_POST['to_room_id']??0);$reason=trim((string)($_POST['transfer_reason']??''));
    $q=$pdo->prepare("SELECT id, room_number FROM rooms WHERE id=? AND status='AVAILABLE'");$q->execute([$to]);
    $requestedRoom=$q->fetch(PDO::FETCH_ASSOC);
    if(!$requestedRoom||$to===(int)$stay['room_id'])$error='Please choose an available room other than your current room.';
    elseif($reason===''||strlen($reason)>300)$error='Please provide a short reason for the room transfer.';
    else{
      $open=$pdo->prepare("SELECT COUNT(*) FROM service_requests WHERE stay_id=? AND request_kind='ROOM_TRANSFER' AND status IN ('NEW','PENDING','ASSIGNED','ACKNOWLEDGED','ACCEPTED','IN_PROGRESS')");
      $open->execute([$stay['stay_id']]);
      if((int)$open->fetchColumn()>0){
        $error='You already have an open room transfer request.';
      }else{
        $code='RQ'.strtoupper(bin2hex(random_bytes(4)));
        $desc='Guest requested room transfer. Reason: '.$reason;
        $q=$pdo->prepare("INSERT INTO service_requests(stay_id,request_code,service_type,assigned_department,status,request_kind,requested_room_id,description) VALUES(?,?,'FRONT_DESK','frontdesk','PENDING','ROOM_TRANSFER',?,?)");
        $q->execute([$stay['stay_id'],$code,$to,$desc]);
        $newReqId=(int)$pdo->lastInsertId();
        $pdo->prepare("INSERT INTO service_request_history (request_id, from_status, to_status, assigned_department, notes) VALUES (?, NULL, 'PENDING', 'frontdesk', 'Room transfer requested by guest via portal')")->execute([$newReqId]);
        audit($pdo,null,'GUEST_ROOM_TRANSFER_REQUEST','service_request',$newReqId,[
          'stay_code'=>$stay['stay_code'],
          'room_number'=>$stay['room_number'],
          'requested_room_id'=>$to
        ]);
        ws_broadcast('ROOM_TRANSFER_REQUESTED',[
          'id'=>$newReqId,
          'request_code'=>$code,
          'stay_code'=>$stay['stay_code'],
          'room_number'=>$stay['room_number'],
          'requested_room_id'=>$to,
          'requested_room_number'=>$requestedRoom['room_number'],
          'service_type'=>'FRONT_DESK',
          'request_kind'=>'ROOM_TRANSFER',
          'assigned_department'=>'frontdesk',
          'status'=>'PENDING',
          'description'=>$desc,
          'chargeable'=>0,
          'price'=>0
        ],null,'frontdesk',$stay['stay_code']);
        $success='Room transfer request submitted. The front desk must approve it before the room changes. Reference: '.$code;
      }
    }
  } else {
    $type=(string)($_POST['type']??'FRONT_DESK');$desc=trim((string)($_POST['description']??''));$itemId=(int)($_POST['catalog_item_id']??0);$quantity=max(1,min(99,(int)($_POST['quantity']??1)));$chargeable=0;$price=0;
    $allowedByType=['FOOD_BEVERAGE'=>['FOOD_BEVERAGE'],'BAR'=>['BAR','MINIBAR'],'HOUSEKEEPING'=>['HOUSEKEEPING','LAUNDRY'],'FRONT_DESK'=>['SERVICE'],'OTHER'=>['OTHER'],'MAINTENANCE'=>['MAINTENANCE'],'VALET'=>['VALET','PARKING']];
    if(!array_key_exists($type,$allowedByType))$error='Please choose a valid request type.';
    if(empty($error)&&$itemId>0){$mi=$pdo->prepare('SELECT name,category,description,price FROM service_catalog WHERE id=? AND active=1');$mi->execute([$itemId]);$item=$mi->fetch();if(!$item){$error='That menu item is no longer available. Please refresh and try again.';}elseif(!in_array($item['category'],$allowedByType[$type],true)){$error='That item does not belong to the selected request type. Please choose a matching item.';}else{$unitPrice=(float)$item['price'];$price=round($unitPrice*$quantity,2);$desc=trim($item['name'].' · Qty: '.$quantity.' · Unit price: ₱'.number_format($unitPrice,2).($item['description']?' — '.$item['description']:'').($desc?' · Guest note: '.$desc:''));$chargeable=$price>0?1:0;}}
    if(empty($error)&&(!in_array($type,['HOUSEKEEPING','FOOD_BEVERAGE','MAINTENANCE','FRONT_DESK','OTHER','BAR','VALET'],true)||$desc===''||strlen($desc)>500))$error='Please choose an item or describe the service you need.';
    elseif(empty($error)){
      $code='RQ'.strtoupper(bin2hex(random_bytes(4)));
      $assignedDept = normalize_department($type);
      $q=$pdo->prepare("INSERT INTO service_requests(stay_id,request_code,service_type,assigned_department,status,description,chargeable,price) VALUES(?,?,?,?,'PENDING',?,?,?)");
      $q->execute([$stay['stay_id'],$code,$type,$assignedDept,$desc,$chargeable,$chargeable?$price:0]);
      $newReqId = (int)$pdo->lastInsertId();
      $pdo->prepare("INSERT INTO service_request_history (request_id, from_status, to_status, assigned_department, notes) VALUES (?, NULL, 'PENDING', ?, 'Requested by guest via guest portal')")->execute([$newReqId, $assignedDept]);
      audit($pdo,null,'GUEST_REQUEST','service_request',$newReqId,['type'=>$type,'catalog_item_id'=>$itemId]);
      ws_broadcast('REQUEST_CREATED', [
        'id' => $newReqId,
        'request_code' => $code,
        'stay_code' => $stay['stay_code'],
        'room_number' => $stay['room_number'],
        'service_type' => $type,
        'assigned_department' => $assignedDept,
        'status' => 'PENDING',
        'description' => $desc,
        'chargeable' => $chargeable,
        'price' => $chargeable ? $price : 0
      ], null, $assignedDept, $stay['stay_code']);
      $success='Request received. Reference: '.$code;
    }
  }
  if (!empty($_POST['ajax']) || (isset($_SERVER['HTTP_ACCEPT']) && str_contains($_SERVER['HTTP_ACCEPT'], 'application/json'))) {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
      'ok' => empty($error),
      'success' => $success,
      'error' => $error,
      'action' => $action,
      'customer' => (!empty($customerId) ? [
        'customer_id' => $customerId,
        'first_name' => $firstName ?? '',
        'last_name' => $lastName ?? '',
        'full_name' => $fullName ?? '',
        'contact_number' => $contactNumber ?? '',
        'email' => $email ?? '',
        'nationality' => $nationality ?? '',
        'id_type' => $idType ?? '',
        'id_number' => $idNumber ?? ''
      ] : null),
      'request' => (!empty($newReqId) ? [
        'id' => $newReqId,
        'request_code' => $code ?? '',
        'stay_code' => $stay['stay_code'] ?? '',
        'description' => $desc ?? '',
        'chargeable' => $chargeable ?? 0,
        'price' => (!empty($chargeable) ? ($price ?? 0) : 0),
        'status' => 'PENDING',
        'created_at' => date('Y-m-d H:i:s'),
        'request_kind' => $action === 'transfer_request' ? 'ROOM_TRANSFER' : 'SERVICE',
        'requested_room' => $action === 'transfer_request' ? ($requestedRoom['room_number'] ?? null) : null
      ] : null)
    ]);
    exit;
  }
  $q=$pdo->prepare("SELECT pt.id token_id,pt.revoked_at,s.id stay_id,s.stay_code,s.status,s.checkin_at,s.planned_checkout,s.actual_checkout,s.room_id,s.customer_id,r.room_number,c.first_name,c.middle_name,c.last_name,c.email,c.contact_number,c.emergency_contact,c.address,c.id_number,c.nationality,c.id_type FROM portal_tokens pt JOIN stays s ON s.id=pt.stay_id JOIN rooms r ON r.id=s.room_id LEFT JOIN customers c ON c.customer_id=s.customer_id WHERE pt.token_hash=? AND pt.expires_at>NOW()");$q->execute([hash('sha256',$token)]);$stay=$q->fetch();
  $_SESSION['portal_flash']=['success'=>$success,'error'=>$error];
  header('Location: portal.php?t='.rawurlencode($token), true, 303);
  exit;
}
$formNonce=bin2hex(random_bytes(24)); $_SESSION['portal_form_tokens'][$formNonce]=time();
?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Guest Service Portal — Shesh Dev Hotel</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css">
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
<style>
/* Compact SweetAlert2 Dialog Styling */
.swal2-popup:not(.swal2-toast) {
  width: 23em !important;
  max-width: 90vw !important;
  padding: 1.25rem 1.25rem 1.1rem !important;
  border-radius: 12px !important;
  box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.15), 0 8px 10px -6px rgba(15, 23, 42, 0.1) !important;
}

.swal2-popup:not(.swal2-toast) .swal2-icon {
  font-size: 0.65rem !important;
  width: 5em !important;
  height: 5em !important;
  margin: 0.4rem auto 0.75rem !important;
  border-width: 0.25em !important;
  box-sizing: content-box !important;
}

.swal2-popup:not(.swal2-toast) .swal2-icon .swal2-icon-content {
  font-size: 3.75em !important;
}

/* Properly scale and center error 'X' mark lines */
.swal2-popup:not(.swal2-toast) .swal2-icon.swal2-error {
  border-color: #f27474 !important;
}

.swal2-popup:not(.swal2-toast) .swal2-icon.swal2-error .swal2-x-mark {
  position: relative !important;
  display: block !important;
  flex-grow: 1 !important;
  width: 100% !important;
  height: 100% !important;
}

.swal2-popup:not(.swal2-toast) .swal2-icon.swal2-error [class^="swal2-x-mark-line"] {
  display: block !important;
  position: absolute !important;
  top: 2.3125em !important;
  width: 2.9375em !important;
  height: 0.3125em !important;
  border-radius: 0.125em !important;
  background-color: #f27474 !important;
}

.swal2-popup:not(.swal2-toast) .swal2-icon.swal2-error [class^="swal2-x-mark-line"][class$="left"] {
  left: 1.0625em !important;
  transform: rotate(45deg) !important;
}

.swal2-popup:not(.swal2-toast) .swal2-icon.swal2-error [class^="swal2-x-mark-line"][class$="right"] {
  right: 1em !important;
  transform: rotate(-45deg) !important;
}

/* Modal close button ('×') */
.swal2-popup .swal2-close {
  font-family: inherit !important;
  font-size: 1.4rem !important;
  line-height: 1 !important;
  color: #94a3b8 !important;
  box-shadow: none !important;
}

.swal2-popup .swal2-close:hover {
  color: #ef4444 !important;
}

.swal2-popup:not(.swal2-toast) .swal2-title {
  font-size: 1.2rem !important;
  font-weight: 600 !important;
  padding: 0 0.5rem !important;
  margin-bottom: 0.35rem !important;
  color: #1e293b !important;
}

.swal2-popup:not(.swal2-toast) .swal2-html-container {
  font-size: 0.88rem !important;
  line-height: 1.45 !important;
  padding: 0 0.5rem !important;
  margin: 0.25rem 0 0 !important;
  color: #475569 !important;
}

.swal2-popup:not(.swal2-toast) .swal2-input,
.swal2-popup:not(.swal2-toast) .swal2-textarea {
  font-size: 0.88rem !important;
  margin: 0.75rem auto 0 !important;
  height: auto !important;
  padding: 0.45rem 0.75rem !important;
  border-radius: 6px !important;
  border: 1px solid #cbd5e1 !important;
}

.swal2-popup:not(.swal2-toast) .swal2-actions {
  margin: 1.1rem auto 0 !important;
  gap: 0.5rem !important;
}

.swal2-popup:not(.swal2-toast) .swal2-styled {
  font-size: 0.85rem !important;
  padding: 0.42rem 1.2rem !important;
  border-radius: 6px !important;
  font-weight: 500 !important;
}

:root {
  --brand-primary: #1e293b;
  --brand-primary-dark: #0f172a;
  --brand-accent: #2563eb;
  --brand-accent-hover: #1d4ed8;
  --bg-body: #f6f7f9;
  --bg-card: #ffffff;
  --border-color: #e2e8f0;
  --border-subtle: #f1f5f9;
  --text-main: #0f172a;
  --text-muted: #64748b;
  --text-light: #94a3b8;
  --success-bg: #f0fdf4;
  --success-text: #15803d;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  font-family: 'Plus Jakarta Sans', Manrope, system-ui, -apple-system, sans-serif;
}
body.portal {
  display: block;
  padding: 24px;
  background: var(--bg-body);
  min-height: 100vh;
  color: var(--text-main);
  -webkit-font-smoothing: antialiased;
}
.portal-card {
  width: min(100%, 1180px);
  margin: 0 auto;
  padding: clamp(20px, 3.5vw, 36px);
  background: var(--bg-card);
  border-radius: 16px;
  box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.05);
  border: 1px solid var(--border-color);
}
.portal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 18px;
  padding-bottom: 22px;
  border-bottom: 1px solid var(--border-color);
}
.eyebrow {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: .08em;
  font-weight: 800;
  margin-bottom: 4px;
}
.portal-header h1 {
  font: 800 clamp(26px, 4vw, 36px) Manrope, sans-serif;
  color: var(--text-main);
  margin: 5px 0 6px;
  letter-spacing: -0.02em;
}
.portal-tag {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  background: var(--success-bg);
  color: var(--success-text);
  border: 1px solid #bbf7d0;
  border-radius: 99px;
  padding: 7px 14px;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}
.portal-tag::before {
  content: '●';
  font-size: 10px;
}
.portal-tag.checked-out {
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #cbd5e1;
}
.portal-tag.checked-out::before {
  content: '✓';
  font-size: 11px;
}
.portal-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin: 20px 0;
}
.portal-stat {
  background: #f8fafc;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 17px 20px;
}
.portal-stat .label {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: .08em;
  font-weight: 800;
}
.portal-stat .value {
  font: 800 24px Manrope, sans-serif;
  color: var(--text-main);
  margin-top: 7px;
}
.balance-panel, .subcard.balance-panel {
  background: var(--brand-primary) !important;
  color: #ffffff !important;
  border-radius: 16px;
  padding: 22px 24px;
  margin: 16px 0;
  box-shadow: 0 4px 16px -2px rgba(23, 44, 69, 0.25);
  border: none !important;
}
.balance-panel .small {
  color: #d3e0e9 !important;
}
.balance {
  font: 800 2rem Manrope, sans-serif;
  margin: .25rem 0;
  color: #ffffff !important;
}
.balance-panel details {
  margin-top: 14px;
}
.balance-panel summary {
  cursor: pointer;
  font-weight: 700;
  font-size: 14px;
  color: #ffffff !important;
  outline: none;
}
.balance-panel table {
  color: #ffffff !important;
  margin-top: 10px;
}
.balance-panel td, .balance-panel th {
  border-color: rgba(255, 255, 255, 0.15) !important;
  color: #ffffff !important;
}
.portal-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin: 16px 0;
}
.subcard {
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  border-radius: 16px;
  padding: 22px;
  min-width: 0;
}
.subcard h2 {
  font: 800 18px Manrope, sans-serif;
  color: var(--text-main);
  margin: 0 0 12px;
}
.status {
  font-weight: 800;
}
.small {
  font-size: .88rem;
  color: var(--text-muted);
  line-height: 1.45;
}
.portal-card form {
  margin-top: 14px;
}
.portal-card label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 14px;
}
.portal-card input,
.portal-card select,
.portal-card textarea {
  width: 100%;
  display: block;
  margin-top: 6px;
  padding: 10px 12px;
  font-size: 14px;
  color: var(--text-main);
  background: #ffffff;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  outline: none;
  font-family: inherit;
  transition: border-color .15s, box-shadow .15s;
}
.portal-card input:focus,
.portal-card select:focus,
.portal-card textarea:focus {
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 2px rgba(32, 57, 78, 0.15);
}
button {
background: var(--brand-primary);
  color: #ffffff;
  border: none;
  border-radius: 8px;
  padding: 11px 20px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all .15s ease;
  margin-top: 6px;
  font-family: inherit;
 box-shadow: 0 2px 6px rgba(32, 57, 78, 0.2);
}
button:hover:not(:disabled) {
 background: var(--brand-primary-dark);
 box-shadow: 0 4px 12px rgba(32, 57, 78, 0.3);
}
button:disabled {
  opacity: .5;
  cursor: not-allowed;
}
button.secondary {
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fee2e2;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 700;
  border-radius: 6px;
  margin-top: 0;
  box-shadow: none;
}
button.secondary:hover {
  background: #fee2e2;
}
button.subtle-btn {
  background: #f1f5f9;
  color: #334155;
  border: 1px solid #cbd5e1;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 700;
  border-radius: 8px;
  margin-top: 0;
  box-shadow: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
button.subtle-btn:hover {
  background: #e2e8f0;
  color: #0f172a;
}
.guest-profile-card {
  margin: 16px 0;
}
.profile-meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 12px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid #e2e8f0;
  font-size: 13px;
}
.profile-form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}
.table-wrap {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
}
td, th {
  text-align: left;
  padding: 11px;
  border-bottom: 1px solid var(--border-color);
  vertical-align: top;
}
th {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: .05em;
  font-weight: 800;
}
.request-status {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 99px;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
  letter-spacing: 0.3px;
}
.request-status.PENDING, .request-status.NEW { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
.request-status.ASSIGNED { background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; }
.request-status.ACKNOWLEDGED, .request-status.ACCEPTED { background: #dbeafe; color: #1d4ed8; border: 1px solid #bfdbfe; }
.request-status.IN_PROGRESS { background: #e0e7ff; color: #4338ca; border: 1px solid #c7d2fe; }
.request-status.ON_HOLD { background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; }
.request-status.COMPLETED { background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; }
.request-status.CANCELLED { background: #f3f4f6; color: #4b5563; border: 1px solid #e5e7eb; }
.request-status.REJECTED { background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; }
.request-status.ERROR { background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; }
.notice {
  padding: 12px 16px;
  border-radius: 10px;
  margin: 16px 0;
  font-size: 14px;
  font-weight: 600;
}
.notice.success {
  background: var(--success-bg);
  color: var(--success-text);
  border: 1px solid #bbf7d0;
}
.notice.error {
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fecaca;
}
.invalid-box {
  text-align: center;
  padding: 40px 20px;
}
.invalid-box h2 {
  font-size: 20px;
  margin-bottom: 8px;
}

/* ── Modern Card-Based Requests List (Mobile-First) ── */
.subcard-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}
.subcard-head h2 {
  margin: 0;
  font: 800 18px Manrope, sans-serif;
}
.badge-count {
  font-size: 11px;
  font-weight: 700;
  padding: 3px 9px;
  background: #f1f5f9;
  color: #475569;
  border-radius: 99px;
}
.requests-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.request-card-item {
  background: #ffffff;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 15px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
  transition: all .15s ease;
}
.request-card-item:hover {
  border-color: #cbd5e1;
  box-shadow: 0 3px 10px rgba(15, 23, 42, 0.06);
}
.request-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding-bottom: 10px;
  border-bottom: 1px solid #f1f5f9;
}
.request-code-badge {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: 0.5px;
}
.request-card-body {
  padding-top: 10px;
}
.request-title-text {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
  line-height: 1.45;
  word-break: break-word;
}
.request-sub-note {
  font-size: 13px;
  color: #64748b;
  margin-top: 4px;
  line-height: 1.4;
  word-break: break-word;
}
.request-tags-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}
.request-price-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  padding: 3px 8px;
  border-radius: 6px;
  color: #334155;
  font-weight: 600;
}
.request-price-pill strong {
  color: #0f172a;
}
.request-free-pill {
  font-size: 12px;
  background: #f0fdf4;
  color: #15803d;
  border: 1px solid #bbf7d0;
  padding: 3px 8px;
  border-radius: 6px;
  font-weight: 700;
}
.request-time-pill {
  font-size: 11px;
  color: #94a3b8;
}
.request-card-actions {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid #f1f5f9;
  display: flex;
  justify-content: flex-end;
}
.kind-badge {
  display: inline-block;
  background: #eff6ff;
  color: #1d4ed8;
  border: 1px solid #bfdbfe;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 5px;
  margin-right: 4px;
}
.empty-requests-card {
  text-align: center;
  padding: 28px 16px;
  color: #64748b;
  font-size: 14px;
  background: #f8fafc;
  border-radius: 12px;
  border: 1px dashed #cbd5e1;
}

/* ── Mobile Responsive Overhauls ── */
@media(max-width: 720px) {
  body.portal {
    padding: 10px 8px;
  }
  .portal-card {
    padding: 16px 14px;
    border-radius: 18px;
  }
  .portal-header {
    display: block;
    padding-bottom: 16px;
  }
  .portal-header h1 {
    font-size: 24px;
    line-height: 1.25;
  }
  .portal-tag {
    margin-top: 10px;
  }
  .portal-stats {
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    gap: 8px !important;
    margin: 14px 0 !important;
  }
  .portal-stat {
    padding: 10px 6px !important;
    border-radius: 10px !important;
    text-align: center;
  }
  .portal-stat .label {
    font-size: 9px !important;
    letter-spacing: .02em !important;
  }
  .portal-stat .value {
    font-size: 16px !important;
    margin-top: 3px !important;
  }
  .portal-stat .small {
    display: none;
  }
  .balance-panel {
    padding: 16px 14px !important;
    border-radius: 14px !important;
    margin: 14px 0 !important;
  }
  .balance {
    font-size: 1.75rem !important;
  }
  .portal-grid {
    grid-template-columns: 1fr !important;
    gap: 14px !important;
    margin: 14px 0 !important;
  }
  .subcard {
    padding: 16px 14px !important;
    border-radius: 14px !important;
  }
  .portal-card input,
  .portal-card select,
  .portal-card textarea {
    font-size: 15px !important;
    padding: 11px 12px !important;
    border-radius: 9px !important;
  }
  button:not(.secondary):not(.scroll-top-btn):not(.subtle-btn) {
    width: 100% !important;
    min-height: 40px !important;
    padding: 9px 14px !important;
    font-size: 14px !important;
    border-radius: 8px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
  }
  select,
  .portal-card select {
    font-size: 13.5px !important;
    padding: 7px 28px 7px 10px !important;
    min-height: 34px !important;
    border-radius: 6px !important;
    max-width: 100% !important;
  }
  select option,
  .portal-card select option {
    font-size: 13.5px !important;
    padding: 6px 10px !important;
    color: #0f172a !important;
    background: #ffffff !important;
  }
  .request-card-item {
    padding: 13px 12px !important;
    border-radius: 12px !important;
  }
  .request-title-text {
    font-size: 14px !important;
    line-height: 1.4 !important;
  }
  .request-sub-note {
    font-size: 12.5px !important;
  }
}

/* ── Floating Scroll-Up Helper with Safe-Area Insets ── */
.scroll-top-btn {
  position: fixed !important;
  bottom: calc(20px + env(safe-area-inset-bottom, 0px)) !important;
  right: calc(20px + env(safe-area-inset-right, 0px)) !important;
  width: 44px !important;
  height: 44px !important;
  min-width: 44px !important;
  min-height: 44px !important;
  border-radius: 50% !important;
  background: var(--brand-primary, #1e293b) !important;
  color: #ffffff !important;
  border: 1px solid rgba(255, 255, 255, 0.2) !important;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.3) !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  cursor: pointer !important;
  opacity: 0;
  visibility: hidden;
  transform: translateY(14px) scale(0.9);
  transition: opacity 0.25s ease, transform 0.25s ease, visibility 0.25s ease, background 0.15s ease, box-shadow 0.15s ease;
  z-index: 9999 !important;
  -webkit-tap-highlight-color: transparent;
  padding: 0 !important;
  margin: 0 !important;
  line-height: 1 !important;
  outline: none !important;
}
.scroll-top-btn.visible {
  opacity: 0.94 !important;
  visibility: visible !important;
  transform: translateY(0) scale(1) !important;
}
.scroll-top-btn:hover {
  opacity: 1 !important;
  background: #0f172a !important;
  transform: translateY(-2px) scale(1.06) !important;
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.4) !important;
  color: #ffffff !important;
}
.scroll-top-btn:active {
  transform: translateY(0) scale(0.95) !important;
}
.scroll-top-btn svg {
  width: 22px !important;
  height: 22px !important;
  display: block !important;
  margin: auto !important;
  stroke: #ffffff !important;
  color: #ffffff !important;
  pointer-events: none !important;
  flex-shrink: 0 !important;
}

@media (max-width: 576px) {
  .scroll-top-btn {
    bottom: calc(16px + env(safe-area-inset-bottom, 0px)) !important;
    right: calc(16px + env(safe-area-inset-right, 0px)) !important;
    width: 42px !important;
    height: 42px !important;
    min-width: 42px !important;
    min-height: 42px !important;
  }
  .scroll-top-btn svg {
    width: 20px !important;
    height: 20px !important;
  }
}
/* 🍽️ RESTAURANT FOOD & DRINKS ORDERING SYSTEM */
.rest-card {
  background: var(--bg-card);
  border-radius: var(--radius-card, 16px);
  border: 1px solid var(--border-color);
  box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.06);
  padding: clamp(16px, 3vw, 26px);
  margin-top: 24px;
}
.rest-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 12px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
}
.rest-header h2 {
  font-size: clamp(20px, 2.5vw, 24px);
  font-weight: 800;
  color: var(--text-main);
  margin: 0 0 4px 0;
  display: flex;
  align-items: center;
  gap: 10px;
}
.rest-nav-pills {
  display: flex;
  gap: 8px;
  margin-top: 16px;
  flex-wrap: wrap;
}
.rest-tab-btn {
  padding: 8px 18px;
  border-radius: 30px;
  border: 1px solid var(--border-color);
  background: #ffffff;
  color: var(--text-main);
  font-size: 13.5px;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s ease;
}
.rest-tab-btn.active {
  background: #0f172a;
  color: #ffffff;
  border-color: #0f172a;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.15);
}
.rest-tab-btn .badge-pill {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 12px;
  background: rgba(0,0,0,0.06);
  color: inherit;
}
.rest-tab-btn.active .badge-pill {
  background: rgba(255,255,255,0.22);
}
.rest-filter-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin: 16px 0 12px;
}
.rest-search-input {
  flex-grow: 1;
  max-width: 320px;
  padding: 8px 14px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  font-size: 13.5px;
  outline: none;
  background: #f8fafc;
}
.rest-search-input:focus {
  border-color: #0f172a;
  background: #ffffff;
}
.rest-cat-scroll {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 8px;
  margin-bottom: 16px;
  scrollbar-width: thin;
}
.rest-cat-pill {
  padding: 6px 14px;
  border-radius: 20px;
  border: 1px solid var(--border-color);
  background: #f8fafc;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
}
.rest-cat-pill.active {
  background: #0284c7;
  color: #ffffff;
  border-color: #0284c7;
}
.rest-cat-pill:hover:not(.active) {
  background: #e2e8f0;
  color: var(--text-main);
}
.rest-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
  margin-top: 10px;
}
.rest-item-card {
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: #ffffff;
  padding: 14px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  position: relative;
}
.rest-item-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px -4px rgba(15, 23, 42, 0.08);
}
.rest-item-card.sold-out {
  opacity: 0.72;
  background: #f8fafc;
}
.rest-item-badge-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.rest-cat-tag {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 6px;
  background: #f1f5f9;
  color: #475569;
}
.rest-avail-tag {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 6px;
}
.rest-avail-tag.available {
  background: #ecfdf5;
  color: #059669;
  border: 1px solid #a7f3d0;
}
.rest-avail-tag.sold-out {
  background: #f1f5f9;
  color: #94a3b8;
  border: 1px solid #e2e8f0;
}
.rest-item-title {
  font-size: 15px;
  font-weight: 800;
  color: var(--text-main);
  margin-bottom: 4px;
  line-height: 1.35;
}
.rest-item-desc {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.4;
  margin-bottom: 12px;
  flex-grow: 1;
}
.rest-item-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid #f1f5f9;
  padding-top: 10px;
  margin-top: 8px;
}
.rest-item-price {
  font-size: 16px;
  font-weight: 800;
  color: #0f172a;
}
.rest-qty-btn-group {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  background: #ffffff;
}
.rest-qty-btn-group button {
  width: 28px !important;
  height: 28px !important;
  min-width: 28px !important;
  min-height: 28px !important;
  padding: 0 !important;
  background: #f8fafc;
  border: none;
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.rest-qty-btn-group button:hover {
  background: #e2e8f0;
}
.rest-qty-val {
  width: 26px;
  text-align: center;
  font-size: 12.5px;
  font-weight: 800;
  color: #0f172a;
}
.rest-add-cart-btn {
  padding: 7px 14px !important;
  font-size: 12.5px !important;
  font-weight: 700 !important;
  border-radius: 8px !important;
  background: #0f172a !important;
  color: #ffffff !important;
  border: none !important;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: background 0.15s ease;
}
.rest-add-cart-btn:hover {
  background: #1e293b !important;
}
.rest-add-cart-btn:disabled {
  background: #cbd5e1 !important;
  cursor: not-allowed;
}

/* Floating Sticky Cart Bar */
.rest-floating-cart {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  width: min(92%, 520px);
  background: #0f172a;
  color: #ffffff;
  padding: 12px 18px;
  border-radius: 16px;
  box-shadow: 0 10px 25px -3px rgba(15, 23, 42, 0.4);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  z-index: 9998;
  animation: slideUpCart 0.3s ease;
}
@keyframes slideUpCart {
  from { transform: translate(-50%, 100%); opacity: 0; }
  to { transform: translate(-50%, 0); opacity: 1; }
}
.rest-cart-drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  z-index: 10000;
  display: none;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.rest-cart-drawer {
  background: #ffffff;
  border-radius: 18px;
  max-width: 580px;
  width: 100%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20px 40px -10px rgba(15, 23, 42, 0.3);
}
.rest-cart-header {
  padding: 16px 20px;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.rest-cart-body {
  padding: 16px 20px;
  overflow-y: auto;
  flex-grow: 1;
}
.rest-cart-footer {
  padding: 16px 20px;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
}
.rest-order-card-item {
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: #ffffff;
  padding: 16px;
  margin-bottom: 12px;
}
.rest-order-card-item:hover {
  border-color: #cbd5e1;
}

/* Design 2 — Boutique Hotel Guest Portal */
:root{--design2-navy:#10243b;--design2-gold:#e9ad4f;--design2-ink:#10233f;--design2-muted:#71829a;--design2-border:#e6edf5}
body{background:#f4f6fa!important;color:var(--design2-ink)!important;font-family:"Plus Jakarta Sans",Inter,"Segoe UI",Arial,sans-serif!important}
.portal-card{width:min(1500px,calc(100% - 24px))!important;margin:12px auto!important;padding:clamp(12px,2vw,26px)!important;border:1px solid #e7edf5!important;border-radius:22px!important;background:#fff!important;box-shadow:0 12px 40px rgba(16,36,59,.07)!important}
.portal-header{position:relative;isolation:isolate;overflow:hidden;margin:-26px -26px 20px!important;padding:34px clamp(18px,3vw,42px) 26px!important;min-height:205px;color:#fff!important;border:0!important;border-radius:21px 21px 0 0;background:linear-gradient(90deg,rgba(7,20,34,.88),rgba(7,20,34,.28)),url('/assets/hotel-hero.jpg') center 48%/cover no-repeat!important}
.portal-header h1{color:#fff!important;font-family:Georgia,"Times New Roman",serif!important;font-size:clamp(30px,4vw,48px)!important;letter-spacing:-.035em!important;line-height:1.08!important}
.portal-header .eyebrow{color:#f2c777!important;letter-spacing:.16em!important}
.portal-header p,.portal-header .small,.portal-header span{color:#eef3fa!important}
.portal-header .portal-tag,.portal-header button{color:#10233f!important}
.portal-stats{gap:12px!important;margin:18px 0!important}
.portal-stat{background:rgba(255,255,255,.98)!important;border:1px solid #e3eaf3!important;border-radius:14px!important;padding:15px 18px!important;box-shadow:0 8px 24px rgba(0,0,0,.07)!important}
.portal-stat .label{font-size:11px!important;letter-spacing:.02em!important;color:#6b7b92!important}
.portal-stat .value{font-size:25px!important;color:#10233f!important;font-weight:800!important}
.balance-panel{background:linear-gradient(135deg,#0d2137,#173651)!important;border:1px solid rgba(233,173,79,.4)!important;border-radius:16px!important;box-shadow:0 10px 26px rgba(16,36,59,.18)!important}
.subcard,.rest-card{border:1px solid var(--design2-border)!important;border-radius:17px!important;box-shadow:0 4px 16px rgba(16,36,59,.035)!important}
.rest-card[aria-labelledby="guestMenuTitle"]{border:0!important;border-radius:18px!important;padding:clamp(14px,2vw,26px)!important;box-shadow:none!important;background:#fff!important}
.rest-menu-eyebrow{color:#a66c20;font-weight:800;letter-spacing:.15em;font-size:10px;margin-bottom:5px}
#guestMenuTitle{font-family:Georgia,"Times New Roman",serif!important;color:#10233f!important;font-size:clamp(26px,3vw,36px)!important;letter-spacing:-.035em!important}
.rest-header{border-bottom:1px solid #edf1f6!important}
.rest-nav-pills{gap:9px!important;margin:18px 0!important}
.rest-tab-btn{border-radius:999px!important;padding:10px 16px!important;border:1px solid #e1e8f0!important;background:#fff!important;color:#3e5069!important;font-weight:700!important}
.rest-tab-btn.active{background:#10243b!important;color:#fff!important;border-color:#10243b!important}
.rest-search-input{border:1px solid #e0e8f2!important;background:#f7f9fc!important;border-radius:13px!important;min-height:44px!important;padding:12px 15px!important}
.rest-cat-scroll{gap:9px!important;padding:4px 1px 12px!important}
.rest-cat-pill{border-radius:999px!important;padding:9px 14px!important;border:1px solid #e2e9f2!important;background:#fff!important;color:#53647c!important}
.rest-cat-pill.active{background:#10243b!important;color:#fff!important;border-color:#10243b!important}
.rest-grid{grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:16px!important}
.rest-item-card{padding:0!important;overflow:hidden!important;border:1px solid #e7edf5!important;border-radius:15px!important;box-shadow:0 4px 14px rgba(16,36,59,.05)!important;background:#fff!important;display:flex!important;flex-direction:column!important;min-width:0!important}
.rest-item-card:hover{transform:translateY(-3px)!important;box-shadow:0 12px 28px rgba(16,36,59,.12)!important}
.rest-item-photo-wrap{width:100%!important;aspect-ratio:1.8/1!important;overflow:hidden!important;margin:0 0 10px!important;border-radius:0!important;background:#edf2f7!important;position:relative!important}
.rest-item-photo-wrap img{display:block!important;width:100%!important;height:100%!important;object-fit:cover!important}
.rest-photo-placeholder{height:100%;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:5px;background:linear-gradient(135deg,#f8fafc,#edf2f7);color:#94a3b8;text-align:center;padding:10px}
.rest-photo-placeholder span:first-child{font-size:27px}
.rest-photo-placeholder span:nth-child(2){font-size:11px;font-weight:700}
.rest-photo-placeholder small{font-size:10px}
.rest-item-card>div:not(.rest-item-photo-wrap){padding-left:12px!important;padding-right:12px!important}
.rest-item-title{font-size:15px!important;font-weight:800!important;color:#10233f!important}
.rest-item-desc{font-size:12px!important;line-height:1.45!important;color:#71829a!important;min-height:32px!important}
.rest-item-footer{padding:10px 12px 13px!important;gap:8px!important;align-items:center!important;margin-top:auto!important}
.rest-item-price{font-size:16px!important;font-weight:850!important;color:#10233f!important}
.rest-add-cart-btn{background:#10243b!important;color:#fff!important;border-radius:10px!important;min-height:35px!important;padding:8px 13px!important}
.rest-qty-btn-group{border:1px solid #d8e1ec!important;border-radius:9px!important;overflow:hidden!important}
.rest-floating-cart{position:sticky!important;bottom:12px!important;z-index:50!important;width:100%!important;margin:18px 0!important;padding:15px 20px!important;border-radius:16px!important;background:linear-gradient(105deg,#0c2035,#173550)!important;color:#fff!important;box-shadow:0 14px 32px rgba(16,36,59,.22)!important}
.rest-floating-cart .rest-add-cart-btn{background:var(--design2-gold)!important;color:#15243a!important;border-radius:999px!important;padding:12px 20px!important;min-height:42px!important}
.request-summary-grid{gap:10px!important}
.request-summary-tile{border-radius:13px!important;background:#f8fafc!important}
.request-filter-btn.active{background:#10243b!important;border-color:#10243b!important}
.request-card-item{border-radius:15px!important;border-color:#e4ebf4!important;background:#fff!important}
@media(max-width:1050px){.rest-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}}
@media(max-width:720px){
 .portal-card{width:calc(100% - 12px)!important;margin:6px auto!important;padding:12px!important;border-radius:17px!important}
 .portal-header{margin:-12px -12px 14px!important;padding:24px 16px 20px!important;min-height:180px!important;border-radius:16px 16px 0 0!important}
 .portal-header h1{font-size:30px!important}
 .portal-stats{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:7px!important}
 .portal-stat{padding:10px 8px!important}
 .portal-stat .value{font-size:18px!important}
 .portal-stat .label{font-size:9px!important}
 .rest-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important}
 .rest-item-photo-wrap{aspect-ratio:1.35/1!important}
 .rest-item-title{font-size:13px!important}
 .rest-item-desc{font-size:11px!important}
 .rest-item-footer{align-items:flex-start!important;flex-direction:column!important}
 .rest-floating-cart{padding:12px!important}
}


/* Layout repair: correct width, hero image, and cart positioning */
body.portal{padding:16px!important;overflow-x:hidden!important}
.portal-card{width:min(1500px,calc(100% - 0px))!important;max-width:1500px!important;margin:0 auto!important;padding:26px!important;overflow:visible!important}
.portal-header{position:relative!important;isolation:isolate!important;overflow:hidden!important;display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:18px!important;padding:34px 28px 28px!important;min-height:220px!important;margin:-26px -26px 20px!important;border:0!important;border-radius:21px 21px 0 0!important;background:linear-gradient(90deg,rgba(7,20,34,.88),rgba(7,20,34,.28)),url('/assets/hotel-hero.jpg') center 52%/cover no-repeat!important;color:#fff!important}
.portal-header h1{font-family:Georgia,"Times New Roman",serif!important;font-size:clamp(32px,4vw,50px)!important;line-height:1.08!important;color:#fff!important;letter-spacing:-.035em!important;margin:12px 0 8px!important}
.portal-header .eyebrow{color:#f0c675!important;letter-spacing:.16em!important}
.portal-header p.small,.portal-header .small{color:#eef3fa!important;max-width:650px!important;font-size:14px!important;line-height:1.55!important}
/* The first-time registration screen stays clean and does not inherit the dashboard hero */
.registration-first-view>.portal-header{background:#fff!important;color:var(--text-main)!important;min-height:0!important;margin:0 0 22px!important;padding:0 0 22px!important;border-bottom:1px solid var(--border-color)!important;border-radius:0!important}
.registration-first-view>.portal-header h1{font-family:inherit!important;font-size:clamp(24px,3.5vw,32px)!important;color:var(--text-main)!important}
.registration-first-view>.portal-header .eyebrow,.registration-first-view>.portal-header p.small{color:var(--text-muted)!important}
.rest-card[aria-labelledby="guestMenuTitle"]{width:100%!important;min-width:0!important;overflow:hidden!important}
.rest-grid{width:100%!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:16px!important}
.rest-item-card{min-width:0!important}
.rest-item-photo-wrap img{display:block!important;width:100%!important;height:100%!important;object-fit:cover!important}
.rest-floating-cart{position:fixed!important;left:50%!important;right:auto!important;bottom:max(16px,env(safe-area-inset-bottom))!important;transform:translateX(-50%)!important;width:min(900px,calc(100vw - 32px))!important;max-width:900px!important;margin:0!important;z-index:9998!important;box-sizing:border-box!important}
.request-summary-grid,.request-filter-bar,.requests-list{width:100%!important;min-width:0!important}
@media(max-width:1050px){.rest-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}}
@media(max-width:720px){
 body.portal{padding:7px!important}
 .portal-card{width:100%!important;padding:12px!important;border-radius:16px!important}
 .portal-header{margin:-12px -12px 15px!important;padding:24px 15px 20px!important;min-height:190px!important;border-radius:15px 15px 0 0!important;flex-direction:column!important}
 .portal-header h1{font-size:32px!important}
 .portal-header>div:last-child{align-self:flex-end!important}
 .registration-first-view>.portal-header{margin:0 0 16px!important;padding:0 0 16px!important}
 .rest-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important}
 .rest-floating-cart{width:calc(100vw - 20px)!important;bottom:max(8px,env(safe-area-inset-bottom))!important;padding:12px!important}
}


/* Food-only menu, four-item preview and professional request history */
.menu-view-all-wrap{display:flex;justify-content:center;padding:18px 0 6px}
.menu-view-all-btn{border:1px solid #d9e2ee!important;background:#fff!important;color:#10243b!important;border-radius:999px!important;padding:11px 22px!important;font-weight:750!important;font-size:13px!important;box-shadow:0 4px 14px rgba(16,36,59,.07)!important;cursor:pointer}
.menu-view-all-btn:hover{background:#f4f7fb!important;border-color:#b8c7d9!important}
section.subcard:has(>.subcard-head h2){border:1px solid #e4ebf4!important;border-radius:20px!important;padding:clamp(15px,2vw,24px)!important;background:linear-gradient(180deg,#fff,#fbfcfe)!important;box-shadow:0 10px 30px rgba(16,36,59,.055)!important}
section.subcard>.subcard-head{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;padding-bottom:16px!important;margin-bottom:14px!important;border-bottom:1px solid #e9eef5!important}
section.subcard>.subcard-head h2{font-family:Georgia,"Times New Roman",serif!important;font-size:clamp(23px,2.5vw,30px)!important;letter-spacing:-.025em!important;color:#10243b!important;margin:0!important}
section.subcard>.subcard-head .badge-count{background:#eef3f8!important;color:#344963!important;border-radius:999px!important;padding:7px 11px!important;font-weight:750!important;font-size:12px!important;white-space:nowrap}
.requests-list{display:grid!important;gap:11px!important}
.request-card-item{position:relative!important;display:block!important;border:1px solid #e5ebf3!important;border-radius:15px!important;background:#fff!important;padding:16px 18px!important;box-shadow:0 3px 12px rgba(16,36,59,.025)!important;transition:border-color .18s ease,box-shadow .18s ease!important}
.request-card-item:hover{border-color:#cad6e5!important;box-shadow:0 8px 20px rgba(16,36,59,.06)!important}
.request-card-header{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;padding:0 0 12px!important;margin-bottom:12px!important;border-bottom:1px solid #edf1f6!important}
.request-code-badge{font-family:ui-monospace,SFMono-Regular,Menlo,monospace!important;font-size:11px!important;letter-spacing:.035em!important;color:#53657d!important;font-weight:750!important}
.request-status{border-radius:999px!important;padding:6px 10px!important;font-size:10px!important;font-weight:800!important;letter-spacing:.035em!important;text-transform:uppercase!important;white-space:nowrap!important}
.request-card-body{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;align-items:center!important;column-gap:16px!important;row-gap:9px!important;padding:0!important}
.request-card-body>div:first-child{font-size:14px!important;line-height:1.5!important;font-weight:750!important;color:#172b45!important}
.request-card-body .request-price-pill{justify-self:end!important;white-space:nowrap!important;background:#f6f8fb!important;border:1px solid #e4eaf2!important;border-radius:9px!important;padding:8px 11px!important;color:#43536a!important;font-size:12px!important}
.request-card-body .request-time-pill{font-size:11px!important;color:#8a98aa!important;white-space:nowrap!important}
@media(max-width:600px){section.subcard:has(>.subcard-head h2){padding:13px!important;border-radius:16px!important}.request-card-item{padding:13px!important}.request-card-body{grid-template-columns:1fr!important}.request-card-body .request-price-pill{justify-self:start!important}.request-card-body .request-time-pill{white-space:normal!important}.menu-view-all-btn{width:100%!important}}


/* ===== Food-delivery compact ordering polish + direct bill + service totals ===== */
#guestPanelFood .rest-card[aria-labelledby="guestMenuTitle"]{background:#f7f8fa!important;padding:20px 22px 112px!important}
#guestPanelFood .rest-header{padding:2px 48px 12px 0!important}
#guestPanelFood #guestMenuTitle{font-size:clamp(23px,2vw,29px)!important;letter-spacing:-.035em!important;margin:4px 0!important}
#guestPanelFood .rest-header .small{font-size:12px!important;color:#718096!important}
#guestPanelFood .rest-nav-pills{gap:7px!important;margin:10px 0 13px!important}
#guestPanelFood .rest-tab-btn{padding:8px 13px!important;border-radius:999px!important;font-size:12px!important}
#guestPanelFood .rest-filter-row{gap:10px!important;margin-bottom:10px!important}
#guestPanelFood .rest-grid{grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:12px!important}
#guestPanelFood .rest-item-card{border-radius:12px!important;box-shadow:0 2px 8px rgba(16,36,59,.045)!important;transition:box-shadow .15s ease!important}
#guestPanelFood .rest-item-card:hover{transform:none!important;box-shadow:0 5px 14px rgba(16,36,59,.09)!important}
#guestPanelFood .rest-item-photo-wrap{height:clamp(94px,10vw,132px)!important;min-height:0!important}
#guestPanelFood .rest-item-photo-wrap img{height:100%!important;object-fit:cover!important}
#guestPanelFood .rest-item-card>div:not(.rest-item-photo-wrap){padding-left:10px!important;padding-right:10px!important}
#guestPanelFood .rest-item-title{font-size:12px!important;line-height:1.35!important;min-height:32px!important}
#guestPanelFood .rest-item-desc{font-size:10px!important;line-height:1.4!important;max-height:2.8em!important;overflow:hidden!important}
#guestPanelFood .rest-item-price{font-size:13px!important;font-weight:800!important}
#guestPanelFood .rest-qty-btn-group button{width:27px!important;height:27px!important;min-width:27px!important}
#guestPanelFood .rest-floating-cart{position:absolute!important;left:18px!important;right:18px!important;bottom:14px!important;transform:none!important;width:auto!important;max-width:none!important;margin:0!important;padding:11px 14px!important;border-radius:13px!important;z-index:30!important;box-shadow:0 8px 26px rgba(16,36,59,.2)!important}
#guestPanelFood .rest-floating-cart strong{font-size:12px!important}
#guestPanelFood .rest-floating-cart .small{font-size:11px!important}
#guestPanelFood .rest-floating-cart .rest-add-cart-btn{padding:10px 16px!important;min-height:38px!important;font-size:12px!important;white-space:nowrap!important}
#guestPanelFood .rest-cart-drawer{max-height:min(82dvh,720px)!important;border-radius:18px 18px 0 0!important}
#guestPanelFood .rest-cart-header{position:sticky!important;top:0!important;z-index:4!important;background:#fff!important}
#guestPanelFood .rest-cart-header .subtle-btn{width:36px!important;height:36px!important;font-size:0!important;border-radius:50%!important;position:relative!important}
#guestPanelFood .rest-cart-header .subtle-btn::before{content:'×';font-size:25px!important;font-weight:300!important;line-height:1!important}
#guestPanelService .service-quantity-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:10px 0 4px;padding:10px 12px;border:1px solid #e3e9f1;border-radius:12px;background:#fff}
#guestPanelService .service-quantity-row>label{margin:0;font-size:13px;font-weight:700;color:#34465d}
#guestPanelService .service-quantity-control{display:flex;align-items:center;gap:8px}
#guestPanelService .service-quantity-control button{width:34px;height:34px;border:1px solid #dbe3ed;border-radius:9px;background:#f8fafc;font-size:20px;color:#23364e;cursor:pointer}
#guestPanelService .service-quantity-control input{width:54px;text-align:center;border:1px solid #dbe3ed;border-radius:9px;padding:7px 4px;font-weight:750}
#guestPanelService .service-price-detail,#guestPanelService .service-total-label{font-size:11px;color:#64748b;margin-top:4px}
#guestPanelService #portalPriceBox{gap:14px!important}
#guestPanelService #portalPriceBox>div:last-child{display:flex;flex-direction:column;align-items:flex-end;gap:4px}
.guest-billing-content{padding:20px 24px 26px;overflow:auto;min-height:0}
.guest-bill-total{display:flex;flex-direction:column;gap:5px;padding:18px;border-radius:15px;background:linear-gradient(135deg,#10243b,#1c4563);color:#fff;margin-bottom:22px}
.guest-bill-total>span{font-size:12px;color:#d4deea}.guest-bill-total>strong{font-size:30px;letter-spacing:-.04em}.guest-bill-total>small{font-size:11px;color:#d4deea}
.guest-billing-content h3{font-size:16px;margin:0 0 12px;color:#172b45}
.guest-bill-line{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;padding:13px 0;border-bottom:1px solid #e8edf3}
.guest-bill-line>div{min-width:0;display:flex;flex-direction:column;gap:4px}.guest-bill-line strong{font-size:13px;line-height:1.4;color:#26384f}.guest-bill-line small{font-size:10px;color:#8a98aa}.guest-bill-line>b{font-size:13px;white-space:nowrap;color:#26384f}
.guest-bill-empty{padding:16px;background:#fff;border:1px dashed #d8e0ea;border-radius:12px;color:#64748b;font-size:13px}
.guest-bill-summary-row{display:flex;justify-content:space-between;gap:12px;padding:10px 0;font-size:13px;color:#5c6d82}.guest-bill-summary-row strong{color:#26384f;white-space:nowrap}.guest-bill-balance-row{border-top:1px solid #dce4ed;margin-top:5px;padding-top:15px;font-size:15px;font-weight:800;color:#172b45}.guest-bill-balance-row strong{font-size:18px;color:#10243b}.guest-bill-note{margin:16px 0 0;padding:12px;background:#f0f4f8;border-radius:10px;color:#63748a;font-size:11px;line-height:1.5}
@media(max-width:900px){#guestPanelFood .rest-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}}
@media(max-width:600px){#guestPanelFood .rest-card[aria-labelledby="guestMenuTitle"]{padding:16px 12px 104px!important}#guestPanelFood .rest-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:9px!important}#guestPanelFood .rest-item-photo-wrap{height:105px!important}#guestPanelFood .rest-item-title{font-size:12px!important}#guestPanelFood .rest-floating-cart{left:10px!important;right:10px!important;bottom:10px!important;padding:10px!important}#guestPanelFood .guest-panel-floating-close{position:sticky!important;float:right!important;top:8px!important;right:auto!important;margin-left:auto!important;margin-bottom:-42px!important}#guestPanelBilling .guest-billing-content{padding:15px 13px 22px}.guest-bill-total>strong{font-size:27px}#guestPanelService .service-quantity-row{padding:9px}}

/* ===== Mobile-first responsive repair (override legacy desktop rules) ===== */
html,body{max-width:100%;overflow-x:clip!important}
*,*::before,*::after{box-sizing:border-box}
img,svg,video,canvas{max-width:100%;height:auto}
.portal-card{width:100%!important;max-width:1500px!important;min-width:0!important;margin:0 auto!important}
.portal-grid{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;gap:16px!important;min-width:0!important}
.portal-grid>*{min-width:0!important;width:100%!important}
.subcard,.rest-card,.request-card-item,.portal-stat,.balance-panel{min-width:0!important;max-width:100%!important}
.portal-header{min-width:0!important;background-position:center!important}
.portal-stats{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important}
.portal-stat{overflow-wrap:anywhere!important}
.rest-card[aria-labelledby="guestMenuTitle"]{min-width:0!important;width:100%!important}
.rest-nav-pills,.request-filter-bar{max-width:100%!important}
.rest-nav-pills{display:flex!important;flex-wrap:wrap!important}
.rest-cat-scroll{display:flex!important;flex-wrap:nowrap!important;overflow-x:auto!important;overflow-y:hidden!important;max-width:100%!important;scrollbar-width:thin!important;-webkit-overflow-scrolling:touch!important}
.rest-cat-pill{flex:0 0 auto!important;white-space:nowrap!important}
.rest-grid{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:14px!important;min-width:0!important}
.rest-item-card{width:100%!important;min-width:0!important;overflow:hidden!important}
.rest-item-title,.rest-item-desc{overflow-wrap:anywhere!important;word-break:normal!important}
.rest-item-footer{display:flex!important;flex-wrap:wrap!important;min-width:0!important}
.rest-qty-btn-group{max-width:100%!important}
.requests-list{min-width:0!important}
.request-card-item{overflow:hidden!important}
.request-card-body{min-width:0!important}
.request-card-body>*{min-width:0!important;overflow-wrap:anywhere!important}
.menu-view-all-wrap{padding:14px 0 4px!important}
@media(max-width:900px){
 .portal-grid{grid-template-columns:minmax(0,1fr)!important;gap:14px!important}
 .rest-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:12px!important}
 .portal-card{padding:18px!important}
 .portal-header{margin:-18px -18px 16px!important;padding:26px 22px!important}
}
@media(max-width:640px){
 html,body{width:100%!important;overflow-x:hidden!important}
 body.portal{padding:0!important}
 .portal-card{width:100%!important;max-width:100%!important;margin:0!important;padding:12px!important;border-radius:0!important;box-shadow:none!important}
 .portal-header{margin:-12px -12px 14px!important;padding:22px 15px 18px!important;min-height:0!important;border-radius:0!important;gap:12px!important}
 .portal-header h1{font-size:clamp(27px,8vw,36px)!important;line-height:1.08!important;max-width:100%!important}
 .portal-header p,.portal-header .small{font-size:12px!important;line-height:1.5!important}
 .portal-header button,.portal-header a{max-width:100%!important}
 .portal-stats{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:7px!important;margin:12px 0!important}
 .portal-stat{padding:10px 8px!important;border-radius:11px!important}
 .portal-stat .label{font-size:9px!important;line-height:1.25!important;overflow-wrap:anywhere!important}
 .portal-stat .value{font-size:clamp(15px,4.5vw,20px)!important;line-height:1.15!important;overflow-wrap:anywhere!important}
 .balance-panel{padding:14px!important}
 .portal-grid{grid-template-columns:minmax(0,1fr)!important;gap:12px!important}
 .subcard{padding:14px!important;border-radius:14px!important}
 .subcard h2{font-size:19px!important}
 label,select,input,textarea{max-width:100%!important}
 input,select,textarea{font-size:16px!important}
 .rest-card[aria-labelledby="guestMenuTitle"]{padding:13px!important;border-radius:15px!important}
 #guestMenuTitle{font-size:25px!important;line-height:1.15!important}
 .rest-nav-pills{display:flex!important;flex-wrap:nowrap!important;overflow-x:auto!important;gap:7px!important;padding:2px 0 7px!important}
 .rest-tab-btn{flex:0 0 auto!important;white-space:nowrap!important;padding:9px 12px!important;font-size:12px!important}
 .rest-search-input{width:100%!important;min-width:0!important}
 .rest-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:9px!important}
 .rest-item-card{border-radius:12px!important}
 .rest-item-photo-wrap{aspect-ratio:1.25/1!important;min-height:95px!important;max-height:155px!important}
 .rest-item-card>div:not(.rest-item-photo-wrap){padding-left:9px!important;padding-right:9px!important}
 .rest-item-title{font-size:12px!important;line-height:1.3!important;min-height:0!important}
 .rest-item-desc{font-size:11px!important;line-height:1.35!important;min-height:0!important}
 .rest-item-badge-row{gap:4px!important;flex-wrap:wrap!important}
 .rest-cat-tag,.rest-avail-tag{font-size:9px!important;max-width:100%!important}
 .rest-item-footer{padding:8px 9px 10px!important;display:flex!important;flex-direction:column!important;align-items:stretch!important;gap:7px!important}
 .rest-item-price{font-size:14px!important}
 .rest-qty-btn-group{width:100%!important;display:flex!important;justify-content:space-between!important}
 .rest-add-cart-btn{width:100%!important;justify-content:center!important;min-height:34px!important;padding:7px 8px!important}
 .menu-view-all-btn{width:100%!important;min-height:42px!important}
 .rest-floating-cart{left:8px!important;right:8px!important;bottom:max(8px,env(safe-area-inset-bottom))!important;transform:none!important;width:auto!important;max-width:none!important;padding:10px 12px!important;border-radius:14px!important;display:flex!important;align-items:center!important;gap:10px!important}
 .rest-floating-cart>*{min-width:0!important}
 .request-summary-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:6px!important}
 .request-summary-tile{padding:9px 7px!important;gap:5px!important}
 .request-summary-tile span{font-size:9px!important;line-height:1.25!important}
 .request-summary-tile strong{font-size:18px!important}
 .request-filter-bar{display:flex!important;flex-wrap:nowrap!important;overflow-x:auto!important;gap:6px!important;padding-bottom:6px!important;-webkit-overflow-scrolling:touch!important}
 .request-filter-btn{flex:0 0 auto!important;white-space:nowrap!important;padding:8px 11px!important}
 section.subcard:has(>.subcard-head h2){padding:12px!important;border-radius:15px!important}
 section.subcard>.subcard-head{align-items:flex-start!important}
 section.subcard>.subcard-head h2{font-size:23px!important}
 .request-card-item{padding:12px!important;border-radius:12px!important}
 .request-card-header{gap:8px!important;align-items:flex-start!important}
 .request-code-badge{font-size:10px!important;overflow-wrap:anywhere!important}
 .request-status{font-size:9px!important;padding:5px 7px!important;white-space:normal!important;text-align:center!important}
 .request-card-body{grid-template-columns:minmax(0,1fr)!important;gap:8px!important}
 .request-card-body .request-price-pill{justify-self:start!important;white-space:normal!important}
 .request-card-body .request-time-pill{white-space:normal!important}
 .request-card-item button,.request-card-item a{max-width:100%!important}
}
@media(max-width:360px){
 .portal-stats{grid-template-columns:1fr!important}
 .portal-stat{display:flex!important;align-items:center!important;justify-content:space-between!important}
 .rest-grid{grid-template-columns:minmax(0,1fr)!important}
 .rest-item-photo-wrap{aspect-ratio:1.8/1!important;max-height:none!important}
 .rest-item-footer{flex-direction:row!important;align-items:center!important;flex-wrap:wrap!important}
 .rest-qty-btn-group{width:auto!important;flex:1 1 100px!important}
 .rest-add-cart-btn{width:auto!important;flex:1 1 90px!important}
 .request-summary-grid{grid-template-columns:1fr!important}
 .request-summary-tile{flex-direction:row!important;align-items:center!important}
}


.guest-action-dashboard{margin:20px 0;padding:clamp(15px,2vw,24px);background:#fff;border:1px solid #e4ebf4;border-radius:20px;box-shadow:0 8px 28px rgba(16,36,59,.05)}
.guest-action-heading h2{font:700 clamp(22px,2.5vw,30px) Georgia,serif;color:#10243b;margin:5px 0}.guest-action-heading p{margin:0;color:#71829a;font-size:13px}
.guest-action-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:18px}
.guest-action-tile{appearance:none;text-align:left;display:flex;flex-direction:column;align-items:flex-start;gap:9px;min-width:0;padding:17px;border:1px solid #e5ebf3;border-radius:16px;background:linear-gradient(180deg,#fff,#f9fbfd);color:#10243b;cursor:pointer}
.guest-action-tile:hover{border-color:#bdcddd;box-shadow:0 8px 20px #10243b12}.guest-action-tile.tile-food{background:linear-gradient(145deg,#fff6e6,#fff);border-color:#f0dfbf}
.guest-action-icon{display:grid;place-items:center;width:42px;height:42px;border-radius:13px;background:#edf2f8;font-size:22px}.tile-food .guest-action-icon{background:#ffebc8}
.guest-action-tile strong{font-size:15px}.guest-action-tile small{font-size:12px;line-height:1.4;color:#71829a;min-height:32px}.guest-action-link{margin-top:auto;font-size:12px;font-weight:800;color:#173550}
.guest-panel-overlay{display:none;position:fixed;inset:0;z-index:9500;background:rgba(10,24,40,.6);backdrop-filter:blur(5px);padding:24px;align-items:center;justify-content:center}
.guest-panel-overlay.is-open{display:flex}.guest-panel-dialog{position:relative;width:min(780px,100%);max-height:90dvh;overflow:auto;overscroll-behavior:contain;background:#f8fafc;border-radius:22px;box-shadow:0 28px 90px #030e1c55;padding:22px}.guest-panel-dialog-wide{width:min(1180px,100%);padding:18px}
.guest-panel-header{display:flex;align-items:flex-start;justify-content:space-between;gap:15px;padding-bottom:15px;margin-bottom:15px;border-bottom:1px solid #e4ebf4}
.guest-panel-header h2{font:700 clamp(23px,3vw,30px) Georgia,serif;color:#10243b;margin:4px 0}.guest-panel-header p{font-size:13px;color:#71829a;margin:0}
.guest-panel-close{flex:0 0 40px;width:40px;height:40px;border:1px solid #e1e8f0;border-radius:50%;background:white;color:#10243b;font-size:25px;line-height:1;cursor:pointer}
.guest-panel-floating-close{position:sticky;top:0;float:right;z-index:3}.guest-panel-primary{border:0;border-radius:11px;background:#10243b;color:white;font-weight:750;padding:12px 17px}
body.guest-panel-open{overflow:hidden!important}
@media(max-width:900px){.guest-action-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.guest-panel-overlay{padding:14px}}
@media(max-width:600px){.guest-action-dashboard{padding:13px;margin:14px 0;border-radius:16px}.guest-action-grid{gap:8px;margin-top:12px}.guest-action-tile{padding:12px;border-radius:13px;gap:7px}.guest-action-tile strong{font-size:13px}.guest-action-tile small{font-size:11px;min-height:0}.guest-action-icon{width:36px;height:36px;font-size:19px}.guest-action-link{font-size:11px}.guest-panel-overlay{padding:0;align-items:stretch}.guest-panel-dialog,.guest-panel-dialog-wide{width:100%;max-width:none;height:100dvh;max-height:100dvh;border-radius:0;padding:14px 12px calc(18px + env(safe-area-inset-bottom))}.guest-panel-header{padding-top:4px}.guest-panel-floating-close{position:fixed;top:8px;right:8px}}
@media(max-width:360px){.guest-action-grid{grid-template-columns:1fr}.guest-action-tile{display:grid;grid-template-columns:38px minmax(0,1fr);column-gap:10px}.guest-action-icon{grid-row:span 3}.guest-action-tile small,.guest-action-link{grid-column:2}}


/* Final polish: seamless surfaces, consistent spacing, aligned close controls */
.guest-action-dashboard{margin:24px 0 28px!important;padding:clamp(18px,2.4vw,30px)!important;border:1px solid #e8edf4!important;border-radius:22px!important;background:linear-gradient(145deg,#fff 0%,#fbfcfe 100%)!important;box-shadow:0 10px 34px rgba(16,36,59,.055)!important}
.guest-action-heading{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:16px!important}
.guest-action-heading h2{margin:5px 0 7px!important;font-size:clamp(24px,2.7vw,32px)!important;line-height:1.15!important;letter-spacing:-.035em!important}
.guest-action-heading p{max-width:560px!important;line-height:1.55!important}
.guest-action-grid{gap:14px!important;margin-top:22px!important}
.guest-action-tile{position:relative!important;min-height:188px!important;padding:18px!important;border-radius:17px!important;border-color:#e7edf4!important;background:#fff!important;box-shadow:0 2px 8px rgba(16,36,59,.025)!important;transition:transform .2s ease,border-color .2s ease,box-shadow .2s ease!important}
.guest-action-tile:hover,.guest-action-tile:focus-visible{transform:translateY(-2px)!important;border-color:#cbd7e5!important;box-shadow:0 12px 28px rgba(16,36,59,.085)!important}
.guest-action-icon{flex:0 0 44px!important;width:44px!important;height:44px!important;border-radius:14px!important}
.guest-action-tile strong{font-size:15px!important;letter-spacing:-.015em!important}
.guest-action-tile small{font-size:12px!important;line-height:1.5!important;min-height:36px!important}
.guest-action-link{display:flex!important;align-items:center!important;gap:6px!important;margin-top:auto!important;padding-top:5px!important}
.guest-panel-overlay{padding:24px!important;background:rgba(9,22,38,.55)!important;backdrop-filter:blur(8px) saturate(115%)!important;-webkit-backdrop-filter:blur(8px) saturate(115%)!important}
.guest-panel-dialog{position:relative!important;display:flex!important;flex-direction:column!important;width:min(780px,100%)!important;max-height:min(88dvh,900px)!important;overflow:hidden!important;padding:0!important;border:1px solid rgba(255,255,255,.75)!important;border-radius:24px!important;background:#f8fafc!important;box-shadow:0 30px 100px rgba(3,14,28,.32)!important}
.guest-panel-dialog-wide{width:min(1180px,100%)!important}
.guest-panel-header{position:relative!important;flex:0 0 auto!important;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:18px!important;padding:24px 26px 20px!important;margin:0!important;border-bottom:1px solid #e8edf4!important;background:rgba(255,255,255,.96)!important}
.guest-panel-header>div{min-width:0!important;padding-right:4px!important}
.guest-panel-header h2{font-size:clamp(24px,2.5vw,30px)!important;line-height:1.15!important;letter-spacing:-.035em!important;margin:5px 0 7px!important}
.guest-panel-header p{font-size:13px!important;line-height:1.5!important}
.guest-panel-close{display:grid!important;place-items:center!important;flex:0 0 40px!important;width:40px!important;height:40px!important;padding:0!important;margin:0!important;border:1px solid #e4eaf1!important;border-radius:50%!important;background:#f8fafc!important;color:#33465e!important;font-family:Arial,sans-serif!important;font-size:0!important;line-height:1!important;cursor:pointer!important;box-shadow:0 2px 5px rgba(16,36,59,.035)!important;transition:background .18s ease,color .18s ease,transform .18s ease!important}
.guest-panel-close::before{content:"×"!important;font-size:27px!important;font-weight:300!important;line-height:1!important;transform:translateY(-1px)!important}
.guest-panel-close:hover{background:#eaf0f6!important;color:#10243b!important;transform:rotate(90deg)!important}
.guest-panel-dialog-wide>.guest-panel-floating-close{position:absolute!important;top:14px!important;right:14px!important;float:none!important;z-index:20!important;background:rgba(255,255,255,.96)!important;box-shadow:0 4px 16px rgba(16,36,59,.12)!important}
.guest-panel-dialog-wide>.rest-card{flex:1 1 auto!important;min-height:0!important;overflow:auto!important;width:100%!important;margin:0!important;border:0!important;border-radius:0!important;box-shadow:none!important;background:#f8fafc!important;padding:22px 24px 26px!important}
#guestPanelService .portal-grid{padding:22px 24px 26px!important;overflow:auto!important;min-height:0!important;gap:16px!important}
#guestPanelRequests>.guest-panel-dialog>section.subcard{flex:1 1 auto!important;min-height:0!important;overflow:auto!important;margin:0!important;border:0!important;border-radius:0!important;box-shadow:none!important;padding:20px 24px 24px!important;background:#f8fafc!important}
#guestPanelRequests .subcard-head{position:sticky!important;top:0!important;z-index:2!important;background:#f8fafc!important;padding:0 0 14px!important}
.guest-panel-primary{min-height:44px!important;padding:12px 18px!important;border-radius:12px!important}
@media(max-width:900px){
 .guest-action-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
 .guest-panel-overlay{padding:16px!important}
 .guest-panel-dialog{max-height:92dvh!important}
}
@media(max-width:600px){
 .guest-action-dashboard{margin:16px 0 20px!important;padding:15px!important;border-radius:17px!important}
 .guest-action-grid{gap:9px!important;margin-top:15px!important}
 .guest-action-tile{min-height:162px!important;padding:13px!important;border-radius:14px!important}
 .guest-action-icon{width:38px!important;height:38px!important;flex-basis:38px!important;border-radius:12px!important}
 .guest-action-tile strong{font-size:13px!important;line-height:1.35!important}
 .guest-action-tile small{font-size:11px!important;line-height:1.45!important;min-height:32px!important}
 .guest-panel-overlay{padding:0!important;align-items:stretch!important}
 .guest-panel-dialog,.guest-panel-dialog-wide{width:100%!important;max-width:none!important;height:100dvh!important;max-height:100dvh!important;border:0!important;border-radius:0!important;box-shadow:none!important}
 .guest-panel-header{padding:20px 18px 17px!important;gap:12px!important}
 .guest-panel-header h2{font-size:25px!important;max-width:calc(100vw - 100px)!important}
 .guest-panel-header p{font-size:12px!important}
 .guest-panel-close{width:38px!important;height:38px!important;flex-basis:38px!important}
 .guest-panel-dialog-wide>.guest-panel-floating-close{position:fixed!important;top:10px!important;right:10px!important}
 .guest-panel-dialog-wide>.rest-card{padding:16px 12px calc(22px + env(safe-area-inset-bottom))!important}
 #guestPanelService .portal-grid{padding:14px 12px calc(22px + env(safe-area-inset-bottom))!important;gap:12px!important}
 #guestPanelRequests>.guest-panel-dialog>section.subcard{padding:14px 12px calc(22px + env(safe-area-inset-bottom))!important}
}
@media(prefers-reduced-motion:reduce){.guest-action-tile,.guest-panel-close{transition:none!important}}


/* Cross-device reliability patch: mobile viewport fallback, reachable service form, and anchored close controls */
.guest-panel-overlay{box-sizing:border-box;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior-y:contain}
.guest-panel-dialog,.guest-panel-dialog-wide{box-sizing:border-box;min-width:0;max-width:100%;}
.guest-panel-header{box-sizing:border-box;position:sticky!important;top:0!important;z-index:15!important;min-height:88px;padding-right:76px!important;align-items:flex-start!important}
.guest-panel-header>button.guest-panel-close{position:absolute!important;top:14px!important;right:14px!important;align-self:auto!important;margin:0!important;z-index:25!important}
.guest-panel-dialog-wide>.guest-panel-floating-close{position:absolute!important;top:14px!important;right:14px!important;left:auto!important;bottom:auto!important;transform:none!important}
/* Service modal scrolls as one continuous surface so the submit button and room-transfer form are reachable. */
#guestPanelService .guest-panel-dialog{display:block!important;overflow-x:hidden!important;overflow-y:auto!important;-webkit-overflow-scrolling:touch!important;overscroll-behavior-y:contain!important;max-height:88vh!important;max-height:88dvh!important}
#guestPanelService .guest-panel-header{margin:0!important}
#guestPanelService .guest-panel-dialog>.subcard{box-sizing:border-box!important;width:100%!important;max-width:100%!important;margin:0!important;border:0!important;border-radius:0!important;box-shadow:none!important;padding:20px 24px 24px!important;overflow:visible!important}
#guestPanelService .guest-panel-dialog>.subcard+ .subcard{border-top:1px solid #e5ebf3!important}
#guestPanelService form,#guestPanelService label,#guestPanelService select,#guestPanelService textarea{box-sizing:border-box;max-width:100%;min-width:0}
#guestPanelService form{display:flex;flex-direction:column;gap:12px}
#guestPanelService form label{display:block;width:100%;margin:0}
#guestPanelService form select,#guestPanelService form textarea,#guestPanelService form input[type=number]{width:100%;min-height:44px;font-size:16px}
#guestPanelService .service-quantity-row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
#guestPanelService #portalPriceBox{gap:12px;flex-wrap:wrap;overflow-wrap:anywhere}
#guestPanelService form button[type=submit]{width:100%;min-height:46px;flex:0 0 auto}
#guestPanelFood .guest-panel-dialog-wide{overflow:hidden!important}
#guestPanelFood .guest-panel-dialog-wide>.rest-card{min-width:0;max-width:100%;overflow-x:hidden;overflow-y:auto;-webkit-overflow-scrolling:touch}
#guestPanelBilling .guest-panel-dialog{overflow-x:hidden!important;overflow-y:auto!important;-webkit-overflow-scrolling:touch!important}
.guest-billing-content{min-width:0;overflow-wrap:anywhere;padding-bottom:24px}
@media(max-width:600px){
 .guest-panel-overlay{padding:0!important;display:none;align-items:stretch!important;justify-content:stretch!important;overflow:hidden!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
 .guest-panel-overlay.is-open{display:flex!important}
 .guest-panel-dialog,.guest-panel-dialog-wide{width:100%!important;max-width:100%!important;height:100vh!important;height:100dvh!important;max-height:100vh!important;max-height:100dvh!important;min-height:0!important;border:0!important;border-radius:0!important;margin:0!important;box-shadow:none!important}
 .guest-panel-header{padding:calc(12px + env(safe-area-inset-top, 0px)) 66px 14px 14px!important;gap:8px!important;min-height:78px!important}
 .guest-panel-header h2{font-size:clamp(20px,5.7vw,25px)!important;line-height:1.18!important;max-width:none!important;overflow-wrap:anywhere}
 .guest-panel-header p{font-size:12px!important;line-height:1.4!important}
 .guest-panel-header>button.guest-panel-close{top:calc(10px + env(safe-area-inset-top, 0px))!important;right:12px!important;width:40px!important;height:40px!important;flex-basis:40px!important}
 .guest-panel-dialog-wide>.guest-panel-floating-close{position:absolute!important;top:calc(10px + env(safe-area-inset-top, 0px))!important;right:12px!important;left:auto!important;z-index:30!important;width:40px!important;height:40px!important}
 #guestPanelService .guest-panel-dialog{display:block!important;height:100vh!important;height:100dvh!important;max-height:100vh!important;max-height:100dvh!important;overflow-x:hidden!important;overflow-y:auto!important;padding-bottom:calc(16px + env(safe-area-inset-bottom, 0px))!important}
 #guestPanelService .guest-panel-dialog>.subcard{padding:16px 14px 22px!important}
 #guestPanelService .guest-panel-dialog>.subcard h2{font-size:18px;line-height:1.25}
 #guestPanelService form{gap:10px!important}
 #guestPanelService form label{font-size:13px;line-height:1.4}
 #guestPanelService form select,#guestPanelService form textarea,#guestPanelService form input[type=number]{font-size:16px!important;min-height:44px!important}
 #guestPanelService #portalPriceBox{align-items:flex-start!important;padding:10px!important}
 #guestPanelService #portalPriceValue{font-size:16px!important;white-space:nowrap}
 #guestPanelService .service-quantity-control{max-width:100%}
 #guestPanelService form button[type=submit]{position:static!important;margin:4px 0 0!important}
 #guestPanelFood .guest-panel-dialog-wide{height:100vh!important;height:100dvh!important;max-height:100vh!important;max-height:100dvh!important}
 #guestPanelFood .guest-panel-dialog-wide>.rest-card{padding:14px 12px calc(22px + env(safe-area-inset-bottom, 0px))!important;max-height:none!important}
 #guestPanelRequests>.guest-panel-dialog{display:flex!important;flex-direction:column!important}
 #guestPanelRequests>.guest-panel-dialog>section.subcard{min-height:0!important;overflow-y:auto!important;-webkit-overflow-scrolling:touch!important;padding:14px 12px calc(24px + env(safe-area-inset-bottom, 0px))!important}
 #guestPanelBilling .guest-panel-dialog{display:flex!important;flex-direction:column!important}
 #guestPanelBilling .guest-billing-content{overflow-y:visible!important;padding:14px 14px calc(26px + env(safe-area-inset-bottom, 0px))!important}
 .guest-action-tile{min-height:0!important}
}
@media(max-width:360px){
 .guest-panel-header{padding-left:12px!important;padding-right:60px!important}
 .guest-panel-header h2{font-size:20px!important}
 #guestPanelService .guest-panel-dialog>.subcard{padding-left:12px!important;padding-right:12px!important}
 #guestPanelService #portalPriceBox{display:flex;flex-direction:column;align-items:stretch}
 #guestPanelService #portalPriceBox>div:last-child{text-align:left!important}
}
@media(prefers-reduced-motion:reduce){.guest-panel-overlay,.guest-panel-dialog,.guest-panel-dialog-wide{scroll-behavior:auto!important}}


/* Final mobile layout normalization: fix sizing at the component level instead of clipping the page. */
html { -webkit-text-size-adjust: 100%; }
body.portal { width:100%; max-width:100%; overflow-x:clip!important; }
.portal-card, .portal-card * { min-width:0; }
.guest-panel-overlay { box-sizing:border-box!important; }
.guest-panel-dialog, .guest-panel-dialog-wide { box-sizing:border-box!important; }
.guest-panel-header { display:flex!important; align-items:flex-start!important; justify-content:space-between!important; gap:14px!important; }
.guest-panel-header>div:first-child { flex:1 1 auto!important; min-width:0!important; }
.guest-panel-header h2, .guest-panel-header p { overflow-wrap:anywhere!important; }
.guest-panel-close { display:inline-grid!important; place-items:center!important; flex:0 0 40px!important; width:40px!important; height:40px!important; min-width:40px!important; min-height:40px!important; padding:0!important; }
.guest-panel-close::before { content:'×'!important; }
#guestPanelService form select, #guestPanelService form textarea, #guestPanelService form input,
#guestPanelService form button, #guestPanelRequests button,
#guestPanelFood button, #guestPanelBilling button { max-width:100%; }
#guestPanelService form select, #guestPanelService form textarea, #guestPanelService form input:not([type=checkbox]):not([type=radio]) { width:100%; }
#guestPanelRequests .request-card-item, #guestPanelRequests .request-card-header,
#guestPanelRequests .request-card-body { min-width:0!important; }
#guestPanelRequests .request-card-header { flex-wrap:wrap!important; }
#guestPanelRequests .request-card-body .request-price-pill { overflow-wrap:anywhere!important; }
#guestPanelFood .rest-grid { grid-template-columns:repeat(4,minmax(0,1fr))!important; }
#guestPanelFood .rest-item-footer { display:flex!important; flex-wrap:wrap!important; }
#guestPanelFood .rest-item-footer>* { max-width:100%; }
#guestPanelFood .rest-floating-cart { box-sizing:border-box!important; }
@media (max-width: 767px) {
  body.portal { padding:6px!important; }
  .portal-card { width:100%!important; max-width:100%!important; padding:12px!important; }
  .portal-header { gap:12px!important; }
  .portal-stats { grid-template-columns:repeat(3,minmax(0,1fr))!important; }
  .portal-stat { min-width:0!important; }
  .portal-stat .value { overflow-wrap:anywhere!important; }
  .guest-panel-overlay { padding:0!important; }
  .guest-panel-dialog, .guest-panel-dialog-wide { width:100%!important; max-width:100%!important; }
  .guest-panel-header { padding-right:62px!important; }
  .guest-panel-header>button.guest-panel-close { position:absolute!important; top:calc(10px + env(safe-area-inset-top,0px))!important; right:12px!important; }
  .guest-panel-dialog-wide>.guest-panel-floating-close { position:fixed!important; top:calc(10px + env(safe-area-inset-top,0px))!important; right:12px!important; }
  #guestPanelFood .rest-grid { grid-template-columns:repeat(2,minmax(0,1fr))!important; gap:10px!important; }
  #guestPanelFood .rest-item-photo-wrap { height:clamp(92px,29vw,135px)!important; }
  #guestPanelFood .rest-item-footer { flex-direction:column!important; align-items:stretch!important; }
  #guestPanelFood .rest-item-footer button { min-height:40px!important; }
  #guestPanelFood .rest-floating-cart { left:10px!important; right:10px!important; bottom:calc(10px + env(safe-area-inset-bottom,0px))!important; }
  #guestPanelService .service-quantity-row { align-items:flex-start!important; }
  #guestPanelService .service-quantity-control { flex-wrap:nowrap!important; }
  #guestPanelRequests .request-card-body { grid-template-columns:minmax(0,1fr)!important; }
  #guestPanelRequests .request-card-body .request-price-pill { justify-self:start!important; }
  .guest-bill-line { flex-wrap:wrap!important; }
  .guest-bill-line>b { white-space:normal!important; overflow-wrap:anywhere!important; }
}
@media (max-width: 380px) {
  .portal-header h1 { font-size:clamp(25px,8vw,30px)!important; }
  .portal-stats { gap:5px!important; }
  .portal-stat { padding:8px 5px!important; }
  .portal-stat .label { font-size:9px!important; overflow-wrap:anywhere!important; }
  #guestPanelFood .rest-card[aria-labelledby="guestMenuTitle"] { padding-left:10px!important; padding-right:10px!important; }
  #guestPanelFood .rest-item-card>div:not(.rest-item-photo-wrap) { padding-left:8px!important; padding-right:8px!important; }
}

</style>
</head>
<body class="portal">
<main class="portal-card">

<?php if(!$stay):?>
  <div class="invalid-box" style="max-width: 440px; margin: 40px auto; text-align: center;">
    <div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;background:#f1f5f9;border-radius:50%;margin-bottom:16px;">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0f172a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
    </div>
    <h2 style="font-size:22px;font-weight:800;color:#0f172a;margin-bottom:6px;">Guest Service Portal</h2>
    <p class="small" style="color:#64748b;margin-bottom:20px;">Enter your Stay Reference Code to access your room services, orders, and live folio balance.</p>
    <form method="GET" action="portal.php" style="margin-top:14px;">
      <div style="margin-bottom:12px;">
        <input type="text" name="code" class="form-control" placeholder="e.g. ST49A8B0CD" value="<?=htmlspecialchars($codeLookup)?>" style="text-transform:uppercase;font-family:monospace;font-size:16px;text-align:center;font-weight:700;letter-spacing:1px;padding:12px;border:2px solid #cbd5e1;border-radius:10px;" required autofocus>
      </div>
      <button type="submit" style="width:100%;padding:12px;font-size:15px;font-weight:700;background:#0f172a;border-radius:10px;">Access My Stay</button>
    </form>
    <?php if($codeLookup !== ''): ?>
      <div style="margin-top:16px;padding:10px 14px;background:#fef2f2;border:1px solid #fee2e2;border-radius:8px;color:#dc2626;font-size:13px;">
        No active stay found matching code "<strong><?=htmlspecialchars($codeLookup)?></strong>". Please check your check-in pass or contact the front desk.
      </div>
    <?php endif; ?>
    <div style="margin-top:24px;border-top:1px solid #e2e8f0;padding-top:16px;font-size:12px;color:#94a3b8;">
      Shesh Dev Hotel · Agora, Lapasan, Cagayan de Oro
    </div>
  </div>
<?php else:
  $checkinPayment=null;
  try { $q=$pdo->prepare("SELECT cp.*, ua.username AS approved_by_name, p.receipt_number FROM checkin_payments cp LEFT JOIN users ua ON ua.id=cp.approved_by LEFT JOIN payments p ON p.id=cp.payment_id WHERE cp.stay_id=? ORDER BY cp.id DESC LIMIT 1"); $q->execute([$stay['stay_id']]); $checkinPayment=$q->fetch() ?: null; } catch(Throwable $e) { $checkinPayment=null; }
  $q=$pdo->prepare('SELECT f.id folio_id,f.folio_number FROM folios f WHERE f.stay_id=?');$q->execute([$stay['stay_id']]);$folio=$q->fetch();
  $q=$pdo->prepare('SELECT COALESCE(SUM(amount),0) FROM charges WHERE folio_id=?');$q->execute([$folio['folio_id']]);$charges=(float)$q->fetchColumn();
  $q=$pdo->prepare('SELECT COALESCE(SUM(amount),0) FROM payments WHERE folio_id=?');$q->execute([$folio['folio_id']]);$paid=(float)$q->fetchColumn();
  $balance=max(0,$charges-$paid);
  $menu=$pdo->query("SELECT id,name,category,subcategory,item_type,description,price FROM service_catalog WHERE active=1 ORDER BY category,subcategory,name")->fetchAll();
  $menuCategories=$pdo->query("SELECT id,name,department,type FROM menu_item_categories ORDER BY department,type,name")->fetchAll();
  $q=$pdo->prepare("SELECT sr.*,rr.room_number requested_room FROM service_requests sr LEFT JOIN rooms rr ON rr.id=sr.requested_room_id WHERE sr.stay_id=? ORDER BY sr.created_at DESC LIMIT 50");$q->execute([$stay['stay_id']]);$requests=$q->fetchAll();
  $q=$pdo->prepare("SELECT r.id,r.room_number,rt.name type,rt.nightly_rate FROM rooms r JOIN room_types rt ON rt.id=r.room_type_id WHERE r.status='AVAILABLE' AND r.id<>? ORDER BY r.room_number");$q->execute([$stay['room_id']]);$available=$q->fetchAll();
    $restCats = []; $restItems = []; $myRestOrders = [];
  try {
    $restCats = $pdo->query("SELECT * FROM menu_categories ORDER BY menu_type, id")->fetchAll(PDO::FETCH_ASSOC);
    $restItems = $pdo->query("SELECT m.*, c.category_name, c.menu_type FROM menu_items m JOIN menu_categories c ON c.id=m.category_id ORDER BY c.menu_type, c.id, m.item_name")->fetchAll(PDO::FETCH_ASSOC);
    $myRestOrdersStmt = $pdo->prepare("SELECT * FROM restaurant_orders WHERE stay_id=? ORDER BY created_at DESC");
    $myRestOrdersStmt->execute([(int)$stay['stay_id']]);
    $myRestOrders = $myRestOrdersStmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($myRestOrders as &$mo) {
        $itms = $pdo->prepare("SELECT * FROM restaurant_order_items WHERE order_id=? ORDER BY id ASC");
        $itms->execute([(int)$mo['id']]);
        $mo['items'] = $itms->fetchAll(PDO::FETCH_ASSOC);
    }
    unset($mo);
  } catch(Throwable $e) { $restCats = []; $restItems = []; $myRestOrders = []; }
?>
<?php if($showRegistrationFirst): ?>
  <!-- First-time Check-In Optional Registration Screen -->
  <div class="registration-first-view" style="max-width: 820px; margin: 0 auto;">
    <header class="portal-header" style="margin-bottom: 22px;">
      <div>
        <div class="eyebrow">SHESH DEV HOTEL &middot; GUEST CHECK-IN</div>
        <p class="small">Agora, Lapasan, Cagayan de Oro</p>
        <h1 style="font-size: clamp(24px, 3.5vw, 32px); margin: 6px 0;">Welcome to Shesh Dev Hotel!</h1>
        <p class="small">Room <strong><?=htmlspecialchars($stay['room_number'])?></strong> &middot; Stay Reference <strong><?=htmlspecialchars($stay['stay_code'])?></strong></p>
      </div>
      <span class="portal-tag" style="background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd;">
        New Check-In
      </span>
    </header>

    <?php if($success):?><div class="notice success"><?=htmlspecialchars($success)?></div><?php endif;?>
    <?php if($error):?><div class="notice error"><?=htmlspecialchars($error)?></div><?php endif;?>

    <section class="subcard" style="box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.06); padding: clamp(20px, 3vw, 28px);">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:14px;border-bottom:1px solid var(--border-color);padding-bottom:14px;">
        <div>
          <h2 style="margin:0 0 4px;display:flex;align-items:center;gap:8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;color:var(--primary);"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg> Guest Profile Registration
          </h2>
          <p class="small" style="margin:0;">
            Completing your guest profile is optional. If you save it, your first and last name are required — contact details, ID, and address are optional. It helps our Front Desk and hotel departments (Restaurant, Housekeeping, Bar, Maintenance) assist you with room service deliveries and prepare your official receipt.
          </p>
        </div>
        <span class="portal-tag" style="background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;">
          Optional Registration
        </span>
      </div>

      <form method="post" id="guestWelcomeForm" action="portal.php?t=<?=rawurlencode($token)?>" style="margin-top:12px;">
        <input type="hidden" name="portal_form_nonce" value="<?=htmlspecialchars($formNonce,ENT_QUOTES)?>">
        <input type="hidden" name="portal_action" value="register_guest">

        <div class="profile-form-grid">
          <label>
            First Name <span style="color:#ef4444;">*</span>
            <input type="text" name="first_name" required maxlength="100" placeholder="e.g. Juan" autofocus>
          </label>
          <label>
            Middle Name <span style="font-weight:400;color:var(--text-muted);">(Optional)</span>
            <input type="text" name="middle_name" maxlength="100" placeholder="e.g. Santos">
          </label>
          <label>
            Last Name <span style="color:#ef4444;">*</span>
            <input type="text" name="last_name" required maxlength="100" placeholder="e.g. Dela Cruz">
          </label>
        </div>

        <div class="profile-form-grid">
          <label>
            Mobile / Contact Number <span style="font-weight:400;color:var(--text-muted);">(Optional)</span>
            <input type="tel" name="contact_number" maxlength="30" placeholder="e.g. 0917 123 4567">
          </label>
          <label>
            Email Address <span style="font-weight:400;color:var(--text-muted);">(Optional)</span>
            <input type="email" name="email" maxlength="150" placeholder="e.g. juan@example.com">
          </label>
          <label>
            Nationality
            <input type="text" name="nationality" maxlength="60" placeholder="e.g. Filipino" value="Filipino">
          </label>
        </div>

        <div class="profile-form-grid">
          <label>
            Valid ID Type <span style="font-weight:400;color:var(--text-muted);">(Optional)</span>
            <select name="id_type">
              <option value="">-- Select ID Type (Optional) --</option>
              <option value="Passport">Passport</option>
              <option value="Driver's License">Driver's License</option>
              <option value="National ID (PhilSys)">National ID (PhilSys)</option>
              <option value="UMID / SSS">UMID / SSS</option>
              <option value="Postal ID">Postal ID</option>
              <option value="PRC ID">PRC ID</option>
              <option value="Voter's ID">Voter's ID</option>
              <option value="Company ID">Company ID</option>
              <option value="Student ID">Student ID</option>
              <option value="Other">Other</option>
            </select>
          </label>
          <label>
            ID / Document Number <span style="font-weight:400;color:var(--text-muted);">(Optional)</span>
            <input type="text" name="id_number" maxlength="50" placeholder="e.g. P1234567A">
          </label>
          <label>
            Emergency Contact <span style="font-weight:400;color:var(--text-muted);">(Optional)</span>
            <input type="text" name="emergency_contact" maxlength="100" placeholder="Contact Name & Phone">
          </label>
        </div>

        <label>
          Address / City <span style="font-weight:400;color:var(--text-muted);">(Optional)</span>
          <input type="text" name="address" maxlength="255" placeholder="e.g. Cagayan de Oro City">
        </label>

        <div style="display:flex;gap:12px;align-items:center;margin-top:18px;flex-wrap:wrap;border-top:1px solid var(--border-color);padding-top:16px;">
          <button type="submit" style="width:auto !important;min-width:180px;">
            Save &amp; Enter Dashboard
          </button>
          <a href="portal.php?t=<?=rawurlencode($token)?>&skip=1" class="subtle-btn" style="text-decoration:none;display:inline-flex;align-items:center;gap:6px;padding:10px 18px;font-size:14px;border-radius:8px;">
            Skip for now &amp; Continue to Dashboard &rarr;
          </a>
        </div>
      </form>
    </section>
  </div>
<?php else: ?>
  <header class="portal-header">
    <div>
      <div class="eyebrow">SHESH DEV HOTEL &middot; GUEST DASHBOARD</div>
      <p class="small">Agora, Lapasan, Cagayan de Oro</p>
      <h1><?= !empty($stay['first_name']) ? 'Welcome, ' . htmlspecialchars($stay['first_name']) . '!' : 'Your stay, at a glance' ?></h1>
      <p class="small"><?= $isActive ? 'Make the most of your stay. Great food, comfortable services, and a relaxing experience — all at your fingertips.' : ($isPending ? 'Your check-in completes once the Cashier approves your payment.' : 'Your stay has concluded. Review your finalized folio and request history below.') ?></p>
    </div>
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
      <button type="button" id="toggleGuestProfileVisibilityBtn" class="subtle-btn" style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:8px;font-size:13px;font-weight:600;background:#ffffff;border:1px solid var(--border-color);color:var(--text-main);cursor:pointer;" aria-expanded="false" aria-controls="guestProfileCard">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
        <span id="profileToggleText">Show Guest Profile</span>
      </button>
      <?php if($isActive):?>
        <span class="portal-tag">Active stay</span>
      <?php elseif($isPending):?>
        <span class="portal-tag" style="background:#fef3c7;color:#92400e;border:1px solid #fde68a;">Pending payment</span>
      <?php else:?>
        <span class="portal-tag checked-out">Checked out</span>
      <?php endif;?>
    </div>
  </header>

  <?php if(!$isActive && !$isPending):?>
    <div class="notice" style="background:#f8fafc;color:#475569;border:1px solid #cbd5e1;margin-top:18px;">
      <span>✓</span> <strong>Stay Completed:</strong> This room stay was checked out<?= $stay['actual_checkout'] ? ' on ' . htmlspecialchars($stay['actual_checkout']) : '' ?>. Your billing is finalized and service ordering is closed.
    </div>
  <?php endif;?>

  <?php if($isPending):?>
    <div class="notice" style="background:#fffbeb;color:#92400e;border:1px solid #fde68a;margin-top:18px;">
      <strong>⏳ Waiting for Cashier payment approval:</strong>
      Please settle <strong>₱<?=number_format((float)($checkinPayment['required_amount'] ?? $balance),2)?></strong><?php if($checkinPayment):?> (<?=(int)$checkinPayment['required_percent']?>% of ₱<?=number_format((float)$checkinPayment['total_amount'],2)?>)<?php endif;?> at the Cashier.
      Your check-in will be confirmed automatically once the Cashier approves your payment — this page updates in real time.
    </div>
  <?php endif;?>

  <?php if($isActive && $checkinPayment && $checkinPayment['status']==='APPROVED'):?>
    <div class="notice success" style="margin-top:18px;">
      <strong>✓ Payment Verified · Check-in Confirmed:</strong>
      ₱<?=number_format((float)$checkinPayment['required_amount'],2)?> paid at check-in (<?=(int)$checkinPayment['required_percent']?>% of ₱<?=number_format((float)$checkinPayment['total_amount'],2)?>)
      <?php if(!empty($checkinPayment['receipt_number'])):?> · Receipt <strong><?=htmlspecialchars($checkinPayment['receipt_number'])?></strong><?php endif;?>
      <?php if(!empty($checkinPayment['approved_by_name'])):?> · Approved by Cashier <strong><?=htmlspecialchars($checkinPayment['approved_by_name'])?></strong><?php endif;?>.
    </div>
  <?php endif;?>

  <div class="portal-stats">
    <div class="portal-stat">
      <div class="label">ASSIGNED ROOM</div>
      <div class="value"><?=htmlspecialchars($stay['room_number'])?></div>
      <div class="small"><?= $isActive ? 'Your assigned room' : 'Stay checked out' ?></div>
    </div>
    <div class="portal-stat">
      <div class="label">STAY REFERENCE</div>
      <div class="value" style="font-size:18px"><?=htmlspecialchars($stay['stay_code'])?></div>
      <div class="small"><?= $isActive ? 'Keep this for hotel assistance' : 'Completed stay reference' ?></div>
    </div>
    <div class="portal-stat">
      <div class="label">OPEN REQUESTS</div>
      <div class="value" id="guest-open-request-count"><?=count(array_filter($requests,fn($request)=>in_array($request['status'],['PENDING','NEW','ASSIGNED','ACKNOWLEDGED','ACCEPTED','IN_PROGRESS'],true)))?></div>
      <div class="small"><?= $isActive ? 'Service and room-transfer requests' : 'All requests concluded' ?></div>
    </div>
  </div>

  <?php if($isSkipped && empty($stay['customer_id']) && $isActive):?>
    <div class="notice" style="background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin:14px 0;">
      <div>
        <strong>Registration Skipped:</strong> You are browsing as an unregistered guest. You can still register your profile anytime below.
      </div>
      <a href="#guestProfileCard" class="subtle-btn" style="text-decoration:none;background:#ffffff;border-color:#bfdbfe;color:#1e40af;font-size:12px;padding:6px 14px;">
        Register Now
      </a>
    </div>
  <?php endif;?>

  <?php if($success):?><div class="notice success"><?=htmlspecialchars($success)?></div><?php endif;?>
  <?php if($error):?><div class="notice error"><?=htmlspecialchars($error)?></div><?php endif;?>

  <section class="balance-panel">
    <div class="small"><?= $isActive ? 'Current outstanding balance' : 'Final account balance' ?></div>
    <div class="balance">₱<?=number_format($balance,2)?></div>
    <div class="small">Posted charges ₱<?=number_format($charges,2)?> · Payments received ₱<?=number_format($paid,2)?></div>
    <p class="small" style="margin-top:4px;"><?= $isActive ? 'This balance updates from posted charges and recorded payments. Requests are not charged until fulfilled.' : 'This folio is finalized and paid. No further charges will be posted.' ?></p>
    <details>
      <summary style="display:flex;align-items:center;gap:6px;padding:4px 0;"><span style="font-size:12px;">▶</span> View itemized charges & breakdown</summary>
      <?php $q=$pdo->prepare('SELECT description,quantity,amount,created_at FROM charges WHERE folio_id=? ORDER BY created_at DESC');$q->execute([$folio['folio_id']]);$items=$q->fetchAll();?>
      <div style="margin-top:10px;border-top:1px solid rgba(255,255,255,0.18);padding-top:6px;">
        <?php foreach($items as $item):?>
        <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.12);font-size:13px;">
          <div style="padding-right:12px;">
            <div style="font-weight:700;color:#ffffff;line-height:1.35;"><?=htmlspecialchars($item['description'])?></div>
            <div style="font-size:11px;color:rgba(255,255,255,0.7);margin-top:2px;">Qty: <?=htmlspecialchars((string)$item['quantity'])?> · <?=htmlspecialchars($item['created_at'])?></div>
          </div>
          <div style="font-weight:800;color:#ffffff;white-space:nowrap;font-size:14px;">₱<?=number_format((float)$item['amount'],2)?></div>
        </div>
        <?php endforeach;?>
        <?php if(!$items):?>
          <div style="padding:10px 0;color:rgba(255,255,255,0.7);font-size:13px;">No posted charges yet.</div>
        <?php endif;?>
      </div>
    </details>
  </section>

  <section class="subcard guest-profile-card" id="guestProfileCard" style="display:none;">
    <div class="subcard-head" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:12px;">
      <div>
        <h2 style="margin:0 0 4px;display:flex;align-items:center;gap:8px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;color:var(--primary);"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg> Guest Profile
        </h2>
        <p class="small" style="margin:0;">
          <?= !empty($stay['customer_id']) ? 'Your details are registered for this stay. Hotel staff will use this information for service deliveries and official billing.' : 'Saving a guest profile is optional. Your first and last name are required; contact details, ID, and address are optional. It helps hotel staff assist you and prepare your official receipt.' ?>
        </p>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <?php if(!empty($stay['customer_id'])): ?>
          <span class="portal-tag" style="background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd;">
            ✓ Registered Guest
          </span>
        <?php else: ?>
          <span class="portal-tag" style="background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;">
            Optional Registration
          </span>
        <?php endif; ?>
        <button type="button" id="hideGuestProfileBtn" class="subtle-btn" style="font-size:12px;padding:6px 12px;" aria-label="Close profile panel">
          ✕ Close
        </button>
      </div>
    </div>

    <?php if(!empty($stay['customer_id'])): ?>
      <div id="guestProfileSummary" style="background:#f8fafc;border:1px solid var(--border-color);border-radius:14px;padding:16px 18px;margin-bottom:6px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;">
          <div>
            <div style="font-size:11px;font-weight:800;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;">REGISTERED GUEST</div>
            <div style="font:800 20px Manrope, sans-serif;color:var(--text-main);margin-top:2px;">
              <?= htmlspecialchars(trim(($stay['first_name']??'') . ' ' . (($stay['middle_name']??'') ? $stay['middle_name'].' ' : '') . ($stay['last_name']??''))) ?>
            </div>
          </div>
          <button type="button" id="toggleProfileEditBtn" class="subtle-btn">
            ✏️ Edit Details
          </button>
        </div>

        <div class="profile-meta-grid">
          <div>
            <span style="color:var(--text-muted);display:block;font-size:11px;font-weight:700;">PHONE / MOBILE</span>
            <strong style="color:var(--text-main);"><?= htmlspecialchars($stay['contact_number']??'—') ?></strong>
          </div>
          <div>
            <span style="color:var(--text-muted);display:block;font-size:11px;font-weight:700;">EMAIL</span>
            <strong style="color:var(--text-main);"><?= htmlspecialchars($stay['email'] ?: 'None provided') ?></strong>
          </div>
          <div>
            <span style="color:var(--text-muted);display:block;font-size:11px;font-weight:700;">NATIONALITY</span>
            <strong style="color:var(--text-main);"><?= htmlspecialchars($stay['nationality'] ?: 'Filipino') ?></strong>
          </div>
          <div>
            <span style="color:var(--text-muted);display:block;font-size:11px;font-weight:700;">ID DOCUMENT</span>
            <strong style="color:var(--text-main);">
              <?= htmlspecialchars(($stay['id_type'] ? $stay['id_type'] . ': ' : '') . ($stay['id_number'] ?: 'Not recorded')) ?>
            </strong>
          </div>
        </div>
      </div>
    <?php endif; ?>

    <div id="guestProfileFormContainer" style="<?= !empty($stay['customer_id']) ? 'display:none;' : '' ?>">
      <form method="post" id="guestProfileForm" style="margin-top:10px;">
        <input type="hidden" name="portal_form_nonce" value="<?=htmlspecialchars($formNonce,ENT_QUOTES)?>">
        <input type="hidden" name="portal_action" value="register_guest">

        <div class="profile-form-grid">
          <label>
            First Name <span style="color:#ef4444;">*</span>
            <input type="text" name="first_name" required maxlength="100" placeholder="e.g. Juan" value="<?= htmlspecialchars($stay['first_name']??'') ?>">
          </label>
          <label>
            Middle Name <span style="font-weight:400;color:var(--text-muted);">(Optional)</span>
            <input type="text" name="middle_name" maxlength="100" placeholder="e.g. Santos" value="<?= htmlspecialchars($stay['middle_name']??'') ?>">
          </label>
          <label>
            Last Name <span style="color:#ef4444;">*</span>
            <input type="text" name="last_name" required maxlength="100" placeholder="e.g. Dela Cruz" value="<?= htmlspecialchars($stay['last_name']??'') ?>">
          </label>
        </div>

        <div class="profile-form-grid">
          <label>
            Mobile / Contact Number <span style="font-weight:400;color:var(--text-muted);">(Optional)</span>
            <input type="tel" name="contact_number" maxlength="30" placeholder="e.g. 0917 123 4567" value="<?= htmlspecialchars($stay['contact_number']??'') ?>">
          </label>
          <label>
            Email Address <span style="font-weight:400;color:var(--text-muted);">(Optional)</span>
            <input type="email" name="email" maxlength="150" placeholder="e.g. juan@example.com" value="<?= htmlspecialchars($stay['email']??'') ?>">
          </label>
          <label>
            Nationality
            <input type="text" name="nationality" maxlength="60" placeholder="e.g. Filipino" value="<?= htmlspecialchars($stay['nationality']??'Filipino') ?>">
          </label>
        </div>

        <div class="profile-form-grid">
          <label>
            Valid ID Type <span style="font-weight:400;color:var(--text-muted);">(Optional)</span>
            <select name="id_type">
              <option value="">-- Select ID Type (Optional) --</option>
              <?php 
                $idTypes = ['Passport', 'Driver\'s License', 'National ID (PhilSys)', 'UMID / SSS', 'Postal ID', 'PRC ID', 'Voter\'s ID', 'Company ID', 'Student ID', 'Other'];
                $currentIdType = $stay['id_type'] ?? '';
                foreach($idTypes as $type):
              ?>
                <option value="<?= htmlspecialchars($type) ?>" <?= $currentIdType === $type ? 'selected' : '' ?>><?= htmlspecialchars($type) ?></option>
              <?php endforeach; ?>
            </select>
          </label>
          <label>
            ID / Document Number <span style="font-weight:400;color:var(--text-muted);">(Optional)</span>
            <input type="text" name="id_number" maxlength="50" placeholder="e.g. P1234567A" value="<?= htmlspecialchars($stay['id_number']??'') ?>">
          </label>
          <label>
            Emergency Contact <span style="font-weight:400;color:var(--text-muted);">(Optional)</span>
            <input type="text" name="emergency_contact" maxlength="100" placeholder="Contact Name & Phone" value="<?= htmlspecialchars($stay['emergency_contact']??'') ?>">
          </label>
        </div>

        <label>
          Address / City <span style="font-weight:400;color:var(--text-muted);">(Optional)</span>
          <input type="text" name="address" maxlength="255" placeholder="e.g. Cagayan de Oro City" value="<?= htmlspecialchars($stay['address']??'') ?>">
        </label>

        <div style="display:flex;gap:10px;align-items:center;margin-top:6px;flex-wrap:wrap;">
          <button type="submit" style="width:auto !important;min-width:180px;">
            <?= !empty($stay['customer_id']) ? 'Update Profile' : 'Save Guest Profile' ?>
          </button>
          <?php if(!empty($stay['customer_id'])): ?>
            <button type="button" id="cancelProfileEditBtn" class="subtle-btn" style="width:auto !important;">
              Cancel
            </button>
          <?php endif; ?>
        </div>
      </form>
    </div>
  </section>

  <section class="guest-action-dashboard">
    <div class="guest-action-heading"><div><div class="rest-menu-eyebrow">YOUR STAY, MADE EASY</div><h2>What do you need today?</h2><p>Choose an option to open its menu.</p></div></div>
    <div class="guest-action-grid">
      <button class="guest-action-tile tile-food" type="button" onclick="openGuestPanel('food')"><span class="guest-action-icon">🍽</span><strong>Food &amp; Drinks</strong><small>Browse meals and drinks</small><span class="guest-action-link">Explore menu →</span></button>
      <button class="guest-action-tile" type="button" onclick="openGuestPanel('service')"><span class="guest-action-icon">♧</span><strong>Request a Service</strong><small>Housekeeping, amenities, laundry</small><span class="guest-action-link">Request service →</span></button>
      <button class="guest-action-tile" type="button" onclick="openGuestPanel('requests')"><span class="guest-action-icon">☷</span><strong>My Requests</strong><small>Track progress and charges</small><span class="guest-action-link">View activity →</span></button>
      <button class="guest-action-tile" type="button" onclick="openGuestPanel('billing')"><span class="guest-action-icon">▤</span><strong>Billing &amp; Balance</strong><small>Review your room balance</small><span class="guest-action-link">View balance →</span></button>
    </div>
  </section>
  <?php if($isActive):?>
    <div id="guestPanelService" class="guest-panel-overlay" aria-hidden="true" onclick="if(event.target===this)closeGuestPanels()"><section class="guest-panel-dialog" role="dialog" aria-modal="true" aria-labelledby="guestServiceTitle"><header class="guest-panel-header"><div><span class="rest-menu-eyebrow">HOTEL ASSISTANCE</span><h2 id="guestServiceTitle">Request a Service</h2><p>Tell our team what you need.</p></div><button type="button" class="guest-panel-close" onclick="closeGuestPanels()" aria-label="Close">×</button></header>
      <section class="subcard">
        <h2>Request a service</h2>
        <form method="post">
          <input type="hidden" name="portal_form_nonce" value="<?=htmlspecialchars($formNonce,ENT_QUOTES)?>">
          <input type="hidden" name="portal_action" value="new_request">
          <label>
            Request type
            <select name="type">
              <option value="HOUSEKEEPING">Housekeeping</option>
              <option value="MAINTENANCE">Maintenance</option>
              <option value="VALET">Valet &amp; Parking</option>
              <option value="FRONT_DESK">Front desk assistance</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label id="categorySelectWrapper">
            Product Category
            <select id="portalCategorySelect" name="portal_category">
              <option value="">-- All Categories --</option>
            </select>
          </label>
          <label>
            Choose an item or service
            <select name="catalog_item_id" id="catalogItemSelect">
              <option value="0" data-category="ALL" data-subcategory="" data-name="" data-price="0">General request / describe below</option>
              <?php foreach($menu as $mi):
                $sub = $mi['subcategory'] ?? '';
              ?>
                <option value="<?= (int)$mi['id']?>"
                        data-category="<?=htmlspecialchars($mi['category'],ENT_QUOTES)?>"
                        data-subcategory="<?=htmlspecialchars($sub,ENT_QUOTES)?>"
                        data-name="<?=htmlspecialchars($mi['name'],ENT_QUOTES)?>"
                        data-price="<?=number_format((float)$mi['price'],2,'.','')?>">
                  <?=htmlspecialchars($mi['name'].' — ₱'.number_format((float)$mi['price'],2))?>
                </option>
              <?php endforeach;?>
            </select>
          </label>
          <div class="service-quantity-row" id="serviceQuantityRow"><label for="portalServiceQuantity">Quantity</label><div class="service-quantity-control"><button type="button" onclick="changeServiceQuantity(-1)" aria-label="Decrease quantity">−</button><input type="number" id="portalServiceQuantity" name="quantity" min="1" max="99" value="1" inputmode="numeric"><button type="button" onclick="changeServiceQuantity(1)" aria-label="Increase quantity">+</button></div></div>
          <div id="portalPriceBox" style="display:none; margin: 10px 0 14px; padding: 12px 14px; background: rgba(30,41,59,0.04); border: 1px solid rgba(148,163,184,0.3); border-radius: 10px; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #64748b; letter-spacing: 0.5px;">Auto Price Calculation</div>
              <div id="portalPriceItemName" style="font-weight: 700; font-size: 14px; color: #0f172a;"></div><div class="service-price-detail">Unit <span id="portalUnitPrice">₱0.00</span> × <span id="portalQuantityValue">1</span></div>
            </div>
            <div style="text-align: right;">
              <div class="service-total-label">Total amount</div><span id="portalPriceValue" style="font-size: 18px; font-weight: 800; color: #059669; background: #ecfdf5; padding: 4px 10px; border-radius: 8px; border: 1px solid #a7f3d0;">₱0.00</span>
            </div>
          </div>
          <label>
            Notes or instructions
            <textarea name="description" maxlength="500" rows="3" placeholder="Describe your request if no item is selected"></textarea>
          </label>
          <button type="submit">Submit request</button>
        </form>
        <p class="small" style="margin-top:10px;">Prices are shown before ordering. Chargeable items post only when staff mark the request completed.</p>
      </section>

      <section class="subcard">
        <h2>Request a room transfer</h2>
        <p class="small">Choose an available room. The front desk may accept your request first. When staff mark it In Progress, the transfer takes effect immediately and the room-rate difference (increase or credit) is posted to your bill. Once In Progress, the transfer cannot be cancelled.</p>
        <form method="post">
          <input type="hidden" name="portal_form_nonce" value="<?=htmlspecialchars($formNonce,ENT_QUOTES)?>">
          <input type="hidden" name="portal_action" value="transfer_request">
          <label>
            Destination room
            <select name="to_room_id" required>
              <?php if(!$available):?>
                <option value="">No rooms currently available</option>
              <?php else: foreach($available as $r):?>
                <option value="<?= (int)$r['id']?>">
                  <?=htmlspecialchars($r['room_number'].' · '.$r['type'].' · ₱'.number_format((float)$r['nightly_rate'],2).'/night')?>
                </option>
              <?php endforeach;endif;?>
            </select>
          </label>
          <label>
            Reason
            <textarea name="transfer_reason" maxlength="300" rows="2" required placeholder="Why would you like to transfer?"></textarea>
          </label>
          <button type="submit" <?=!$available?'disabled':''?>>Request transfer</button>
        </form>
      </section>
    </div></section></div>

    <div id="guestPanelFood" class="guest-panel-overlay" aria-hidden="true" onclick="if(event.target===this)closeGuestPanels()"><section class="guest-panel-dialog guest-panel-dialog-wide" role="dialog" aria-modal="true" aria-labelledby="guestMenuTitle"><button type="button" class="guest-panel-close guest-panel-floating-close" onclick="closeGuestPanels()" aria-label="Close">×</button>
    <section class="rest-card" aria-labelledby="guestMenuTitle">
      <div class="rest-header">
        <div>
          <div class="rest-menu-eyebrow">IN-ROOM DINING</div><h2 id="guestMenuTitle">Food &amp; Drinks</h2>
          <p class="small mb-0">Restaurant-quality meals and drinks, delivered to your room.</p>
        </div>
      </div>

      <nav class="rest-nav-pills" aria-label="Menu sections">
        <button type="button" id="tab-btn-food" class="rest-tab-btn active" onclick="switchPortalMenuTab('Food')">Food</button>
        <button type="button" id="tab-btn-drinks" class="rest-tab-btn" onclick="switchPortalMenuTab('Drinks')">Drinks</button>
        <button type="button" id="tab-btn-my-orders" class="rest-tab-btn" onclick="switchPortalMenuTab('Orders')">
          My Orders <span class="badge-pill" id="badge-count-orders"><?=count($myRestOrders)?></span>
        </button>
      </nav>

      <div id="portalMenuBrowser">
        <div class="rest-filter-row">
          <input class="rest-search-input" type="search" placeholder="Search menu items..." aria-label="Search menu items" oninput="handleMenuSearch(this.value)">
          <label class="small d-flex align-items-center gap-2 mb-0">
            <input type="checkbox" checked onchange="toggleAvailOnly(this.checked)">
            Available items only
          </label>
        </div>
        <div id="portalCategoryPills" class="rest-cat-scroll" aria-label="Menu categories"></div>
        <div id="portalMenuItemsGrid" class="rest-grid" aria-live="polite"></div>
        <div class="menu-view-all-wrap">
          <button type="button" id="portalMenuViewAll" class="menu-view-all-btn" hidden onclick="window.portalMenuShowAll = !window.portalMenuShowAll; renderMenuItems();">View all items</button>
        </div>
      </div>

      <div id="portalMyOrdersContainer" style="display:none;">
        <div id="portalOrdersList" aria-live="polite"></div>
      </div>
    </section>

    <div id="portalFloatingCart" class="rest-floating-cart" style="display:none;">
      <div>
        <strong id="cartItemSummary">0 items selected</strong>
        <div class="small">Subtotal: <span id="cartTotalSummary">₱0.00</span></div>
      </div>
      <button type="button" class="rest-add-cart-btn" onclick="openCartDrawer()">View Cart →</button>
    </div>

    <div id="portalCartOverlay" class="rest-cart-drawer-overlay" onclick="if(event.target===this)closeCartDrawer()">
      <section class="rest-cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cartDrawerTitle">
        <header class="rest-cart-header">
          <h3 id="cartDrawerTitle" class="h5 mb-0">Your Order</h3>
          <button type="button" class="subtle-btn" onclick="closeCartDrawer()" aria-label="Close cart">Close</button>
        </header>
        <div id="cartItemsList" class="rest-cart-body"></div>
        <footer class="rest-cart-footer">
          <label for="cartOrderType">Order destination</label>
          <select id="cartOrderType" class="form-control mb-3">
            <option value="Room Service">Room Service</option>
            <option value="Dine-In">Dine-In</option>
            <option value="Takeaway">Takeaway</option>
          </select>
          <label for="cartOrderNotes">Notes for the kitchen (optional)</label>
          <textarea id="cartOrderNotes" class="form-control mb-3" maxlength="500" rows="2"></textarea>
          <div class="d-flex justify-content-between fw-bold mb-3">
            <span>Total</span><span id="cartGrandTotal">₱0.00</span>
          </div>
          <button type="button" id="btnSubmitOrder" class="rest-add-cart-btn w-100 justify-content-center" onclick="submitRestaurantOrder()">Submit Order Now</button>
        </footer>
      </section>
    </div>
    </section></section></div>
  <?php else:?>
    <div class="portal-grid">
      <section class="subcard">
        <h2>Request a service</h2>
        <p class="small" style="margin-top:10px;color:#64748b;">Service requests are closed because this stay has been checked out.</p>
      </section>
      <section class="subcard">
        <h2>Request a room transfer</h2>
        <p class="small" style="margin-top:10px;color:#64748b;">Room transfers are closed because this stay has been checked out.</p>
      </section>
    </div>
  <?php endif;?>

  <div id="guestPanelRequests" class="guest-panel-overlay" aria-hidden="true" onclick="if(event.target===this)closeGuestPanels()"><section class="guest-panel-dialog" role="dialog" aria-modal="true" aria-labelledby="guestRequestsTitle"><header class="guest-panel-header"><div><span class="rest-menu-eyebrow">YOUR ACTIVITY</span><h2 id="guestRequestsTitle">Your Requests</h2><p>Track progress and review recorded charges.</p></div><button type="button" class="guest-panel-close" onclick="closeGuestPanels()" aria-label="Close">×</button></header>
  <section class="subcard">
    <div class="subcard-head">
      <h2>Your requests</h2>
      <span class="badge-count"><?=count($requests)?> <?=count($requests)===1?'request':'requests'?></span>
    </div>

    <div class="requests-list">
      <?php foreach($requests as $r):?>
      <div class="request-card-item" id="req-<?= (int)$r['id'] ?>" data-request-id="<?= (int)$r['id'] ?>" data-request-code="<?= htmlspecialchars($r['request_code']) ?>">
        <div class="request-card-header">
          <div class="request-code-badge"><?=htmlspecialchars($r['request_code'])?></div>
          <span class="request-status <?=htmlspecialchars($r['status'],ENT_QUOTES)?>">
            <?=htmlspecialchars(str_replace('_',' ',$r['status']))?>
          </span>
        </div>

        <div class="request-card-body">
          <?php if($r['request_kind']==='ROOM_TRANSFER'):?>
            <div class="request-title-text">
              <span class="kind-badge">Room Transfer</span> to Room <strong><?=htmlspecialchars($r['requested_room']??'room')?></strong>
            </div>
            <?php if(!empty($r['description'])):?>
              <div class="request-sub-note"><?=htmlspecialchars($r['description'])?></div>
            <?php endif;?>
          <?php else:?>
            <div class="request-title-text"><?=htmlspecialchars($r['description'])?></div>
          <?php endif;?>
          <?php if(!empty($r['on_hold_reason'])):?>
            <div class="request-hold-note" style="color:#b45309;font-size:12px;margin-top:6px;font-weight:600;">⏸️ Hold note: <?=htmlspecialchars($r['on_hold_reason'])?></div>
          <?php endif;?>

          <div class="request-tags-row">
            <?php if((int)$r['chargeable']):?>
              <div class="request-price-pill">
                <span>Charge:</span> <strong>₱<?=number_format((float)$r['price'],2)?></strong>
              </div>
            <?php else:?>
              <span class="request-free-pill">Complimentary / Free</span>
            <?php endif;?>
            <?php if(!empty($r['created_at'])):?>
              <span class="request-time-pill"><?=htmlspecialchars($r['created_at'])?></span>
            <?php endif;?>
          </div>
        </div>

        <?php if($isActive && $r['request_kind']==='SERVICE' && in_array($r['status'],['PENDING','NEW','ASSIGNED','ACKNOWLEDGED','ACCEPTED'],true)):?>
          <div class="request-card-actions">
            <form method="post" style="margin:0;">
              <input type="hidden" name="portal_form_nonce" value="<?=htmlspecialchars($formNonce,ENT_QUOTES)?>">
              <input type="hidden" name="portal_action" value="cancel_request">
              <input type="hidden" name="request_id" value="<?= (int)$r['id']?>">
              <button type="submit" class="secondary" style="padding:6px 14px;font-size:12px;border-radius:6px;width:auto !important;min-height:auto !important;">Cancel request</button>
            </form>
          </div>
        <?php endif;?>
      </div>
      <?php endforeach;?>

      <?php if(!$requests):?>
        <div class="empty-requests-card">
          No requests recorded for this stay yet. Use the service or transfer forms above to make a request.
        </div>
      <?php endif;?>
    </div>

    <p class="small" style="margin-top:14px;color:#64748b;font-size:12px;line-height:1.5;">
      <?= $isActive ? 'Request statuses update in real time when hotel staff accept, prepare, or complete your request. Eligible new requests can be cancelled before fulfillment.' : 'All service requests are archived with their final status.' ?>
    </p>
  </section></section></div>
  <?php $billingItems=[]; if(!empty($folio['folio_id'])){$billingQuery=$pdo->prepare('SELECT description,quantity,amount,created_at FROM charges WHERE folio_id=? ORDER BY created_at DESC');$billingQuery->execute([$folio['folio_id']]);$billingItems=$billingQuery->fetchAll();} ?>
  <div id="guestPanelBilling" class="guest-panel-overlay" aria-hidden="true" onclick="if(event.target===this)closeGuestPanels()"><section class="guest-panel-dialog" role="dialog" aria-modal="true" aria-labelledby="guestBillingTitle"><header class="guest-panel-header"><div><span class="rest-menu-eyebrow">ACCOUNT SUMMARY</span><h2 id="guestBillingTitle">Billing &amp; Balance</h2><p>Itemized charges and payment summary.</p></div><button type="button" class="guest-panel-close" onclick="closeGuestPanels()" aria-label="Close">×</button></header><div class="guest-billing-content"><div class="guest-bill-total"><span>Outstanding balance</span><strong>₱<?=number_format($balance,2)?></strong><small>Posted charges ₱<?=number_format($charges,2)?> · Payments received ₱<?=number_format($paid,2)?></small></div><h3>Bill details</h3><?php if($billingItems): foreach($billingItems as $billItem): ?><div class="guest-bill-line"><div><strong><?=htmlspecialchars($billItem['description'])?></strong><small>Qty: <?=htmlspecialchars((string)$billItem['quantity'])?> · <?=htmlspecialchars((string)$billItem['created_at'])?></small></div><b>₱<?=number_format((float)$billItem['amount'],2)?></b></div><?php endforeach; else: ?><p class="guest-bill-empty">No posted charges yet.</p><?php endif; ?><div class="guest-bill-summary-row"><span>Total posted charges</span><strong>₱<?=number_format($charges,2)?></strong></div><div class="guest-bill-summary-row"><span>Payments received</span><strong>− ₱<?=number_format($paid,2)?></strong></div><div class="guest-bill-summary-row guest-bill-balance-row"><span>Balance due</span><strong>₱<?=number_format($balance,2)?></strong></div><p class="guest-bill-note">Requests are charged only after they are fulfilled and posted to your account.</p></div></section></div>
<?php endif; // showRegistrationFirst ?>
<?php endif; // !stay ?>

<script>
(()=>{
  document.querySelectorAll('form[method="post"]').forEach(form=>{
    form.addEventListener('submit',()=>{
      const button=form.querySelector('button[type="submit"],button:not([type])');
      if(button){
        button.disabled=true;
        button.dataset.originalText=button.textContent;
        button.textContent='Submitting…';
      }
    });
  });
  const typeSelect = document.querySelector('select[name="type"]');
  const catSelect = document.getElementById('portalCategorySelect');
  const itemSelect = document.getElementById('catalogItemSelect');
  const priceBox = document.getElementById('portalPriceBox');
  const priceItemName = document.getElementById('portalPriceItemName');
  const priceValue = document.getElementById('portalPriceValue');
  const catWrapper = document.getElementById('categorySelectWrapper');

  if (!typeSelect || !itemSelect) return;

  const categoriesByType = {
    FOOD_BEVERAGE: ['FOOD_BEVERAGE'],
    BAR: ['BAR', 'MINIBAR'],
    HOUSEKEEPING: ['HOUSEKEEPING', 'LAUNDRY'],
    FRONT_DESK: ['SERVICE'],
    OTHER: ['OTHER'],
    MAINTENANCE: ['MAINTENANCE'],
    VALET: ['VALET', 'PARKING']
  };

  const quantityInput = document.getElementById('portalServiceQuantity');
  window.changeServiceQuantity = function(delta){ if(!quantityInput)return; quantityInput.value=String(Math.max(1,Math.min(99,(parseInt(quantityInput.value||'1',10)||1)+delta))); updatePrice(); };
  function updatePrice() {
    const selected = itemSelect.selectedOptions ? itemSelect.selectedOptions[0] : null;
    if (!selected || selected.value === '0') {
      if (priceBox) priceBox.style.display = 'none';
      return;
    }
    const unitPrice = Number(selected.dataset.price || 0);
    const qty = Math.max(1,Math.min(99,parseInt(quantityInput?.value||'1',10)||1));
    if(quantityInput) quantityInput.value=String(qty);
    const price = unitPrice * qty;
    const name = selected.dataset.name || selected.textContent.split(' — ')[0];
    if (priceBox) {
      priceBox.style.display = 'flex';
      if (priceItemName) priceItemName.textContent = name;
      const unitEl=document.getElementById('portalUnitPrice'), qtyEl=document.getElementById('portalQuantityValue');
      if(unitEl)unitEl.textContent='₱'+unitPrice.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
      if(qtyEl)qtyEl.textContent=String(qty);
      if (priceValue) priceValue.textContent = '₱' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
  }

  function populateCategories() {
    if (!catSelect) return;
    const selectedType = typeSelect.value;
    const allowedCats = categoriesByType[selectedType] || [];
    
    // Find all unique subcategories for this department
    const subcats = new Set();
    Array.from(itemSelect.options).forEach(opt => {
      if (opt.value !== '0' && allowedCats.includes(opt.dataset.category) && opt.dataset.subcategory) {
        subcats.add(opt.dataset.subcategory.trim());
      }
    });

    const isFoodOrBar = ['FOOD_BEVERAGE', 'BAR'].includes(selectedType);
    if (catWrapper) {
      catWrapper.style.display = (subcats.size > 0 || isFoodOrBar) ? 'block' : 'none';
    }

    const currentSub = catSelect.value;
    catSelect.innerHTML = '<option value="">-- All ' + (selectedType === 'BAR' ? 'Drinks Categories' : 'Food & Drink Categories') + ' --</option>';
    Array.from(subcats).sort().forEach(sub => {
      const opt = document.createElement('option');
      opt.value = sub;
      opt.textContent = sub;
      if (sub === currentSub) opt.selected = true;
      catSelect.appendChild(opt);
    });

    filterItems();
  }

  function filterItems() {
    const allowedCats = categoriesByType[typeSelect.value] || [];
    const selectedSubcat = catSelect ? catSelect.value : '';
    let selectedStillValid = false;

    for (const option of itemSelect.options) {
      if (option.value === '0') {
        option.hidden = false;
        option.disabled = false;
        continue;
      }
      const isDisabled = option.dataset.disabled === '1';
      const matchesType = allowedCats.includes(option.dataset.category);
      const matchesSub = !selectedSubcat || (option.dataset.subcategory === selectedSubcat);
      const show = matchesType && matchesSub && !isDisabled;

      option.hidden = !show;
      option.disabled = !show;
      if (show && option.selected) selectedStillValid = true;
    }

    if (itemSelect.value !== '0' && !selectedStillValid) {
      itemSelect.value = '0';
    }
    updatePrice();
  }

  window.portalFilterItems = filterItems;
  typeSelect.addEventListener('change', populateCategories);
  if (catSelect) catSelect.addEventListener('change', filterItems);
  itemSelect.addEventListener('change', updatePrice);
  quantityInput?.addEventListener('input', updatePrice);

  populateCategories();
  updatePrice();
})();
(() => {
  const stayCode = <?= json_encode($stay ? $stay['stay_code'] : '') ?>;
  if (!stayCode) return;
  const wsHost = window.location.hostname || '192.168.1.3';
  const wsUrl = 'ws://' + wsHost + ':8085';
  let ws;

  function showToast(message, isError = false) {
    if (window.Swal) {
      window.Swal.fire({
        toast: true,
        position: 'top-end',
        icon: isError ? 'error' : 'success',
        title: message,
        showConfirmButton: false,
        timer: 3800,
        timerProgressBar: true
      });
      return;
    }
    const toast = document.createElement('div');
    toast.className = 'notice ' + (isError ? 'error' : 'success');
    toast.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:99999;max-width:380px;box-shadow:0 12px 30px rgba(0,0,0,0.18);padding:14px 18px;border-radius:12px;font-weight:600;font-size:13px;transition:opacity 0.3s ease, transform 0.3s ease;';
    toast.innerHTML = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 350);
    }, 4500);
  }

  function updateRequestInDom(data) {
    if (!data) return;
    const reqId = data.id;
    const reqCode = data.request_code;
    const newStatus = (data.status || '').toUpperCase();
    const requestKind = (data.request_kind || 'SERVICE').toUpperCase();

    // Find existing card
    const card = document.querySelector(`[data-request-id="${reqId}"]`) || 
                 document.querySelector(`[data-request-code="${reqCode}"]`);

    if (card) {
      // 1. Update status badge
      const statusBadge = card.querySelector('.request-status');
      if (statusBadge) {
        statusBadge.className = 'request-status ' + newStatus;
        statusBadge.textContent = newStatus.replace(/_/g, ' ');
      }

      // 2. Handle on hold note if provided
      if (newStatus === 'ON_HOLD' && data.reason) {
        let holdEl = card.querySelector('.request-hold-note');
        if (!holdEl) {
          holdEl = document.createElement('div');
          holdEl.className = 'request-hold-note';
          holdEl.style.cssText = 'color:#b45309;font-size:12px;margin-top:6px;font-weight:600;';
          card.querySelector('.request-card-body')?.appendChild(holdEl);
        }
        holdEl.innerHTML = '⏸️ Hold note: ' + (data.reason || '');
      }

      // 3. Remove cancel button if no longer pending or accepted
      const actionsDiv = card.querySelector('.request-card-actions');
      if (['COMPLETED', 'CANCELLED', 'REJECTED', 'IN_PROGRESS'].includes(newStatus)) {
        if (actionsDiv) actionsDiv.remove();
      }

      // 4. Subtle flash highlight
      card.style.transition = 'background-color 0.4s ease';
      card.style.backgroundColor = '#eff6ff';
      setTimeout(() => { card.style.backgroundColor = ''; }, 1200);

      const statusFriendly = newStatus.replace(/_/g, ' ');
      showToast(`<strong>${data.description || reqCode}</strong> status: <span class="request-status ${newStatus}" style="font-size:10px;padding:2px 8px;margin-left:6px;">${statusFriendly}</span>`);
    } else if (data.stay_code && data.stay_code.toUpperCase() === stayCode.toUpperCase()) {
      // Prepend new request dynamically
      const list = document.querySelector('.requests-list');
      const emptyBox = document.querySelector('.empty-requests-card');
      if (emptyBox) emptyBox.remove();

      if (list) {
        const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        })[char]);
        const requestTitle = requestKind === 'ROOM_TRANSFER'
          ? `<span class="kind-badge">Room Transfer</span> to Room <strong>${escapeHtml(data.requested_room || data.requested_room_number || 'room')}</strong>`
          : escapeHtml(data.description || 'Service request');
        const itemHtml = `
          <div class="request-card-item" id="req-${escapeHtml(data.id)}" data-request-id="${escapeHtml(data.id)}" data-request-code="${escapeHtml(reqCode)}">
            <div class="request-card-header">
              <div class="request-code-badge">${escapeHtml(reqCode)}</div>
              <span class="request-status ${newStatus}">${newStatus.replace(/_/g, ' ')}</span>
            </div>
            <div class="request-card-body">
              <div class="request-title-text">${requestTitle}</div>
              ${requestKind === 'ROOM_TRANSFER' && data.description ? `<div class="request-sub-note">${escapeHtml(data.description)}</div>` : ''}
              <div class="request-tags-row">
                ${Number(data.chargeable) ? `<div class="request-price-pill"><span>Charge:</span> <strong>₱${Number(data.price||0).toFixed(2)}</strong></div>` : '<span class="request-free-pill">Complimentary / Free</span>'}
                <span class="request-time-pill">Just now</span>
              </div>
            </div>
          </div>
        `;
        list.insertAdjacentHTML('afterbegin', itemHtml);
        const countBadge = document.querySelector('.badge-count');
        if (countBadge) {
          const cur = document.querySelectorAll('.request-card-item').length;
          countBadge.textContent = cur + (cur === 1 ? ' request' : ' requests');
        }
        if (['PENDING', 'NEW', 'ASSIGNED', 'ACKNOWLEDGED', 'ACCEPTED', 'IN_PROGRESS'].includes(newStatus)) {
          const openCount = document.getElementById('guest-open-request-count');
          if (openCount) openCount.textContent = String(Number(openCount.textContent || 0) + 1);
        }
        showToast(`Request <strong>${data.request_code}</strong> received!`);
      }
    }
  }

  function connect() {
    try {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        ws.send(JSON.stringify({
          action: 'authenticate',
          role: 'guest',
          stayCode: stayCode
        }));
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          const eventType = msg.event || msg.type;
          if (eventType === 'CHECKIN_PAYMENT_APPROVED') {
            showToast('<strong>Payment verified!</strong> Your check-in is now confirmed.');
            setTimeout(() => window.location.reload(), 1500);
            return;
          }
          if (eventType === 'CHECKIN_PAYMENT_CANCELLED') {
            showToast('<strong>Check-in cancelled.</strong> Please see the front desk for assistance.', true);
            setTimeout(() => window.location.reload(), 1500);
            return;
          }
          if (['REQUEST_STATUS_CHANGED','REQUEST_ASSIGNED','REQUEST_CREATED','ROOM_TRANSFER_REQUESTED','REQUEST_CANCELLED','REQUEST_ACKNOWLEDGED','REQUEST_ON_HOLD','REQUEST_COMPLETED'].includes(eventType)) {
            updateRequestInDom(msg.data);
          } else if (eventType === 'CATALOG_ITEM_TOGGLED' && msg.data) {
            const data = msg.data;
            const itemSelect = document.getElementById('catalogItemSelect');
            if (itemSelect) {
              const itemId = String(data.id);
              const isActive = Number(data.active) === 1;
              let opt = Array.from(itemSelect.options).find(o => String(o.value) === itemId);
              if (!isActive) {
                if (opt) {
                  opt.dataset.disabled = '1';
                  opt.hidden = true;
                  opt.disabled = true;
                  if (itemSelect.value === itemId) {
                    itemSelect.value = '0';
                    showToast(`Notice: <strong>${data.name || 'Selected item'}</strong> is currently unavailable.`, true);
                  }
                }
              } else {
                if (opt) {
                  delete opt.dataset.disabled;
                  opt.hidden = false;
                  opt.disabled = false;
                  showToast(`Menu update: <strong>${data.name || 'Item'}</strong> is now available!`);
                } else {
                  opt = document.createElement('option');
                  opt.value = itemId;
                  opt.dataset.category = data.category;
                  const catNames = {
                    FOOD_BEVERAGE: 'Food & Restaurant',
                    BAR: 'Bar & Drinks',
                    HOUSEKEEPING: 'Housekeeping',
                    SERVICE: 'General Services',
                    LAUNDRY: 'Laundry',
                    MINIBAR: 'Minibar',
                    MAINTENANCE: 'Maintenance',
                    VALET: 'Valet Service',
                    PARKING: 'Parking',
                    OTHER: 'Other'
                  };
                  const catLabel = catNames[data.category] || data.category;
                  opt.textContent = `${catLabel} · ${data.name} — ₱${Number(data.price||0).toFixed(2)}`;
                  itemSelect.appendChild(opt);
                  showToast(`New menu item available: <strong>${data.name}</strong>!`);
                }
              }
              if (typeof window.portalFilterItems === 'function') window.portalFilterItems();
            }
          } else if (eventType === 'CATALOG_UPDATED' && msg.data) {
            const data = msg.data;
            const itemSelect = document.getElementById('catalogItemSelect');
            if (itemSelect) {
              const itemId = String(data.id);
              const isActive = Number(data.active) === 1;
              let opt = Array.from(itemSelect.options).find(o => String(o.value) === itemId);
              const catNames = {
                FOOD_BEVERAGE: 'Food & Restaurant',
                BAR: 'Bar & Drinks',
                HOUSEKEEPING: 'Housekeeping',
                SERVICE: 'General Services',
                LAUNDRY: 'Laundry',
                MINIBAR: 'Minibar',
                MAINTENANCE: 'Maintenance',
                VALET: 'Valet Service',
                PARKING: 'Parking',
                OTHER: 'Other'
              };
              const catLabel = catNames[data.category] || data.category;
              const optText = `${catLabel} · ${data.name} — ₱${Number(data.price||0).toFixed(2)}`;
              if (opt) {
                opt.dataset.category = data.category;
                opt.textContent = optText;
                if (!isActive) {
                  opt.dataset.disabled = '1';
                  opt.hidden = true;
                  opt.disabled = true;
                  if (itemSelect.value === itemId) itemSelect.value = '0';
                } else {
                  delete opt.dataset.disabled;
                  opt.hidden = false;
                  opt.disabled = false;
                }
              } else if (isActive) {
                opt = document.createElement('option');
                opt.value = itemId;
                opt.dataset.category = data.category;
                opt.textContent = optText;
                itemSelect.appendChild(opt);
              }
              if (typeof window.portalFilterItems === 'function') window.portalFilterItems();
            }
          } else if (eventType === 'ROOM_STATUS_CHANGED' && msg.data) {
            const data = msg.data;
            const roomSelect = document.querySelector('select[name="to_room_id"]');
            if (roomSelect && data.room_id) {
              const roomId = String(data.room_id);
              const opt = Array.from(roomSelect.options).find(o => String(o.value) === roomId);
              if (data.status === 'AVAILABLE') {
                if (!opt && data.room_number) {
                  const newOpt = document.createElement('option');
                  newOpt.value = roomId;
                  newOpt.textContent = `${data.room_number} · ${data.type || 'Room'} · ₱${Number(data.nightly_rate||0).toFixed(2)}/night`;
                  roomSelect.appendChild(newOpt);
                }
              } else {
                if (opt) {
                  if (roomSelect.value === roomId) roomSelect.value = '';
                  opt.remove();
                }
              }
              const submitBtn = roomSelect.closest('form')?.querySelector('button[type="submit"]');
              if (submitBtn) {
                submitBtn.disabled = roomSelect.options.length === 0 || (roomSelect.options.length === 1 && !roomSelect.options[0].value);
              }
            }
          }
        } catch (_) {}
      };
      ws.onclose = () => { setTimeout(connect, 3000); };
    } catch (_) {}
  }
  connect();

  // Intercept forms for seamless asynchronous submission without full-page reloads
  document.querySelectorAll('form').forEach(f => {
    f.addEventListener('submit', async (e) => {
      const actionInput = f.querySelector('input[name="portal_action"]');
      if (!actionInput) return;
      e.preventDefault();
      const submitBtn = f.querySelector('button[type="submit"]');
      const origText = submitBtn ? submitBtn.textContent : '';

      if (actionInput.value === 'cancel_request' && window.Swal) {
        const confirmResult = await window.Swal.fire({
          title: 'Cancel this request?',
          text: 'Are you sure you want to cancel this request?',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#dc2626',
          cancelButtonColor: '#64748b',
          confirmButtonText: 'Yes, cancel request',
          cancelButtonText: 'Keep request',
          reverseButtons: true
        });
        if (!confirmResult.isConfirmed) return;
      }

      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Submitting…'; }

      const fd = new FormData(f);
      fd.append('ajax', '1');

      try {
        const resp = await fetch(window.location.href, {
          method: 'POST',
          body: fd,
          headers: { 'Accept': 'application/json' }
        });
        const res = await resp.json();
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = origText; }

        if (res.ok) {
          if (res.action === 'register_guest' || res.action === 'update_profile') {
            if (window.Swal) {
              await window.Swal.fire({
                icon: 'success',
                title: 'Profile Saved!',
                text: res.success || 'Guest profile saved successfully!',
                timer: 1600,
                showConfirmButton: false
              });
            } else {
              showToast(res.success || 'Guest profile saved successfully!');
            }
            window.location.reload();
          } else if (res.action === 'cancel_request') {
            const reqId = fd.get('request_id');
            const card = document.querySelector(`[data-request-id="${reqId}"]`);
            if (card) {
              const statusBadge = card.querySelector('.request-status');
              if (statusBadge) {
                statusBadge.className = 'request-status CANCELLED';
                statusBadge.textContent = 'CANCELLED';
              }
              const acts = card.querySelector('.request-card-actions');
              if (acts) acts.remove();
            }
            showToast('Your request has been cancelled.');
          } else {
            f.reset();
            const desc = f.querySelector('textarea[name="description"]');
            if (desc) desc.value = '';
            if (res.request) {
              updateRequestInDom(res.request);
            } else {
              showToast(res.success || 'Request submitted successfully.');
            }
          }
        } else {
          if (window.Swal) {
            window.Swal.fire({
              icon: 'error',
              title: 'Notice',
              text: res.error || 'Failed to submit request.',
              confirmButtonColor: '#dc2626'
            });
          } else {
            showToast(res.error || 'Failed to submit request.', true);
          }
        }
      } catch (err) {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = origText; }
        f.submit();
      }
    });
  });

  const toggleBtn = document.getElementById('toggleProfileEditBtn');
  const cancelBtn = document.getElementById('cancelProfileEditBtn');
  const formContainer = document.getElementById('guestProfileFormContainer');
  const summaryContainer = document.getElementById('guestProfileSummary');
  if (toggleBtn && formContainer) {
    toggleBtn.addEventListener('click', () => {
      formContainer.style.display = 'block';
      if (summaryContainer) summaryContainer.style.display = 'none';
    });
  }
  if (cancelBtn && formContainer) {
    cancelBtn.addEventListener('click', () => {
      formContainer.style.display = 'none';
      if (summaryContainer) summaryContainer.style.display = 'block';
    });
  }

  // Guest Profile Visibility Control (Hide/Unhide)
  const profileCard = document.getElementById('guestProfileCard');
  const toggleVisibilityBtn = document.getElementById('toggleGuestProfileVisibilityBtn');
  const hideBtn = document.getElementById('hideGuestProfileBtn');
  const toggleText = document.getElementById('profileToggleText');

  const setProfileVisible = (show, scrollIntoView = false) => {
    if (!profileCard) return;
    if (show) {
      profileCard.style.display = 'block';
      if (toggleText) toggleText.textContent = 'Hide Guest Profile';
      if (toggleVisibilityBtn) toggleVisibilityBtn.setAttribute('aria-expanded', 'true');
      if (scrollIntoView) {
        profileCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else {
      profileCard.style.display = 'none';
      if (toggleText) toggleText.textContent = 'Show Guest Profile';
      if (toggleVisibilityBtn) toggleVisibilityBtn.setAttribute('aria-expanded', 'false');
    }
  };

  if (toggleVisibilityBtn) {
    toggleVisibilityBtn.addEventListener('click', () => {
      const isVisible = profileCard && profileCard.style.display !== 'none';
      setProfileVisible(!isVisible, !isVisible);
    });
  }
  if (hideBtn) {
    hideBtn.addEventListener('click', () => {
      setProfileVisible(false);
    });
  }

  document.querySelectorAll('a[href="#guestProfileCard"]').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      setProfileVisible(true, true);
    });
  });

  // Override native alert() with SweetAlert2
  if (window.Swal) {
    window.alert = function(msg) {
      window.Swal.fire({
        title: 'Shesh Dev Hotel',
        text: String(msg || ''),
        icon: 'info',
        confirmButtonColor: '#1e293b'
      });
    };
  }

  // Floating Scroll Up Helper
  const scrollBtn = document.createElement('button');
  scrollBtn.className = 'scroll-top-btn';
  scrollBtn.type = 'button';
  scrollBtn.setAttribute('aria-label', 'Scroll to top');
  scrollBtn.setAttribute('title', 'Scroll to top');
  scrollBtn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:block;margin:auto;"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  document.body.appendChild(scrollBtn);

  const checkPortalScroll = () => {
    if (window.scrollY > 200 || document.documentElement.scrollTop > 200) {
      scrollBtn.classList.add('visible');
    } else {
      scrollBtn.classList.remove('visible');
    }
  };
  window.addEventListener('scroll', checkPortalScroll, { passive: true });
  scrollBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.documentElement.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();
</script>
</main>
<script>
(() => {
  'use strict';

  // Server-rendered dataset
  const ALL_CATEGORIES = <?= json_encode($restCats ?? []) ?>;
  const ALL_ITEMS = <?= json_encode($restItems ?? []) ?>;
  let ALL_ORDERS = <?= json_encode($myRestOrders ?? []) ?>;
  const STAY_CODE = "<?= htmlspecialchars($stay['stay_code'] ?? '') ?>";
  const STAY_ID = <?= (int)($stay['stay_id'] ?? 0) ?>;
  const FORM_NONCE = "<?= htmlspecialchars($formNonce ?? '', ENT_QUOTES) ?>";

  let activeTab = 'Food'; // 'Food', 'Drinks', 'Orders'
  let activeCategory = '';
  let activeSearch = '';
  let showAvailOnly = true;
  let cart = []; // Array of { id, item_name, price, quantity, category_name }

  // Load cart from localStorage for persistence across reloads
  try {
    const saved = localStorage.getItem('hotel_cart_' + STAY_CODE);
    if (saved) cart = JSON.parse(saved);
  } catch (_) { cart = []; }

  function saveCart() {
    try {
      localStorage.setItem('hotel_cart_' + STAY_CODE, JSON.stringify(cart));
    } catch (_) {}
    updateCartUI();
  }

  function formatPhp(n) {
    return '₱' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function switchPortalMenuTab(tab) {
    window.portalMenuShowAll = false;
    activeTab = tab;
    document.getElementById('tab-btn-food')?.classList.toggle('active', tab === 'Food');
    document.getElementById('tab-btn-drinks')?.classList.toggle('active', tab === 'Drinks');
    document.getElementById('tab-btn-my-orders')?.classList.toggle('active', tab === 'Orders');

    const browser = document.getElementById('portalMenuBrowser');
    const ordersCont = document.getElementById('portalMyOrdersContainer');

    if (tab === 'Orders') {
      if (browser) browser.style.display = 'none';
      if (ordersCont) ordersCont.style.display = 'block';
      renderOrdersList();
    } else {
      if (browser) browser.style.display = 'block';
      if (ordersCont) ordersCont.style.display = 'none';
      activeCategory = '';
      renderCategoryPills();
      renderMenuItems();
    }
  }

  function renderCategoryPills() {
    const container = document.getElementById('portalCategoryPills');
    if (!container) return;

    const NON_FOOD_MENU_CATEGORY = /\b(towel|towels|bedding|linen|linens|guest supplies|wellness|pillow|pillows|slippers|toiletries|amenities|laundry|housekeeping|maintenance|parking|valet|souvenir|merchandise|service item|non.?food|transportation|business center|room services?|tours?|guest assistance|facilities|special garments?|express service|wash and fold|collection)\b/i;
    const visibleDiningItems = ALL_ITEMS.filter(i => (i.menu_type || 'Food') === activeTab && !NON_FOOD_MENU_CATEGORY.test(String(i.category_name || '') + ' ' + String(i.menu_type || '')));
    const cats = ALL_CATEGORIES.filter(c => (c.menu_type || 'Food') === activeTab && visibleDiningItems.some(i => String(i.category_id) === String(c.id)));
    const totalCount = visibleDiningItems.length;

    let html = `
      <button type="button" class="rest-cat-pill ${!activeCategory ? 'active' : ''}" onclick="selectCategory('')">
        All (${totalCount})
      </button>
    `;

    cats.forEach(c => {
      const cnt = visibleDiningItems.filter(i => String(i.category_id) === String(c.id)).length;
      const isActive = String(activeCategory) === String(c.id);
      html += `
        <button type="button" class="rest-cat-pill ${isActive ? 'active' : ''}" onclick="selectCategory('${c.id}')">
          ${c.category_name} (${cnt})
        </button>
      `;
    });

    container.innerHTML = html;
  }

  function selectCategory(catId) {
    window.portalMenuShowAll = false;
    activeCategory = catId;
    renderCategoryPills();
    renderMenuItems();
  }

  function handleMenuSearch(q) {
    window.portalMenuShowAll = false;
    activeSearch = (q || '').trim().toLowerCase();
    renderMenuItems();
  }

  function toggleAvailOnly(val) {
    showAvailOnly = Boolean(val);
    renderMenuItems();
  }

  function renderMenuItems() {
    const grid = document.getElementById('portalMenuItemsGrid');
    if (!grid) return;

    const NON_FOOD_MENU_CATEGORY = /\b(towel|towels|bedding|linen|linens|guest supplies|wellness|pillow|pillows|slippers|toiletries|amenities|laundry|housekeeping|maintenance|parking|valet|souvenir|merchandise|service item|non.?food|transportation|business center|room services?|tours?|guest assistance|facilities|special garments?|express service|wash and fold|collection)\b/i;
    let items = ALL_ITEMS.filter(i => (i.menu_type || 'Food') === activeTab && !NON_FOOD_MENU_CATEGORY.test(String(i.category_name || '') + ' ' + String(i.menu_type || '')));

    if (activeCategory) {
      items = items.filter(i => String(i.category_id) === String(activeCategory));
    }

    if (showAvailOnly) {
      items = items.filter(i => i.availability_status === 'Available');
    }

    if (activeSearch) {
      items = items.filter(i =>
        (i.item_name || '').toLowerCase().includes(activeSearch) ||
        (i.description || '').toLowerCase().includes(activeSearch) ||
        (i.category_name || '').toLowerCase().includes(activeSearch)
      );
    }

    if (items.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px 20px; color: #94a3b8;">
          <div style="font-size: 32px; margin-bottom: 8px;">🍽️</div>
          <div style="font-size: 15px; font-weight: 700; color: #475569;">No menu items found</div>
          <div class="small">Try clearing your search query or unchecking "Available items only".</div>
        </div>
      `;
      return;
    }

    const viewAllButton = document.getElementById('portalMenuViewAll');
    const shouldShowAll = Boolean(window.portalMenuShowAll);
    const displayItems = shouldShowAll ? items : items.slice(0, 4);
    if (viewAllButton) {
      viewAllButton.hidden = items.length <= 4;
      viewAllButton.textContent = shouldShowAll ? 'Show fewer items' : `View all ${items.length} items`;
      viewAllButton.setAttribute('aria-expanded', shouldShowAll ? 'true' : 'false');
    }
    grid.innerHTML = displayItems.map(item => {
      const isAvail = item.availability_status === 'Available';
      const inCart = cart.find(c => Number(c.id) === Number(item.id));
      const inCartQty = inCart ? inCart.quantity : 1;

      const productNameForPhoto = String(item.item_name || '').toLowerCase();
      const seededPhotoRules = [
        [/kare.?kare/, 'beef-kare-kare.jpg'], [/salmon/, 'grilled-salmon.jpg'],
        [/sandwich/, 'club-sandwich.jpg'], [/caesar|salad/, 'chicken-caesar-salad.jpg'],
        [/spaghetti|carbonara|pasta/, 'spaghetti-carbonara.jpg'],
        [/cappuccino|coffee|espresso/, 'cappuccino.jpg'], [/iced latte|latte/, 'iced-latte.jpg'],
        [/mango shake|mango smoothie|shake/, 'mango-shake.jpg']
      ];
      const matchedSeedPhoto = seededPhotoRules.find(([pattern]) => pattern.test(productNameForPhoto));
      const menuTypeForPhoto = String(item.menu_type || item.category_name || '').toLowerCase();
      const seededPhotoUrl = matchedSeedPhoto
        ? '/assets/' + matchedSeedPhoto[1]
        : (/coffee|cafe/.test(menuTypeForPhoto) ? '/assets/cappuccino.jpg'
          : (/drink|beverage|juice|smoothie|shake/.test(menuTypeForPhoto) ? '/assets/mango-shake.jpg' : ''));
      const photoUrl = String(item.image_url || item.photo_url || seededPhotoUrl || '').trim();

      return `
        <div class="rest-item-card ${!isAvail ? 'sold-out' : ''}" id="card-item-${item.id}">
          <div class="rest-item-photo-wrap">
            ${photoUrl
              ? `<img src="${photoUrl.replace(/"/g, '&quot;')}" alt="${String(item.item_name || 'Menu item').replace(/"/g, '&quot;')}" loading="lazy" onerror="this.parentElement.classList.add('photo-missing');this.remove();">`
              : `<div class="rest-photo-placeholder"><span>🍽</span><span>Photo coming soon</span><small>Add a product image in your menu data</small></div>`}
          </div>
          <div>
            <div class="rest-item-badge-row">
              <span class="rest-cat-tag">${item.category_name || 'General'}</span>
              <span class="rest-avail-tag ${isAvail ? 'available' : 'sold-out'}">
                ${isAvail ? '● Available' : 'Sold Out'}
              </span>
            </div>
            <div class="rest-item-title">${item.item_name}</div>
            <div class="rest-item-desc">${item.description || 'Deliciously prepared by our culinary team.'}</div>
          </div>

          <div class="rest-item-footer">
            <div class="rest-item-price">${formatPhp(item.price)}</div>
            ${isAvail ? `
              <div style="display:flex;align-items:center;gap:6px;">
                <div class="rest-qty-btn-group">
                  <button type="button" onclick="adjustItemCardQty(${item.id}, -1)">−</button>
                  <span class="rest-qty-val" id="qty-val-${item.id}">1</span>
                  <button type="button" onclick="adjustItemCardQty(${item.id}, 1)">+</button>
                </div>
                <button type="button" class="rest-add-cart-btn" onclick="addToCartFromCard(${item.id})">
                  + Add
                </button>
              </div>
            ` : `
              <button type="button" class="rest-add-cart-btn" disabled>
                Unavailable
              </button>
            `}
          </div>
        </div>
      `;
    }).join('');
  }

  window.adjustItemCardQty = (itemId, delta) => {
    const el = document.getElementById('qty-val-' + itemId);
    if (!el) return;
    let cur = parseInt(el.textContent, 10) || 1;
    cur = Math.max(1, Math.min(20, cur + delta));
    el.textContent = cur;
  };

  window.addToCartFromCard = (itemId) => {
    const item = ALL_ITEMS.find(i => Number(i.id) === Number(itemId));
    if (!item) return;

    const qtyEl = document.getElementById('qty-val-' + itemId);
    const qty = qtyEl ? (parseInt(qtyEl.textContent, 10) || 1) : 1;

    const existing = cart.find(c => Number(c.id) === Number(itemId));
    if (existing) {
      existing.quantity = Math.min(99, existing.quantity + qty);
    } else {
      cart.push({
        id: item.id,
        item_name: item.item_name,
        category_name: item.category_name,
        price: parseFloat(item.price),
        quantity: qty
      });
    }

    saveCart();
    if (typeof window.showToast === 'function') {
      window.showToast(`Added ${qty}x <strong>${item.item_name}</strong> to your cart!`);
    }
  };

  function updateCartUI() {
    const totalCount = cart.reduce((sum, i) => sum + i.quantity, 0);
    const totalAmount = cart.reduce((sum, i) => sum + (i.quantity * i.price), 0);

    const floatBar = document.getElementById('portalFloatingCart');
    const summaryText = document.getElementById('cartItemSummary');
    const totalText = document.getElementById('cartTotalSummary');
    const grandTotal = document.getElementById('cartGrandTotal');

    if (floatBar) {
      if (totalCount > 0) {
        floatBar.style.display = 'flex';
        if (summaryText) summaryText.textContent = `${totalCount} item${totalCount === 1 ? '' : 's'} selected`;
        if (totalText) totalText.textContent = formatPhp(totalAmount);
      } else {
        floatBar.style.display = 'none';
      }
    }

    if (grandTotal) grandTotal.textContent = formatPhp(totalAmount);
    renderCartDrawerItems();
  }

  function renderCartDrawerItems() {
    const cont = document.getElementById('cartItemsList');
    if (!cont) return;

    if (cart.length === 0) {
      cont.innerHTML = `
        <div style="text-align:center;padding:30px 10px;color:#94a3b8;">
          <div style="font-size:32px;margin-bottom:6px;">🛒</div>
          <div style="font-weight:700;color:#475569;">Your cart is empty</div>
          <div class="small">Add your favorite food and drinks from the menu.</div>
        </div>
      `;
      return;
    }

    cont.innerHTML = cart.map((line, idx) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f1f5f9;gap:12px;">
        <div style="flex-grow:1;min-width:0;">
          <div style="font-weight:700;font-size:14px;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${line.item_name}
          </div>
          <div class="small" style="color:#64748b;">
            ${formatPhp(line.price)} each &middot; <span style="font-weight:700;color:#0f172a;">${formatPhp(line.price * line.quantity)}</span>
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:8px;">
          <div class="rest-qty-btn-group">
            <button type="button" onclick="modifyCartLine(${line.id}, -1)">−</button>
            <span class="rest-qty-val">${line.quantity}</span>
            <button type="button" onclick="modifyCartLine(${line.id}, 1)">+</button>
          </div>
          <button type="button" onclick="removeCartLine(${line.id})" style="background:none;border:none;color:#ef4444;cursor:pointer;padding:4px;font-size:16px;" title="Remove">
            ✕
          </button>
        </div>
      </div>
    `).join('');
  }

  window.modifyCartLine = (id, delta) => {
    const item = cart.find(c => Number(c.id) === Number(id));
    if (!item) return;
    item.quantity += delta;
    if (item.quantity <= 0) {
      cart = cart.filter(c => Number(c.id) !== Number(id));
    }
    saveCart();
  };

  window.removeCartLine = (id) => {
    cart = cart.filter(c => Number(c.id) !== Number(id));
    saveCart();
  };

  window.clearCart = () => {
    cart = [];
    saveCart();
    closeCartDrawer();
  };

  window.openCartDrawer = () => {
    const overlay = document.getElementById('portalCartOverlay');
    if (overlay) overlay.style.display = 'flex';
    updateCartUI();
  };

  window.closeCartDrawer = () => {
    const overlay = document.getElementById('portalCartOverlay');
    if (overlay) overlay.style.display = 'none';
  };

  // Submit Order to backend
  window.submitRestaurantOrder = async () => {
    if (cart.length === 0) {
      alert('Your cart is empty. Please add items to order.');
      return;
    }

    const orderType = document.getElementById('cartOrderType')?.value || 'Room Service';
    const notes = document.getElementById('cartOrderNotes')?.value || '';
    const totalAmount = cart.reduce((sum, i) => sum + (i.quantity * i.price), 0);

    const confirmMsg = `Please review and confirm your order:\n\n` +
      cart.map(i => `${i.quantity}x ${i.item_name} - ${formatPhp(i.price * i.quantity)}`).join('\n') +
      `\n\nTotal: ${formatPhp(totalAmount)}\nDestination: ${orderType}\n\nSubmit this order?`;

    if (!confirm(confirmMsg)) return;

    const btn = document.getElementById('btnSubmitOrder');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = 'Submitting Order...';
    }

    try {
      const formData = new FormData();
      formData.append('portal_action', 'place_restaurant_order');
      formData.append('portal_form_nonce', FORM_NONCE);
      formData.append('order_type', orderType);
      formData.append('order_notes', notes);
      formData.append('items', JSON.stringify(cart));
      formData.append('ajax', '1');

      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        body: formData
      });

      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || 'Failed to place order.');
      }

      // Success: clear cart and close drawer
      cart = [];
      saveCart();
      closeCartDrawer();

      if (typeof window.showToast === 'function') {
        window.showToast(`Order <strong>${data.order_code || ''}</strong> placed successfully!`);
      }

      // Fetch fresh orders and switch to 'Orders' tab
      await refreshOrdersFromServer();
      switchPortalMenuTab('Orders');
    } catch (err) {
      alert('Order Error: ' + err.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = 'Submit Order Now';
      }
    }
  };

  async function refreshOrdersFromServer() {
    try {
      const res = await fetch(window.location.pathname + '?t=' + encodeURIComponent(new URLSearchParams(window.location.search).get('t') || '') + '&ajax=restaurant_orders');
      const data = await res.json();
      if (data.ok && Array.isArray(data.orders)) {
        ALL_ORDERS = data.orders;
        const b = document.getElementById('badge-count-orders');
        if (b) b.textContent = ALL_ORDERS.length;
        renderOrdersList();
      }
    } catch (_) {}
  }

  function renderOrdersList() {
    const cont = document.getElementById('portalOrdersList');
    if (!cont) return;

    if (ALL_ORDERS.length === 0) {
      cont.innerHTML = `
        <div style="text-align:center;padding:40px 10px;color:#94a3b8;">
          <div style="font-size:36px;margin-bottom:8px;">📋</div>
          <div style="font-size:16px;font-weight:700;color:#475569;">No orders placed yet</div>
          <div class="small">Explore our Food and Drinks menus to place your first order.</div>
        </div>
      `;
      return;
    }

    const statusBadgeClass = {
      Pending: 'background:#fef3c7;color:#92400e;border:1px solid #fde68a;',
      Confirmed: 'background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd;',
      Preparing: 'background:#e0e7ff;color:#3730a3;border:1px solid #c7d2fe;',
      'Ready for Serving': 'background:#ccfbf1;color:#115e59;border:1px solid #99f6e4;',
      Served: 'background:#f0fdf4;color:#166534;border:1px solid #bbf7d0;',
      Completed: 'background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0;',
      Cancelled: 'background:#fef2f2;color:#991b1b;border:1px solid #fecaca;'
    };

    cont.innerHTML = ALL_ORDERS.map(ord => {
      const canCancel = ['Pending', 'Confirmed'].includes(ord.order_status);
      const badgeStyle = statusBadgeClass[ord.order_status] || 'background:#f1f5f9;color:#475569;';
      const itemsList = (ord.items || []).map(i => `
        <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;border-bottom:1px solid #f8fafc;">
          <div><span style="font-weight:700;">${i.quantity}x</span> ${i.item_name} <span class="small" style="color:#94a3b8;">(${i.category_name || ''})</span></div>
          <div style="font-weight:700;color:#0f172a;">${formatPhp(i.subtotal)}</div>
        </div>
      `).join('');

      return `
        <div class="rest-order-card-item" id="portal-order-${ord.id}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
            <div>
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:16px;font-weight:800;font-family:monospace;color:#0f172a;">${ord.order_code}</span>
                <span class="portal-tag" style="${badgeStyle}font-size:12px;padding:3px 10px;">
                  ${ord.order_status}
                </span>
              </div>
              <div class="small" style="color:#64748b;margin-top:2px;">
                ${ord.order_type || 'Room Service'} &middot; Placed ${ord.created_at}
              </div>
            </div>

            ${canCancel ? `
              <button type="button" class="subtle-btn" onclick="cancelGuestOrder(${ord.id}, '${ord.order_code}')" style="color:#dc2626;border-color:#fecaca;background:#fff5f5;font-size:12px;padding:5px 12px;">
                ✕ Cancel Order
              </button>
            ` : `
              <span class="small" style="color:#94a3b8;font-size:11px;">
                ${ord.order_status === 'Cancelled' ? 'Cancelled' : 'Kitchen is processing (Cannot cancel)'}
              </span>
            `}
          </div>

          <div style="background:#f8fafc;padding:10px 14px;border-radius:10px;margin-bottom:10px;">
            ${itemsList || '<div class="small text-muted">No items</div>'}
          </div>

          ${ord.notes ? `
            <div class="small" style="margin-bottom:8px;color:#d97706;font-style:italic;">
              <strong>Note:</strong> ${ord.notes}
            </div>
          ` : ''}

          <div style="display:flex;justify-content:space-between;align-items:center;padding-top:6px;border-top:1px solid #f1f5f9;">
            <span class="small" style="font-weight:700;color:#64748b;">Total Amount</span>
            <span style="font-size:16px;font-weight:800;color:#0f172a;">${formatPhp(ord.total_amount)}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  window.cancelGuestOrder = async (orderId, orderCode) => {
    if (!confirm(`Are you sure you want to cancel order #${orderCode}?`)) return;

    try {
      const formData = new FormData();
      formData.append('portal_action', 'cancel_restaurant_order');
      formData.append('portal_form_nonce', FORM_NONCE);
      formData.append('order_id', orderId);
      formData.append('ajax', '1');

      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        body: formData
      });

      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed to cancel order.');

      if (typeof window.showToast === 'function') {
        window.showToast(`Order <strong>${orderCode}</strong> has been cancelled.`);
      }

      await refreshOrdersFromServer();
    } catch (err) {
      alert('Cancel Error: ' + err.message);
    }
  };

  // Real-time WebSocket hook on portal page
  document.addEventListener('DOMContentLoaded', () => {
    switchPortalMenuTab('Food');
    updateCartUI();

    // Hook existing portal WebSocket messages
    const origOnMessage = window.onPortalWsMessage;
    window.addEventListener('message', (e) => {
      // Reserved for cross-frame if any
    });
  });

  // Listen for WebSocket events handled by the portal ws listener
  window.handleRestaurantWsEvent = (msg) => {
    const ev = msg.event || msg.type;
    const data = msg.data || {};

    if (ev === 'RESTAURANT_ORDER_STATUS_CHANGED') {
      refreshOrdersFromServer();
      if (typeof window.showToast === 'function') {
        window.showToast(`Your order <strong>${data.order_code || ''}</strong> is now <strong>${data.order_status || ''}</strong>!`);
      }
    } else if (ev === 'RESTAURANT_ITEM_TOGGLED') {
      const item = ALL_ITEMS.find(i => Number(i.id) === Number(data.id));
      if (item) {
        item.availability_status = data.availability_status;
        renderMenuItems();
      }
    }
  };

  // Expose global methods
  window.switchPortalMenuTab = switchPortalMenuTab;
  window.selectCategory = selectCategory;
  window.handleMenuSearch = handleMenuSearch;
  window.toggleAvailOnly = toggleAvailOnly;
})();
</script>
<script>
(function(){let previousFocus=null;window.openGuestPanel=function(name){window.closeGuestPanels();const ids={food:'guestPanelFood',service:'guestPanelService',requests:'guestPanelRequests',billing:'guestPanelBilling'};const panel=document.getElementById(ids[name]);if(!panel)return;previousFocus=document.activeElement;panel.classList.add('is-open');panel.setAttribute('aria-hidden','false');document.body.classList.add('guest-panel-open');const dialog=panel.querySelector('[role="dialog"]');if(dialog){dialog.setAttribute('tabindex','-1');dialog.focus({preventScroll:true});}};window.closeGuestPanels=function(){document.querySelectorAll('.guest-panel-overlay.is-open').forEach(p=>{p.classList.remove('is-open');p.setAttribute('aria-hidden','true');});document.body.classList.remove('guest-panel-open');if(previousFocus&&previousFocus.focus)previousFocus.focus({preventScroll:true});};document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.querySelector('.guest-panel-overlay.is-open'))window.closeGuestPanels();});})();
</script>
</body>
</html>
