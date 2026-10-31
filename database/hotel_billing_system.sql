-- phpMyAdmin SQL Dump
-- version 5.2.3
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Oct 30, 2026 at 09:58 AM
-- Server version: 10.11.16-MariaDB
-- PHP Version: 8.5.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
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

--
-- Dumping data for table `applied_discounts`
--

INSERT INTO `applied_discounts` (`id`, `folio_id`, `policy_id`, `name`, `category`, `discount_type`, `discount_value`, `amount`, `status`, `reason`, `applied_by`, `approved_by`, `approved_at`, `created_at`) VALUES
(0, 13, 2, 'PWD (20%)', 'PWD', 'PERCENT', 20.00, 560.00, 'APPLIED', 'Applied during cashier check-in approval: PWD (20%)', 4, 4, NULL, '2026-10-27 03:26:20'),
(1, 1, NULL, 'Senior Citizen (wa ra gud)', 'SENIOR_CITIZEN', 'FIXED', 178.57, 178.57, 'APPROVED', 'wa ra gud', 3, 3, '2026-10-25 13:44:14', '2026-10-25 05:44:14'),
(3, 14, 8, 'Birthday promotion (9%)', 'BIRTHDAY', 'PERCENT', 9.00, 315.00, 'APPLIED', 'Applied during cashier check-in approval: Birthday promotion (9%)', 4, 4, NULL, '2026-10-27 03:54:57'),
(4, 16, 11, 'Off-season promotion (25%)', 'OFF_SEASON', 'PERCENT', 25.00, 750.00, 'APPLIED', 'Applied during cashier check-in approval: Off-season promotion (25%)', 4, 4, NULL, '2026-10-29 14:09:04'),
(11, 35, 2, 'PWD (20%)', 'PWD', 'PERCENT', 20.00, 267.86, 'APPLIED', 'Group check-in discount: PWD', 4, 4, NULL, '2026-10-30 04:33:06'),
(12, 36, 2, 'PWD (20%)', 'PWD', 'PERCENT', 20.00, 500.00, 'APPLIED', 'Group check-in discount: PWD', 4, 4, NULL, '2026-10-30 04:33:06');

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

--
-- Dumping data for table `audit_logs`
--

