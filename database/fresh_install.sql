-- Hotel Billing System fresh database schema
-- Based on the supplied db_hotel_billing dump and project requirements.
-- This file intentionally contains NO operational/sample records.
-- Import into a disposable MariaDB test database before deployment.
CREATE DATABASE IF NOT EXISTS `hotel_billing_system` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `hotel_billing_system`;

-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Oct 22, 2026 at 04:35 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Fresh-install schema generated from the supplied database structure; operational rows intentionally omitted.
-- Database: `hotel_billing_system`
--

-- --------------------------------------------------------

--
-- Table structure for table `applied_discounts`
--

CREATE TABLE `applied_discounts` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `folio_id` bigint(20) UNSIGNED NOT NULL,
  `policy_id` bigint(20) UNSIGNED DEFAULT NULL,
  `name` varchar(120) NOT NULL,
  `category` varchar(40) NOT NULL DEFAULT 'PROMOTIONAL',
  `discount_type` enum('PERCENT','FIXED') NOT NULL,
  `discount_value` decimal(12,2) NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `status` enum('PENDING','APPROVED','REJECTED','APPLIED','VOID') NOT NULL DEFAULT 'APPLIED',
  `reason` varchar(255) DEFAULT NULL,
  `applied_by` bigint(20) UNSIGNED DEFAULT NULL,
  `approved_by` bigint(20) UNSIGNED DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `audit_logs`
--

CREATE TABLE `audit_logs` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `user_id` bigint(20) UNSIGNED DEFAULT NULL,
  `action` varchar(80) NOT NULL,
  `entity_type` varchar(80) NOT NULL,
  `entity_id` bigint(20) UNSIGNED DEFAULT NULL,
  `details` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`details`)),
  `ip_address` varchar(45) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `auth_login_attempts`
--

CREATE TABLE `auth_login_attempts` (
  `attempt_key` char(64) NOT NULL,
  `attempts` tinyint(3) UNSIGNED NOT NULL,
  `window_started_at` datetime NOT NULL,
  `locked_until` datetime DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `billing_adjustments`
--

CREATE TABLE `billing_adjustments` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `folio_id` bigint(20) UNSIGNED NOT NULL,
  `adjustment_type` enum('CREDIT','FEE_WAIVER','CORRECTION','EXCEPTION') NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `reason` varchar(500) NOT NULL,
  `status` enum('PENDING','APPROVED','REJECTED','APPLIED','REVERSED') NOT NULL DEFAULT 'PENDING',
  `requested_by` bigint(20) UNSIGNED DEFAULT NULL,
  `approved_by` bigint(20) UNSIGNED DEFAULT NULL,
  `applied_charge_id` bigint(20) UNSIGNED DEFAULT NULL,
  `before_values` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`before_values`)),
  `after_values` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`after_values`)),
  `idempotency_key` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `billing_policies`
--

CREATE TABLE `billing_policies` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `policy_key` varchar(80) NOT NULL,
  `policy_value` varchar(255) NOT NULL,
  `updated_by` bigint(20) UNSIGNED DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `charges`
--

CREATE TABLE `charges` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `folio_id` bigint(20) UNSIGNED NOT NULL,
  `category` enum('ROOM','FOOD','LAUNDRY','MINIBAR','SERVICE','OTHER','ADJUSTMENT','DAMAGE','MISSING_ITEM','EXTRA_PERSON','LATE_CHECKOUT','ROOM_SERVICE') NOT NULL,
  `description` varchar(255) NOT NULL,
  `quantity` decimal(10,2) NOT NULL DEFAULT 1.00,
  `unit_price` decimal(12,2) NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `service_request_id` bigint(20) UNSIGNED DEFAULT NULL,
  `idempotency_key` varchar(100) DEFAULT NULL,
  `created_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `charge_categories`
--

CREATE TABLE `charge_categories` (
  `charge_category_id` int(11) NOT NULL,
  `category_name` varchar(100) NOT NULL,
  `description` text DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `checkin_payments`
--

CREATE TABLE `checkin_payments` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `stay_id` bigint(20) UNSIGNED NOT NULL,
  `folio_id` bigint(20) UNSIGNED NOT NULL,
  `subject` varchar(80) NOT NULL DEFAULT 'CHECK-IN PAYMENT',
  `nights` int(11) NOT NULL DEFAULT 1,
  `total_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `required_percent` int(11) NOT NULL DEFAULT 100,
  `required_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `status` varchar(20) NOT NULL DEFAULT 'FOR_PAYMENT',
  `payment_id` bigint(20) UNSIGNED DEFAULT NULL,
  `created_by` bigint(20) UNSIGNED DEFAULT NULL,
  `approved_by` bigint(20) UNSIGNED DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `confirmed_by` bigint(20) UNSIGNED DEFAULT NULL,
  `confirmed_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `gross_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `discount_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `discount_type` varchar(40) DEFAULT NULL,
  `discount_reason` varchar(255) DEFAULT NULL,
  `balance_amount` decimal(10,2) NOT NULL DEFAULT 0.00
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `checkout_records`
--

