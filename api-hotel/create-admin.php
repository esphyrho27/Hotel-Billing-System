<?php

require_once __DIR__ . '/connection-pdo.php';

$username = 'admin';
$password = 'admin123';
$role = 'admin';

try {
    // Check whether the username already exists.
    $check = $conn->prepare(
        'SELECT id FROM users WHERE username = ? LIMIT 1'
    );

    $check->execute([$username]);

    if ($check->fetch(PDO::FETCH_ASSOC)) {
        echo 'The username "admin" already exists. No new account was created.';
        exit;
    }

    // Securely hash the password.
    $passwordHash = password_hash($password, PASSWORD_DEFAULT);

    if ($passwordHash === false) {
        throw new RuntimeException('Password hashing failed.');
    }

    // Create the admin account.
    $stmt = $conn->prepare(
        'INSERT INTO users
            (username, password_hash, role, active, session_version)
         VALUES
            (?, ?, ?, 1, 0)'
    );

    $stmt->execute([
        $username,
        $passwordHash,
        $role
    ]);

    echo 'Admin account created successfully!';
    echo '<br>Username: admin';
    echo '<br>Password: admin123';

} catch (Throwable $e) {
    http_response_code(500);

    error_log($e->__toString());

    echo 'Account creation failed. Check the PHP error log.';
}
