<?php
declare(strict_types=1);

/**
 * Hotel Billing System - Database Connection Factory
 * Initializes and exposes a secure PDO instance ($conn) with prepared statement emulation disabled.
 */

$config = require __DIR__ . '/config.php';
$servername = $config['host'];
$dbusername = $config['user'];
$dbpassword = $config['pass'];
$dbname     = $config['name'];

// Strict PDO configuration: throw exceptions, fetch associative arrays, disable emulation
$connectionOptions = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
];

try {
    // Connect to MySQL using UTF-8 mb4 charset
    $conn = new PDO(
        "mysql:host={$servername};dbname={$dbname};charset=utf8mb4",
        $dbusername,
        $dbpassword,
        $connectionOptions
    );
} catch (PDOException $connectionError) {
    // Return standard JSON error if the database is unreachable
    http_response_code(503);
    header("Content-Type: application/json; charset=utf-8");
    echo json_encode(["error" => "Database connection failed. Verify MySQL and the hotel_billing_system database."]);
    exit;
}
