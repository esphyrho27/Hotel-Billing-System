<?php
declare(strict_types=1);

require_once __DIR__ . '/connection-pdo.php';

$username = 'admin';
$newPassword = 'ChangeMe_2026!';

try {
    $hash = password_hash($newPassword, PASSWORD_DEFAULT);

    $stmt = $conn->prepare(
        'UPDATE users
         SET password_hash = ?,
             session_version = session_version + 1
         WHERE username = ?'
    );

    $stmt->execute([$hash, $username]);

    if ($stmt->rowCount() > 0) {
        echo 'Admin password reset successfully.';
    } else {
        echo 'No row was changed. Verify that the admin username exists and check the users table.';
    }
} catch (Throwable $e) {
    http_response_code(500);
    error_log($e->__toString());
    echo 'Password reset failed. Check the PHP error log.';
}
