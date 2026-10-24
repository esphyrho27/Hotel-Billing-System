<?php
declare(strict_types=1);

/**
 * Hotel Billing System - Vehicles API Handler
 * Handles legacy vehicle operations for valet and parking integration.
 */

header('Content-Type: application/json; charset=utf-8');
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

class Vehicle {
    /**
     * Retrieves all recorded vehicles from tblvehicles.
     *
     * @param string $json Request JSON parameters.
     * @return string JSON-encoded list of vehicles.
     */
    function getVehicles($json){
        include 'connection-pdo.php';
        $json = json_decode($json, true);
        $sql = "SELECT veh_id, veh_brand, veh_color, veh_model, veh_brand AS brand, veh_color AS color, veh_model AS model FROM tblvehicles";
        $stmt = $conn->prepare($sql);
        $stmt->execute();
        $returnValue = $stmt->fetchAll(PDO::FETCH_ASSOC);
        unset($conn); unset($stmt);
        return json_encode($returnValue);
    }

    /**
     * Creates a new vehicle record in tblvehicles.
     *
     * @param string $json Request JSON parameters containing brand, color, and model.
     * @return string JSON-encoded success status (1 for success, 0 for failure).
     */
    function save($json){
        include 'connection-pdo.php';
        $json = json_decode($json, true);

        $sql = "INSERT INTO tblvehicles(veh_brand, veh_color, veh_model) VALUES(:brand, :color, :model)";
        $stmt = $conn->prepare($sql);
        $brand = $json['brand'] ?? $json['veh_brand'] ?? '';
        $color = $json['color'] ?? $json['veh_color'] ?? '';
        $model = $json['model'] ?? $json['veh_model'] ?? '';

        $stmt->bindParam(':brand', $brand);
        $stmt->bindParam(':color', $color);
        $stmt->bindParam(':model', $model);
        $stmt->execute();
        $returnValue = $stmt->rowCount() > 0 ? 1 : 0;
        unset($conn); unset($stmt);
        return json_encode($returnValue);
    }
}

// Extract operation and input payload from GET or POST requests
if ($_SERVER['REQUEST_METHOD'] === 'GET'){
    $operation = $_GET['operation'] ?? '';
    $json = $_GET['json'] ?? '{}';
} else if($_SERVER['REQUEST_METHOD'] === 'POST'){
    $operation = $_POST['operation'] ?? '';
    $json = $_POST['json'] ?? '{}';
    if (empty($operation)) {
        $rawInput = file_get_contents('php://input');
        $decoded = json_decode($rawInput, true);
        if (is_array($decoded)) {
            $operation = $decoded['operation'] ?? '';
            $json = isset($decoded['json']) ? (is_string($decoded['json']) ? $decoded['json'] : json_encode($decoded['json'])) : $rawInput;
        }
    }
}

// Dispatch operation to Vehicle controller
$vehicle = new Vehicle();
switch($operation){
    case "getVehicles":
    case "get":
        echo $vehicle->getVehicles($json);
        break;
    case "save":
    case "addVehicle":
    case "saveVehicle":
        echo $vehicle->save($json);
        break;
    default:
        http_response_code(400);
        echo json_encode(["error" => "Invalid vehicle operation"]);
        break;
}
?>
