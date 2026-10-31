<?php
declare(strict_types=1);

function htl_ensure_guest_order_ids(PDO $pdo): void {
    $originalSqlMode = (string)$pdo->query('SELECT @@SESSION.sql_mode')->fetchColumn();
    $pdo->exec("SET SESSION sql_mode = CONCAT_WS(',', @@SESSION.sql_mode, 'NO_AUTO_VALUE_ON_ZERO')");

    $definitions = [
        'restaurant_orders' => ['type' => 'INT', 'primary' => false],
        'restaurant_order_items' => ['type' => 'INT', 'primary' => false],
        'service_requests' => ['type' => 'BIGINT UNSIGNED', 'primary' => false],
        'service_request_history' => ['type' => 'BIGINT UNSIGNED', 'primary' => true],
    ];

    try {
        foreach ($definitions as $table => $definition) {
            $columns = $pdo->prepare(
                'SELECT COLUMN_NAME, EXTRA, COLUMN_KEY
                 FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?'
            );
            $columns->execute([$table]);
            $id = null;
            foreach ($columns->fetchAll(PDO::FETCH_ASSOC) as $column) {
                if (strtolower((string)$column['COLUMN_NAME']) === 'id') {
                    $id = $column;
                    break;
                }
            }
            if ($id === null) {
                continue;
            }

            $needsPrimaryKey = $definition['primary'] && $id['COLUMN_KEY'] !== 'PRI';
            $needsAutoIncrement = stripos((string)$id['EXTRA'], 'auto_increment') === false;
            if (!$needsPrimaryKey && !$needsAutoIncrement) {
                continue;
            }

            if ($needsPrimaryKey) {
                $duplicates = $pdo->query(
                    "SELECT COUNT(*) - COUNT(DISTINCT id) FROM `$table`"
                );
                if ((int)$duplicates->fetchColumn() > 0) {
                    $pdo->exec('SET @guest_service_history_id = 0');
                    $pdo->exec(
                        'UPDATE service_request_history
                         SET id = (@guest_service_history_id := @guest_service_history_id + 1)
                         ORDER BY created_at, request_id, id'
                    );
                }
            }

            $alter = "ALTER TABLE `$table` MODIFY `id` {$definition['type']} NOT NULL";
            if ($needsAutoIncrement) {
                $alter .= ' AUTO_INCREMENT';
            }
            if ($needsPrimaryKey) {
                $alter .= ', ADD PRIMARY KEY (`id`)';
            }
            $pdo->exec($alter);
        }
    } finally {
        $restoreSqlMode = $pdo->prepare('SET SESSION sql_mode = ?');
        $restoreSqlMode->execute([$originalSqlMode]);
    }
}
