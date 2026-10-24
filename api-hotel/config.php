<?php
declare(strict_types=1);

/**
 * Hotel Billing System - Database Configuration
 * Loads database connection parameters from environment variables with local fallbacks.
 */
return [
    'host'       => getenv('HOTEL_DB_HOST') ?: '127.0.0.1',
    'name'       => getenv('HOTEL_DB_NAME') ?: 'hotel_billing_system',
    'user'       => getenv('HOTEL_DB_USER') ?: 'root',
    'pass'       => getenv('HOTEL_DB_PASS') !== false ? getenv('HOTEL_DB_PASS') : '',
    'timezone'   => getenv('HOTEL_TIMEZONE') ?: 'Asia/Manila',
    'server_ip'  => getenv('HOTEL_SERVER_IP') ?: '192.168.254.199',
    'portal_url' => getenv('HOTEL_PORTAL_BASE_URL') ?: 'http://192.168.254.199/portal.php',
];
