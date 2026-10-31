CREATE TABLE IF NOT EXISTS group_checkin_receipts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    group_booking_id BIGINT UNSIGNED NOT NULL,
    receipt_number VARCHAR(32) NOT NULL,
    method ENUM('CASH','CARD','GCASH','BANK_TRANSFER','MAYA','QR_PH','OTHER') NOT NULL,
    received_amount DECIMAL(12,2) NOT NULL,
    amount_paid DECIMAL(12,2) NOT NULL,
    change_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    received_by BIGINT UNSIGNED DEFAULT NULL,
    idempotency_key CHAR(64) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_group_checkin_receipt_number (receipt_number),
    UNIQUE KEY uq_group_checkin_idempotency (idempotency_key),
    KEY idx_group_checkin_receipt_booking (group_booking_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS group_checkin_receipt_allocations (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    group_receipt_id BIGINT UNSIGNED NOT NULL,
    checkin_payment_id BIGINT UNSIGNED NOT NULL,
    payment_id BIGINT UNSIGNED NOT NULL,
    folio_id BIGINT UNSIGNED NOT NULL,
    room_number VARCHAR(30) NOT NULL,
    gross_amount DECIMAL(12,2) NOT NULL,
    discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    discount_name VARCHAR(120) DEFAULT NULL,
    discount_category VARCHAR(40) DEFAULT NULL,
    total_amount DECIMAL(12,2) NOT NULL,
    required_amount DECIMAL(12,2) NOT NULL,
    amount_paid DECIMAL(12,2) NOT NULL,
    remaining_balance DECIMAL(12,2) NOT NULL,
    vatable_sales DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    vat_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    vat_exempt_sales DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    PRIMARY KEY (id),
    UNIQUE KEY uq_group_receipt_checkin_payment (group_receipt_id, checkin_payment_id),
    KEY idx_group_receipt_allocation_payment (payment_id),
    KEY idx_group_receipt_allocation_folio (folio_id),
    CONSTRAINT fk_group_receipt_allocation_receipt
        FOREIGN KEY (group_receipt_id) REFERENCES group_checkin_receipts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