CREATE TABLE `checkout_records` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `stay_id` bigint(20) UNSIGNED NOT NULL,
  `folio_id` bigint(20) UNSIGNED NOT NULL,
  `scheduled_checkout_at` date NOT NULL,
  `actual_checkout_at` datetime NOT NULL,
  `nights_stayed` int(10) UNSIGNED NOT NULL,
  `unused_nights` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `charges_total` decimal(12,2) NOT NULL,
  `discount_total` decimal(12,2) NOT NULL DEFAULT 0.00,
  `vat_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `final_amount` decimal(12,2) NOT NULL,
  `payments_received` decimal(12,2) NOT NULL DEFAULT 0.00,
  `refunds_completed` decimal(12,2) NOT NULL DEFAULT 0.00,
  `finalized_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `customers`
--

CREATE TABLE `customers` (
  `customer_id` int(11) NOT NULL,
  `first_name` varchar(100) NOT NULL,
  `middle_name` varchar(100) DEFAULT NULL,
  `last_name` varchar(100) NOT NULL,
  `email` varchar(150) DEFAULT NULL,
  `contact_number` varchar(30) NOT NULL,
  `emergency_contact` varchar(100) DEFAULT NULL,
  `address` varchar(255) DEFAULT NULL,
  `id_number` varchar(50) DEFAULT NULL,
  `nationality` varchar(60) DEFAULT 'Filipino',
  `id_type` varchar(50) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `department_inventory`
--

CREATE TABLE `department_inventory` (
  `id` int(11) NOT NULL,
  `department` varchar(40) NOT NULL,
  `item_name` varchar(120) NOT NULL,
  `category` varchar(80) NOT NULL DEFAULT 'General',
  `quantity` int(11) NOT NULL DEFAULT 0,
  `unit` varchar(20) NOT NULL DEFAULT 'pcs',
  `reorder_level` int(11) NOT NULL DEFAULT 5,
  `cost_price` decimal(10,2) NOT NULL DEFAULT 0.00,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `discount_policies`
--

CREATE TABLE `discount_policies` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `name` varchar(120) NOT NULL,
  `category` varchar(40) NOT NULL DEFAULT 'PROMOTIONAL',
  `discount_type` enum('PERCENT','FIXED') NOT NULL,
  `discount_value` decimal(12,2) NOT NULL,
  `applies_to` enum('ROOM','FOOD','LAUNDRY','MINIBAR','SERVICE','OTHER','ALL') NOT NULL DEFAULT 'ROOM',
  `starts_at` datetime DEFAULT NULL,
  `expires_at` datetime DEFAULT NULL,
  `min_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `max_discount` decimal(12,2) DEFAULT NULL,
  `combinable` tinyint(1) NOT NULL DEFAULT 0,
  `requires_manager` tinyint(1) NOT NULL DEFAULT 0,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `created_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `discount_type`
--

CREATE TABLE `discount_type` (
  `discount_type_id` int(11) NOT NULL,
  `discount_name` varchar(100) NOT NULL,
  `discount_mode` varchar(50) NOT NULL DEFAULT 'PERCENTAGE',
  `discount_value` decimal(12,2) NOT NULL DEFAULT 0.00,
  `requires_verification` tinyint(1) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `early_checkout_policy_configs`
--

CREATE TABLE `early_checkout_policy_configs` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `policy_key` enum('PRORATED_HOURLY','MINIMUM_NIGHT','HOURLY_PLUS_FEE','MANAGER_EXCEPTION') NOT NULL,
  `name` varchar(120) NOT NULL,
  `description` varchar(500) DEFAULT NULL,
  `minimum_hours` decimal(8,2) NOT NULL DEFAULT 1.00,
  `minimum_nights` int(11) NOT NULL DEFAULT 1,
  `fixed_fee` decimal(12,2) NOT NULL DEFAULT 0.00,
  `requires_manager` tinyint(1) NOT NULL DEFAULT 0,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `updated_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `early_checkout_requests`
--

CREATE TABLE `early_checkout_requests` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `stay_id` bigint(20) UNSIGNED NOT NULL,
  `folio_id` bigint(20) UNSIGNED NOT NULL,
  `request_type` enum('EARLY_CHECKOUT','CANCEL_AFTER_CHECKIN') NOT NULL,
  `checkin_at` datetime NOT NULL,
  `requested_departure_at` datetime NOT NULL,
  `actual_departure_at` datetime DEFAULT NULL,
  `reason` varchar(500) NOT NULL,
  `policy` enum('PRORATED_HOURLY','MINIMUM_NIGHT','HOURLY_PLUS_FEE','MANAGER_EXCEPTION') NOT NULL DEFAULT 'MINIMUM_NIGHT',
  `hourly_rate` decimal(12,2) NOT NULL DEFAULT 0.00,
  `minimum_hours` decimal(8,2) NOT NULL DEFAULT 0.00,
  `minimum_nights` int(11) NOT NULL DEFAULT 1,
  `fixed_fee` decimal(12,2) NOT NULL DEFAULT 0.00,
  `proposed_room_charge` decimal(12,2) NOT NULL DEFAULT 0.00,
  `status` enum('REQUESTED','APPROVED','REJECTED','FINALIZED') NOT NULL DEFAULT 'REQUESTED',
  `requested_by` bigint(20) UNSIGNED DEFAULT NULL,
  `approved_by` bigint(20) UNSIGNED DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `folios`
--

CREATE TABLE `folios` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `stay_id` bigint(20) UNSIGNED NOT NULL,
  `folio_number` varchar(32) NOT NULL,
  `status` enum('OPEN','PAID','VOID') NOT NULL DEFAULT 'OPEN',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `menu_categories`
--

CREATE TABLE `menu_categories` (
  `id` int(11) NOT NULL,
  `category_name` varchar(100) NOT NULL,
  `menu_type` enum('Food','Drinks') NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `menu_items`
--

CREATE TABLE `menu_items` (
  `id` int(11) NOT NULL,
  `category_id` int(11) NOT NULL,
  `item_name` varchar(150) NOT NULL,
  `description` text DEFAULT NULL,
  `price` decimal(10,2) NOT NULL DEFAULT 0.00,
  `image_path` varchar(255) DEFAULT NULL,
  `availability_status` enum('Available','Unavailable') DEFAULT 'Available',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `menu_item_categories`
--

CREATE TABLE `menu_item_categories` (
  `id` int(11) NOT NULL,
  `name` varchar(120) NOT NULL,
  `department` varchar(50) NOT NULL DEFAULT 'restaurant',
  `type` varchar(20) NOT NULL DEFAULT 'FOOD',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `payments`
--

CREATE TABLE `payments` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `folio_id` bigint(20) UNSIGNED NOT NULL,
  `receipt_number` varchar(32) NOT NULL,
  `method` enum('CASH','CARD','GCASH','BANK_TRANSFER','MAYA','QR_PH','OTHER') NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `received_amount` decimal(12,2) NOT NULL,
  `change_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `reference_note` varchar(120) DEFAULT NULL,
  `received_by` bigint(20) UNSIGNED DEFAULT NULL,
  `idempotency_key` char(64) DEFAULT NULL,
  `idempotency_part` smallint(5) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `portal_tokens`
--

CREATE TABLE `portal_tokens` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `stay_id` bigint(20) UNSIGNED NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `revoked_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `refunds`
--

CREATE TABLE `refunds` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `folio_id` bigint(20) UNSIGNED NOT NULL,
  `payment_id` bigint(20) UNSIGNED NOT NULL,
  `refund_number` varchar(32) NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `method` enum('CASH','CARD','GCASH','BANK_TRANSFER','MAYA','QR_PH','OTHER') NOT NULL,
  `reason` varchar(500) NOT NULL,
  `transaction_reference` varchar(120) DEFAULT NULL,
  `status` enum('REQUESTED','APPROVED','PROCESSING','COMPLETED','REJECTED','FAILED') NOT NULL DEFAULT 'REQUESTED',
  `requested_by` bigint(20) UNSIGNED DEFAULT NULL,
  `approved_by` bigint(20) UNSIGNED DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `processed_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `completed_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `refund_transactions`
--

CREATE TABLE `refund_transactions` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `refund_id` bigint(20) UNSIGNED NOT NULL,
  `attempt_number` int(10) UNSIGNED NOT NULL,
  `provider` varchar(40) NOT NULL DEFAULT 'MANUAL',
  `transaction_reference` varchar(120) DEFAULT NULL,
  `status` enum('PROCESSING','COMPLETED','FAILED') NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `result_message` varchar(500) DEFAULT NULL,
  `processed_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `restaurant_orders`
--

CREATE TABLE `restaurant_orders` (
  `id` int(11) NOT NULL,
  `order_code` varchar(32) NOT NULL,
  `customer_id` bigint(20) UNSIGNED DEFAULT NULL,
  `stay_id` bigint(20) UNSIGNED DEFAULT NULL,
  `room_number` varchar(20) DEFAULT NULL,
  `order_type` varchar(50) DEFAULT 'Room Service',
  `notes` text DEFAULT NULL,
  `total_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `order_status` enum('Pending','Confirmed','Preparing','Ready for Serving','Served','Completed','Cancelled') DEFAULT 'Pending',
  `payment_status` enum('Unpaid','Billed to Room','Paid') NOT NULL DEFAULT 'Unpaid',
  `payment_method` varchar(40) DEFAULT NULL,
  `paid_amount` decimal(10,2) DEFAULT NULL,
  `payment_reference` varchar(120) DEFAULT NULL,
  `paid_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `restaurant_order_items`
--

CREATE TABLE `restaurant_order_items` (
  `id` int(11) NOT NULL,
  `order_id` int(11) NOT NULL,
  `item_id` int(11) NOT NULL,
  `item_name` varchar(150) NOT NULL,
  `category_name` varchar(100) DEFAULT NULL,
  `quantity` int(11) NOT NULL DEFAULT 1,
  `unit_price` decimal(10,2) NOT NULL,
  `subtotal` decimal(10,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `role_permissions`
--

CREATE TABLE `role_permissions` (
  `id` int(10) UNSIGNED NOT NULL,
  `role` varchar(50) NOT NULL,
  `permission` varchar(80) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `rooms`
--

CREATE TABLE `rooms` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `room_number` varchar(20) NOT NULL,
  `room_type_id` bigint(20) UNSIGNED NOT NULL,
  `floor_number` int(11) NOT NULL DEFAULT 1,
  `capacity` int(11) DEFAULT NULL,
  `status` enum('AVAILABLE','OCCUPIED','CLEANING','MAINTENANCE') NOT NULL DEFAULT 'AVAILABLE'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `room_transfers`
--

CREATE TABLE `room_transfers` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `stay_id` bigint(20) UNSIGNED NOT NULL,
  `from_room_id` bigint(20) UNSIGNED NOT NULL,
  `to_room_id` bigint(20) UNSIGNED NOT NULL,
  `effective_date` date NOT NULL,
  `old_rate` decimal(12,2) NOT NULL,
  `new_rate` decimal(12,2) NOT NULL,
  `reason` varchar(255) NOT NULL,
  `authorized_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `room_type`
--



-- --------------------------------------------------------

--
-- Table structure for table `room_types`
--

CREATE TABLE `room_types` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `name` varchar(80) NOT NULL,
  `nightly_rate` decimal(12,2) NOT NULL DEFAULT 0.00,
  `capacity` int(11) NOT NULL DEFAULT 2
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `service_catalog`
--

CREATE TABLE `service_catalog` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `name` varchar(120) NOT NULL,
  `category` enum('FOOD_BEVERAGE','HOUSEKEEPING','SERVICE','LAUNDRY','MINIBAR','OTHER') NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `price` decimal(12,2) NOT NULL DEFAULT 0.00,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `subcategory` varchar(120) DEFAULT NULL,
  `item_type` varchar(20) NOT NULL DEFAULT 'FOOD'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `service_requests`
--

CREATE TABLE `service_requests` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `stay_id` bigint(20) UNSIGNED NOT NULL,
  `request_code` varchar(32) NOT NULL,
  `service_type` varchar(50) NOT NULL,
  `assigned_department` varchar(50) DEFAULT NULL,
  `assigned_to` bigint(20) UNSIGNED DEFAULT NULL,
  `assigned_at` datetime DEFAULT NULL,
  `acknowledged_by` bigint(20) UNSIGNED DEFAULT NULL,
  `acknowledged_at` datetime DEFAULT NULL,
  `request_kind` enum('SERVICE','ROOM_TRANSFER') NOT NULL DEFAULT 'SERVICE',
  `requested_room_id` bigint(20) UNSIGNED DEFAULT NULL,
  `description` varchar(500) NOT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'PENDING',
  `chargeable` tinyint(1) NOT NULL DEFAULT 0,
  `price` decimal(12,2) NOT NULL DEFAULT 0.00,
  `fulfilled_at` datetime DEFAULT NULL,
  `completed_by` bigint(20) UNSIGNED DEFAULT NULL,
  `on_hold_reason` varchar(255) DEFAULT NULL,
  `rejection_reason` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `service_request_history`
--

CREATE TABLE `service_request_history` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `request_id` bigint(20) UNSIGNED NOT NULL,
  `from_status` varchar(30) DEFAULT NULL,
  `to_status` varchar(30) NOT NULL,
  `changed_by_user_id` bigint(20) UNSIGNED DEFAULT NULL,
  `changed_by_role` varchar(50) DEFAULT NULL,
  `assigned_department` varchar(50) DEFAULT NULL,
  `notes` varchar(500) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `stays`
--

CREATE TABLE `stays` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `stay_code` varchar(32) NOT NULL,
  `room_id` bigint(20) UNSIGNED NOT NULL,
  `customer_id` int(11) DEFAULT NULL,
  `guest_count` int(11) NOT NULL DEFAULT 1,
  `checkin_at` datetime NOT NULL,
  `planned_checkout` date NOT NULL,
  `actual_checkout` datetime DEFAULT NULL,
  `status` enum('ACTIVE','CHECKED_OUT','CANCELLED','PENDING_PAYMENT') NOT NULL DEFAULT 'ACTIVE',
  `created_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tax_config`
--

CREATE TABLE `tax_config` (
  `tax_config_id` int(11) NOT NULL,
  `tax_name` varchar(100) NOT NULL,
  `tax_rate_percent` decimal(6,2) NOT NULL DEFAULT 0.00,
  `is_inclusive` tinyint(1) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `user`
--



-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `username` varchar(80) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` varchar(50) NOT NULL DEFAULT 'frontdesk',
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `session_version` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `applied_discounts`
--
ALTER TABLE `applied_discounts`
  ADD PRIMARY KEY (`id`),
  ADD KEY `policy_id` (`policy_id`),
  ADD KEY `applied_by` (`applied_by`),
  ADD KEY `approved_by` (`approved_by`),
  ADD KEY `folio_id` (`folio_id`,`status`);

--
-- Indexes for table `audit_logs`
--
ALTER TABLE `audit_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `auth_login_attempts`
--
ALTER TABLE `auth_login_attempts`
  ADD PRIMARY KEY (`attempt_key`),
  ADD KEY `idx_auth_login_locked_until` (`locked_until`);

--
-- Indexes for table `billing_adjustments`
--
ALTER TABLE `billing_adjustments`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `idempotency_key` (`idempotency_key`),
  ADD KEY `folio_id` (`folio_id`),
  ADD KEY `requested_by` (`requested_by`),
  ADD KEY `approved_by` (`approved_by`),
  ADD KEY `applied_charge_id` (`applied_charge_id`),
  ADD KEY `idx_billing_adjustment_status` (`status`,`created_at`);

--
-- Indexes for table `billing_policies`
--
ALTER TABLE `billing_policies`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `policy_key` (`policy_key`),
  ADD KEY `updated_by` (`updated_by`);

--
-- Indexes for table `charges`
--
ALTER TABLE `charges`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `idempotency_key` (`idempotency_key`),
  ADD KEY `created_by` (`created_by`),
  ADD KEY `folio_id` (`folio_id`);

--
-- Indexes for table `charge_categories`
--
ALTER TABLE `charge_categories`
  ADD PRIMARY KEY (`charge_category_id`),
  ADD UNIQUE KEY `uk_charge_category_name` (`category_name`);

--
-- Indexes for table `checkin_payments`
--
ALTER TABLE `checkin_payments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_cp_stay` (`stay_id`),
  ADD KEY `idx_cp_status` (`status`);

--
-- Indexes for table `checkout_records`
--
ALTER TABLE `checkout_records`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `stay_id` (`stay_id`),
  ADD KEY `folio_id` (`folio_id`),
  ADD KEY `finalized_by` (`finalized_by`),
  ADD KEY `idx_checkout_record_date` (`actual_checkout_at`);

--
-- Indexes for table `customers`
--
ALTER TABLE `customers`
  ADD PRIMARY KEY (`customer_id`);

--
-- Indexes for table `department_inventory`
--
ALTER TABLE `department_inventory`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_department` (`department`);

--
-- Indexes for table `discount_policies`
--
ALTER TABLE `discount_policies`
  ADD PRIMARY KEY (`id`),
  ADD KEY `created_by` (`created_by`);

--
-- Indexes for table `discount_type`
--
ALTER TABLE `discount_type`
  ADD PRIMARY KEY (`discount_type_id`),
  ADD UNIQUE KEY `uk_discount_name` (`discount_name`);

--
-- Indexes for table `early_checkout_policy_configs`
--
ALTER TABLE `early_checkout_policy_configs`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `policy_key` (`policy_key`),
  ADD KEY `fk_early_policy_updated_by` (`updated_by`);

--
-- Indexes for table `early_checkout_requests`
--
ALTER TABLE `early_checkout_requests`
  ADD PRIMARY KEY (`id`),
  ADD KEY `folio_id` (`folio_id`),
  ADD KEY `requested_by` (`requested_by`),
  ADD KEY `approved_by` (`approved_by`),
  ADD KEY `stay_id` (`stay_id`,`status`);

--
-- Indexes for table `folios`
--
ALTER TABLE `folios`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `stay_id` (`stay_id`),
  ADD UNIQUE KEY `folio_number` (`folio_number`);

--
-- Indexes for table `menu_categories`
--
ALTER TABLE `menu_categories`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `category_name` (`category_name`);

--
-- Indexes for table `menu_items`
--
ALTER TABLE `menu_items`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_cat_item` (`category_id`,`item_name`);

--
-- Indexes for table `menu_item_categories`
--
ALTER TABLE `menu_item_categories`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_dept_name` (`department`,`name`);

--
-- Indexes for table `payments`
--
ALTER TABLE `payments`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `receipt_number` (`receipt_number`),
  ADD UNIQUE KEY `uq_payments_idempotency_part` (`idempotency_key`,`idempotency_part`),
  ADD KEY `folio_id` (`folio_id`);

--
-- Indexes for table `portal_tokens`
--
ALTER TABLE `portal_tokens`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `token_hash` (`token_hash`),
  ADD KEY `stay_id` (`stay_id`);

--
-- Indexes for table `refunds`
--
ALTER TABLE `refunds`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `refund_number` (`refund_number`),
  ADD KEY `requested_by` (`requested_by`),
  ADD KEY `approved_by` (`approved_by`),
  ADD KEY `processed_by` (`processed_by`),
  ADD KEY `folio_id` (`folio_id`,`status`),
  ADD KEY `payment_id` (`payment_id`,`status`);

--
-- Indexes for table `refund_transactions`
--
ALTER TABLE `refund_transactions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_refund_attempt` (`refund_id`,`attempt_number`),
  ADD KEY `processed_by` (`processed_by`),
  ADD KEY `idx_refund_tx_reference` (`transaction_reference`);

--
-- Indexes for table `restaurant_orders`
--
ALTER TABLE `restaurant_orders`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `order_code` (`order_code`),
  ADD KEY `idx_stay` (`stay_id`),
  ADD KEY `idx_status` (`order_status`),
  ADD KEY `idx_customer` (`customer_id`);

--
-- Indexes for table `restaurant_order_items`
--
ALTER TABLE `restaurant_order_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_order` (`order_id`),
  ADD KEY `idx_item` (`item_id`);

--
-- Indexes for table `role_permissions`
--
ALTER TABLE `role_permissions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_role_perm` (`role`,`permission`),
  ADD KEY `idx_role` (`role`);

--
-- Indexes for table `rooms`
--
ALTER TABLE `rooms`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `room_number` (`room_number`),
  ADD KEY `room_type_id` (`room_type_id`);

--
-- Indexes for table `room_transfers`
--
ALTER TABLE `room_transfers`
  ADD PRIMARY KEY (`id`),
  ADD KEY `stay_id` (`stay_id`),
  ADD KEY `from_room_id` (`from_room_id`),
  ADD KEY `to_room_id` (`to_room_id`),
  ADD KEY `authorized_by` (`authorized_by`);

--
-- Indexes for table `room_type`
--


--
-- Indexes for table `room_types`
--
ALTER TABLE `room_types`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `name` (`name`);

--
-- Indexes for table `service_catalog`
--
ALTER TABLE `service_catalog`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_service_catalog_name_category` (`name`,`category`);

--
-- Indexes for table `service_requests`
--
ALTER TABLE `service_requests`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `request_code` (`request_code`),
  ADD KEY `requested_room_id` (`requested_room_id`),
  ADD KEY `completed_by` (`completed_by`),
  ADD KEY `stay_id` (`stay_id`,`status`);

--
-- Indexes for table `service_request_history`
--
ALTER TABLE `service_request_history`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_req_hist_req_id` (`request_id`);

--
-- Indexes for table `stays`
--
ALTER TABLE `stays`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `stay_code` (`stay_code`),
  ADD KEY `room_id` (`room_id`),
  ADD KEY `created_by` (`created_by`),
  ADD KEY `fk_stays_customer` (`customer_id`);

--
-- Indexes for table `tax_config`
--
ALTER TABLE `tax_config`
  ADD PRIMARY KEY (`tax_config_id`),
  ADD UNIQUE KEY `uk_tax_name` (`tax_name`);

--
-- Indexes for table `user`
--


--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `username` (`username`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `applied_discounts`
--
ALTER TABLE `applied_discounts`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `audit_logs`
--
ALTER TABLE `audit_logs`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `billing_adjustments`
--
ALTER TABLE `billing_adjustments`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `billing_policies`
--
ALTER TABLE `billing_policies`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `charges`
--
ALTER TABLE `charges`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `charge_categories`
--
ALTER TABLE `charge_categories`
  MODIFY `charge_category_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `checkin_payments`
--
ALTER TABLE `checkin_payments`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `checkout_records`
--
ALTER TABLE `checkout_records`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `customers`
--
ALTER TABLE `customers`
  MODIFY `customer_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `department_inventory`
--
ALTER TABLE `department_inventory`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `discount_policies`
--
ALTER TABLE `discount_policies`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `discount_type`
--
ALTER TABLE `discount_type`
  MODIFY `discount_type_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `early_checkout_policy_configs`
--
ALTER TABLE `early_checkout_policy_configs`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `early_checkout_requests`
--
ALTER TABLE `early_checkout_requests`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `folios`
--
ALTER TABLE `folios`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `menu_categories`
--
ALTER TABLE `menu_categories`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `menu_items`
--
ALTER TABLE `menu_items`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `menu_item_categories`
--
ALTER TABLE `menu_item_categories`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `payments`
--
ALTER TABLE `payments`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `portal_tokens`
--
ALTER TABLE `portal_tokens`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `refunds`
--
ALTER TABLE `refunds`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `refund_transactions`
--
ALTER TABLE `refund_transactions`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `restaurant_orders`
--
ALTER TABLE `restaurant_orders`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `restaurant_order_items`
--
ALTER TABLE `restaurant_order_items`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `role_permissions`
--
ALTER TABLE `role_permissions`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `rooms`
--
ALTER TABLE `rooms`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `room_transfers`
--
ALTER TABLE `room_transfers`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `room_type`
--


--
-- AUTO_INCREMENT for table `room_types`
--
ALTER TABLE `room_types`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `service_catalog`
--
ALTER TABLE `service_catalog`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `service_requests`
--
ALTER TABLE `service_requests`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `service_request_history`
--
ALTER TABLE `service_request_history`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `stays`
--
ALTER TABLE `stays`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tax_config`
--
ALTER TABLE `tax_config`
  MODIFY `tax_config_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `user`
--


--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `applied_discounts`
--
ALTER TABLE `applied_discounts`
  ADD CONSTRAINT `applied_discounts_ibfk_1` FOREIGN KEY (`folio_id`) REFERENCES `folios` (`id`),
  ADD CONSTRAINT `applied_discounts_ibfk_2` FOREIGN KEY (`policy_id`) REFERENCES `discount_policies` (`id`),
  ADD CONSTRAINT `applied_discounts_ibfk_3` FOREIGN KEY (`applied_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `applied_discounts_ibfk_4` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`);

--
-- Constraints for table `audit_logs`
--
ALTER TABLE `audit_logs`
  ADD CONSTRAINT `audit_logs_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);

--
-- Constraints for table `billing_adjustments`
--
ALTER TABLE `billing_adjustments`
  ADD CONSTRAINT `billing_adjustments_ibfk_1` FOREIGN KEY (`folio_id`) REFERENCES `folios` (`id`),
  ADD CONSTRAINT `billing_adjustments_ibfk_2` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `billing_adjustments_ibfk_3` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `billing_adjustments_ibfk_4` FOREIGN KEY (`applied_charge_id`) REFERENCES `charges` (`id`);

--
-- Constraints for table `billing_policies`
--
ALTER TABLE `billing_policies`
  ADD CONSTRAINT `billing_policies_ibfk_1` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);

--
-- Constraints for table `charges`
--
ALTER TABLE `charges`
  ADD CONSTRAINT `charges_ibfk_1` FOREIGN KEY (`folio_id`) REFERENCES `folios` (`id`),
  ADD CONSTRAINT `charges_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);

--
-- Constraints for table `checkout_records`
--
ALTER TABLE `checkout_records`
  ADD CONSTRAINT `checkout_records_ibfk_1` FOREIGN KEY (`stay_id`) REFERENCES `stays` (`id`),
  ADD CONSTRAINT `checkout_records_ibfk_2` FOREIGN KEY (`folio_id`) REFERENCES `folios` (`id`),
  ADD CONSTRAINT `checkout_records_ibfk_3` FOREIGN KEY (`finalized_by`) REFERENCES `users` (`id`);

--
-- Constraints for table `discount_policies`
--
ALTER TABLE `discount_policies`
  ADD CONSTRAINT `discount_policies_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);

--
-- Constraints for table `early_checkout_policy_configs`
--
ALTER TABLE `early_checkout_policy_configs`
  ADD CONSTRAINT `fk_early_policy_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);

--
-- Constraints for table `early_checkout_requests`
--
ALTER TABLE `early_checkout_requests`
  ADD CONSTRAINT `early_checkout_requests_ibfk_1` FOREIGN KEY (`stay_id`) REFERENCES `stays` (`id`),
  ADD CONSTRAINT `early_checkout_requests_ibfk_2` FOREIGN KEY (`folio_id`) REFERENCES `folios` (`id`),
  ADD CONSTRAINT `early_checkout_requests_ibfk_3` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `early_checkout_requests_ibfk_4` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`);

--
-- Constraints for table `folios`
--
ALTER TABLE `folios`
  ADD CONSTRAINT `folios_ibfk_1` FOREIGN KEY (`stay_id`) REFERENCES `stays` (`id`);

--
-- Constraints for table `payments`
--
ALTER TABLE `payments`
  ADD CONSTRAINT `payments_ibfk_1` FOREIGN KEY (`folio_id`) REFERENCES `folios` (`id`);

--
-- Constraints for table `portal_tokens`
--
ALTER TABLE `portal_tokens`
  ADD CONSTRAINT `portal_tokens_ibfk_1` FOREIGN KEY (`stay_id`) REFERENCES `stays` (`id`);

--
-- Constraints for table `refunds`
--
ALTER TABLE `refunds`
  ADD CONSTRAINT `refunds_ibfk_1` FOREIGN KEY (`folio_id`) REFERENCES `folios` (`id`),
  ADD CONSTRAINT `refunds_ibfk_2` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`),
  ADD CONSTRAINT `refunds_ibfk_3` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `refunds_ibfk_4` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `refunds_ibfk_5` FOREIGN KEY (`processed_by`) REFERENCES `users` (`id`);

--
-- Constraints for table `refund_transactions`
--
ALTER TABLE `refund_transactions`
  ADD CONSTRAINT `refund_transactions_ibfk_1` FOREIGN KEY (`refund_id`) REFERENCES `refunds` (`id`),
  ADD CONSTRAINT `refund_transactions_ibfk_2` FOREIGN KEY (`processed_by`) REFERENCES `users` (`id`);

--
-- Constraints for table `rooms`
--
ALTER TABLE `rooms`
  ADD CONSTRAINT `rooms_ibfk_1` FOREIGN KEY (`room_type_id`) REFERENCES `room_types` (`id`);

--
-- Constraints for table `room_transfers`
--
ALTER TABLE `room_transfers`
  ADD CONSTRAINT `room_transfers_ibfk_1` FOREIGN KEY (`stay_id`) REFERENCES `stays` (`id`),
  ADD CONSTRAINT `room_transfers_ibfk_2` FOREIGN KEY (`from_room_id`) REFERENCES `rooms` (`id`),
  ADD CONSTRAINT `room_transfers_ibfk_3` FOREIGN KEY (`to_room_id`) REFERENCES `rooms` (`id`),
  ADD CONSTRAINT `room_transfers_ibfk_4` FOREIGN KEY (`authorized_by`) REFERENCES `users` (`id`);

--
-- Constraints for table `service_requests`
--
ALTER TABLE `service_requests`
  ADD CONSTRAINT `service_requests_ibfk_1` FOREIGN KEY (`stay_id`) REFERENCES `stays` (`id`),
  ADD CONSTRAINT `service_requests_ibfk_2` FOREIGN KEY (`requested_room_id`) REFERENCES `rooms` (`id`),
  ADD CONSTRAINT `service_requests_ibfk_3` FOREIGN KEY (`completed_by`) REFERENCES `users` (`id`);

--
-- Constraints for table `service_request_history`
--
ALTER TABLE `service_request_history`
  ADD CONSTRAINT `service_request_history_ibfk_1` FOREIGN KEY (`request_id`) REFERENCES `service_requests` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `stays`
--
ALTER TABLE `stays`
  ADD CONSTRAINT `fk_stays_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`customer_id`) ON DELETE SET NULL,
  ADD CONSTRAINT `stays_ibfk_1` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`id`),
  ADD CONSTRAINT `stays_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);


/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;


-- Canonical VAT configuration used by the PHP billing engine (12% as configured in source dump).
INSERT INTO `billing_policies` (`policy_key`, `policy_value`) VALUES ('VAT_RATE', '12')
ON DUPLICATE KEY UPDATE `policy_value`=VALUES(`policy_value`);

-- Restaurant integrity constraints: fresh database has no operational rows to clean up.
-- The application posts a folio charge transactionally before setting Billed to Room.
ALTER TABLE `restaurant_orders`
  ADD KEY `idx_restaurant_orders_stay_id` (`stay_id`),
  ADD CONSTRAINT `fk_restaurant_orders_stay` FOREIGN KEY (`stay_id`) REFERENCES `stays` (`id`) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `restaurant_order_items`
  ADD KEY `idx_restaurant_order_items_order_id` (`order_id`),
  ADD CONSTRAINT `fk_restaurant_order_items_order` FOREIGN KEY (`order_id`) REFERENCES `restaurant_orders` (`id`) ON UPDATE CASCADE ON DELETE RESTRICT;


-- Check-in payment references use the same identifier types as their parent tables.
ALTER TABLE `checkin_payments`
  ADD KEY `idx_checkin_payments_folio` (`folio_id`),
  ADD KEY `idx_checkin_payments_payment` (`payment_id`),
  ADD CONSTRAINT `fk_checkin_payments_stay` FOREIGN KEY (`stay_id`) REFERENCES `stays` (`id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT `fk_checkin_payments_folio` FOREIGN KEY (`folio_id`) REFERENCES `folios` (`id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT `fk_checkin_payments_payment` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT `fk_checkin_payments_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT `fk_checkin_payments_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT `fk_checkin_payments_confirmed_by` FOREIGN KEY (`confirmed_by`) REFERENCES `users` (`id`) ON UPDATE CASCADE ON DELETE RESTRICT;