INSERT INTO `audit_logs` (`id`, `user_id`, `action`, `entity_type`, `entity_id`, `details`, `ip_address`, `created_at`) VALUES
(1, 1, 'LOGIN', 'user', 1, '[]', '::1', '2026-10-24 13:54:23'),
(2, 1, 'CREATE_USER', 'user', 2, '{\"username\":\"manager\",\"role\":\"manager\",\"active\":1}', '::1', '2026-10-24 13:55:55'),
(3, 1, 'CREATE_USER', 'user', 3, '{\"username\":\"frontdesk\",\"role\":\"frontdesk\",\"active\":1}', '::1', '2026-10-24 13:56:14'),
(4, 1, 'CREATE_USER', 'user', 4, '{\"username\":\"cashier\",\"role\":\"cashier\",\"active\":1}', '::1', '2026-10-24 13:56:51'),
(5, 1, 'CREATE_USER', 'user', 5, '{\"username\":\"housekeeping\",\"role\":\"housekeeping\",\"active\":1}', '::1', '2026-10-24 13:57:17'),
(6, 1, 'CREATE_USER', 'user', 6, '{\"username\":\"bar\",\"role\":\"bar\",\"active\":1}', '::1', '2026-10-24 13:57:30'),
(7, 1, 'CREATE_USER', 'user', 7, '{\"username\":\"restaurant\",\"role\":\"restaurant\",\"active\":1}', '::1', '2026-10-24 13:57:51'),
(8, 1, 'CREATE_USER', 'user', 8, '{\"username\":\"parking\",\"role\":\"parking_valet\",\"active\":1}', '::1', '2026-10-24 13:58:12'),
(9, 1, 'CREATE_USER', 'user', 9, '{\"username\":\"laundry\",\"role\":\"laundry\",\"active\":1}', '::1', '2026-10-24 13:58:30'),
(10, 1, 'CREATE_USER', 'user', 10, '{\"username\":\"maintenance\",\"role\":\"maintenance\",\"active\":1}', '::1', '2026-10-24 13:58:57'),
(11, 2, 'LOGIN', 'user', 2, '[]', '::1', '2026-10-24 14:05:40'),
(12, 2, 'CREATE_MENU_ITEM', 'service_catalog', 1, '{\"name\":\"Tanduay\",\"category\":\"MINIBAR\",\"price\":200}', '::1', '2026-10-24 14:11:11'),
(13, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-25 05:42:11'),
(14, 3, 'CHECKIN_PAYMENT_DISCOUNT', 'stay', 1, '{\"discount\":200,\"category\":\"SENIOR_CITIZEN\",\"discount_pre_vat\":178.57,\"reason\":\"wa ra gud\",\"gross_total\":3360,\"new_total\":3160}', '::1', '2026-10-25 05:44:14'),
(15, 3, 'CHECK_IN', 'stay', 1, '{\"room\":\"101\",\"nights\":2,\"customer_id\":1,\"guest_name\":\"Pitok Batolata\",\"checkin_payment_id\":1,\"required_amount\":3160,\"required_percent\":100,\"discount_amount\":200}', '::1', '2026-10-25 05:44:14'),
(16, 4, 'LOGIN', 'user', 4, '[]', '::1', '2026-10-25 05:49:25'),
(17, 4, 'CHECKIN_PAYMENT_APPROVED', 'stay', 1, '{\"checkin_payment_id\":1,\"payment_id\":1,\"receipt_number\":\"OR261025F5E8DB\",\"amount\":3160,\"applied\":3160,\"received\":3160,\"change\":0,\"method\":\"CASH\",\"guest_name\":\"Pitok Batolata\",\"room\":\"101\"}', '::1', '2026-10-25 05:49:58'),
(18, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-25 05:50:45'),
(19, NULL, 'RESTAURANT_ORDER_PLACED', 'restaurant_order', 1, '{\"order_code\":\"RO-EB9EBA20\",\"total_amount\":400,\"order_type\":\"Room Service\",\"room_number\":\"101\"}', '::1', '2026-10-25 05:58:00'),
(20, 7, 'LOGIN', 'user', 7, '[]', '::1', '2026-10-25 06:02:50'),
(21, NULL, 'GUEST_ROOM_TRANSFER_REQUEST', 'service_request', 2, '{\"stay_code\":\"STF90111F7E6\",\"room_number\":\"101\",\"requested_room_id\":6}', '::1', '2026-10-25 06:08:25'),
(22, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-25 06:08:43'),
(23, 2, 'LOGIN', 'user', 2, '[]', '::1', '2026-10-25 06:10:49'),
(24, 4, 'LOGIN', 'user', 4, '[]', '::1', '2026-10-25 12:25:17'),
(25, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-26 09:37:20'),
(26, 3, 'GROUP_CHECK_IN', 'stay', 4, '{\"group_booking_id\":6,\"group_code\":\"GR04794975E4\",\"room\":\"103\",\"nights\":1,\"expected_departure_date\":\"2026-10-27\",\"occupant_names\":[\"dfds\"],\"customer_id\":4,\"checkin_payment_id\":4,\"required_amount\":1680,\"required_percent\":100}', '::1', '2026-10-26 11:09:37'),
(27, 3, 'GROUP_CHECK_IN', 'stay', 5, '{\"group_booking_id\":6,\"group_code\":\"GR04794975E4\",\"room\":\"102\",\"nights\":1,\"expected_departure_date\":\"2026-10-27\",\"occupant_names\":[\"dfdf\"],\"customer_id\":4,\"checkin_payment_id\":5,\"required_amount\":1680,\"required_percent\":100}', '::1', '2026-10-26 11:09:37'),
(28, 3, 'GROUP_BOOKING_CREATED', 'group_booking', 6, '{\"group_code\":\"GR04794975E4\",\"customer_id\":4,\"stay_ids\":[4,5],\"room_count\":2,\"nights\":1}', '::1', '2026-10-26 11:09:37'),
(29, 4, 'LOGIN', 'user', 4, '[]', '::1', '2026-10-26 11:17:35'),
(30, 4, 'CHECKIN_PAYMENT_APPROVED', 'stay', 5, '{\"checkin_payment_id\":5,\"payment_id\":0,\"receipt_number\":\"OR261026E3C372\",\"amount\":1680,\"applied\":1680,\"received\":1680,\"change\":0,\"method\":\"CASH\",\"guest_name\":\"Ronald Intud\",\"room\":\"102\"}', '::1', '2026-10-26 11:17:44'),
(31, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-26 11:18:07'),
(32, 3, 'CHECK_IN', 'stay', 6, '{\"room\":\"202\",\"nights\":1,\"customer_id\":5,\"guest_name\":\"Rastel Bansing\",\"checkin_payment_id\":6,\"required_amount\":2464,\"required_percent\":100,\"discount_amount\":0}', '::1', '2026-10-26 12:51:43'),
(33, 4, 'LOGIN', 'user', 4, '[]', '::1', '2026-10-26 12:52:17'),
(34, 3, 'CHECKIN_PAYMENT_CANCELLED', 'stay', 4, '{\"stay_code\":\"ST0F03AFD2F9\",\"room\":\"103\"}', '::1', '2026-10-26 12:58:54'),
(35, 4, 'LOGIN', 'user', 4, '[]', '::1', '2026-10-26 12:59:12'),
(36, 4, 'LOGIN', 'user', 4, '[]', '::1', '2026-10-26 13:02:23'),
(37, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-26 13:02:59'),
(38, 3, 'GROUP_CHECK_IN', 'stay', 7, '{\"group_booking_id\":7,\"group_code\":\"GR2D48CF1D3F\",\"room\":\"503\",\"nights\":1,\"expected_departure_date\":\"2026-10-27\",\"occupant_names\":[\"dfg\"],\"customer_id\":6,\"checkin_payment_id\":7,\"required_amount\":5600,\"required_percent\":100}', '::1', '2026-10-26 13:03:50'),
(39, 3, 'GROUP_CHECK_IN', 'stay', 8, '{\"group_booking_id\":7,\"group_code\":\"GR2D48CF1D3F\",\"room\":\"601\",\"nights\":1,\"expected_departure_date\":\"2026-10-27\",\"occupant_names\":[\"fdf\"],\"customer_id\":6,\"checkin_payment_id\":8,\"required_amount\":9520,\"required_percent\":100}', '::1', '2026-10-26 13:03:50'),
(40, 3, 'GROUP_BOOKING_CREATED', 'group_booking', 7, '{\"group_code\":\"GR2D48CF1D3F\",\"customer_id\":6,\"stay_ids\":[7,8],\"room_count\":2,\"nights\":1}', '::1', '2026-10-26 13:03:50'),
(41, 4, 'LOGIN', 'user', 4, '[]', '::1', '2026-10-26 13:04:20'),
(42, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-26 13:13:11'),
(43, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-26 14:00:25'),
(44, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-26 14:18:12'),
(45, 3, 'GUEST_PORTAL_LINK_ISSUED', 'stay', 5, '{\"stay_code\":\"ST62FEB8CDC7\",\"expires_at\":\"2026-10-27 23:59:59\"}', '::1', '2026-10-26 14:20:58'),
(46, 3, 'GUEST_PORTAL_LINK_ISSUED', 'stay', 5, '{\"stay_code\":\"ST62FEB8CDC7\",\"expires_at\":\"2026-10-27 23:59:59\"}', '::1', '2026-10-26 14:23:13'),
(47, 3, 'GUEST_PORTAL_LINK_ISSUED', 'stay', 5, '{\"stay_code\":\"ST62FEB8CDC7\",\"expires_at\":\"2026-10-27 23:59:59\"}', '::1', '2026-10-26 14:24:56'),
(48, 4, 'LOGIN', 'user', 4, '[]', '::1', '2026-10-26 14:26:18'),
(49, 3, 'GUEST_PORTAL_LINK_ISSUED', 'stay', 5, '{\"stay_code\":\"ST62FEB8CDC7\",\"expires_at\":\"2026-10-27 23:59:59\"}', '::1', '2026-10-26 14:26:52'),
(50, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-26 14:27:48'),
(51, 3, 'GUEST_PORTAL_LINK_ISSUED', 'stay', 5, '{\"stay_code\":\"ST62FEB8CDC7\",\"expires_at\":\"2026-10-27 23:59:59\"}', '::1', '2026-10-26 14:28:13'),
(52, 3, 'CHECKIN_PAYMENT_CONFIRMED', 'stay', 5, '{\"checkin_payment_id\":5,\"receipt_number\":\"OR261026E3C372\",\"guest_name\":\"Ronald Intud\",\"room\":\"102\"}', '::1', '2026-10-26 14:28:16'),
(53, 3, 'CHECKIN_PAYMENT_CONFIRMED', 'stay', 1, '{\"checkin_payment_id\":1,\"receipt_number\":\"OR261025F5E8DB\",\"guest_name\":\"Pitok Batolata\",\"room\":\"101\"}', '::1', '2026-10-26 14:28:22'),
(54, 4, 'LOGIN', 'user', 4, '[]', '::1', '2026-10-26 14:28:44'),
(55, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-26 14:29:26'),
(56, 7, 'LOGIN', 'user', 7, '[]', '::1', '2026-10-26 14:33:39'),
(57, 7, 'SERVICE_STATUS', 'service_request', 0, '{\"from\":\"PENDING\",\"to\":\"ACKNOWLEDGED\",\"kind\":\"SERVICE\"}', '::1', '2026-10-26 14:33:49'),
(58, 7, 'SERVICE_STATUS', 'service_request', 0, '{\"from\":\"ACKNOWLEDGED\",\"to\":\"IN_PROGRESS\",\"kind\":\"SERVICE\"}', '::1', '2026-10-26 14:33:59'),
(59, 7, 'SERVICE_STATUS', 'service_request', 0, '{\"from\":\"IN_PROGRESS\",\"to\":\"COMPLETED\",\"kind\":\"SERVICE\"}', '::1', '2026-10-26 14:34:10'),
(60, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-26 14:35:47'),
(61, 3, 'GROUP_CHECK_IN', 'stay', 9, '{\"group_booking_id\":8,\"group_code\":\"GR57A022B37A\",\"room\":\"103\",\"nights\":1,\"expected_departure_date\":\"2026-10-27\",\"occupant_names\":[\"dfgdsg\"],\"customer_id\":7,\"checkin_payment_id\":9,\"required_amount\":1680,\"required_percent\":100}', '::1', '2026-10-26 14:43:35'),
(62, 3, 'GROUP_CHECK_IN', 'stay', 10, '{\"group_booking_id\":8,\"group_code\":\"GR57A022B37A\",\"room\":\"201\",\"nights\":1,\"expected_departure_date\":\"2026-10-27\",\"occupant_names\":[\"sdgdsf\"],\"customer_id\":7,\"checkin_payment_id\":10,\"required_amount\":2464,\"required_percent\":100}', '::1', '2026-10-26 14:43:35'),
(63, 3, 'GROUP_BOOKING_CREATED', 'group_booking', 8, '{\"group_code\":\"GR57A022B37A\",\"customer_id\":7,\"stay_ids\":[9,10],\"room_count\":2,\"nights\":1}', '::1', '2026-10-26 14:43:35'),
(64, 4, 'LOGIN', 'user', 4, '[]', '::1', '2026-10-26 14:53:31'),
(65, 4, 'CHECKIN_PAYMENT_APPROVED', 'stay', 6, '{\"checkin_payment_id\":6,\"payment_id\":2,\"receipt_number\":\"OR261026379D3E\",\"amount\":2464,\"applied\":2464,\"received\":2464,\"change\":0,\"method\":\"CASH\",\"guest_name\":\"Rastel Bansing\",\"room\":\"202\"}', '::1', '2026-10-26 14:57:43'),
(66, 4, 'CHECKIN_PAYMENT_APPROVED', 'stay', 9, '{\"checkin_payment_id\":9,\"payment_id\":3,\"receipt_number\":\"OR2610261641E9\",\"amount\":1680,\"applied\":1680,\"received\":1680,\"change\":0,\"method\":\"CASH\",\"guest_name\":\"Lourd Andig\",\"room\":\"103\"}', '::1', '2026-10-26 15:10:49'),
(67, 4, 'CHECKIN_PAYMENT_APPROVED', 'stay', 10, '{\"checkin_payment_id\":10,\"payment_id\":4,\"receipt_number\":\"OR261026062D8F\",\"amount\":2464,\"applied\":2464,\"received\":2464,\"change\":0,\"method\":\"CASH\",\"guest_name\":\"Lourd Andig\",\"room\":\"201\"}', '::1', '2026-10-26 15:10:56'),
(68, 4, 'CHECKIN_PAYMENT_APPROVED', 'stay', 7, '{\"checkin_payment_id\":7,\"payment_id\":5,\"receipt_number\":\"OR261026E89A09\",\"amount\":5600,\"applied\":5600,\"received\":5600,\"change\":0,\"method\":\"CASH\",\"guest_name\":\"Gabby Magusara\",\"room\":\"503\"}', '::1', '2026-10-26 15:11:05'),
(69, 4, 'CHECKIN_PAYMENT_APPROVED', 'stay', 8, '{\"checkin_payment_id\":8,\"payment_id\":6,\"receipt_number\":\"OR261026B42BBA\",\"amount\":9520,\"applied\":9520,\"received\":9520,\"change\":0,\"method\":\"CASH\",\"guest_name\":\"Gabby Magusara\",\"room\":\"601\"}', '::1', '2026-10-26 15:11:12'),
(70, 5, 'LOGIN', 'user', 5, '[]', '::1', '2026-10-26 15:21:05'),
(71, 5, 'CREATE_INVENTORY', 'department_inventory', 0, '{\"dept\":\"housekeeping\",\"item\":\"Gakotch\",\"qty\":10}', '::1', '2026-10-26 15:21:48'),
(72, 7, 'LOGIN', 'user', 7, '[]', '::1', '2026-10-26 15:22:07'),
(73, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-27 01:04:18'),
(74, 3, 'CHECK_OUT', 'stay', 6, '[]', '::1', '2026-10-27 01:09:11'),
(75, 4, 'LOGIN', 'user', 4, '[]', '::1', '2026-10-27 01:15:31'),
(76, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-27 01:25:34'),
(77, 3, 'CHECKIN_PAYMENT_CONFIRMED', 'stay', 9, '{\"checkin_payment_id\":9,\"receipt_number\":\"OR2610261641E9\",\"guest_name\":\"Lourd Andig\",\"room\":\"103\"}', '::1', '2026-10-27 01:25:41'),
(78, 3, 'CHECKIN_PAYMENT_CONFIRMED', 'stay', 10, '{\"checkin_payment_id\":10,\"receipt_number\":\"OR261026062D8F\",\"guest_name\":\"Lourd Andig\",\"room\":\"201\"}', '::1', '2026-10-27 01:25:43'),
(79, 3, 'CHECKIN_PAYMENT_CONFIRMED', 'stay', 7, '{\"checkin_payment_id\":7,\"receipt_number\":\"OR261026E89A09\",\"guest_name\":\"Gabby Magusara\",\"room\":\"503\"}', '::1', '2026-10-27 01:25:44'),
(80, 3, 'CHECKIN_PAYMENT_CONFIRMED', 'stay', 8, '{\"checkin_payment_id\":8,\"receipt_number\":\"OR261026B42BBA\",\"guest_name\":\"Gabby Magusara\",\"room\":\"601\"}', '::1', '2026-10-27 01:25:45'),
(81, 3, 'CHECKIN_PAYMENT_CONFIRMED', 'stay', 6, '{\"checkin_payment_id\":6,\"receipt_number\":\"OR261026379D3E\",\"guest_name\":\"Rastel Bansing\",\"room\":\"202\"}', '::1', '2026-10-27 01:25:46'),
(82, 4, 'LOGIN', 'user', 4, '[]', '::1', '2026-10-27 01:29:51'),
(83, 4, 'PAYMENT', 'folio', 5, '{\"amount\":112,\"receipts\":[\"OR26102769B955\"],\"split_count\":1}', '::1', '2026-10-27 01:51:36'),
(84, 4, 'PAYMENT', 'folio', 1, '{\"amount\":448,\"receipts\":[\"OR261027097AC9\",\"OR2610272FD7E6\"],\"split_count\":2}', '::1', '2026-10-27 01:59:48'),
(85, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-27 02:11:38'),
(86, 3, 'CHECK_IN', 'stay', 11, '{\"room\":\"203\",\"nights\":2,\"customer_id\":8,\"guest_name\":\"Kulas Dimalas\",\"checkin_payment_id\":11,\"required_amount\":4928,\"required_percent\":100,\"discount_amount\":0}', '::1', '2026-10-27 02:12:22'),
(87, 4, 'LOGIN', 'user', 4, '[]', '::1', '2026-10-27 02:14:22'),
(88, 4, 'CHECKIN_PAYMENT_APPROVED', 'stay', 11, '{\"checkin_payment_id\":11,\"payment_id\":10,\"receipt_number\":\"OR261027089DDB\",\"amount\":4928,\"applied\":4928,\"received\":4928,\"change\":0,\"method\":\"CASH\",\"guest_name\":\"Kulas Dimalas\",\"room\":\"203\"}', '::1', '2026-10-27 02:28:20'),
(89, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-27 02:42:37'),
(90, 3, 'CHECK_IN', 'stay', 12, '{\"room\":\"602\",\"nights\":1,\"customer_id\":9,\"guest_name\":\"Uncle Dags\",\"checkin_payment_id\":12,\"required_amount\":9520,\"required_percent\":100,\"discount_amount\":0}', '::1', '2026-10-27 02:43:06'),
(91, 4, 'LOGIN', 'user', 4, '[]', '::1', '2026-10-27 02:44:36'),
(92, 4, 'CHECKIN_PAYMENT_APPROVED', 'stay', 12, '{\"checkin_payment_id\":12,\"payment_id\":11,\"receipt_number\":\"OR26102767B286\",\"amount\":9520,\"applied\":9520,\"received\":9520,\"change\":0,\"method\":\"CASH\",\"guest_name\":\"Uncle Dags\",\"room\":\"602\"}', '::1', '2026-10-27 03:04:57'),
(93, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-27 03:07:00'),
(94, 3, 'CHECK_IN', 'stay', 13, '{\"room\":\"303\",\"nights\":1,\"customer_id\":10,\"guest_name\":\"Love Jhun Ortiz\",\"checkin_payment_id\":13,\"required_amount\":3136,\"required_percent\":100,\"discount_amount\":0}', '::1', '2026-10-27 03:08:14'),
(95, 4, 'LOGIN', 'user', 4, '[]', '::1', '2026-10-27 03:08:45'),
(96, 4, 'APPLY_CHECKIN_DISCOUNT', 'folio', 13, '{\"discount_id\":0,\"checkin_payment_id\":13,\"category\":\"PWD\",\"rate\":20,\"eligible_amount\":\"2800.00\",\"amount\":\"560.00\",\"eligibility_confirmed\":true}', '::1', '2026-10-27 03:26:20'),
(97, 4, 'CHECKIN_PAYMENT_APPROVED', 'stay', 13, '{\"checkin_payment_id\":13,\"payment_id\":12,\"receipt_number\":\"OR261027ABB6CD\",\"amount\":2508.8,\"applied\":2508.8,\"received\":2508.8,\"change\":0,\"method\":\"GCASH\",\"discount_amount\":\"627.20\",\"discount_category\":\"PWD\",\"guest_name\":\"Love Jhun Ortiz\",\"room\":\"303\"}', '::1', '2026-10-27 03:26:20'),
(98, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-27 03:28:10'),
(99, 3, 'CHECKIN_PAYMENT_CONFIRMED', 'stay', 13, '{\"checkin_payment_id\":13,\"receipt_number\":\"OR261027ABB6CD\",\"guest_name\":\"Love Jhun Ortiz\",\"room\":\"303\"}', '::1', '2026-10-27 03:32:10'),
(100, 3, 'CHECKIN_PAYMENT_CONFIRMED', 'stay', 12, '{\"checkin_payment_id\":12,\"receipt_number\":\"OR26102767B286\",\"guest_name\":\"Uncle Dags\",\"room\":\"602\"}', '::1', '2026-10-27 03:32:14'),
(101, 3, 'CHECKIN_PAYMENT_CONFIRMED', 'stay', 11, '{\"checkin_payment_id\":11,\"receipt_number\":\"OR261027089DDB\",\"guest_name\":\"Kulas Dimalas\",\"room\":\"203\"}', '::1', '2026-10-27 03:32:17'),
(102, 3, 'CHECK_IN', 'stay', 14, '{\"room\":\"403\",\"nights\":1,\"customer_id\":11,\"guest_name\":\"Bugoy Koykoy\",\"checkin_payment_id\":14,\"required_amount\":3920,\"required_percent\":100,\"discount_amount\":0}', '::1', '2026-10-27 03:43:04'),
(103, 4, 'LOGIN', 'user', 4, '[]', '::1', '2026-10-27 03:43:32'),
(104, 4, 'APPLY_CHECKIN_DISCOUNT', 'folio', 14, '{\"discount_id\":3,\"checkin_payment_id\":14,\"category\":\"BIRTHDAY\",\"rate\":9,\"eligible_amount\":\"3500.00\",\"amount\":\"315.00\",\"eligibility_confirmed\":false}', '::1', '2026-10-27 03:54:57'),
(105, 4, 'CHECKIN_PAYMENT_APPROVED', 'stay', 14, '{\"checkin_payment_id\":14,\"payment_id\":13,\"receipt_number\":\"OR26102724958D\",\"amount\":3567.2,\"applied\":3567.2,\"received\":3567.2,\"change\":0,\"method\":\"CASH\",\"discount_amount\":\"352.80\",\"discount_category\":\"BIRTHDAY\",\"guest_name\":\"Bugoy Koykoy\",\"room\":\"403\"}', '::1', '2026-10-27 03:54:57'),
(106, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-27 03:55:45'),
(107, 3, 'CHECKIN_PAYMENT_CONFIRMED', 'stay', 14, '{\"checkin_payment_id\":14,\"receipt_number\":\"OR26102724958D\",\"guest_name\":\"Bugoy Koykoy\",\"room\":\"403\"}', '::1', '2026-10-27 03:56:03'),
(108, 1, 'LOGIN', 'user', 1, '[]', '::1', '2026-10-28 13:22:24'),
(109, 1, 'REQUEST_ASSIGN', 'service_request', 6, '{\"from_dept\":\"restaurant\",\"to_dept\":\"restaurant\"}', '::1', '2026-10-28 13:22:59'),
(110, 7, 'LOGIN', 'user', 7, '[]', '::1', '2026-10-28 13:23:28'),
(111, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-28 13:25:18'),
(112, 7, 'LOGIN', 'user', 7, '[]', '::1', '2026-10-28 13:30:13'),
(113, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-28 14:25:18'),
(114, 3, 'CHECK_OUT', 'stay', 5, '[]', '::1', '2026-10-28 14:26:32'),
(115, 3, 'CHECK_OUT', 'stay', 7, '[]', '::1', '2026-10-28 14:26:57'),
(116, 3, 'CHECK_OUT', 'stay', 10, '[]', '::1', '2026-10-28 14:27:05'),
(117, 5, 'LOGIN', 'user', 5, '[]', '::1', '2026-10-28 14:42:31'),
(118, 5, 'SERVICE_STATUS', 'service_request', 7, '{\"from\":\"PENDING\",\"to\":\"REJECTED\",\"kind\":\"SERVICE\"}', '::1', '2026-10-28 14:43:22'),
(119, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-28 14:46:53'),
(120, 2, 'LOGIN', 'user', 2, '[]', '::1', '2026-10-28 14:55:56'),
(121, 2, 'CREATE_USER', 'user', 0, '{\"username\":\"service\",\"role\":\"service\",\"active\":1}', '::1', '2026-10-28 14:56:16'),
(122, 0, 'LOGIN', 'user', 0, '[]', '::1', '2026-10-28 14:56:35'),
(123, 10, 'LOGIN', 'user', 10, '[]', '::1', '2026-10-28 14:57:50'),
(124, 10, 'SERVICE_STATUS', 'service_request', 10, '{\"from\":\"PENDING\",\"to\":\"IN_PROGRESS\",\"kind\":\"SERVICE\"}', '::1', '2026-10-28 15:02:53'),
(125, 10, 'ROOM_STATUS', 'room', 2, '{\"status\":\"MAINTENANCE\"}', '::1', '2026-10-28 15:13:52'),
(126, 10, 'ROOM_STATUS', 'room', 2, '{\"status\":\"AVAILABLE\"}', '::1', '2026-10-28 15:14:02'),
(127, 10, 'ROOM_STATUS', 'room', 5, '{\"status\":\"AVAILABLE\"}', '::1', '2026-10-28 15:14:09'),
(128, 10, 'ROOM_STATUS', 'room', 6, '{\"status\":\"MAINTENANCE\"}', '::1', '2026-10-28 15:14:13'),
(129, 10, 'ROOM_STATUS', 'room', 13, '{\"status\":\"AVAILABLE\"}', '::1', '2026-10-28 15:14:22'),
(130, 10, 'REQUEST_SAFETY_FLAG', 'service_request', 10, '{\"department\":\"maintenance\"}', '::1', '2026-10-28 15:15:10'),
(131, 0, 'LOGIN', 'user', 0, '[]', '::1', '2026-10-28 15:15:33'),
(132, 4, 'LOGIN', 'user', 4, '[]', '::1', '2026-10-28 15:17:49'),
(133, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-28 15:19:21'),
(134, 4, 'LOGIN', 'user', 4, '[]', '::1', '2026-10-28 15:23:37'),
(135, 4, 'PAYMENT', 'folio', 14, '{\"amount\":235.2,\"receipts\":[\"OR261028C3EB20\"],\"split_count\":1}', '::1', '2026-10-28 15:28:36'),
(136, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-28 15:30:01'),
(137, 3, 'CHECK_OUT', 'stay', 8, '[]', '::1', '2026-10-28 15:30:46'),
(138, 3, 'CHECK_OUT', 'stay', 9, '[]', '::1', '2026-10-28 15:30:57'),
(139, 3, 'CHECK_OUT', 'stay', 11, '[]', '::1', '2026-10-28 15:31:05'),
(140, 3, 'CHECK_OUT', 'stay', 12, '[]', '::1', '2026-10-28 15:31:12'),
(141, 3, 'CHECK_OUT', 'stay', 13, '[]', '::1', '2026-10-28 15:31:18'),
(142, 2, 'LOGIN', 'user', 2, '[]', '::1', '2026-10-28 15:32:28'),
(143, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-28 15:35:13'),
(144, 3, 'GUEST_PORTAL_LINK_ISSUED', 'stay', 1, '{\"stay_code\":\"STF90111F7E6\",\"expires_at\":\"2026-10-28 23:59:59\"}', '::1', '2026-10-28 15:35:50'),
(145, 4, 'LOGIN', 'user', 4, '[]', '::1', '2026-10-28 15:42:12'),
(146, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-29 04:55:01'),
(147, 3, 'REQUEST_ASSIGN', 'service_request', 10, '{\"from_dept\":\"maintenance\",\"to_dept\":\"maintenance\"}', '::1', '2026-10-29 04:55:51'),
(148, 3, 'REQUEST_ASSIGN', 'service_request', 11, '{\"from_dept\":\"service\",\"to_dept\":\"service\"}', '::1', '2026-10-29 04:56:16'),
(149, 6, 'LOGIN', 'user', 6, '[]', '::1', '2026-10-29 04:56:39'),
(150, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-29 04:58:08'),
(151, 3, 'GUEST_PORTAL_LINK_ISSUED', 'stay', 14, '{\"stay_code\":\"ST29D092A49A\",\"expires_at\":\"2026-10-29 23:59:59\"}', '::1', '2026-10-29 04:58:42'),
(152, 3, 'CHECK_IN', 'stay', 15, '{\"room\":\"202\",\"nights\":2,\"customer_id\":12,\"guest_name\":\"Bongbong Marcos\",\"checkin_payment_id\":15,\"required_amount\":4928,\"required_percent\":100,\"discount_amount\":0}', '::1', '2026-10-29 05:06:17'),
(153, 10, 'LOGIN', 'user', 10, '[]', '::1', '2026-10-29 05:38:42'),
(154, 10, 'SERVICE_STATUS', 'service_request', 10, '{\"from\":\"ASSIGNED\",\"to\":\"ACKNOWLEDGED\",\"kind\":\"SERVICE\"}', '::1', '2026-10-29 05:38:49'),
(155, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-29 05:39:50'),
(156, 0, 'LOGIN', 'user', 0, '[]', '::1', '2026-10-29 05:42:25'),
(157, 0, 'LOGIN', 'user', 0, '[]', '::1', '2026-10-29 05:43:11'),
(158, 10, 'LOGIN', 'user', 10, '[]', '::1', '2026-10-29 05:50:21'),
(159, 10, 'SERVICE_STATUS', 'service_request', 10, '{\"from\":\"ACKNOWLEDGED\",\"to\":\"IN_PROGRESS\",\"kind\":\"SERVICE\"}', '::1', '2026-10-29 05:50:28'),
(160, 10, 'SERVICE_STATUS', 'service_request', 10, '{\"from\":\"IN_PROGRESS\",\"to\":\"COMPLETED\",\"kind\":\"SERVICE\"}', '::1', '2026-10-29 05:50:46'),
(161, 10, 'ROOM_STATUS', 'room', 1, '{\"status\":\"AVAILABLE\"}', '::1', '2026-10-29 05:51:31'),
(162, 10, 'ROOM_STATUS', 'room', 4, '{\"status\":\"AVAILABLE\"}', '::1', '2026-10-29 05:51:40'),
(163, 10, 'ROOM_STATUS', 'room', 7, '{\"status\":\"MAINTENANCE\"}', '::1', '2026-10-29 05:51:52'),
(164, 10, 'ROOM_STATUS', 'room', 18, '{\"status\":\"AVAILABLE\"}', '::1', '2026-10-29 05:52:02'),
(165, 10, 'ROOM_STATUS', 'room', 17, '{\"status\":\"AVAILABLE\"}', '::1', '2026-10-29 05:52:13'),
(166, 10, 'REQUEST_SAFETY_FLAG', 'service_request', 12, '{\"department\":\"maintenance\"}', '::1', '2026-10-29 05:55:42'),
(167, 10, 'SERVICE_STATUS', 'service_request', 12, '{\"from\":\"PENDING\",\"to\":\"ACKNOWLEDGED\",\"kind\":\"SERVICE\"}', '::1', '2026-10-29 05:56:04'),
(168, 10, 'SERVICE_STATUS', 'service_request', 12, '{\"from\":\"ACKNOWLEDGED\",\"to\":\"ON_HOLD\",\"kind\":\"SERVICE\"}', '::1', '2026-10-29 05:56:38'),
(169, 10, 'SERVICE_STATUS', 'service_request', 12, '{\"from\":\"ON_HOLD\",\"to\":\"IN_PROGRESS\",\"kind\":\"SERVICE\"}', '::1', '2026-10-29 05:57:35'),
(170, 10, 'SERVICE_STATUS', 'service_request', 12, '{\"from\":\"IN_PROGRESS\",\"to\":\"COMPLETED\",\"kind\":\"SERVICE\"}', '::1', '2026-10-29 05:57:47'),
(171, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-29 06:00:49'),
(172, 2, 'LOGIN', 'user', 2, '[]', '::1', '2026-10-29 06:01:16'),
(173, 1, 'LOGIN', 'user', 1, '[]', '::1', '2026-10-29 06:02:17'),
(174, 0, 'LOGIN', 'user', 0, '[]', '::1', '2026-10-29 06:03:27'),
(175, 0, 'LOGIN', 'user', 0, '[]', '::1', '2026-10-29 06:11:01'),
(176, 0, 'LOGIN', 'user', 0, '[]', '::1', '2026-10-29 06:12:38'),
(177, 0, 'LOGIN', 'user', 0, '[]', '::1', '2026-10-29 06:13:01'),
(178, 0, 'SERVICE_STATUS', 'service_request', 8, '{\"from\":\"PENDING\",\"to\":\"ACKNOWLEDGED\",\"kind\":\"SERVICE\"}', '::1', '2026-10-29 06:20:08'),
(179, 0, 'SERVICE_STATUS', 'service_request', 8, '{\"from\":\"ACKNOWLEDGED\",\"to\":\"COMPLETED\",\"kind\":\"SERVICE\"}', '::1', '2026-10-29 06:20:50'),
(180, 0, 'SERVICE_STATUS', 'service_request', 11, '{\"from\":\"ASSIGNED\",\"to\":\"ACKNOWLEDGED\",\"kind\":\"SERVICE\"}', '::1', '2026-10-29 06:21:32'),
(181, 0, 'SERVICE_STATUS', 'service_request', 11, '{\"from\":\"ACKNOWLEDGED\",\"to\":\"IN_PROGRESS\",\"kind\":\"SERVICE\"}', '::1', '2026-10-29 06:21:39'),
(182, 0, 'SERVICE_STATUS', 'service_request', 11, '{\"from\":\"IN_PROGRESS\",\"to\":\"COMPLETED\",\"kind\":\"SERVICE\"}', '::1', '2026-10-29 06:21:51'),
(183, 10, 'LOGIN', 'user', 10, '[]', '::1', '2026-10-29 06:22:27'),
(184, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-29 06:22:47'),
(185, 3, 'REQUEST_ASSIGN', 'service_request', 9, '{\"from_dept\":\"frontdesk\",\"to_dept\":\"maintenance\"}', '::1', '2026-10-29 06:23:54'),
(186, 3, 'REQUEST_ASSIGN', 'service_request', 9, '{\"from_dept\":\"maintenance\",\"to_dept\":\"service\"}', '::1', '2026-10-29 06:24:19'),
(187, 10, 'LOGIN', 'user', 10, '[]', '::1', '2026-10-29 06:24:41'),
(188, 0, 'LOGIN', 'user', 0, '[]', '::1', '2026-10-29 06:24:58'),
(189, 0, 'SERVICE_STATUS', 'service_request', 9, '{\"from\":\"ASSIGNED\",\"to\":\"ACKNOWLEDGED\",\"kind\":\"SERVICE\"}', '::1', '2026-10-29 06:25:16'),
(190, 0, 'SERVICE_STATUS', 'service_request', 9, '{\"from\":\"ACKNOWLEDGED\",\"to\":\"COMPLETED\",\"kind\":\"SERVICE\"}', '::1', '2026-10-29 06:25:45'),
(191, 6, 'LOGIN', 'user', 6, '[]', '::1', '2026-10-29 06:26:30'),
(192, 6, 'MENU_ITEM_CREATE', 'menu_items', 0, '{\"item\":\"Redhorse\",\"category\":\"Cold Drinks\",\"price\":250,\"status\":\"Available\"}', '::1', '2026-10-29 06:56:10'),
(193, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-29 09:55:08'),
(194, 7, 'LOGIN', 'user', 7, '[]', '::1', '2026-10-29 09:58:12'),
(195, 8, 'LOGIN', 'user', 8, '[]', '::1', '2026-10-29 10:03:59'),
(196, 1, 'LOGIN', 'user', 1, '[]', '::1', '2026-10-29 10:08:49'),
(197, 9, 'LOGIN', 'user', 9, '[]', '::1', '2026-10-29 10:10:04'),
(198, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-29 10:11:02'),
(199, 4, 'LOGIN', 'user', 4, '[]', '::1', '2026-10-29 10:12:43'),
(200, 4, 'PAYMENT', 'folio', 14, '{\"amount\":403.2,\"receipts\":[\"OR26102911E258\"],\"split_count\":1}', '::1', '2026-10-29 10:16:01'),
(201, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-29 10:17:01'),
(202, 3, 'CHECK_OUT', 'stay', 14, '[]', '::1', '2026-10-29 10:17:28'),
(203, 2, 'LOGIN', 'user', 2, '[]', '::1', '2026-10-29 10:18:06'),
(204, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-29 10:26:52'),
(205, 1, 'LOGIN', 'user', 1, '[]', '::1', '2026-10-29 12:36:53'),
(206, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-29 12:41:04'),
(207, 3, 'CHECK_IN', 'stay', 16, '{\"room\":\"103\",\"nights\":2,\"customer_id\":13,\"guest_name\":\"Martin Romualdez\",\"checkin_payment_id\":16,\"required_amount\":3360,\"required_percent\":100,\"discount_amount\":0}', '::1', '2026-10-29 12:42:22'),
(208, 1, 'LOGIN', 'user', 1, '[]', '::1', '2026-10-29 12:50:23'),
(209, 1, 'CREATE_EARLY_CHECKOUT_POLICY', 'early_checkout_policy', 0, '{\"name\":\"Manager-approved early departure exception\",\"active\":1}', '::1', '2026-10-29 12:50:47'),
(210, 1, 'DEMO_CLOCK_SET', 'demo_clock', 1, '{\"simulated_at\":\"2026-10-29 20:50:00\",\"timezone\":\"Asia\\/Manila\"}', '::1', '2026-10-29 12:51:51'),
(211, 1, 'DEMO_CLOCK_RESET', 'demo_clock', 1, '{\"timezone\":\"Asia\\/Manila\"}', '::1', '2026-10-29 12:51:59'),
(212, 1, 'DEMO_CLOCK_SET', 'demo_clock', 1, '{\"simulated_at\":\"2026-10-30 13:54:00\",\"timezone\":\"Asia\\/Manila\"}', '::1', '2026-10-29 12:52:15'),
(213, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-29 12:52:30'),
(214, 1, 'LOGIN', 'user', 1, '[]', '::1', '2026-10-29 12:53:40'),
(215, 1, 'DEMO_CLOCK_RESET', 'demo_clock', 1, '{\"timezone\":\"Asia\\/Manila\"}', '::1', '2026-10-29 12:53:57'),
(216, 1, 'DEMO_CLOCK_SET', 'demo_clock', 1, '{\"simulated_at\":\"2026-10-29 20:53:00\",\"timezone\":\"Asia\\/Manila\"}', '::1', '2026-10-29 12:54:12'),
(217, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-29 12:54:37'),
(218, 2, 'LOGIN', 'user', 2, '[]', '::1', '2026-10-29 13:05:20'),
(219, 2, 'ROOM_TRANSFER_DESTINATION_CHANGED', 'service_request', 2, '{\"from_room\":\"201\",\"to_room\":\"503\",\"status\":\"PENDING\"}', '::1', '2026-10-29 13:45:44'),
(220, 2, 'GUEST_PORTAL_LINK_ISSUED', 'stay', 1, '{\"stay_code\":\"STF90111F7E6\",\"expires_at\":\"2026-10-29 23:59:59\"}', '::1', '2026-10-29 13:46:00'),
(221, 2, 'SERVICE_STATUS', 'service_request', 2, '{\"from\":\"PENDING\",\"to\":\"IN_PROGRESS\",\"kind\":\"ROOM_TRANSFER\"}', '::1', '2026-10-29 13:48:41'),
(222, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-29 13:49:47'),
(223, 2, 'LOGIN', 'user', 2, '[]', '::1', '2026-10-29 14:00:53'),
(224, 2, 'SERVICE_STATUS', 'service_request', 2, '{\"from\":\"IN_PROGRESS\",\"to\":\"COMPLETED\",\"kind\":\"ROOM_TRANSFER\",\"room_transfer\":true,\"legacy_transfer_finalized\":true}', '::1', '2026-10-29 14:01:01'),
(225, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-29 14:02:24'),
(226, 4, 'LOGIN', 'user', 4, '[]', '::1', '2026-10-29 14:03:08'),
(227, 4, 'PAYMENT', 'folio', 1, '{\"amount\":7840,\"receipts\":[\"OR2610292E1623\"],\"split_count\":1}', '::1', '2026-10-29 14:03:53'),
(228, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-29 14:04:17'),
(229, 3, 'CHECK_OUT', 'stay', 1, '[]', '::1', '2026-10-29 14:04:41'),
(230, 4, 'LOGIN', 'user', 4, '[]', '::1', '2026-10-29 14:07:41'),
(231, 4, 'CHECKIN_PAYMENT_APPROVED', 'stay', 15, '{\"checkin_payment_id\":15,\"payment_id\":17,\"receipt_number\":\"OR261029BE67B0\",\"amount\":4928,\"applied\":4928,\"received\":4928,\"change\":0,\"method\":\"CASH\",\"discount_amount\":\"0.00\",\"discount_category\":null,\"guest_name\":\"Bongbong Marcos\",\"room\":\"202\"}', '::1', '2026-10-29 14:08:00'),
(232, 4, 'APPLY_CHECKIN_DISCOUNT', 'folio', 16, '{\"discount_id\":4,\"checkin_payment_id\":16,\"category\":\"OFF_SEASON\",\"rate\":25,\"eligible_amount\":\"3000.00\",\"amount\":\"750.00\",\"eligibility_confirmed\":false}', '::1', '2026-10-29 14:09:04'),
(233, 4, 'CHECKIN_PAYMENT_APPROVED', 'stay', 16, '{\"checkin_payment_id\":16,\"payment_id\":18,\"receipt_number\":\"OR261029ED6CF1\",\"amount\":2520,\"applied\":2520,\"received\":2520,\"change\":0,\"method\":\"CASH\",\"discount_amount\":\"840.00\",\"discount_category\":\"OFF_SEASON\",\"guest_name\":\"Martin Romualdez\",\"room\":\"103\"}', '::1', '2026-10-29 14:09:04'),
(234, 1, 'LOGIN', 'user', 1, '[]', '::1', '2026-10-29 14:09:34'),
(235, 1, 'DEMO_CLOCK_SET', 'demo_clock', 1, '{\"simulated_at\":\"2026-10-30 08:53:00\",\"timezone\":\"Asia\\/Manila\"}', '::1', '2026-10-29 14:09:56'),
(236, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-29 14:10:14'),
(237, NULL, 'CREATE_EARLY_CHECKOUT_POLICY', 'early_checkout_policy', 2, '{\"name\": \"Prorated hourly + ₱500 fee\", \"policy_key\": \"HOURLY_PLUS_FEE\", \"fixed_fee\": 500.00, \"requires_manager\": 1, \"configured_by\": \"database migration\"}', NULL, '2026-10-29 14:28:09'),
(238, 3, 'EARLY_CHECKOUT_REQUEST', 'stay', 16, '{\"request_id\":0,\"policy\":\"HOURLY_PLUS_FEE\",\"policy_config_id\":2,\"proposed_room_charge\":1680.21}', '::1', '2026-10-29 14:33:06'),
(239, 2, 'LOGIN', 'user', 2, '[]', '::1', '2026-10-29 14:33:29'),
(240, 2, 'EARLY_CHECKOUT_APPROVED', 'stay', 16, '{\"request_id\":1,\"note\":\"di gagawas, pero cgeg ka?. ..\"}', '::1', '2026-10-29 14:40:54'),
(241, 2, 'EARLY_CHECKOUT_ROOM_CHARGE_RECALCULATED', 'stay', 16, '{\"request_id\":1,\"folio_id\":16,\"policy\":\"HOURLY_PLUS_FEE\",\"previous_room_charge\":3000,\"recalculated_room_charge\":1680.21,\"separate_fee_charge_created\":false}', '::1', '2026-10-29 14:41:03'),
(242, 4, 'LOGIN', 'user', 4, '[]', '::1', '2026-10-29 14:43:05'),
(243, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-29 14:44:28'),
(244, 3, 'CHECKIN_PAYMENT_CONFIRMED', 'stay', 16, '{\"checkin_payment_id\":16,\"receipt_number\":\"OR261029ED6CF1\",\"guest_name\":\"Martin Romualdez\",\"room\":\"103\"}', '::1', '2026-10-29 14:44:48'),
(245, 3, 'CHECKIN_PAYMENT_CONFIRMED', 'stay', 15, '{\"checkin_payment_id\":15,\"receipt_number\":\"OR261029BE67B0\",\"guest_name\":\"Bongbong Marcos\",\"room\":\"202\"}', '::1', '2026-10-29 14:45:05'),
(246, 4, 'LOGIN', 'user', 4, '[]', '::1', '2026-10-29 14:45:55'),
(247, 1, 'LOGIN', 'user', 1, '[]', '::1', '2026-10-29 14:48:13'),
(248, 1, 'DEMO_CLOCK_RESET', 'demo_clock', 1, '{\"timezone\":\"Asia\\/Manila\"}', '::1', '2026-10-29 14:49:08'),
(249, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-29 14:49:25'),
(250, 1, 'LOGIN', 'user', 1, '[]', '::1', '2026-10-29 14:50:29'),
(251, 1, 'DEMO_CLOCK_SET', 'demo_clock', 1, '{\"simulated_at\":\"2026-10-29 14:53:00\",\"timezone\":\"Asia\\/Manila\"}', '::1', '2026-10-29 14:50:59'),
(252, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-29 14:51:22'),
(253, 1, 'LOGIN', 'user', 1, '[]', '::1', '2026-10-29 14:52:17'),
(254, 1, 'DEMO_CLOCK_SET', 'demo_clock', 1, '{\"simulated_at\":\"2026-10-29 14:53:00\",\"timezone\":\"Asia\\/Manila\"}', '::1', '2026-10-29 14:52:27'),
(255, 1, 'DEMO_CLOCK_SET', 'demo_clock', 1, '{\"simulated_at\":\"2026-10-31 14:53:00\",\"timezone\":\"Asia\\/Manila\"}', '::1', '2026-10-29 14:52:36'),
(256, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-29 14:52:51'),
(257, 3, 'CHECK_OUT', 'stay', 16, '[]', '::1', '2026-10-29 14:53:09'),
(258, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-30 02:24:30'),
(259, 1, 'LOGIN', 'user', 1, '[]', '::1', '2026-10-30 02:40:01'),
(260, 2, 'LOGIN', 'user', 2, '[]', '::1', '2026-10-30 02:42:29'),
(261, 1, 'LOGIN', 'user', 1, '[]', '::1', '2026-10-30 03:02:33'),
(262, 1, 'DEMO_CLOCK_RESET', 'demo_clock', 1, '{\"timezone\":\"Asia\\/Manila\"}', '::1', '2026-10-30 03:11:50'),
(263, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-30 03:12:10'),
(264, 1, 'LOGIN', 'user', 1, '[]', '::1', '2026-10-30 03:16:20'),
(265, 1, 'DEMO_CLOCK_SET', 'demo_clock', 1, '{\"simulated_at\":\"2026-10-30 12:01:00\",\"timezone\":\"Asia\\/Manila\"}', '::1', '2026-10-30 03:16:45'),
(266, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-30 03:17:01'),
(267, 1, 'LOGIN', 'user', 1, '[]', '::1', '2026-10-30 03:17:32'),
(268, 1, 'DEMO_CLOCK_SET', 'demo_clock', 1, '{\"simulated_at\":\"2026-10-30 14:01:00\",\"timezone\":\"Asia\\/Manila\"}', '::1', '2026-10-30 03:17:41'),
(269, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-30 03:21:14'),
(284, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-30 03:31:49'),
(288, 3, 'GROUP_CHECK_IN', 'stay', 35, '{\"group_booking_id\":18,\"group_code\":\"GRC2B10B21F1\",\"room\":\"101\",\"nights\":1,\"expected_departure_date\":\"2026-10-31\",\"occupant_names\":[\"Andres Bonifacio\",\"Emilio Aguinaldo\"],\"customer_id\":23,\"checkin_payment_id\":35,\"required_amount\":1500,\"required_percent\":100}', '::1', '2026-10-30 03:40:01'),
(289, 3, 'GROUP_CHECK_IN', 'stay', 36, '{\"group_booking_id\":18,\"group_code\":\"GRC2B10B21F1\",\"room\":\"301\",\"nights\":1,\"expected_departure_date\":\"2026-10-31\",\"occupant_names\":[\"Antonio Luna\",\"Apolinario Mabini\"],\"customer_id\":23,\"checkin_payment_id\":36,\"required_amount\":2800,\"required_percent\":100}', '::1', '2026-10-30 03:40:01'),
(290, 3, 'GROUP_BOOKING_CREATED', 'group_booking', 18, '{\"group_code\":\"GRC2B10B21F1\",\"customer_id\":23,\"stay_ids\":[35,36],\"room_count\":2,\"nights\":1}', '::1', '2026-10-30 03:40:01'),
(291, 4, 'LOGIN', 'user', 4, '[]', '::1', '2026-10-30 03:44:41'),
(292, 4, 'APPLY_CHECKIN_DISCOUNT', 'folio', 35, '{\"checkin_payment_id\":35,\"group_booking_id\":18,\"category\":\"PWD\",\"rate\":20,\"room_number\":\"101\",\"amount\":\"267.86\",\"eligibility_confirmed\":true}', '::1', '2026-10-30 04:33:06'),
(293, 4, 'APPLY_CHECKIN_DISCOUNT', 'folio', 36, '{\"checkin_payment_id\":36,\"group_booking_id\":18,\"category\":\"PWD\",\"rate\":20,\"room_number\":\"301\",\"amount\":\"500.00\",\"eligibility_confirmed\":true}', '::1', '2026-10-30 04:33:06'),
(294, 4, 'CHECKIN_PAYMENT_APPROVED', 'stay', 35, '{\"checkin_payment_id\":35,\"group_receipt_number\":\"OR261030B15B5C\",\"payment_id\":25,\"amount_paid\":\"1071.43\",\"remaining_balance\":\"0.00\",\"room_number\":\"101\",\"group_booking_id\":18}', '::1', '2026-10-30 04:33:06'),
(295, 4, 'CHECKIN_PAYMENT_APPROVED', 'stay', 36, '{\"checkin_payment_id\":36,\"group_receipt_number\":\"OR261030B15B5C\",\"payment_id\":26,\"amount_paid\":\"2000.00\",\"remaining_balance\":\"0.00\",\"room_number\":\"301\",\"group_booking_id\":18}', '::1', '2026-10-30 04:33:06'),
(296, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-30 04:33:58'),
(297, 3, 'CHECKIN_PAYMENT_CONFIRMED', 'stay', 35, '{\"checkin_payment_id\":35,\"receipt_number\":\"OR261030B15B5C-01\",\"guest_name\":\"Laong Laan\",\"room\":\"101\"}', '::1', '2026-10-30 04:34:28'),
(298, 3, 'CHECKIN_PAYMENT_CONFIRMED', 'stay', 36, '{\"checkin_payment_id\":36,\"receipt_number\":\"OR261030B15B5C-02\",\"guest_name\":\"Laong Laan\",\"room\":\"301\"}', '::1', '2026-10-30 04:34:33'),
(299, 3, 'GUEST_PORTAL_LINK_ISSUED', 'stay', 35, '{\"stay_code\":\"ST2262F71769\",\"expires_at\":\"2026-10-31 23:59:59\"}', '::1', '2026-10-30 04:34:44'),
(300, 1, 'LOGIN', 'user', 1, '[]', '::1', '2026-10-30 04:47:07'),
(301, 3, 'GUEST_PORTAL_LINK_ISSUED', 'stay', 36, '{\"stay_code\":\"ST9CF65BC519\",\"expires_at\":\"2026-10-31 23:59:59\"}', '::1', '2026-10-30 05:09:38'),
(302, 3, 'ROOM_TRANSFER_DESTINATION_CHANGED', 'service_request', 16, '{\"from_room\":\"602\",\"to_room\":\"302\",\"status\":\"PENDING\"}', '::1', '2026-10-30 05:17:14'),
(303, 2, 'LOGIN', 'user', 2, '[]', '::1', '2026-10-30 05:18:08'),
(304, 2, 'SERVICE_STATUS', 'service_request', 16, '{\"from\":\"PENDING\",\"to\":\"COMPLETED\",\"kind\":\"ROOM_TRANSFER\",\"room_transfer\":true,\"legacy_transfer_finalized\":false}', '::1', '2026-10-30 05:37:56'),
(305, 6, 'LOGIN', 'user', 6, '[]', '::1', '2026-10-30 06:10:21'),
(306, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-30 06:16:29'),
(307, 6, 'LOGIN', 'user', 6, '[]', '::1', '2026-10-30 06:17:33'),
(308, 5, 'LOGIN', 'user', 5, '[]', '::1', '2026-10-30 06:20:58'),
(309, 5, 'SERVICE_STATUS', 'service_request', 20, '{\"from\":\"PENDING\",\"to\":\"ACKNOWLEDGED\",\"kind\":\"SERVICE\",\"room_transfer\":false,\"legacy_transfer_finalized\":false}', '::1', '2026-10-30 06:21:08'),
(310, 5, 'SERVICE_STATUS', 'service_request', 20, '{\"from\":\"ACKNOWLEDGED\",\"to\":\"COMPLETED\",\"kind\":\"SERVICE\",\"room_transfer\":false,\"legacy_transfer_finalized\":false}', '::1', '2026-10-30 06:21:30'),
(311, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-30 06:25:00'),
(312, 3, 'REQUEST_ASSIGN', 'service_request', 21, '{\"from_dept\":\"frontdesk\",\"to_dept\":\"bar\"}', '::1', '2026-10-30 06:26:16'),
(313, 6, 'LOGIN', 'user', 6, '[]', '::1', '2026-10-30 06:26:27'),
(314, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-30 06:27:45'),
(315, 6, 'LOGIN', 'user', 6, '[]', '::1', '2026-10-30 06:48:28'),
(316, 6, 'SERVICE_STATUS', 'service_request', 21, '{\"from\":\"ASSIGNED\",\"to\":\"ACKNOWLEDGED\",\"kind\":\"SERVICE\",\"room_transfer\":false,\"legacy_transfer_finalized\":false}', '::1', '2026-10-30 06:48:42'),
(317, 6, 'SERVICE_STATUS', 'service_request', 21, '{\"from\":\"ACKNOWLEDGED\",\"to\":\"COMPLETED\",\"kind\":\"SERVICE\",\"room_transfer\":false,\"legacy_transfer_finalized\":false}', '::1', '2026-10-30 06:48:57'),
(318, 6, 'MENU_ITEM_CREATE', 'menu_items', 59, '{\"item\":\"Tanduay Select\",\"category\":\"Cold Drinks\",\"price\":300,\"status\":\"Available\"}', '::1', '2026-10-30 06:53:54'),
(319, 6, 'MENU_ITEM_UPDATE', 'menu_items', 59, '{\"item\":\"Tanduay Select Set\",\"category\":\"Cold Drinks\",\"price\":300,\"status\":\"Available\"}', '::1', '2026-10-30 06:58:09'),
(320, 6, 'SERVICE_STATUS', 'service_request', 22, '{\"from\":\"PENDING\",\"to\":\"ACKNOWLEDGED\",\"kind\":\"SERVICE\",\"room_transfer\":false,\"legacy_transfer_finalized\":false}', '::1', '2026-10-30 07:02:20'),
(321, 6, 'SERVICE_STATUS', 'service_request', 17, '{\"from\":\"PENDING\",\"to\":\"ACKNOWLEDGED\",\"kind\":\"SERVICE\",\"room_transfer\":false,\"legacy_transfer_finalized\":false}', '::1', '2026-10-30 07:02:29'),
(322, 6, 'SERVICE_STATUS', 'service_request', 17, '{\"from\":\"ACKNOWLEDGED\",\"to\":\"COMPLETED\",\"kind\":\"SERVICE\",\"room_transfer\":false,\"legacy_transfer_finalized\":false}', '::1', '2026-10-30 07:02:39'),
(323, 6, 'SERVICE_STATUS', 'service_request', 22, '{\"from\":\"ACKNOWLEDGED\",\"to\":\"COMPLETED\",\"kind\":\"SERVICE\",\"room_transfer\":false,\"legacy_transfer_finalized\":false}', '::1', '2026-10-30 07:02:47'),
(324, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-30 07:03:53'),
(325, 3, 'GUEST_DETAILS_UPDATED', 'stay', 36, '{\"stay_code\":\"ST9CF65BC519\",\"customer_id\":23,\"guest_name\":\"Laong Laan\"}', '::1', '2026-10-30 07:28:58'),
(326, 5, 'LOGIN', 'user', 5, '[]', '::1', '2026-10-30 07:30:55'),
(327, 5, 'SERVICE_STATUS', 'service_request', 23, '{\"from\":\"PENDING\",\"to\":\"ACKNOWLEDGED\",\"kind\":\"SERVICE\",\"room_transfer\":false,\"legacy_transfer_finalized\":false}', '::1', '2026-10-30 07:31:11'),
(328, 5, 'SERVICE_STATUS', 'service_request', 23, '{\"from\":\"ACKNOWLEDGED\",\"to\":\"IN_PROGRESS\",\"kind\":\"SERVICE\",\"room_transfer\":false,\"legacy_transfer_finalized\":false}', '::1', '2026-10-30 07:31:23'),
(329, 5, 'SERVICE_STATUS', 'service_request', 23, '{\"from\":\"IN_PROGRESS\",\"to\":\"COMPLETED\",\"kind\":\"SERVICE\",\"room_transfer\":false,\"legacy_transfer_finalized\":false}', '::1', '2026-10-30 07:31:46'),
(330, 10, 'LOGIN', 'user', 10, '[]', '::1', '2026-10-30 07:33:07'),
(331, 10, 'SERVICE_STATUS', 'service_request', 24, '{\"from\":\"PENDING\",\"to\":\"ACKNOWLEDGED\",\"kind\":\"SERVICE\",\"room_transfer\":false,\"legacy_transfer_finalized\":false}', '::1', '2026-10-30 07:33:35'),
(332, 10, 'SERVICE_STATUS', 'service_request', 24, '{\"from\":\"ACKNOWLEDGED\",\"to\":\"IN_PROGRESS\",\"kind\":\"SERVICE\",\"room_transfer\":false,\"legacy_transfer_finalized\":false}', '::1', '2026-10-30 07:33:50'),
(333, 10, 'REQUEST_SAFETY_FLAG', 'service_request', 24, '{\"department\":\"maintenance\"}', '::1', '2026-10-30 07:42:16'),
(334, 10, 'SERVICE_STATUS', 'service_request', 24, '{\"from\":\"IN_PROGRESS\",\"to\":\"COMPLETED\",\"kind\":\"SERVICE\",\"room_transfer\":false,\"legacy_transfer_finalized\":false}', '::1', '2026-10-30 07:42:42'),
(335, 7, 'LOGIN', 'user', 7, '[]', '::1', '2026-10-30 07:43:19'),
(336, 7, 'SERVICE_STATUS', 'service_request', 25, '{\"from\":\"PENDING\",\"to\":\"ACKNOWLEDGED\",\"kind\":\"SERVICE\",\"room_transfer\":false,\"legacy_transfer_finalized\":false}', '::1', '2026-10-30 07:43:43'),
(337, 7, 'SERVICE_STATUS', 'service_request', 25, '{\"from\":\"ACKNOWLEDGED\",\"to\":\"IN_PROGRESS\",\"kind\":\"SERVICE\",\"room_transfer\":false,\"legacy_transfer_finalized\":false}', '::1', '2026-10-30 07:47:56'),
(338, 7, 'SERVICE_STATUS', 'service_request', 25, '{\"from\":\"IN_PROGRESS\",\"to\":\"COMPLETED\",\"kind\":\"SERVICE\",\"room_transfer\":false,\"legacy_transfer_finalized\":false}', '::1', '2026-10-30 07:48:20'),
(339, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-30 07:54:47'),
(340, 7, 'LOGIN', 'user', 7, '[]', '::1', '2026-10-30 08:06:07'),
(341, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-30 08:12:51'),
(342, 7, 'LOGIN', 'user', 7, '[]', '::1', '2026-10-30 08:13:34'),
(343, 3, 'LOGIN', 'user', 3, '[]', '::1', '2026-10-30 08:53:47');

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

--
-- Dumping data for table `auth_login_attempts`
--

INSERT INTO `auth_login_attempts` (`attempt_key`, `attempts`, `window_started_at`, `locked_until`, `updated_at`) VALUES
('708daccc3e36386a96b46093380b450acf89c037287dfc29581683bec2cd2a2d', 1, '2026-10-29 13:50:08', NULL, '2026-10-29 05:50:08'),
('de0c62c53df2c6557d0ba118af8747c1202f6748d3c5c91ef43f0ba694c6f418', 1, '2026-10-29 18:03:44', NULL, '2026-10-29 10:03:44');

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

--
-- Dumping data for table `billing_policies`
--

INSERT INTO `billing_policies` (`id`, `policy_key`, `policy_value`, `updated_by`, `updated_at`) VALUES
(1, 'VAT_RATE', '12', NULL, '2026-10-24 13:12:29');

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

--
-- Dumping data for table `charges`
--

INSERT INTO `charges` (`id`, `folio_id`, `category`, `description`, `quantity`, `unit_price`, `amount`, `service_request_id`, `idempotency_key`, `created_by`, `created_at`) VALUES
(1, 1, 'ROOM', 'Accommodation - 2 night(s)', 2.00, 1500.00, 3000.00, NULL, NULL, 3, '2026-10-25 05:44:14'),
(2, 1, 'FOOD', 'Restaurant Order RO-EB9EBA20 (Room Service)', 1.00, 400.00, 400.00, NULL, 'order-charge-RO-EB9EBA20', 7, '2026-10-25 06:07:30'),
(5, 4, 'ROOM', 'Accommodation - 1 night(s)', 1.00, 1500.00, 1500.00, NULL, NULL, 3, '2026-10-26 11:09:37'),
(6, 5, 'ROOM', 'Accommodation - 1 night(s)', 1.00, 1500.00, 1500.00, NULL, NULL, 3, '2026-10-26 11:09:37'),
(7, 6, 'ROOM', 'Accommodation - 1 night(s)', 1.00, 2200.00, 2200.00, NULL, NULL, 3, '2026-10-26 12:51:43'),
(8, 7, 'ROOM', 'Accommodation - 1 night(s)', 1.00, 5000.00, 5000.00, NULL, NULL, 3, '2026-10-26 13:03:50'),
(9, 8, 'ROOM', 'Accommodation - 1 night(s)', 1.00, 8500.00, 8500.00, NULL, NULL, 3, '2026-10-26 13:03:50'),
(10, 5, 'FOOD', '1x French Fries', 1.00, 100.00, 100.00, 0, 'order-charge-RO-20261026-007B7A', 7, '2026-10-26 14:34:10'),
(11, 9, 'ROOM', 'Accommodation - 1 night(s)', 1.00, 1500.00, 1500.00, NULL, NULL, 3, '2026-10-26 14:43:35'),
(12, 10, 'ROOM', 'Accommodation - 1 night(s)', 1.00, 2200.00, 2200.00, NULL, NULL, 3, '2026-10-26 14:43:35'),
(14, 11, 'ROOM', 'Accommodation - 2 night(s)', 2.00, 2200.00, 4400.00, NULL, NULL, 3, '2026-10-27 02:12:22'),
(15, 12, 'ROOM', 'Accommodation - 1 night(s)', 1.00, 8500.00, 8500.00, NULL, NULL, 3, '2026-10-27 02:43:06'),
(16, 13, 'ROOM', 'Accommodation - 1 night(s)', 1.00, 2800.00, 2800.00, NULL, NULL, 3, '2026-10-27 03:08:14'),
(17, 14, 'ROOM', 'Accommodation - 1 night(s)', 1.00, 3500.00, 3500.00, NULL, NULL, 3, '2026-10-27 03:43:04'),
(18, 14, 'FOOD', 'Restaurant Order RO-20261027-1B964D (Room Service)', 1.00, 210.00, 210.00, NULL, 'order-charge-RO-20261027-1B964D', 7, '2026-10-28 13:30:20'),
(19, 15, 'ROOM', 'Accommodation - 2 night(s)', 2.00, 2200.00, 4400.00, NULL, NULL, 3, '2026-10-29 05:06:17'),
(20, 14, 'FOOD', 'Restaurant Order RO-20261029-1B18A3 (Room Service)', 1.00, 360.00, 360.00, NULL, 'order-charge-RO-20261029-1B18A3', 7, '2026-10-29 09:58:40'),
(21, 16, 'ROOM', 'Accommodation recalculated under HOURLY_PLUS_FEE policy · Request #1', 1.00, 1680.21, 1680.21, NULL, NULL, 3, '2026-10-29 12:42:22'),
(22, 1, 'ADJUSTMENT', 'Room rate increase from 2026-10-29', 2.00, 3500.00, 7000.00, 2, 'room-transfer-request-2', 2, '2026-10-29 13:48:41'),
(41, 35, 'ROOM', 'Accommodation - 1 night(s)', 1.00, 1500.00, 1500.00, NULL, NULL, 3, '2026-10-30 03:40:01'),
(42, 36, 'ROOM', 'Accommodation - 1 night(s)', 1.00, 2800.00, 2800.00, NULL, NULL, 3, '2026-10-30 03:40:01'),
(43, 35, 'FOOD', 'Restaurant Order RO-20261030-84A31C (Room Service)', 1.00, 750.00, 750.00, NULL, 'order-charge-RO-20261030-84A31C', 6, '2026-10-30 06:17:50'),
(44, 35, 'SERVICE', 'Pillow (quantity: 1) — pwde pa gakotch', 1.00, 200.00, 200.00, 20, 'service-request-20', 5, '2026-10-30 06:21:30'),
(45, 36, 'FOOD', '3x Bottled Water', 1.00, 120.00, 120.00, 17, 'order-charge-RO-20261030-0C9038', 6, '2026-10-30 07:02:39'),
(46, 35, 'FOOD', '2x Tanduay Select Set', 1.00, 600.00, 600.00, 22, 'order-charge-RO-20261030-0DB2A5', 6, '2026-10-30 07:02:47'),
(47, 36, 'SERVICE', 'Extra towels (quantity: 1)', 1.00, 150.00, 150.00, 23, 'service-request-23', 5, '2026-10-30 07:31:46'),
(48, 36, 'FOOD', '1x Beef Steak', 1.00, 280.00, 280.00, 25, 'order-charge-RO-20261030-47B632', 7, '2026-10-30 07:48:20'),
(49, 35, 'FOOD', 'Restaurant Order RO-20261030-39126C (Room Service)', 1.00, 180.00, 180.00, NULL, 'order-charge-RO-20261030-39126C', 7, '2026-10-30 08:06:19');

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

--
-- Dumping data for table `checkin_payments`
--

INSERT INTO `checkin_payments` (`id`, `stay_id`, `folio_id`, `subject`, `nights`, `total_amount`, `required_percent`, `required_amount`, `status`, `payment_id`, `created_by`, `approved_by`, `approved_at`, `confirmed_by`, `confirmed_at`, `created_at`, `updated_at`, `gross_amount`, `discount_amount`, `discount_type`, `discount_reason`, `balance_amount`) VALUES
(1, 1, 1, 'CHECK-IN PAYMENT', 2, 3160.00, 100, 3160.00, 'APPROVED', 1, 3, 4, '2026-10-25 13:49:58', 3, '2026-10-26 22:28:22', '2026-10-25 05:44:14', '2026-10-26 14:28:22', 3360.00, 200.00, 'SENIOR_CITIZEN', 'wa ra gud', 0.00),
(4, 4, 4, 'CHECK-IN PAYMENT', 1, 1680.00, 100, 1680.00, 'CANCELLED', NULL, 3, NULL, NULL, NULL, NULL, '2026-10-26 11:09:37', '2026-10-26 12:58:54', 1680.00, 0.00, 'NONE', NULL, 0.00),
(5, 5, 5, 'CHECK-IN PAYMENT', 1, 1680.00, 100, 1680.00, 'APPROVED', 0, 3, 4, '2026-10-26 19:17:44', 3, '2026-10-26 22:28:16', '2026-10-26 11:09:37', '2026-10-26 14:28:16', 1680.00, 0.00, 'NONE', NULL, 0.00),
(6, 6, 6, 'CHECK-IN PAYMENT', 1, 2464.00, 100, 2464.00, 'APPROVED', 2, 3, 4, '2026-10-26 22:57:43', 3, '2026-10-27 09:25:46', '2026-10-26 12:51:43', '2026-10-27 01:25:46', 2464.00, 0.00, 'NONE', NULL, 0.00),
(7, 7, 7, 'CHECK-IN PAYMENT', 1, 5600.00, 100, 5600.00, 'APPROVED', 5, 3, 4, '2026-10-26 23:11:05', 3, '2026-10-27 09:25:44', '2026-10-26 13:03:50', '2026-10-27 01:25:44', 5600.00, 0.00, 'NONE', NULL, 0.00),
(8, 8, 8, 'CHECK-IN PAYMENT', 1, 9520.00, 100, 9520.00, 'APPROVED', 6, 3, 4, '2026-10-26 23:11:12', 3, '2026-10-27 09:25:45', '2026-10-26 13:03:50', '2026-10-27 01:25:45', 9520.00, 0.00, 'NONE', NULL, 0.00),
(9, 9, 9, 'CHECK-IN PAYMENT', 1, 1680.00, 100, 1680.00, 'APPROVED', 3, 3, 4, '2026-10-26 23:10:49', 3, '2026-10-27 09:25:41', '2026-10-26 14:43:35', '2026-10-27 01:25:41', 1680.00, 0.00, 'NONE', NULL, 0.00),
(10, 10, 10, 'CHECK-IN PAYMENT', 1, 2464.00, 100, 2464.00, 'APPROVED', 4, 3, 4, '2026-10-26 23:10:56', 3, '2026-10-27 09:25:43', '2026-10-26 14:43:35', '2026-10-27 01:25:43', 2464.00, 0.00, 'NONE', NULL, 0.00),
(11, 11, 11, 'CHECK-IN PAYMENT', 2, 4928.00, 100, 4928.00, 'APPROVED', 10, 3, 4, '2026-10-27 10:28:20', 3, '2026-10-27 11:32:17', '2026-10-27 02:12:22', '2026-10-27 03:32:17', 4928.00, 0.00, 'NONE', NULL, 0.00),
(12, 12, 12, 'CHECK-IN PAYMENT', 1, 9520.00, 100, 9520.00, 'APPROVED', 11, 3, 4, '2026-10-27 11:04:57', 3, '2026-10-27 11:32:14', '2026-10-27 02:43:06', '2026-10-27 03:32:14', 9520.00, 0.00, 'NONE', NULL, 0.00),
(13, 13, 13, 'CHECK-IN PAYMENT', 1, 2508.80, 100, 2508.80, 'APPROVED', 12, 3, 4, '2026-10-27 11:26:20', 3, '2026-10-27 11:32:10', '2026-10-27 03:08:14', '2026-10-27 03:32:10', 3136.00, 627.20, 'PWD', 'Applied during cashier check-in approval: PWD (20%)', 0.00),
(14, 14, 14, 'CHECK-IN PAYMENT', 1, 3567.20, 100, 3567.20, 'APPROVED', 13, 3, 4, '2026-10-27 11:54:57', 3, '2026-10-27 11:56:03', '2026-10-27 03:43:04', '2026-10-27 03:56:03', 3920.00, 352.80, 'BIRTHDAY', 'Applied during cashier check-in approval: Birthday promotion (9%)', 0.00),
(15, 15, 15, 'CHECK-IN PAYMENT', 2, 4928.00, 100, 4928.00, 'APPROVED', 17, 3, 4, '2026-10-29 22:08:00', 3, '2026-10-29 22:45:05', '2026-10-29 05:06:17', '2026-10-29 14:45:05', 4928.00, 0.00, 'NONE', NULL, 0.00),
(16, 16, 16, 'CHECK-IN PAYMENT', 2, 2520.00, 100, 2520.00, 'APPROVED', 18, 3, 4, '2026-10-29 22:09:04', 3, '2026-10-29 22:44:48', '2026-10-29 12:42:22', '2026-10-29 14:44:48', 3360.00, 840.00, 'OFF_SEASON', 'Applied during cashier check-in approval: Off-season promotion (25%)', 0.00),
(35, 35, 35, 'CHECK-IN PAYMENT', 1, 1071.43, 100, 1071.43, 'APPROVED', 25, 3, 4, '2026-10-30 12:33:06', 3, '2026-10-30 12:34:28', '2026-10-30 03:40:01', '2026-10-30 04:34:28', 1500.00, 267.86, 'PWD', 'Group check-in discount: PWD', 0.00),
(36, 36, 36, 'CHECK-IN PAYMENT', 1, 2000.00, 100, 2000.00, 'APPROVED', 26, 3, 4, '2026-10-30 12:33:06', 3, '2026-10-30 12:34:33', '2026-10-30 03:40:01', '2026-10-30 04:34:33', 2800.00, 500.00, 'PWD', 'Group check-in discount: PWD', 0.00);

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
  `vat_exempt_sales` decimal(12,2) DEFAULT NULL,
  `final_amount` decimal(12,2) NOT NULL,
  `payments_received` decimal(12,2) NOT NULL DEFAULT 0.00,
  `finalized_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `checkout_records`
--

INSERT INTO `checkout_records` (`id`, `stay_id`, `folio_id`, `scheduled_checkout_at`, `actual_checkout_at`, `nights_stayed`, `unused_nights`, `charges_total`, `discount_total`, `vat_amount`, `vat_exempt_sales`, `final_amount`, `payments_received`, `finalized_by`, `created_at`) VALUES
(0, 6, 6, '2026-10-27', '2026-10-27 09:09:11', 1, 0, 2200.00, 0.00, 264.00, NULL, 2464.00, 2464.00, 3, '2026-10-27 01:09:11'),
(2, 5, 5, '2026-10-27', '2026-10-28 22:26:32', 2, 0, 1600.00, 0.00, 192.00, NULL, 1792.00, 1792.00, 3, '2026-10-28 14:26:32'),
(3, 7, 7, '2026-10-27', '2026-10-28 22:26:57', 2, 0, 5000.00, 0.00, 600.00, NULL, 5600.00, 5600.00, 3, '2026-10-28 14:26:57'),
(4, 10, 10, '2026-10-27', '2026-10-28 22:27:05', 2, 0, 2200.00, 0.00, 264.00, NULL, 2464.00, 2464.00, 3, '2026-10-28 14:27:05'),
(5, 8, 8, '2026-10-27', '2026-10-28 23:30:46', 2, 0, 8500.00, 0.00, 1020.00, NULL, 9520.00, 9520.00, 3, '2026-10-28 15:30:46'),
(6, 9, 9, '2026-10-27', '2026-10-28 23:30:57', 2, 0, 1500.00, 0.00, 180.00, NULL, 1680.00, 1680.00, 3, '2026-10-28 15:30:57'),
(7, 11, 11, '2026-10-29', '2026-10-28 23:31:05', 1, 1, 4400.00, 0.00, 528.00, NULL, 4928.00, 4928.00, 3, '2026-10-28 15:31:05'),
(8, 12, 12, '2026-10-28', '2026-10-28 23:31:12', 1, 0, 8500.00, 0.00, 1020.00, NULL, 9520.00, 9520.00, 3, '2026-10-28 15:31:12'),
(9, 13, 13, '2026-10-28', '2026-10-28 23:31:18', 1, 0, 2800.00, 560.00, 268.80, NULL, 2508.80, 2508.80, 3, '2026-10-28 15:31:18'),
(10, 14, 14, '2026-10-28', '2026-10-29 18:17:28', 2, 0, 4070.00, 315.00, 450.60, NULL, 4205.60, 4205.60, 3, '2026-10-29 10:17:28'),
(11, 1, 1, '2026-10-27', '2026-10-29 20:53:00', 4, 0, 10400.00, 178.57, 1226.57, NULL, 11448.00, 11448.00, 3, '2026-10-29 14:04:41'),
(12, 16, 16, '2026-10-31', '2026-10-31 14:53:00', 2, 0, 1680.21, 750.00, 111.63, NULL, 1041.84, 2520.00, 3, '2026-10-29 14:53:09');

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

--
-- Dumping data for table `customers`
--

INSERT INTO `customers` (`customer_id`, `first_name`, `middle_name`, `last_name`, `email`, `contact_number`, `emergency_contact`, `address`, `id_number`, `nationality`, `id_type`, `is_active`) VALUES
(1, 'Pitok', '', 'Batolata', '', '', '', '', '', 'Filipino', '', 1),
(4, 'Ronald', '', 'Intud', 'rosa.intud.coc@phinmaed.com', '5454', '', '', '', 'Filipino', '', 1),
(5, 'Rastel', '', 'Bansing', '', '', '', '', '', 'Filipino', '', 1),
(6, 'Gabby', '', 'Magusara', 'gabby@gmail.com', '868684', '', '', '', 'Filipino', '', 1),
(7, 'Lourd', '', 'Andig', 'andig@gmail.com', '567567567', '', '', '', 'Filipino', '', 1),
(8, 'Kulas', '', 'Dimalas', '', '', '', '', '', 'Filipino', '', 1),
(9, 'Uncle', '', 'Dags', '', '', '', '', '', 'Filipino', '', 1),
(10, 'Love Jhun', '', 'Ortiz', '', '', '', '', '', 'Filipino', '', 1),
(11, 'Bugoy', '', 'Koykoy', '', '', '', '', '', 'Filipino', '', 1),
(12, 'Bongbong', '', 'Marcos', '', '', '', '', '', 'Filipino', '', 1),
(13, 'Martin', '', 'Romualdez', '', '', '', '', '', 'Filipino', '', 1),
(23, 'Laong', '', 'Laan', 'laan@gmail.com', '0904164598751', '', '', '', 'Filipino', '', 1);

-- --------------------------------------------------------

--
-- Table structure for table `demo_clock_state`
--

CREATE TABLE `demo_clock_state` (
  `id` tinyint(3) UNSIGNED NOT NULL,
  `simulated_at` datetime DEFAULT NULL,
  `updated_by` bigint(20) UNSIGNED DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `demo_clock_state`
--

INSERT INTO `demo_clock_state` (`id`, `simulated_at`, `updated_by`, `updated_at`) VALUES
(1, '2026-10-30 14:01:00', 1, '2026-10-30 03:17:41');

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

--
-- Dumping data for table `department_inventory`
--

INSERT INTO `department_inventory` (`id`, `department`, `item_name`, `category`, `quantity`, `unit`, `reorder_level`, `cost_price`, `updated_at`) VALUES
(0, 'housekeeping', 'Gakotch', 'General', 10, 'pcs', 5, 1000.00, '2026-10-26 15:21:48');

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

--
-- Dumping data for table `discount_policies`
--

INSERT INTO `discount_policies` (`id`, `name`, `category`, `discount_type`, `discount_value`, `applies_to`, `starts_at`, `expires_at`, `min_amount`, `max_discount`, `combinable`, `requires_manager`, `active`, `created_by`, `created_at`) VALUES
(0, 'Senior citizen', 'SENIOR_CITIZEN', 'PERCENT', 20.00, 'ROOM', NULL, NULL, 0.00, NULL, 0, 0, 1, NULL, '2026-10-27 03:18:33'),
(1, 'Senior citizen', 'SENIOR_CITIZEN', 'PERCENT', 20.00, 'ROOM', NULL, NULL, 0.00, NULL, 0, 0, 0, NULL, '2026-10-27 03:23:03'),
(2, 'PWD', 'PWD', 'PERCENT', 20.00, 'ROOM', NULL, NULL, 0.00, NULL, 0, 0, 1, NULL, '2026-10-27 03:23:03'),
(3, 'Early-bird booking', 'EARLY_BOOKING', 'PERCENT', 5.00, 'ROOM', NULL, NULL, 0.00, NULL, 0, 0, 1, NULL, '2026-10-27 03:23:03'),
(4, 'Long-stay guest', 'LONG_STAY', 'PERCENT', 10.00, 'ROOM', NULL, NULL, 0.00, NULL, 0, 0, 1, NULL, '2026-10-27 03:23:03'),
(5, 'Group booking', 'GROUP', 'PERCENT', 5.00, 'ROOM', NULL, NULL, 0.00, NULL, 0, 0, 1, NULL, '2026-10-27 03:23:03'),
(6, 'Loyalty / returning guest', 'LOYALTY', 'PERCENT', 5.00, 'ROOM', NULL, NULL, 0.00, NULL, 0, 0, 1, NULL, '2026-10-27 03:23:03'),
(7, 'Walk-in promotion', 'WALK_IN', 'PERCENT', 5.00, 'ROOM', NULL, NULL, 0.00, NULL, 0, 0, 1, NULL, '2026-10-27 03:23:03'),
(8, 'Birthday promotion', 'BIRTHDAY', 'PERCENT', 5.00, 'ROOM', NULL, NULL, 0.00, NULL, 0, 0, 1, NULL, '2026-10-27 03:23:03'),
(9, 'Employee discount', 'EMPLOYEE', 'PERCENT', 10.00, 'ROOM', NULL, NULL, 0.00, NULL, 0, 0, 1, NULL, '2026-10-27 03:23:03'),
(10, 'Corporate / partner rate', 'CORPORATE', 'PERCENT', 5.00, 'ROOM', NULL, NULL, 0.00, NULL, 0, 0, 1, NULL, '2026-10-27 03:23:03'),
(11, 'Off-season promotion', 'OFF_SEASON', 'PERCENT', 10.00, 'ROOM', NULL, NULL, 0.00, NULL, 0, 0, 1, NULL, '2026-10-27 03:23:03');

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

--
-- Dumping data for table `early_checkout_policy_configs`
--

INSERT INTO `early_checkout_policy_configs` (`id`, `policy_key`, `name`, `description`, `minimum_hours`, `minimum_nights`, `fixed_fee`, `requires_manager`, `active`, `updated_by`, `created_at`, `updated_at`) VALUES
(1, 'MANAGER_EXCEPTION', 'Manager-approved early departure exception', 'Requires a documented reason and approval by a manager other than the requester. Does not change room charges.', 0.00, 0, 0.00, 1, 1, 1, '2026-10-29 12:50:47', '2026-10-29 12:50:47'),
(2, 'HOURLY_PLUS_FEE', 'Prorated hourly + ₱500 fee', 'Recalculates the room charge using actual occupied hours (minimum 1 hour) plus a ₱500 fixed fee. Requires separate manager approval and does not authorize early room release.', 1.00, 0, 500.00, 1, 1, NULL, '2026-10-29 14:28:09', '2026-10-29 14:28:09');

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

--
-- Dumping data for table `early_checkout_requests`
--

INSERT INTO `early_checkout_requests` (`id`, `stay_id`, `folio_id`, `request_type`, `checkin_at`, `requested_departure_at`, `actual_departure_at`, `reason`, `policy`, `hourly_rate`, `minimum_hours`, `minimum_nights`, `fixed_fee`, `proposed_room_charge`, `status`, `requested_by`, `approved_by`, `approved_at`, `created_at`, `updated_at`) VALUES
(1, 16, 16, 'EARLY_CHECKOUT', '2026-10-29 14:00:00', '2026-10-30 08:53:00', NULL, 'Plan B', 'HOURLY_PLUS_FEE', 62.50, 1.00, 0, 500.00, 1680.21, 'FINALIZED', 3, 2, '2026-10-29 22:40:54', '2026-10-29 14:33:06', '2026-10-29 14:41:03');

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

--
-- Dumping data for table `folios`
--

INSERT INTO `folios` (`id`, `stay_id`, `folio_number`, `status`, `created_at`) VALUES
(1, 1, 'F2610250BFE55', 'PAID', '2026-10-25 05:44:14'),
(4, 4, 'F2610263F22A6', '', '2026-10-26 11:09:37'),
(5, 5, 'F2610261EE37E', 'PAID', '2026-10-26 11:09:37'),
(6, 6, 'F2610267B6A88', 'PAID', '2026-10-26 12:51:43'),
(7, 7, 'F261026A0E41E', 'PAID', '2026-10-26 13:03:50'),
(8, 8, 'F2610265C6E9A', 'PAID', '2026-10-26 13:03:50'),
(9, 9, 'F261026AC2D0D', 'PAID', '2026-10-26 14:43:35'),
(10, 10, 'F261026B9E76A', 'PAID', '2026-10-26 14:43:35'),
(11, 11, 'F261027D1BA94', 'PAID', '2026-10-27 02:12:22'),
(12, 12, 'F261027E2915E', 'PAID', '2026-10-27 02:43:06'),
(13, 13, 'F2610276AA362', 'PAID', '2026-10-27 03:08:14'),
(14, 14, 'F26102776A6F6', 'PAID', '2026-10-27 03:43:04'),
(15, 15, 'F261029644996', 'OPEN', '2026-10-29 05:06:17'),
(16, 16, 'F2610293D6852', 'PAID', '2026-10-29 12:42:22'),
(35, 35, 'F261030316F8F', 'OPEN', '2026-10-30 03:40:01'),
(36, 36, 'F26103008C96E', 'OPEN', '2026-10-30 03:40:01');

-- --------------------------------------------------------

--
-- Table structure for table `group_bookings`
--

CREATE TABLE `group_bookings` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `group_code` varchar(32) NOT NULL,
  `primary_customer_id` int(11) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'OPEN',
  `created_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `group_bookings`
--

INSERT INTO `group_bookings` (`id`, `group_code`, `primary_customer_id`, `status`, `created_by`, `created_at`) VALUES
(6, 'GR04794975E4', 4, 'OPEN', 3, '2026-10-26 11:09:37'),
(7, 'GR2D48CF1D3F', 6, 'OPEN', 3, '2026-10-26 13:03:50'),
(8, 'GR57A022B37A', 7, 'OPEN', 3, '2026-10-26 14:43:35'),
(18, 'GRC2B10B21F1', 23, 'OPEN', 3, '2026-10-30 03:40:01');

-- --------------------------------------------------------

--
-- Table structure for table `group_checkin_receipts`
--

CREATE TABLE `group_checkin_receipts` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `group_booking_id` bigint(20) UNSIGNED NOT NULL,
  `receipt_number` varchar(32) NOT NULL,
  `method` enum('CASH','CARD','GCASH','BANK_TRANSFER','MAYA','QR_PH','OTHER') NOT NULL,
  `received_amount` decimal(12,2) NOT NULL,
  `amount_paid` decimal(12,2) NOT NULL,
  `change_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `received_by` bigint(20) UNSIGNED DEFAULT NULL,
  `idempotency_key` char(64) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `group_checkin_receipts`
--

INSERT INTO `group_checkin_receipts` (`id`, `group_booking_id`, `receipt_number`, `method`, `received_amount`, `amount_paid`, `change_amount`, `received_by`, `idempotency_key`, `created_at`) VALUES
(4, 18, 'OR261030B15B5C', 'CASH', 3071.43, 3071.43, 0.00, 4, 'ac18c919ad5e3c761f31ad3649f37b37a3b9bc8fe6384763b42fd357134d00be', '2026-10-30 04:33:06');

-- --------------------------------------------------------

--
-- Table structure for table `group_checkin_receipt_allocations`
--

CREATE TABLE `group_checkin_receipt_allocations` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `group_receipt_id` bigint(20) UNSIGNED NOT NULL,
  `checkin_payment_id` bigint(20) UNSIGNED NOT NULL,
  `payment_id` bigint(20) UNSIGNED NOT NULL,
  `folio_id` bigint(20) UNSIGNED NOT NULL,
  `room_number` varchar(30) NOT NULL,
  `gross_amount` decimal(12,2) NOT NULL,
  `discount_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `discount_name` varchar(120) DEFAULT NULL,
  `discount_category` varchar(40) DEFAULT NULL,
  `total_amount` decimal(12,2) NOT NULL,
  `required_amount` decimal(12,2) NOT NULL,
  `amount_paid` decimal(12,2) NOT NULL,
  `remaining_balance` decimal(12,2) NOT NULL,
  `vatable_sales` decimal(12,2) NOT NULL DEFAULT 0.00,
  `vat_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `vat_exempt_sales` decimal(12,2) NOT NULL DEFAULT 0.00
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `group_checkin_receipt_allocations`
--

INSERT INTO `group_checkin_receipt_allocations` (`id`, `group_receipt_id`, `checkin_payment_id`, `payment_id`, `folio_id`, `room_number`, `gross_amount`, `discount_amount`, `discount_name`, `discount_category`, `total_amount`, `required_amount`, `amount_paid`, `remaining_balance`, `vatable_sales`, `vat_amount`, `vat_exempt_sales`) VALUES
(7, 4, 35, 25, 35, '101', 1500.00, 267.86, 'PWD (20%)', 'PWD', 1071.43, 1071.43, 1071.43, 0.00, 0.00, 0.00, 1071.43),
(8, 4, 36, 26, 36, '301', 2800.00, 500.00, 'PWD (20%)', 'PWD', 2000.00, 2000.00, 2000.00, 0.00, 0.00, 0.00, 2000.00);

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

--
-- Dumping data for table `menu_categories`
--

INSERT INTO `menu_categories` (`id`, `category_name`, `menu_type`, `created_at`) VALUES
(7, 'Main Course', 'Food', '2026-10-25 05:32:21'),
(8, 'Appetizers', 'Food', '2026-10-25 05:32:21'),
(9, 'Desserts', 'Food', '2026-10-25 05:32:21'),
(10, 'Hot Drinks', 'Drinks', '2026-10-25 05:32:21'),
(11, 'Cold Drinks', 'Drinks', '2026-10-25 05:32:21');

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

--
-- Dumping data for table `menu_items`
--

INSERT INTO `menu_items` (`id`, `category_id`, `item_name`, `description`, `price`, `image_path`, `availability_status`, `created_at`, `updated_at`) VALUES
(33, 7, 'Chicken Adobo', 'Chicken cooked in soy sauce and vinegar', 220.00, NULL, 'Available', '2026-10-25 05:32:21', '2026-10-25 05:32:21'),
(34, 7, 'Beef Steak', 'Beef steak with onions', 280.00, NULL, 'Available', '2026-10-25 05:32:21', '2026-10-25 05:32:21'),
(35, 7, 'Grilled Bangus', 'Grilled milkfish', 240.00, NULL, 'Available', '2026-10-25 05:32:21', '2026-10-25 05:32:21'),
(36, 7, 'Pork Sinigang', 'Pork in sour tamarind soup', 250.00, NULL, 'Available', '2026-10-25 05:32:21', '2026-10-25 05:32:21'),
(37, 7, 'Chicken Inasal', 'Filipino grilled chicken', 230.00, NULL, 'Available', '2026-10-25 05:32:21', '2026-10-25 05:32:21'),
(38, 8, 'Lumpia Shanghai', 'Crispy Filipino spring rolls', 120.00, NULL, 'Available', '2026-10-25 05:32:21', '2026-10-25 05:32:21'),
(39, 8, 'Garlic Bread', 'Toasted bread with garlic butter', 90.00, NULL, 'Available', '2026-10-25 05:32:21', '2026-10-25 05:32:21'),
(40, 8, 'French Fries', 'Crispy potato fries', 100.00, NULL, 'Available', '2026-10-25 05:32:21', '2026-10-25 05:32:21'),
(41, 8, 'Chicken Wings', 'Seasoned chicken wings', 180.00, NULL, 'Available', '2026-10-25 05:32:21', '2026-10-25 05:32:21'),
(42, 8, 'Nachos', 'Tortilla chips with toppings', 160.00, NULL, 'Available', '2026-10-25 05:32:21', '2026-10-25 05:32:21'),
(43, 9, 'Leche Flan', 'Filipino caramel custard', 90.00, NULL, 'Available', '2026-10-25 05:32:21', '2026-10-25 05:32:21'),
(44, 9, 'Chocolate Cake', 'Chocolate cake slice', 120.00, NULL, 'Available', '2026-10-25 05:32:21', '2026-10-25 05:32:21'),
(45, 9, 'Halo-Halo', 'Filipino shaved ice dessert', 130.00, NULL, 'Available', '2026-10-25 05:32:21', '2026-10-25 05:32:21'),
(46, 9, 'Ice Cream', 'Ice cream serving', 80.00, NULL, 'Available', '2026-10-25 05:32:21', '2026-10-25 05:32:21'),
(47, 9, 'Fruit Salad', 'Chilled fruit salad', 100.00, NULL, 'Available', '2026-10-25 05:32:21', '2026-10-25 05:32:21'),
(48, 10, 'Brewed Coffee', 'Freshly brewed coffee', 80.00, NULL, 'Available', '2026-10-25 05:32:21', '2026-10-25 05:32:21'),
(49, 10, 'Cappuccino', 'Espresso with milk foam', 120.00, NULL, 'Available', '2026-10-25 05:32:21', '2026-10-25 05:32:21'),
(50, 10, 'Cafe Latte', 'Espresso with steamed milk', 120.00, NULL, 'Available', '2026-10-25 05:32:21', '2026-10-25 05:32:21'),
(51, 10, 'Hot Chocolate', 'Warm chocolate drink', 100.00, NULL, 'Available', '2026-10-25 05:32:21', '2026-10-25 05:32:21'),
(52, 10, 'Hot Tea', 'Hot brewed tea', 70.00, NULL, 'Available', '2026-10-25 05:32:21', '2026-10-25 05:32:21'),
(53, 11, 'Iced Coffee', 'Chilled coffee', 100.00, NULL, 'Available', '2026-10-25 05:32:21', '2026-10-25 05:32:21'),
(54, 11, 'Iced Tea', 'Chilled tea', 70.00, NULL, 'Available', '2026-10-25 05:32:21', '2026-10-25 05:32:21'),
(55, 11, 'Fresh Orange Juice', 'Fresh orange juice', 100.00, NULL, 'Available', '2026-10-25 05:32:21', '2026-10-25 05:32:21'),
(56, 11, 'Bottled Water', 'Bottled drinking water', 40.00, NULL, 'Available', '2026-10-25 05:32:21', '2026-10-25 05:32:21'),
(57, 11, 'Mango Shake', 'Chilled mango shake', 120.00, NULL, 'Available', '2026-10-25 05:32:21', '2026-10-25 05:32:21'),
(58, 11, 'Redhorse', 'Jumbo', 250.00, NULL, 'Available', '2026-10-29 06:56:10', '2026-10-30 06:13:52'),
(59, 11, 'Tanduay Select Set', 'Set w/ juice & ice', 300.00, NULL, 'Available', '2026-10-30 06:53:54', '2026-10-30 06:58:09');

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

--
-- Dumping data for table `payments`
--

INSERT INTO `payments` (`id`, `folio_id`, `receipt_number`, `method`, `amount`, `received_amount`, `change_amount`, `reference_note`, `received_by`, `idempotency_key`, `idempotency_part`, `created_at`) VALUES
(0, 5, 'OR261026E3C372', 'CASH', 1680.00, 1680.00, 0.00, 'Check-in payment (100% of total)', 4, '10208757ed512432f3a9a9504e2253435cc0da612adc7dba890b579471565fc8', 0, '2026-10-26 11:17:44'),
(1, 1, 'OR261025F5E8DB', 'CASH', 3160.00, 3160.00, 0.00, 'Check-in payment (100% of total)', 4, '0ad08b4bc4f1371b5d58f3cadd40b7b8fe76786ac8ddaa38e425d10d5e7ac8f7', 0, '2026-10-25 05:49:58'),
(2, 6, 'OR261026379D3E', 'CASH', 2464.00, 2464.00, 0.00, 'Check-in payment (100% of total)', 4, 'fab6a1aa0d8d115d4519817eee189b1c0c3113c9edfd6237779e4570546fd619', 0, '2026-10-26 14:57:43'),
(3, 9, 'OR2610261641E9', 'CASH', 1680.00, 1680.00, 0.00, 'Check-in payment (100% of total)', 4, '71be19ff42321ca25226bc57f651f44ed9fdd6d58e96e5f24f8c2e1749bbf464', 0, '2026-10-26 15:10:49'),
(4, 10, 'OR261026062D8F', 'CASH', 2464.00, 2464.00, 0.00, 'Check-in payment (100% of total)', 4, '2b3ae4311f16eb2cbf0e03f31bfaf8c6b4fade0d6d97ef7042dd71b4b8156ec8', 0, '2026-10-26 15:10:56'),
(5, 7, 'OR261026E89A09', 'CASH', 5600.00, 5600.00, 0.00, 'Check-in payment (100% of total)', 4, 'a6046e9fe681c94afa4bc2464873a6a3673302fdc2c93556b9439a116a929b03', 0, '2026-10-26 15:11:05'),
(6, 8, 'OR261026B42BBA', 'CASH', 9520.00, 9520.00, 0.00, 'Check-in payment (100% of total)', 4, 'f4eff699fb26fb0682d9a00a1af22db725c262a675c13267d3ddda5ba3131546', 0, '2026-10-26 15:11:12'),
(7, 5, 'OR26102769B955', 'CASH', 112.00, 112.00, 0.00, '', 4, '37edb14f7f32b333c3b6160442042aed2a1dbc9838b6cca2b5db8c2c399c1298', 0, '2026-10-27 01:51:36'),
(8, 1, 'OR261027097AC9', 'CASH', 48.00, 48.00, 0.00, '', 4, 'c46d8fdf6348225e3b11ab8fd861c912d9117523c7750190fc47748f3662326f', 0, '2026-10-27 01:59:48'),
(9, 1, 'OR2610272FD7E6', 'CARD', 400.00, 400.00, 0.00, '', 4, 'c46d8fdf6348225e3b11ab8fd861c912d9117523c7750190fc47748f3662326f', 1, '2026-10-27 01:59:48'),
(10, 11, 'OR261027089DDB', 'CASH', 4928.00, 4928.00, 0.00, 'Check-in payment (100% of total)', 4, 'c1d75784f1f0d43547e4fb692321e43dbbfbd1d7930ba08c1dcd4264019de4d3', 0, '2026-10-27 02:28:20'),
(11, 12, 'OR26102767B286', 'CASH', 9520.00, 9520.00, 0.00, 'Check-in payment (100% of total)', 4, '903e2a5d14904ff0bcd4d3eaae789d60a4058662f9b247d37f2df9dcd332cdf5', 0, '2026-10-27 03:04:57'),
(12, 13, 'OR261027ABB6CD', 'GCASH', 2508.80, 2508.80, 0.00, 'Check-in payment (100% of total) · Discount: PWD', 4, '06a35605924dfc54aadcf54fe0a3795a6a2d9afcb7dbf1efe2f55b6edc106adf', 0, '2026-10-27 03:26:20'),
(13, 14, 'OR26102724958D', 'CASH', 3567.20, 3567.20, 0.00, 'Check-in payment (100% of total) · Discount: Birthday promotion', 4, '5e66ffb1c0e7df0e3aa466643abbd97e3a4724fe24c3998742f7676924efeb34', 0, '2026-10-27 03:54:57'),
(14, 14, 'OR261028C3EB20', 'CASH', 235.20, 235.20, 0.00, '', 4, 'babb449b7b31bbd04527cf45908cf49ba5ecf8059f0ba68d963d430b0c8d7016', 0, '2026-10-28 15:28:36'),
(15, 14, 'OR26102911E258', 'CASH', 403.20, 500.00, 96.80, '', 4, '9668d13eb63a59ae6b24fd7230412c4977e247c00538a4eac30f33d6f73bb213', 0, '2026-10-29 10:16:01'),
(16, 1, 'OR2610292E1623', 'CASH', 7840.00, 8000.00, 160.00, '', 4, 'f22d985b40b1b8c14d2078b0c42619f153cb56b25ca2273f5fad6045f73106cd', 0, '2026-10-29 14:03:53'),
(17, 15, 'OR261029BE67B0', 'CASH', 4928.00, 4928.00, 0.00, 'Check-in payment (100% of total)', 4, 'f6eb758f232134a6ac5ffbd84a61febe3ad8f81a95dccbdcbd3c960bba17a49d', 0, '2026-10-29 14:08:00'),
(18, 16, 'OR261029ED6CF1', 'CASH', 2520.00, 2520.00, 0.00, 'Check-in payment (100% of total) · Discount: Off-season promotion', 4, '738d96cb745fcc04b4473736066d8550e8705b6365000ef579fffc9fee4c2b8b', 0, '2026-10-29 14:09:04'),
(25, 35, 'OR261030B15B5C-01', 'CASH', 1071.43, 1071.43, 0.00, 'Group receipt OR261030B15B5C · Room 101 · Discount: PWD', 4, 'd5c74a17b996bedee59becdb02f73745c4e619d87c1a6d12f7e474856fbd515e', 0, '2026-10-30 04:33:06'),
(26, 36, 'OR261030B15B5C-02', 'CASH', 2000.00, 2000.00, 0.00, 'Group receipt OR261030B15B5C · Room 301 · Discount: PWD', 4, '7b2f84fa411af15f86b42d5c29daf227642fe0e0b33d0ce1b7786fbdce847ef2', 0, '2026-10-30 04:33:06');

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

--
-- Dumping data for table `portal_tokens`
--

INSERT INTO `portal_tokens` (`id`, `stay_id`, `token_hash`, `expires_at`, `revoked_at`, `created_at`) VALUES
(1, 1, '031a146ba3845e2a5e8db791ac8ab6d47ad62404b473da6f6d91fceeb2501cae', '2026-11-05 20:53:00', NULL, '2026-10-25 05:44:14'),
(4, 4, '29100035b42bfdd52b5ebb3550c932462b1b00780ed3680707ce793164ff1c65', '2026-10-27 23:59:59', NULL, '2026-10-26 11:09:37'),
(5, 5, '95c5cf6161dafab759dd453ca1ac1d8e70667541ef94f13675cd9096ad78e05f', '2026-11-04 22:26:32', NULL, '2026-10-26 11:09:37'),
(6, 6, 'ecb9b3d25846918851980a78b369da234ecb32809cbcb6be4dc0a2a936b6d401', '2026-10-27 23:59:59', '2026-10-27 09:09:11', '2026-10-26 12:51:43'),
(7, 7, '89b0526ca0bd429b1c9dcf3522b4c7a1dd7139abb01465fadb49cae79a97c6ca', '2026-11-04 22:26:57', NULL, '2026-10-26 13:03:50'),
(8, 8, '20d4dcbebeac60c7842ace1302eb5e40f23a628dbc7f683a5f09670ca49b0e7a', '2026-11-04 23:30:46', NULL, '2026-10-26 13:03:50'),
(9, 5, 'a5bd152062baa0ccb3e231dbe5efabc0e21d29727edb6174f33134ad3d991155', '2026-11-04 22:26:32', NULL, '2026-10-26 14:20:58'),
(10, 5, '66008837fd983d8ff99fe6f8509ea36c8220195114e9e24b6cb554c0d45abbda', '2026-11-04 22:26:32', NULL, '2026-10-26 14:23:13'),
(11, 5, 'e75483d5448c3a147d4e998743600826fcda163d222198b2be2aa334d29ce2b4', '2026-11-04 22:26:32', NULL, '2026-10-26 14:24:56'),
(12, 5, '68c7fc9adbba3a02a414cff84d03c936cee2145ef14431f401e7bf199ffd9ed0', '2026-11-04 22:26:32', NULL, '2026-10-26 14:26:52'),
(13, 5, '5025eb5c984825fea23e901d21bc946bafda53c335e4051d2ad4e38697b65a4f', '2026-11-04 22:26:32', NULL, '2026-10-26 14:28:13'),
(14, 9, '4f5ef6ab8b5432acbb02b92a69f26a4090b47b0034e02c07e715f2925eff781d', '2026-11-04 23:30:57', NULL, '2026-10-26 14:43:35'),
(15, 10, 'a708c03671cff84055877ba4076aa7652330bf16f587fdfd5b8948d8ebeb1783', '2026-11-04 22:27:05', NULL, '2026-10-26 14:43:35'),
(16, 11, 'e3fba5fec5e997e9957427d46767e9bd42f5f620e061df52547f1899a101c4cf', '2026-11-04 23:31:05', NULL, '2026-10-27 02:12:22'),
(17, 12, 'b99288ccb04ae8c672c23d967256c7ddc0c711fe339419a5ed934e56b6d83ddd', '2026-11-04 23:31:12', NULL, '2026-10-27 02:43:06'),
(18, 13, '07812b15c9ec2fd1da669276a99cd6be28e8e13cd7bfb5e8739ba199955bcc54', '2026-11-04 23:31:18', NULL, '2026-10-27 03:08:14'),
(19, 14, '00bb49b3e4f0aa63cced456d768af8a7e8fd41b4b08ca86c667221cac2ed5a8a', '2026-11-05 18:17:28', NULL, '2026-10-27 03:43:04'),
(21, 1, 'f92f91a32eb5506a54d55ad977158398063aad29d53ae759caae0438e3692a2d', '2026-11-05 20:53:00', NULL, '2026-10-28 15:35:50'),
(22, 14, '635d9da122171e05d4aa561d1e1a8e9dc88d41b7b23ed6f21faf4170121c6cb8', '2026-11-05 18:17:28', NULL, '2026-10-29 04:58:42'),
(23, 15, '8f8624e6fec149d22a0e2a52490bd3bb51fc7bb436192c64d6a4da5d36d00f1d', '2026-10-31 23:59:59', NULL, '2026-10-29 05:06:17'),
(24, 16, '94f10fbec8f534e1ae80cc008ec867abcd77f7dcda10959c15138857e55ae303', '2026-11-07 14:53:00', NULL, '2026-10-29 12:42:22'),
(25, 1, '1ed73241f3ad925999d9d7e5ffb12be393e18fcbc7f8142e5c6781009b43c10c', '2026-11-05 20:53:00', NULL, '2026-10-29 13:46:00'),
(44, 35, '21049e0300a7f2e542fdf3d6df7d75ae7fded5762cc17a55e4ad9acceca8423d', '2026-10-31 23:59:59', NULL, '2026-10-30 03:40:01'),
(45, 36, '9ef5fcaa936ca56e818f337aa489e6fb24e08593fadad97bf68d7ec56fcf8268', '2026-10-31 23:59:59', NULL, '2026-10-30 03:40:01'),
(46, 35, '2af02274367d5ed5ea480a446ee48965b55abfb4175c5bf4beba2b68321ac3b3', '2026-10-31 23:59:59', NULL, '2026-10-30 04:34:44'),
(55, 36, 'e7f21796041b83b4900c7dccf3951bcdc935269aa11d9712ebb56b702290dfd7', '2026-10-31 23:59:59', NULL, '2026-10-30 05:09:38');

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
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `estimated_ready_at` datetime DEFAULT NULL,
  `confirmed_at` datetime DEFAULT NULL,
  `preparing_at` datetime DEFAULT NULL,
  `ready_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `restaurant_orders`
--

INSERT INTO `restaurant_orders` (`id`, `order_code`, `customer_id`, `stay_id`, `room_number`, `order_type`, `notes`, `total_amount`, `order_status`, `payment_status`, `payment_method`, `paid_amount`, `payment_reference`, `paid_at`, `created_at`, `updated_at`, `estimated_ready_at`, `confirmed_at`, `preparing_at`, `ready_at`, `completed_at`) VALUES
(0, 'RO-20261026-007B7A', 4, 5, '102', 'Room Service', NULL, 100.00, 'Completed', 'Billed to Room', 'Billed to Room', NULL, NULL, NULL, '2026-10-26 22:33:16', '2026-10-26 23:35:28', NULL, '2026-10-26 23:23:55', '2026-10-26 23:24:24', '2026-10-26 23:24:33', '2026-10-26 23:34:17'),
(1, 'RO-EB9EBA20', 1, 1, '101', 'Room Service', NULL, 400.00, 'Completed', 'Billed to Room', 'Billed to Room', 400.00, NULL, '2026-10-25 14:07:30', '2026-10-25 13:58:00', '2026-10-26 23:35:44', NULL, NULL, NULL, NULL, '2026-10-26 23:35:44'),
(4, 'RO-20261027-1B964D', 11, 14, '403', 'Room Service', NULL, 210.00, 'Served', 'Billed to Room', 'Billed to Room', NULL, NULL, NULL, '2026-10-27 12:44:27', '2026-10-29 17:59:44', '2026-10-27 13:04:27', '2026-10-28 21:30:20', '2026-10-29 17:59:08', '2026-10-29 17:59:22', '2026-10-29 17:59:44'),
(5, 'RO-20261029-1B18A3', 11, 14, '403', 'Room Service', NULL, 360.00, 'Served', 'Billed to Room', 'Billed to Room', NULL, NULL, NULL, '2026-10-29 14:09:28', '2026-10-29 17:59:34', '2026-10-29 14:29:28', '2026-10-29 17:58:40', '2026-10-29 17:58:55', '2026-10-29 17:59:19', '2026-10-29 17:59:34'),
(6, 'RO-20261030-0C9038', 23, 36, '302', 'Room Service', NULL, 120.00, 'Pending', 'Unpaid', NULL, NULL, NULL, NULL, '2026-10-30 14:11:34', '2026-10-30 14:11:34', '2026-10-30 14:31:34', NULL, NULL, NULL, NULL),
(8, 'RO-20261030-84A31C', 23, 35, '101', 'Room Service', NULL, 750.00, 'Served', 'Billed to Room', 'Billed to Room', NULL, NULL, NULL, '2026-10-30 14:17:19', '2026-10-30 14:18:52', '2026-10-30 14:37:19', '2026-10-30 14:17:50', '2026-10-30 14:18:15', '2026-10-30 14:18:35', '2026-10-30 14:18:52'),
(9, 'RO-20261030-0DB2A5', 23, 35, '101', 'Room Service', NULL, 600.00, 'Pending', 'Unpaid', NULL, NULL, NULL, NULL, '2026-10-30 15:02:04', '2026-10-30 15:02:04', '2026-10-30 15:22:04', NULL, NULL, NULL, NULL),
(10, 'RO-20261030-47B632', 23, 36, '302', 'Room Service', NULL, 280.00, 'Pending', 'Unpaid', NULL, NULL, NULL, NULL, '2026-10-30 15:43:32', '2026-10-30 15:43:32', '2026-10-30 16:03:32', NULL, NULL, NULL, NULL),
(11, 'RO-20261030-39126C', 23, 35, '101', 'Room Service', NULL, 180.00, 'Served', 'Billed to Room', 'Billed to Room', NULL, NULL, NULL, '2026-10-30 15:55:21', '2026-10-30 16:13:54', '2026-10-30 16:15:21', '2026-10-30 16:06:19', '2026-10-30 16:11:50', '2026-10-30 16:13:39', '2026-10-30 16:13:54');

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

--
-- Dumping data for table `restaurant_order_items`
--

INSERT INTO `restaurant_order_items` (`id`, `order_id`, `item_id`, `item_name`, `category_name`, `quantity`, `unit_price`, `subtotal`) VALUES
(0, 0, 40, 'French Fries', 'Appetizers', 1, 100.00, 100.00),
(1, 1, 34, 'Beef Steak', 'Main Course', 1, 280.00, 280.00),
(2, 1, 50, 'Cafe Latte', 'Hot Drinks', 1, 120.00, 120.00),
(5, 4, 45, 'Halo-Halo', 'Desserts', 1, 130.00, 130.00),
(6, 4, 46, 'Ice Cream', 'Desserts', 1, 80.00, 80.00),
(7, 5, 35, 'Grilled Bangus', 'Main Course', 1, 240.00, 240.00),
(8, 5, 57, 'Mango Shake', 'Cold Drinks', 1, 120.00, 120.00),
(9, 6, 56, 'Bottled Water', 'Cold Drinks', 3, 40.00, 120.00),
(11, 8, 58, 'Redhorse', 'Cold Drinks', 3, 250.00, 750.00),
(12, 9, 59, 'Tanduay Select Set', 'Cold Drinks', 2, 300.00, 600.00),
(13, 10, 34, 'Beef Steak', 'Main Course', 1, 280.00, 280.00),
(14, 11, 41, 'Chicken Wings', 'Appetizers', 1, 180.00, 180.00);

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

--
-- Dumping data for table `rooms`
--

INSERT INTO `rooms` (`id`, `room_number`, `room_type_id`, `floor_number`, `capacity`, `status`) VALUES
(1, '103', 1, 1, 2, 'CLEANING'),
(2, '102', 1, 1, 2, 'AVAILABLE'),
(3, '101', 1, 1, 2, 'OCCUPIED'),
(4, '203', 2, 2, 2, 'AVAILABLE'),
(5, '202', 2, 2, 2, 'OCCUPIED'),
(6, '201', 2, 2, 2, 'MAINTENANCE'),
(7, '303', 3, 3, 2, 'MAINTENANCE'),
(8, '302', 3, 3, 2, 'OCCUPIED'),
(9, '301', 3, 3, 2, 'AVAILABLE'),
(10, '403', 4, 4, 4, 'CLEANING'),
(11, '402', 4, 4, 4, 'AVAILABLE'),
(12, '401', 4, 4, 4, 'AVAILABLE'),
(13, '503', 5, 5, 3, 'CLEANING'),
(14, '502', 5, 5, 3, 'AVAILABLE'),
(15, '501', 5, 5, 3, 'AVAILABLE'),
(16, '603', 6, 6, 4, 'AVAILABLE'),
(17, '602', 6, 6, 4, 'AVAILABLE'),
(18, '601', 6, 6, 4, 'AVAILABLE');

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

--
-- Dumping data for table `room_transfers`
--

INSERT INTO `room_transfers` (`id`, `stay_id`, `from_room_id`, `to_room_id`, `effective_date`, `old_rate`, `new_rate`, `reason`, `authorized_by`, `created_at`) VALUES
(1, 1, 3, 13, '2026-10-29', 1500.00, 5000.00, 'Guest portal transfer RQ7956839D', 2, '2026-10-29 13:48:41'),
(4, 36, 9, 8, '2026-10-30', 2800.00, 2800.00, 'Guest portal transfer RTE9B8ECEA', 2, '2026-10-30 05:37:56');

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

--
-- Dumping data for table `room_types`
--

INSERT INTO `room_types` (`id`, `name`, `nightly_rate`, `capacity`) VALUES
(1, 'Standard', 1500.00, 2),
(2, 'Deluxe', 2200.00, 2),
(3, 'Superior', 2800.00, 2),
(4, 'Family', 3500.00, 4),
(5, 'Executive Suite', 5000.00, 3),
(6, 'Presidential Suite', 8500.00, 4);

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

--
-- Dumping data for table `service_catalog`
--

INSERT INTO `service_catalog` (`id`, `name`, `category`, `description`, `price`, `active`, `created_at`, `updated_at`, `subcategory`, `item_type`) VALUES
(1, 'Tanduay', 'MINIBAR', 'Tanan Anaa Niini Dautan Ug Ang  Yawa', 200.00, 1, '2026-10-24 14:11:11', '2026-10-24 14:11:11', 'Cold Drinks', 'DRINK'),
(2, 'Chicken Adobo', 'FOOD_BEVERAGE', 'Chicken cooked in soy sauce and vinegar', 220.00, 1, '2026-10-24 14:20:48', '2026-10-24 14:20:48', 'Main Course', 'FOOD'),
(3, 'Beef Steak', 'FOOD_BEVERAGE', 'Beef steak with onions', 280.00, 1, '2026-10-24 14:20:48', '2026-10-24 14:20:48', 'Main Course', 'FOOD'),
(4, 'Grilled Bangus', 'FOOD_BEVERAGE', 'Grilled milkfish', 240.00, 1, '2026-10-24 14:20:48', '2026-10-24 14:20:48', 'Main Course', 'FOOD'),
(5, 'Pork Sinigang', 'FOOD_BEVERAGE', 'Pork in sour tamarind soup', 250.00, 1, '2026-10-24 14:20:48', '2026-10-24 14:20:48', 'Main Course', 'FOOD'),
(6, 'Chicken Inasal', 'FOOD_BEVERAGE', 'Filipino grilled chicken', 230.00, 1, '2026-10-24 14:20:48', '2026-10-24 14:20:48', 'Main Course', 'FOOD'),
(7, 'Lumpia Shanghai', 'FOOD_BEVERAGE', 'Crispy Filipino spring rolls', 120.00, 1, '2026-10-24 14:20:48', '2026-10-24 14:20:48', 'Appetizers', 'FOOD'),
(8, 'Garlic Bread', 'FOOD_BEVERAGE', 'Toasted bread with garlic butter', 90.00, 1, '2026-10-24 14:20:48', '2026-10-24 14:20:48', 'Appetizers', 'FOOD'),
(9, 'French Fries', 'FOOD_BEVERAGE', 'Crispy potato fries', 100.00, 1, '2026-10-24 14:20:48', '2026-10-24 14:20:48', 'Appetizers', 'FOOD'),
(10, 'Chicken Wings', 'FOOD_BEVERAGE', 'Seasoned chicken wings', 180.00, 1, '2026-10-24 14:20:48', '2026-10-24 14:20:48', 'Appetizers', 'FOOD'),
(11, 'Nachos', 'FOOD_BEVERAGE', 'Tortilla chips with toppings', 160.00, 1, '2026-10-24 14:20:48', '2026-10-24 14:20:48', 'Appetizers', 'FOOD'),
(12, 'Leche Flan', 'FOOD_BEVERAGE', 'Filipino caramel custard', 90.00, 1, '2026-10-24 14:20:48', '2026-10-24 14:20:48', 'Desserts', 'FOOD'),
(13, 'Chocolate Cake', 'FOOD_BEVERAGE', 'Chocolate cake slice', 120.00, 1, '2026-10-24 14:20:48', '2026-10-24 14:20:48', 'Desserts', 'FOOD'),
(14, 'Halo-Halo', 'FOOD_BEVERAGE', 'Filipino shaved ice dessert', 130.00, 1, '2026-10-24 14:20:48', '2026-10-24 14:20:48', 'Desserts', 'FOOD'),
(15, 'Ice Cream', 'FOOD_BEVERAGE', 'Ice cream serving', 80.00, 1, '2026-10-24 14:20:48', '2026-10-24 14:20:48', 'Desserts', 'FOOD'),
(16, 'Fruit Salad', 'FOOD_BEVERAGE', 'Chilled fruit salad', 100.00, 1, '2026-10-24 14:20:48', '2026-10-24 14:20:48', 'Desserts', 'FOOD'),
(17, 'Brewed Coffee', 'FOOD_BEVERAGE', 'Freshly brewed coffee', 80.00, 1, '2026-10-24 14:20:48', '2026-10-24 14:20:48', 'Hot Drinks', 'DRINK'),
(18, 'Cappuccino', 'FOOD_BEVERAGE', 'Espresso with milk foam', 120.00, 1, '2026-10-24 14:20:48', '2026-10-24 14:20:48', 'Hot Drinks', 'DRINK'),
(19, 'Cafe Latte', 'FOOD_BEVERAGE', 'Espresso with steamed milk', 120.00, 1, '2026-10-24 14:20:48', '2026-10-24 14:20:48', 'Hot Drinks', 'DRINK'),
(20, 'Hot Chocolate', 'FOOD_BEVERAGE', 'Warm chocolate drink', 100.00, 1, '2026-10-24 14:20:48', '2026-10-24 14:20:48', 'Hot Drinks', 'DRINK'),
(21, 'Hot Tea', 'FOOD_BEVERAGE', 'Hot brewed tea', 70.00, 1, '2026-10-24 14:20:48', '2026-10-24 14:20:48', 'Hot Drinks', 'DRINK'),
(22, 'Iced Coffee', 'FOOD_BEVERAGE', 'Chilled coffee', 100.00, 1, '2026-10-24 14:20:48', '2026-10-24 14:20:48', 'Cold Drinks', 'DRINK'),
(23, 'Iced Tea', 'FOOD_BEVERAGE', 'Chilled tea', 70.00, 1, '2026-10-24 14:20:48', '2026-10-24 14:20:48', 'Cold Drinks', 'DRINK'),
(24, 'Fresh Orange Juice', 'FOOD_BEVERAGE', 'Fresh orange juice', 100.00, 1, '2026-10-24 14:20:48', '2026-10-24 14:20:48', 'Cold Drinks', 'DRINK'),
(25, 'Bottled Water', 'FOOD_BEVERAGE', 'Bottled drinking water', 40.00, 1, '2026-10-24 14:20:48', '2026-10-24 14:20:48', 'Cold Drinks', 'DRINK'),
(26, 'Mango Shake', 'FOOD_BEVERAGE', 'Chilled mango shake', 120.00, 1, '2026-10-24 14:20:48', '2026-10-24 14:20:48', 'Cold Drinks', 'DRINK'),
(0, 'Extra towels', 'HOUSEKEEPING', 'Additional towels per item', 150.00, 1, '2026-10-26 09:30:49', '2026-10-26 09:30:49', 'Guest Requests', 'SERVICE'),
(0, 'Pillow', 'HOUSEKEEPING', 'Additional pillow per item', 200.00, 1, '2026-10-26 09:30:49', '2026-10-26 09:30:49', 'Guest Requests', 'SERVICE'),
(0, 'Blanket', 'HOUSEKEEPING', 'Additional blanket per item', 300.00, 1, '2026-10-26 09:30:49', '2026-10-26 09:30:49', 'Guest Requests', 'SERVICE'),
(0, 'Bed sheets', 'HOUSEKEEPING', 'Bed sheets per set', 300.00, 1, '2026-10-26 09:30:49', '2026-10-26 09:30:49', 'Guest Requests', 'SERVICE'),
(0, 'Toiletries', 'HOUSEKEEPING', 'Toiletry set per item', 200.00, 1, '2026-10-26 09:30:49', '2026-10-26 09:30:49', 'Guest Requests', 'SERVICE'),
(0, 'Drinking water', 'HOUSEKEEPING', 'Drinking water per bottle', 100.00, 1, '2026-10-26 09:30:49', '2026-10-26 09:30:49', 'Guest Requests', 'SERVICE');

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
  `priority` enum('NORMAL','URGENT') NOT NULL DEFAULT 'NORMAL',
  `safety_flag` tinyint(1) NOT NULL DEFAULT 0,
  `safety_note` varchar(500) DEFAULT NULL,
  `safety_flagged_at` datetime DEFAULT NULL,
  `safety_flagged_by` bigint(20) UNSIGNED DEFAULT NULL,
  `chargeable` tinyint(1) NOT NULL DEFAULT 0,
  `price` decimal(12,2) NOT NULL DEFAULT 0.00,
  `fulfilled_at` datetime DEFAULT NULL,
  `completed_by` bigint(20) UNSIGNED DEFAULT NULL,
  `on_hold_reason` varchar(255) DEFAULT NULL,
  `rejection_reason` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `service_requests`
--

INSERT INTO `service_requests` (`id`, `stay_id`, `request_code`, `service_type`, `assigned_department`, `assigned_to`, `assigned_at`, `acknowledged_by`, `acknowledged_at`, `request_kind`, `requested_room_id`, `description`, `status`, `priority`, `safety_flag`, `safety_note`, `safety_flagged_at`, `safety_flagged_by`, `chargeable`, `price`, `fulfilled_at`, `completed_by`, `on_hold_reason`, `rejection_reason`, `created_at`) VALUES
(0, 5, 'RO-20261026-007B7A', 'FOOD_BEVERAGE', 'restaurant', NULL, NULL, 7, '2026-10-26 22:33:49', 'SERVICE', NULL, '1x French Fries', 'COMPLETED', 'NORMAL', 0, NULL, NULL, NULL, 1, 100.00, '2026-10-26 22:34:10', 7, NULL, NULL, '2026-10-26 14:33:16'),
(1, 1, 'RO-EB9EBA20', 'FOOD_BEVERAGE', 'restaurant', NULL, NULL, NULL, NULL, 'SERVICE', NULL, '1x Beef Steak, 1x Cafe Latte', 'COMPLETED', 'NORMAL', 0, NULL, NULL, NULL, 1, 400.00, NULL, NULL, NULL, NULL, '2026-10-25 05:58:00'),
(2, 1, 'RQ7956839D', 'FRONT_DESK', 'frontdesk', NULL, NULL, NULL, NULL, 'ROOM_TRANSFER', 13, 'Guest requested room transfer. Reason: naa k kyt', 'COMPLETED', 'NORMAL', 0, NULL, NULL, NULL, 0, 0.00, '2026-10-29 22:01:01', 2, NULL, NULL, '2026-10-25 06:08:25'),
(6, 14, 'RO-20261027-1B964D', 'FOOD_BEVERAGE', 'restaurant', NULL, '2026-10-28 21:22:59', NULL, NULL, 'SERVICE', NULL, '1x Halo-Halo, 1x Ice Cream', 'COMPLETED', 'NORMAL', 0, NULL, NULL, NULL, 1, 210.00, NULL, NULL, NULL, NULL, '2026-10-27 04:44:27'),
(7, 14, 'RQ541E8A5A', 'HOUSEKEEPING', 'housekeeping', NULL, NULL, NULL, NULL, 'SERVICE', NULL, 'Drinking water (quantity: 3) — uhaw', 'REJECTED', 'NORMAL', 0, NULL, NULL, NULL, 1, 300.00, NULL, NULL, NULL, 'dd2 ka sa restaurant dept unta boi', '2026-10-28 14:33:23'),
(8, 14, 'RQC68CF3A8', 'OTHER', 'service', NULL, NULL, 0, '2026-10-29 14:20:08', 'SERVICE', NULL, 'gusto kog gakotch. ..', 'COMPLETED', 'NORMAL', 0, NULL, NULL, NULL, 0, 0.00, '2026-10-29 14:20:50', 0, NULL, NULL, '2026-10-28 14:39:48'),
(9, 14, 'RQ6777C6D2', 'FRONT_DESK', 'service', NULL, '2026-10-29 14:24:19', 0, '2026-10-29 14:25:16', 'SERVICE', NULL, 'frontdesk asa mani padulong?', 'COMPLETED', 'NORMAL', 0, NULL, NULL, NULL, 0, 0.00, '2026-10-29 14:25:45', 0, NULL, NULL, '2026-10-28 14:44:09'),
(10, 14, 'RQD162E244', 'MAINTENANCE', 'maintenance', NULL, '2026-10-29 12:55:51', 10, '2026-10-29 13:38:49', 'SERVICE', NULL, 'asang IT ky paayu ko aircon!', 'COMPLETED', 'URGENT', 1, 'ayaw ambak!', '2026-10-28 23:15:10', 10, 0, 0.00, '2026-10-29 13:50:46', 10, NULL, NULL, '2026-10-28 14:44:40'),
(11, 14, 'RQ653E202D', 'OTHER', 'service', NULL, '2026-10-29 12:56:16', 0, '2026-10-29 14:21:32', 'SERVICE', NULL, 'ha unsa?', 'COMPLETED', 'NORMAL', 0, NULL, NULL, NULL, 0, 0.00, '2026-10-29 14:21:51', 0, NULL, NULL, '2026-10-28 14:44:55'),
(12, 14, 'RQ2945E155', 'MAINTENANCE', 'maintenance', NULL, NULL, 10, '2026-10-29 13:56:04', 'SERVICE', NULL, 'asa ko nag kulang??', 'COMPLETED', 'URGENT', 1, 'marcos  bridge aa', '2026-10-29 13:55:42', 10, 0, 0.00, '2026-10-29 13:57:47', 10, 'aysa', NULL, '2026-10-29 05:55:00'),
(13, 14, 'RO-20261029-1B18A3', 'FOOD_BEVERAGE', 'restaurant', NULL, NULL, NULL, NULL, 'SERVICE', NULL, '1x Grilled Bangus, 1x Mango Shake', 'COMPLETED', 'NORMAL', 0, NULL, NULL, NULL, 1, 360.00, NULL, NULL, NULL, NULL, '2026-10-29 06:09:28'),
(16, 36, 'RTE9B8ECEA', 'FRONT_DESK', 'frontdesk', NULL, NULL, NULL, NULL, 'ROOM_TRANSFER', 8, 'Requested room 602: bahug B', 'COMPLETED', 'NORMAL', 0, NULL, NULL, NULL, 0, 0.00, '2026-10-30 13:37:56', 2, NULL, NULL, '2026-10-30 05:12:28'),
(17, 36, 'RO-20261030-0C9038', 'FOOD_BEVERAGE', 'bar', NULL, NULL, 6, '2026-10-30 15:02:29', 'SERVICE', NULL, '3x Bottled Water', 'COMPLETED', 'NORMAL', 0, NULL, NULL, NULL, 1, 120.00, '2026-10-30 15:02:39', 6, NULL, NULL, '2026-10-30 06:11:34'),
(19, 35, 'RO-20261030-84A31C', 'FOOD_BEVERAGE', 'bar', NULL, NULL, NULL, NULL, 'SERVICE', NULL, '3x Redhorse', 'COMPLETED', 'NORMAL', 0, NULL, NULL, NULL, 1, 750.00, NULL, NULL, NULL, NULL, '2026-10-30 06:17:19'),
(20, 35, 'RQEA37CB6D', 'HOUSEKEEPING', 'housekeeping', NULL, NULL, 5, '2026-10-30 14:21:08', 'SERVICE', NULL, 'Pillow (quantity: 1) — pwde pa gakotch', 'COMPLETED', 'NORMAL', 0, NULL, NULL, NULL, 1, 200.00, '2026-10-30 14:21:30', 5, NULL, NULL, '2026-10-30 06:20:43'),
(21, 35, 'RQC4E7ABA5', 'FRONT_DESK', 'bar', NULL, '2026-10-30 14:26:16', 6, '2026-10-30 14:48:42', 'SERVICE', NULL, 'asa agion ilang rr?', 'COMPLETED', 'NORMAL', 0, NULL, NULL, NULL, 0, 0.00, '2026-10-30 14:48:57', 6, NULL, NULL, '2026-10-30 06:24:47'),
(22, 35, 'RO-20261030-0DB2A5', 'FOOD_BEVERAGE', 'bar', NULL, NULL, 6, '2026-10-30 15:02:20', 'SERVICE', NULL, '2x Tanduay Select Set', 'COMPLETED', 'NORMAL', 0, NULL, NULL, NULL, 1, 600.00, '2026-10-30 15:02:47', 6, NULL, NULL, '2026-10-30 07:02:04'),
(23, 36, 'RQD837B2AC', 'HOUSEKEEPING', 'housekeeping', NULL, NULL, 5, '2026-10-30 15:31:11', 'SERVICE', NULL, 'Extra towels (quantity: 1)', 'COMPLETED', 'NORMAL', 0, NULL, NULL, NULL, 1, 150.00, '2026-10-30 15:31:46', 5, NULL, NULL, '2026-10-30 07:31:01'),
(24, 36, 'RQD4C845BA', 'MAINTENANCE', 'maintenance', NULL, NULL, 10, '2026-10-30 15:33:35', 'SERVICE', NULL, 'ako pa ba?', 'COMPLETED', 'URGENT', 1, 'test', '2026-10-30 15:42:16', 10, 0, 0.00, '2026-10-30 15:42:42', 10, NULL, NULL, '2026-10-30 07:33:14'),
(25, 36, 'RO-20261030-47B632', 'FOOD_BEVERAGE', 'restaurant', NULL, NULL, 7, '2026-10-30 15:43:43', 'SERVICE', NULL, '1x Beef Steak', 'COMPLETED', 'NORMAL', 0, NULL, NULL, NULL, 1, 280.00, '2026-10-30 15:48:20', 7, NULL, NULL, '2026-10-30 07:43:32'),
(26, 35, 'RO-20261030-39126C', 'FOOD_BEVERAGE', 'restaurant', NULL, NULL, NULL, NULL, 'SERVICE', NULL, '1x Chicken Wings', 'COMPLETED', 'NORMAL', 0, NULL, NULL, NULL, 1, 180.00, NULL, NULL, NULL, NULL, '2026-10-30 07:55:21');

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

--
-- Dumping data for table `service_request_history`
--

INSERT INTO `service_request_history` (`id`, `request_id`, `from_status`, `to_status`, `changed_by_user_id`, `changed_by_role`, `assigned_department`, `notes`, `created_at`) VALUES
(1, 1, NULL, 'PENDING', NULL, NULL, 'restaurant', 'Guest order submitted from guest portal', '2026-10-25 05:58:00'),
(2, 2, NULL, 'PENDING', NULL, NULL, 'frontdesk', 'Room transfer requested by guest via portal', '2026-10-25 06:08:25'),
(3, 0, 'PENDING', 'ACKNOWLEDGED', 7, 'restaurant', 'restaurant', NULL, '2026-10-26 14:33:49'),
(4, 0, 'ACKNOWLEDGED', 'IN_PROGRESS', 7, 'restaurant', 'restaurant', NULL, '2026-10-26 14:33:59'),
(5, 0, 'IN_PROGRESS', 'COMPLETED', 7, 'restaurant', 'restaurant', NULL, '2026-10-26 14:34:10'),
(9, 6, NULL, 'PENDING', NULL, NULL, 'restaurant', 'Created with room-service order from the guest portal.', '2026-10-27 04:44:27'),
(10, 6, 'PENDING', 'ASSIGNED', 1, 'admin', 'restaurant', 'Reassigned from Restaurant to Restaurant · Note: dalia', '2026-10-28 13:22:59'),
(11, 7, NULL, 'PENDING', NULL, NULL, 'housekeeping', 'Created by guest through the guest portal.', '2026-10-28 14:33:23'),
(12, 8, NULL, 'PENDING', NULL, NULL, 'service', 'Created by guest through the guest portal.', '2026-10-28 14:39:48'),
(13, 7, 'PENDING', 'REJECTED', 5, 'housekeeping', 'housekeeping', 'dd2 ka sa restaurant dept unta boi', '2026-10-28 14:43:22'),
(14, 9, NULL, 'PENDING', NULL, NULL, 'frontdesk', 'Created by guest through the guest portal.', '2026-10-28 14:44:09'),
(15, 10, NULL, 'PENDING', NULL, NULL, 'maintenance', 'Created by guest through the guest portal.', '2026-10-28 14:44:40'),
(16, 11, NULL, 'PENDING', NULL, NULL, 'service', 'Created by guest through the guest portal.', '2026-10-28 14:44:55'),
(17, 10, 'PENDING', 'IN_PROGRESS', 10, 'maintenance', 'maintenance', NULL, '2026-10-28 15:02:53'),
(18, 10, 'IN_PROGRESS', 'IN_PROGRESS', 10, 'maintenance', 'maintenance', 'URGENT SAFETY ALERT: ayaw ambak!', '2026-10-28 15:15:10'),
(19, 10, 'IN_PROGRESS', 'ASSIGNED', 3, 'frontdesk', 'maintenance', 'Reassigned from Maintenance to Maintenance · Note: kalma kol', '2026-10-29 04:55:51'),
(20, 11, 'PENDING', 'ASSIGNED', 3, 'frontdesk', 'service', 'Reassigned from Service to Service · Note: dha ka', '2026-10-29 04:56:16'),
(21, 10, 'ASSIGNED', 'ACKNOWLEDGED', 10, 'maintenance', 'maintenance', NULL, '2026-10-29 05:38:49'),
(22, 10, 'ACKNOWLEDGED', 'IN_PROGRESS', 10, 'maintenance', 'maintenance', NULL, '2026-10-29 05:50:28'),
(23, 10, 'IN_PROGRESS', 'COMPLETED', 10, 'maintenance', 'maintenance', NULL, '2026-10-29 05:50:46'),
(24, 12, NULL, 'PENDING', NULL, NULL, 'maintenance', 'Created by guest through the guest portal.', '2026-10-29 05:55:00'),
(25, 12, 'PENDING', 'PENDING', 10, 'maintenance', 'maintenance', 'URGENT SAFETY ALERT: marcos  bridge aa', '2026-10-29 05:55:42'),
(26, 12, 'PENDING', 'ACKNOWLEDGED', 10, 'maintenance', 'maintenance', NULL, '2026-10-29 05:56:04'),
(27, 12, 'ACKNOWLEDGED', 'ON_HOLD', 10, 'maintenance', 'maintenance', 'aysa', '2026-10-29 05:56:38'),
(28, 12, 'ON_HOLD', 'IN_PROGRESS', 10, 'maintenance', 'maintenance', NULL, '2026-10-29 05:57:35'),
(29, 12, 'IN_PROGRESS', 'COMPLETED', 10, 'maintenance', 'maintenance', NULL, '2026-10-29 05:57:47'),
(30, 13, NULL, 'PENDING', NULL, NULL, 'restaurant', 'Created with room-service order from the guest portal.', '2026-10-29 06:09:28'),
(31, 8, 'PENDING', 'ACKNOWLEDGED', 0, 'service', 'service', NULL, '2026-10-29 06:20:08'),
(32, 8, 'ACKNOWLEDGED', 'COMPLETED', 0, 'service', 'service', NULL, '2026-10-29 06:20:50'),
(33, 11, 'ASSIGNED', 'ACKNOWLEDGED', 0, 'service', 'service', NULL, '2026-10-29 06:21:32'),
(34, 11, 'ACKNOWLEDGED', 'IN_PROGRESS', 0, 'service', 'service', NULL, '2026-10-29 06:21:39'),
(35, 11, 'IN_PROGRESS', 'COMPLETED', 0, 'service', 'service', NULL, '2026-10-29 06:21:51'),
(36, 9, 'PENDING', 'ASSIGNED', 3, 'frontdesk', 'maintenance', 'Reassigned from Frontdesk to Maintenance · Note: dd2 na  saservice', '2026-10-29 06:23:54'),
(37, 9, 'ASSIGNED', 'ASSIGNED', 3, 'frontdesk', 'service', 'Reassigned from Maintenance to Service · Note: sa service diay', '2026-10-29 06:24:19'),
(38, 9, 'ASSIGNED', 'ACKNOWLEDGED', 0, 'service', 'service', NULL, '2026-10-29 06:25:16'),
(39, 9, 'ACKNOWLEDGED', 'COMPLETED', 0, 'service', 'service', NULL, '2026-10-29 06:25:45'),
(40, 2, 'PENDING', 'PENDING', 2, 'manager', 'frontdesk', 'Transfer destination changed from Room 201 to Room 503. Approval remains pending.', '2026-10-29 13:45:44'),
(41, 2, 'PENDING', 'IN_PROGRESS', 2, 'manager', 'frontdesk', NULL, '2026-10-29 13:48:41'),
(42, 2, 'IN_PROGRESS', 'COMPLETED', 2, 'manager', 'frontdesk', 'Finalized previously executed room transfer; no second room move was made.', '2026-10-29 14:01:01'),
(45, 16, NULL, 'PENDING', NULL, NULL, 'frontdesk', 'Guest requested room 602; estimated rate adjustment 5700.00 for 1 remaining night(s). Staff approval required.', '2026-10-30 05:12:28'),
(46, 16, 'PENDING', 'PENDING', 3, 'frontdesk', 'frontdesk', 'Transfer destination changed from Room 602 to Room 302. Approval remains pending.', '2026-10-30 05:17:14'),
(47, 16, 'PENDING', 'COMPLETED', 2, 'manager', 'frontdesk', 'Approved and completed room transfer.', '2026-10-30 05:37:56'),
(48, 17, NULL, 'PENDING', NULL, NULL, 'bar', 'Created with room-service order from the guest portal.', '2026-10-30 06:11:34'),
(49, 19, NULL, 'PENDING', NULL, NULL, 'bar', 'Created with room-service order from the guest portal.', '2026-10-30 06:17:19'),
(50, 20, NULL, 'PENDING', NULL, NULL, 'housekeeping', 'Created by guest through the guest portal.', '2026-10-30 06:20:43'),
(51, 20, 'PENDING', 'ACKNOWLEDGED', 5, 'housekeeping', 'housekeeping', NULL, '2026-10-30 06:21:08'),
(52, 20, 'ACKNOWLEDGED', 'COMPLETED', 5, 'housekeeping', 'housekeeping', NULL, '2026-10-30 06:21:30'),
(53, 21, NULL, 'PENDING', NULL, NULL, 'frontdesk', 'Created by guest through the guest portal.', '2026-10-30 06:24:47'),
(54, 21, 'PENDING', 'ASSIGNED', 3, 'frontdesk', 'bar', 'Reassigned from Frontdesk to Bar · Note: subaya lang ang tingog sa trumpa. .', '2026-10-30 06:26:16'),
(55, 21, 'ASSIGNED', 'ACKNOWLEDGED', 6, 'bar', 'bar', NULL, '2026-10-30 06:48:42'),
(56, 21, 'ACKNOWLEDGED', 'COMPLETED', 6, 'bar', 'bar', NULL, '2026-10-30 06:48:57'),
(57, 22, NULL, 'PENDING', NULL, NULL, 'bar', 'Created with room-service order from the guest portal.', '2026-10-30 07:02:04'),
(58, 22, 'PENDING', 'ACKNOWLEDGED', 6, 'bar', 'bar', NULL, '2026-10-30 07:02:20'),
(59, 17, 'PENDING', 'ACKNOWLEDGED', 6, 'bar', 'bar', NULL, '2026-10-30 07:02:29'),
(60, 17, 'ACKNOWLEDGED', 'COMPLETED', 6, 'bar', 'bar', NULL, '2026-10-30 07:02:39'),
(61, 22, 'ACKNOWLEDGED', 'COMPLETED', 6, 'bar', 'bar', NULL, '2026-10-30 07:02:47'),
(62, 23, NULL, 'PENDING', NULL, NULL, 'housekeeping', 'Created by guest through the guest portal.', '2026-10-30 07:31:01'),
(63, 23, 'PENDING', 'ACKNOWLEDGED', 5, 'housekeeping', 'housekeeping', NULL, '2026-10-30 07:31:11'),
(64, 23, 'ACKNOWLEDGED', 'IN_PROGRESS', 5, 'housekeeping', 'housekeeping', NULL, '2026-10-30 07:31:23'),
(65, 23, 'IN_PROGRESS', 'COMPLETED', 5, 'housekeeping', 'housekeeping', NULL, '2026-10-30 07:31:46'),
(66, 24, NULL, 'PENDING', NULL, NULL, 'maintenance', 'Created by guest through the guest portal.', '2026-10-30 07:33:14'),
(67, 24, 'PENDING', 'ACKNOWLEDGED', 10, 'maintenance', 'maintenance', NULL, '2026-10-30 07:33:35'),
(68, 24, 'ACKNOWLEDGED', 'IN_PROGRESS', 10, 'maintenance', 'maintenance', NULL, '2026-10-30 07:33:50'),
(69, 24, 'IN_PROGRESS', 'IN_PROGRESS', 10, 'maintenance', 'maintenance', 'URGENT SAFETY ALERT: test', '2026-10-30 07:42:16'),
(70, 24, 'IN_PROGRESS', 'COMPLETED', 10, 'maintenance', 'maintenance', NULL, '2026-10-30 07:42:42'),
(71, 25, NULL, 'PENDING', NULL, NULL, 'restaurant', 'Created with room-service order from the guest portal.', '2026-10-30 07:43:32'),
(72, 25, 'PENDING', 'ACKNOWLEDGED', 7, 'restaurant', 'restaurant', NULL, '2026-10-30 07:43:43'),
(73, 25, 'ACKNOWLEDGED', 'IN_PROGRESS', 7, 'restaurant', 'restaurant', NULL, '2026-10-30 07:47:56'),
(74, 25, 'IN_PROGRESS', 'COMPLETED', 7, 'restaurant', 'restaurant', NULL, '2026-10-30 07:48:20'),
(75, 26, NULL, 'PENDING', NULL, NULL, 'restaurant', 'Created with room-service order from the guest portal.', '2026-10-30 07:55:21');

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
  `actual_checkin_at` datetime DEFAULT NULL,
  `planned_checkout` date NOT NULL,
  `actual_checkout` datetime DEFAULT NULL,
  `status` enum('ACTIVE','CHECKED_OUT','CANCELLED','PENDING_PAYMENT') NOT NULL DEFAULT 'ACTIVE',
  `created_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `group_booking_id` bigint(20) UNSIGNED DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `stays`
--

INSERT INTO `stays` (`id`, `stay_code`, `room_id`, `customer_id`, `guest_count`, `checkin_at`, `actual_checkin_at`, `planned_checkout`, `actual_checkout`, `status`, `created_by`, `created_at`, `group_booking_id`) VALUES
(1, 'STF90111F7E6', 13, 1, 1, '2026-10-25 13:44:14', NULL, '2026-10-27', '2026-10-29 20:53:00', 'CHECKED_OUT', 3, '2026-10-25 05:44:14', NULL),
(4, 'ST0F03AFD2F9', 1, 4, 1, '2026-10-26 19:09:37', NULL, '2026-10-27', NULL, 'CANCELLED', 3, '2026-10-26 11:09:37', 6),
(5, 'ST62FEB8CDC7', 2, 4, 1, '2026-10-26 19:09:37', NULL, '2026-10-27', '2026-10-28 22:26:32', 'CHECKED_OUT', 3, '2026-10-26 11:09:37', 6),
(6, 'ST62CA091CA0', 5, 5, 1, '2026-10-26 20:51:43', NULL, '2026-10-27', '2026-10-27 09:09:11', 'CHECKED_OUT', 3, '2026-10-26 12:51:43', NULL),
(7, 'ST8B5B014213', 13, 6, 1, '2026-10-26 21:03:50', NULL, '2026-10-27', '2026-10-28 22:26:57', 'CHECKED_OUT', 3, '2026-10-26 13:03:50', 7),
(8, 'ST187F4B2F8B', 18, 6, 1, '2026-10-26 21:03:50', NULL, '2026-10-27', '2026-10-28 23:30:46', 'CHECKED_OUT', 3, '2026-10-26 13:03:50', 7),
(9, 'ST1D704A583A', 1, 7, 1, '2026-10-26 22:43:35', NULL, '2026-10-27', '2026-10-28 23:30:57', 'CHECKED_OUT', 3, '2026-10-26 14:43:35', 8),
(10, 'ST705D976915', 6, 7, 1, '2026-10-26 22:43:35', NULL, '2026-10-27', '2026-10-28 22:27:05', 'CHECKED_OUT', 3, '2026-10-26 14:43:35', 8),
(11, 'ST9A37F4E30C', 4, 8, 1, '2026-10-27 10:12:22', NULL, '2026-10-29', '2026-10-28 23:31:05', 'CHECKED_OUT', 3, '2026-10-27 02:12:22', NULL),
(12, 'ST592B2360EB', 17, 9, 1, '2026-10-27 10:43:06', NULL, '2026-10-28', '2026-10-28 23:31:12', 'CHECKED_OUT', 3, '2026-10-27 02:43:06', NULL),
(13, 'ST839A569036', 7, 10, 1, '2026-10-27 11:08:14', NULL, '2026-10-28', '2026-10-28 23:31:18', 'CHECKED_OUT', 3, '2026-10-27 03:08:14', NULL),
(14, 'ST29D092A49A', 10, 11, 1, '2026-10-27 14:00:00', NULL, '2026-10-28', '2026-10-29 18:17:28', 'CHECKED_OUT', 3, '2026-10-27 03:43:04', NULL),
(15, 'STEE55FBD586', 5, 12, 1, '2026-10-29 14:00:00', '2026-10-29 20:53:00', '2026-10-31', NULL, 'ACTIVE', 3, '2026-10-29 05:06:17', NULL),
(16, 'ST5E982C4BE7', 1, 13, 1, '2026-10-29 14:00:00', '2026-10-29 20:53:00', '2026-10-31', '2026-10-31 14:53:00', 'CHECKED_OUT', 3, '2026-10-29 12:42:22', NULL),
(35, 'ST2262F71769', 3, 23, 2, '2026-10-30 14:00:00', '2026-10-30 14:01:00', '2026-10-31', NULL, 'ACTIVE', 3, '2026-10-30 03:40:01', 18),
(36, 'ST9CF65BC519', 8, 23, 2, '2026-10-30 14:00:00', '2026-10-30 14:01:00', '2026-10-31', NULL, 'ACTIVE', 3, '2026-10-30 03:40:01', 18);

--
-- Triggers `stays`
--
DELIMITER $$
CREATE TRIGGER `hotel_stays_before_insert_time_guard` BEFORE INSERT ON `stays` FOR EACH ROW BEGIN
  DECLARE policy_now DATETIME;
  SET policy_now = COALESCE(@hotel_policy_now, CURRENT_TIMESTAMP);

  IF NEW.status = 'ACTIVE' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Create check-ins through the cashier approval workflow.';
  END IF;

  IF NEW.status = 'CHECKED_OUT' OR NEW.actual_checkout IS NOT NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'A stay cannot be created as already checked out.';
  END IF;

  IF NEW.checkin_at <> TIMESTAMP(DATE(policy_now), '14:00:00')
      OR policy_now < TIMESTAMP(DATE(policy_now), '14:00:00') THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Hotel check-in is allowed only from 2:00 PM local time.';
  END IF;

  SET NEW.actual_checkin_at = NULL;
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `hotel_stays_before_update_time_guard` BEFORE UPDATE ON `stays` FOR EACH ROW BEGIN
  DECLARE approved_exception_count INT DEFAULT 0;
  DECLARE policy_now DATETIME;
  SET policy_now = COALESCE(@hotel_policy_now, CURRENT_TIMESTAMP);

  IF NOT (NEW.checkin_at <=> OLD.checkin_at) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'The scheduled check-in timestamp cannot be changed.';
  END IF;

  IF NOT (NEW.planned_checkout <=> OLD.planned_checkout) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'The scheduled checkout date cannot be changed directly.';
  END IF;

  IF NOT (NEW.actual_checkin_at <=> OLD.actual_checkin_at)
      AND NOT (NEW.status = 'ACTIVE' AND OLD.status <> 'ACTIVE') THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Actual check-in time is recorded only when a stay becomes active.';
  END IF;

  IF NEW.status = 'ACTIVE' AND OLD.status <> 'ACTIVE' THEN
    IF OLD.status NOT IN ('PENDING_PAYMENT', '') THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Only a pending check-in can become active.';
    END IF;
    IF policy_now < TIMESTAMP(DATE(NEW.checkin_at), '14:00:00') THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Hotel check-in is allowed only from 2:00 PM local time.';
    END IF;
    SET NEW.actual_checkin_at = policy_now;
  END IF;

  IF NOT (NEW.actual_checkout <=> OLD.actual_checkout)
      AND NOT (NEW.status = 'CHECKED_OUT' AND OLD.status <> 'CHECKED_OUT') THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Actual checkout time is recorded only when a stay checks out.';
  END IF;

  IF NEW.status = 'CHECKED_OUT' AND OLD.status <> 'CHECKED_OUT' THEN
    IF OLD.status <> 'ACTIVE' THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Only an active stay can be checked out.';
    END IF;
    IF policy_now < TIMESTAMP(NEW.planned_checkout, '12:00:00') THEN
      SELECT COUNT(*)
        INTO approved_exception_count
        FROM early_checkout_requests e
        JOIN early_checkout_policy_configs p
          ON p.policy_key = e.policy
       WHERE e.stay_id = NEW.id
         AND e.status = 'FINALIZED'
         AND e.request_type = 'EARLY_CHECKOUT'
         AND e.policy = 'MANAGER_EXCEPTION'
         AND p.active = 1
         AND p.requires_manager = 1
         AND e.approved_by IS NOT NULL
         AND e.requested_by IS NOT NULL
         AND e.approved_by <> e.requested_by
         AND e.approved_at IS NOT NULL
         AND e.requested_departure_at >= NEW.checkin_at
         AND e.requested_departure_at < TIMESTAMP(NEW.planned_checkout, '12:00:00')
         AND e.requested_departure_at <= policy_now;

      IF approved_exception_count = 0 THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'Checkout before scheduled noon requires a finalized, separately manager-approved exception.';
      END IF;
    END IF;

    SET NEW.actual_checkout = policy_now;
  END IF;
END
$$
DELIMITER ;

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
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `username`, `password_hash`, `role`, `active`, `session_version`, `created_at`) VALUES
(0, 'service', '$2y$12$CLYlaUjc5DsljUKllubcL.3ngcrrEftEhdx/S1GsoJVxPacuUrDHy', 'service', 1, 0, '2026-10-28 14:56:16'),
(1, 'admin', '$2y$10$90/OPLxxLHWPimMkiWgYYeBTTHtfSz284HL2ENNS/.WA4cDKNNuAW', 'admin', 1, 0, '2026-10-24 13:52:56'),
(2, 'manager', '$2y$10$XFu7X7FlWb/Qyq.xK/x/IuM7dvSZE38tgKstsRKQkyHA9Q9z2kMb.', 'manager', 1, 0, '2026-10-24 13:55:55'),
(3, 'frontdesk', '$2y$10$YC8VErA8mvLez7F1E11fWeO/k3IxqiCPlmVn9lcYJ.qyChGCHhyE6', 'frontdesk', 1, 0, '2026-10-24 13:56:14'),
(4, 'cashier', '$2y$10$PPK1U7.hEHk40YxHb/Quxe94peBmSn7utr6pVmoaWbZ3HZ.LXsFNq', 'cashier', 1, 0, '2026-10-24 13:56:51'),
(5, 'housekeeping', '$2y$10$imxZbnzr9FKN62eWSvMUD.bE8ippPoFAnzgFRKuU5s/0E8Y4bqxMa', 'housekeeping', 1, 0, '2026-10-24 13:57:17'),
(6, 'bar', '$2y$10$nlDhrRwWAxnX4dWaBFK7C.XHwuNeYUpvnv9bi81bWdFnLUDKkCe1y', 'bar', 1, 0, '2026-10-24 13:57:30'),
(7, 'restaurant', '$2y$10$2nqqoiH2226UaOHttYPjuO369U/c48fS.umKlbKvpKONoQRKiz95W', 'restaurant', 1, 0, '2026-10-24 13:57:51'),
(8, 'parking', '$2y$10$ZbGR1ntclg/hOqlVoYYvv.WgyE6VL9jNreR691bZlrkeDi7XmIlVy', 'parking_valet', 1, 0, '2026-10-24 13:58:12'),
(9, 'laundry', '$2y$10$DUq0mLQ5aQ3FXb9MoLAfwu8I/HhSNZRsoi/CqK8IBfL1/EajEX4pW', 'laundry', 1, 0, '2026-10-24 13:58:30'),
(10, 'maintenance', '$2y$10$vNhZbxs6nL.02Q6.d4j8/Oc9PqW1xXyVlbvzZndEEgR5nKdfW529O', 'maintenance', 1, 0, '2026-10-24 13:58:57');

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
  ADD KEY `idx_cp_status` (`status`),
  ADD KEY `idx_checkin_payments_folio` (`folio_id`),
  ADD KEY `idx_checkin_payments_payment` (`payment_id`),
  ADD KEY `fk_checkin_payments_created_by` (`created_by`),
  ADD KEY `fk_checkin_payments_approved_by` (`approved_by`),
  ADD KEY `fk_checkin_payments_confirmed_by` (`confirmed_by`);

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
-- Indexes for table `demo_clock_state`
--
ALTER TABLE `demo_clock_state`
  ADD PRIMARY KEY (`id`);

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
-- Indexes for table `group_bookings`
--
ALTER TABLE `group_bookings`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_group_bookings_group_code` (`group_code`),
  ADD KEY `idx_group_bookings_primary_customer` (`primary_customer_id`),
  ADD KEY `idx_group_bookings_created_by` (`created_by`);

--
-- Indexes for table `group_checkin_receipts`
--
ALTER TABLE `group_checkin_receipts`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_group_checkin_receipt_number` (`receipt_number`),
  ADD UNIQUE KEY `uq_group_checkin_idempotency` (`idempotency_key`),
  ADD KEY `idx_group_checkin_receipt_booking` (`group_booking_id`);

--
-- Indexes for table `group_checkin_receipt_allocations`
--
ALTER TABLE `group_checkin_receipt_allocations`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_group_receipt_checkin_payment` (`group_receipt_id`,`checkin_payment_id`),
  ADD KEY `idx_group_receipt_allocation_payment` (`payment_id`),
  ADD KEY `idx_group_receipt_allocation_folio` (`folio_id`);

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
-- Indexes for table `restaurant_orders`
--
ALTER TABLE `restaurant_orders`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `order_code` (`order_code`),
  ADD KEY `idx_stay` (`stay_id`),
  ADD KEY `idx_status` (`order_status`),
  ADD KEY `idx_customer` (`customer_id`),
  ADD KEY `idx_restaurant_orders_stay_id` (`stay_id`);

--
-- Indexes for table `restaurant_order_items`
--
ALTER TABLE `restaurant_order_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_order` (`order_id`),
  ADD KEY `idx_item` (`item_id`),
  ADD KEY `idx_restaurant_order_items_order_id` (`order_id`);

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
-- Indexes for table `room_types`
--
ALTER TABLE `room_types`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `name` (`name`);

--
-- Indexes for table `service_requests`
--
ALTER TABLE `service_requests`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `request_code` (`request_code`),
  ADD KEY `requested_room_id` (`requested_room_id`),
  ADD KEY `completed_by` (`completed_by`),
  ADD KEY `stay_id` (`stay_id`,`status`),
  ADD KEY `idx_service_requests_queue` (`assigned_department`,`status`,`priority`,`created_at`),
  ADD KEY `idx_service_requests_safety` (`safety_flag`,`priority`);

--
-- Indexes for table `service_request_history`
--
ALTER TABLE `service_request_history`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `stays`
--
ALTER TABLE `stays`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_stays_group_booking_id` (`group_booking_id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `applied_discounts`
--
ALTER TABLE `applied_discounts`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=13;

--
-- AUTO_INCREMENT for table `audit_logs`
--
ALTER TABLE `audit_logs`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=344;

--
-- AUTO_INCREMENT for table `charges`
--
ALTER TABLE `charges`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=50;

--
-- AUTO_INCREMENT for table `checkin_payments`
--
ALTER TABLE `checkin_payments`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=37;

--
-- AUTO_INCREMENT for table `checkout_records`
--
ALTER TABLE `checkout_records`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=13;

--
-- AUTO_INCREMENT for table `customers`
--
ALTER TABLE `customers`
  MODIFY `customer_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=24;

--
-- AUTO_INCREMENT for table `early_checkout_policy_configs`
--
ALTER TABLE `early_checkout_policy_configs`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `early_checkout_requests`
--
ALTER TABLE `early_checkout_requests`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `folios`
--
ALTER TABLE `folios`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=37;

--
-- AUTO_INCREMENT for table `group_bookings`
--
ALTER TABLE `group_bookings`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=19;

--
-- AUTO_INCREMENT for table `group_checkin_receipts`
--
ALTER TABLE `group_checkin_receipts`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `group_checkin_receipt_allocations`
--
ALTER TABLE `group_checkin_receipt_allocations`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT for table `menu_items`
--
ALTER TABLE `menu_items`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=60;

--
-- AUTO_INCREMENT for table `payments`
--
ALTER TABLE `payments`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=27;

--
-- AUTO_INCREMENT for table `portal_tokens`
--
ALTER TABLE `portal_tokens`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=58;

--
-- AUTO_INCREMENT for table `restaurant_orders`
--
ALTER TABLE `restaurant_orders`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=12;

--
-- AUTO_INCREMENT for table `restaurant_order_items`
--
ALTER TABLE `restaurant_order_items`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=15;

--
-- AUTO_INCREMENT for table `room_transfers`
--
ALTER TABLE `room_transfers`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `service_requests`
--
ALTER TABLE `service_requests`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=27;

--
-- AUTO_INCREMENT for table `service_request_history`
--
ALTER TABLE `service_request_history`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=76;

--
-- AUTO_INCREMENT for table `stays`
--
ALTER TABLE `stays`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=37;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `group_bookings`
--
ALTER TABLE `group_bookings`
  ADD CONSTRAINT `fk_group_bookings_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_group_bookings_primary_customer` FOREIGN KEY (`primary_customer_id`) REFERENCES `customers` (`customer_id`);

--
-- Constraints for table `group_checkin_receipt_allocations`
--
ALTER TABLE `group_checkin_receipt_allocations`
  ADD CONSTRAINT `fk_group_receipt_allocation_receipt` FOREIGN KEY (`group_receipt_id`) REFERENCES `group_checkin_receipts` (`id`);

--
-- Constraints for table `stays`
--
ALTER TABLE `stays`
  ADD CONSTRAINT `fk_stays_group_booking` FOREIGN KEY (`group_booking_id`) REFERENCES `group_bookings` (`id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
