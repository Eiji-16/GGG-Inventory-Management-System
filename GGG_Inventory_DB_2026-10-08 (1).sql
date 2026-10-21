-- --------------------------------------------------------
-- Host:                         127.0.0.1
-- Server version:               8.4.3 - MySQL Community Server - GPL
-- Server OS:                    Win64
-- HeidiSQL Version:             12.8.0.6908
-- --------------------------------------------------------

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET NAMES utf8 */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;


-- Dumping database structure for ggg_inventory
CREATE DATABASE IF NOT EXISTS `ggg_inventory` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;
USE `ggg_inventory`;

-- Dumping structure for table ggg_inventory.activity_logs
CREATE TABLE IF NOT EXISTS `activity_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned DEFAULT NULL,
  `action` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `icon` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `meta` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `activity_logs_user_id_created_at_index` (`user_id`,`created_at`),
  CONSTRAINT `activity_logs_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=28 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table ggg_inventory.activity_logs: ~16 rows (approximately)
INSERT INTO `activity_logs` (`id`, `user_id`, `action`, `description`, `icon`, `meta`, `created_at`, `updated_at`) VALUES
	(1, NULL, 'login', 'Signed in', 'login', NULL, '2026-10-06 13:55:49', '2026-10-06 13:55:49'),
	(2, 3, 'login', 'Signed in', 'login', NULL, '2026-10-06 14:18:03', '2026-10-06 14:18:03'),
	(3, NULL, 'stock.in', 'Stock in â€” 30 unit(s) of CherryMobile', 'boxes', '{"qty": 30, "product": "CherryMobile"}', '2026-10-06 14:18:45', '2026-10-06 14:18:45'),
	(4, NULL, 'login', 'Signed in', 'login', NULL, '2026-10-06 14:20:34', '2026-10-06 14:20:34'),
	(5, 5, 'login', 'Signed in', 'login', NULL, '2026-10-06 14:20:49', '2026-10-06 14:20:49'),
	(7, 3, 'login', 'Signed in', 'login', NULL, '2026-10-06 14:45:41', '2026-10-06 14:45:41'),
	(8, 3, 'login', 'Signed in', 'login', NULL, '2026-10-06 16:44:47', '2026-10-06 16:44:47'),
	(9, 3, 'login', 'Signed in', 'login', NULL, '2026-10-07 01:33:52', '2026-10-07 01:33:52'),
	(10, 3, 'formula.compute', 'Computed EOQ — 1.22 units', 'calculator', '{"by": "Super Admin User", "unit": "units", "inputs": {"D": 1, "H": 4, "S": 3}, "result": 1.22, "formula": "EOQ", "product": null}', '2026-10-07 02:25:02', '2026-10-07 02:25:02'),
	(11, 3, 'formula.compute', 'Computed EOQ — 100 units for Poco X6 Pro', 'calculator', '{"by": "Super Admin User", "unit": "units", "inputs": {"D": 1000, "H": 10, "S": 50}, "result": 100, "formula": "EOQ", "product": "Poco X6 Pro"}', '2026-10-07 02:26:16', '2026-10-07 02:26:16'),
	(12, 3, 'formula.compute', 'Computed EOQ — 100 units for Poco X6 Pro', 'calculator', '{"by": "Super Admin User", "unit": "units", "inputs": {"D": 1000, "H": 10, "S": 50}, "result": 100, "formula": "EOQ", "product": "Poco X6 Pro"}', '2026-10-07 02:27:02', '2026-10-07 02:27:02'),
	(13, 3, 'login', 'Signed in', 'login', NULL, '2026-10-08 01:02:30', '2026-10-08 01:02:30'),
	(14, 3, 'login', 'Signed in', 'login', NULL, '2026-10-08 01:08:35', '2026-10-08 01:08:35'),
	(15, 3, 'login', 'Signed in', 'login', NULL, '2026-10-13 23:40:12', '2026-10-13 23:40:12'),
	(16, 3, 'staff.create', 'Created account — Test Staff (staff)', 'user', '{"email": "staff@ggg.com"}', '2026-10-13 23:42:30', '2026-10-13 23:42:30'),
	(17, 7, 'login', 'Signed in', 'login', NULL, '2026-10-13 23:43:04', '2026-10-13 23:43:04'),
	(18, 3, 'login', 'Signed in', 'login', NULL, '2026-10-13 23:43:40', '2026-10-13 23:43:40'),
	(19, 3, 'login', 'Signed in', 'login', NULL, '2026-10-21 01:20:20', '2026-10-21 01:20:20'),
	(20, 3, 'formula.compute', 'Computed EOQ — 10 units for Aula', 'calculator', '{"by": "Super Admin User", "unit": "units", "inputs": {"holdingCost": 20, "annualDemand": 100, "annualOrders": 10, "orderingCost": 10}, "result": 10, "formula": "EOQ", "product": "Aula"}', '2026-10-21 01:42:43', '2026-10-21 01:42:43'),
	(21, 3, 'formula.compute', 'Computed EOQ — 20 units for Aula', 'calculator', '{"by": "Super Admin User", "unit": "units", "inputs": {"holdingCost": 50, "annualDemand": 1000, "annualOrders": 50, "orderingCost": 10}, "result": 20, "formula": "EOQ", "product": "Aula"}', '2026-10-21 01:43:02', '2026-10-21 01:43:02'),
	(22, 3, 'formula.compute', 'Computed EOQ — 44.72 units for Aula', 'calculator', '{"by": "Super Admin User", "unit": "units", "inputs": {"holdingCost": 50, "annualDemand": 1000, "annualOrders": 22.36, "orderingCost": 50}, "result": 44.72, "formula": "EOQ", "product": "Aula"}', '2026-10-21 01:43:11', '2026-10-21 01:43:11'),
	(23, 3, 'formula.compute', 'Computed EOQ — 44.72 units for Aula', 'calculator', '{"by": "Super Admin User", "unit": "units", "inputs": {"holdingCost": 50, "annualDemand": 1000, "annualOrders": 22.36, "orderingCost": 50}, "result": 44.72, "formula": "EOQ", "product": "Aula"}', '2026-10-21 01:46:01', '2026-10-21 01:46:01'),
	(24, 3, 'formula.compute', 'Computed EOQ — 47.75 units for Aula', 'calculator', '{"by": "Super Admin User", "unit": "units", "inputs": {"holdingCost": 50, "annualDemand": 1000, "annualOrders": 20.94, "orderingCost": 57}, "result": 47.75, "formula": "EOQ", "product": "Aula"}', '2026-10-21 01:46:08', '2026-10-21 01:46:08'),
	(25, 3, 'formula.compute', 'Computed EOQ — 44.72 units for Aula', 'calculator', '{"by": "Super Admin User", "unit": "units", "inputs": {"holdingCost": 50, "annualDemand": 1000, "annualOrders": 22.36, "orderingCost": 50}, "result": 44.72, "formula": "EOQ", "product": "Aula"}', '2026-10-21 01:46:16', '2026-10-21 01:46:16'),
	(26, 3, 'formula.compute', 'Computed EOQ — 44.72 units for Aula', 'calculator', '{"by": "Super Admin User", "unit": "units", "inputs": {"holdingCost": 50, "annualDemand": 1000, "annualOrders": 22.36, "orderingCost": 50}, "result": 44.72, "formula": "EOQ", "product": "Aula"}', '2026-10-21 01:54:14', '2026-10-21 01:54:14'),
	(27, 3, 'stock.clear', 'Cleared stock for CherryMobile (30 units)', 'boxes', '{"product": "CherryMobile", "totalQty": 0, "productId": "PRD-1314", "deletedMovements": 1, "previousTotalQty": 30}', '2026-10-21 02:05:57', '2026-10-21 02:05:57');

-- Dumping structure for table ggg_inventory.cache
CREATE TABLE IF NOT EXISTS `cache` (
  `key` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` mediumtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `expiration` bigint NOT NULL,
  PRIMARY KEY (`key`),
  KEY `cache_expiration_index` (`expiration`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table ggg_inventory.cache: ~4 rows (approximately)
INSERT INTO `cache` (`key`, `value`, `expiration`) VALUES
	('laravel-cache-424f74a6a7ed4d4ed4761507ebcd209a6ef0937b', 'i:1;', 1791099814),
	('laravel-cache-424f74a6a7ed4d4ed4761507ebcd209a6ef0937b:timer', 'i:1791099814;', 1791099814),
	('laravel-cache-5c785c036466adea360111aa28563bfd556b5fba', 'i:1;', 1791099428),
	('laravel-cache-5c785c036466adea360111aa28563bfd556b5fba:timer', 'i:1791099428;', 1791099428);

-- Dumping structure for table ggg_inventory.cache_locks
CREATE TABLE IF NOT EXISTS `cache_locks` (
  `key` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `owner` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expiration` bigint NOT NULL,
  PRIMARY KEY (`key`),
  KEY `cache_locks_expiration_index` (`expiration`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table ggg_inventory.cache_locks: ~0 rows (approximately)

-- Dumping structure for table ggg_inventory.custom_formulas
CREATE TABLE IF NOT EXISTS `custom_formulas` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `full_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `expression` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `result_unit` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fields` json NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `custom_formulas_name_unique` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table ggg_inventory.custom_formulas: ~0 rows (approximately)

-- Dumping structure for table ggg_inventory.failed_jobs
CREATE TABLE IF NOT EXISTS `failed_jobs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `uuid` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `connection` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `queue` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `payload` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `exception` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `failed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `failed_jobs_uuid_unique` (`uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table ggg_inventory.failed_jobs: ~0 rows (approximately)

-- Dumping structure for table ggg_inventory.jobs
CREATE TABLE IF NOT EXISTS `jobs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `queue` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `payload` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `attempts` smallint unsigned NOT NULL,
  `reserved_at` int unsigned DEFAULT NULL,
  `available_at` int unsigned NOT NULL,
  `created_at` int unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `jobs_queue_index` (`queue`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table ggg_inventory.jobs: ~0 rows (approximately)

-- Dumping structure for table ggg_inventory.job_batches
CREATE TABLE IF NOT EXISTS `job_batches` (
  `id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `total_jobs` int NOT NULL,
  `pending_jobs` int NOT NULL,
  `failed_jobs` int NOT NULL,
  `failed_job_ids` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `options` mediumtext COLLATE utf8mb4_unicode_ci,
  `cancelled_at` int DEFAULT NULL,
  `created_at` int NOT NULL,
  `finished_at` int DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table ggg_inventory.job_batches: ~0 rows (approximately)

-- Dumping structure for table ggg_inventory.migrations
CREATE TABLE IF NOT EXISTS `migrations` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `migration` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `batch` int NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=25 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table ggg_inventory.migrations: ~0 rows (approximately)
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES
	(1, '0001_01_01_000000_create_users_table', 1),
	(2, '0001_01_01_000001_create_cache_table', 1),
	(3, '0001_01_01_000002_create_jobs_table', 1),
	(4, '2026_09_20_000001_create_suppliers_table', 1),
	(5, '2026_09_20_000002_create_products_table', 1),
	(6, '2026_09_20_000003_create_stock_movements_table', 1),
	(7, '2026_09_20_000004_create_safety_stock_table', 1),
	(8, '2026_09_20_000005_create_sales_history_table', 1),
	(9, '2026_10_03_000001_add_variant_name_to_stock_movements_table', 1),
	(10, '2026_10_04_000001_add_is_adjustment_to_stock_movements_table', 1),
	(11, '2026_10_04_000001_create_password_reset_otps_table', 1),
	(12, '2026_10_06_000002_create_custom_formulas_table', 1),
	(13, '2026_10_06_000003_add_role_to_users_table', 1),
	(14, '2026_10_06_000004_add_status_to_users_table', 1),
	(15, '2026_10_06_000005_create_activity_logs_table', 1),
	(16, '2026_10_06_000006_add_department_to_users_table', 1),
	(17, '2026_10_06_000007_add_image_to_products_table', 2),
	(18, '2026_10_17_000001_add_period_type_to_sales_history_table', 2),
	(19, '2026_10_17_000002_add_order_timing_to_safety_stock_table', 2),
	(20, '2026_10_18_000001_add_order_costs_to_safety_stock_table', 2),
	(21, '2026_10_18_000002_create_purchase_orders_tables', 2),
	(22, '2026_10_18_000003_drop_purchase_order_tables', 2),
	(23, '2026_10_21_000001_add_currency_to_users_table', 3),
	(24, '2026_10_21_000002_add_soft_deletes_to_products_table', 4);

-- Dumping structure for table ggg_inventory.password_reset_otps
CREATE TABLE IF NOT EXISTS `password_reset_otps` (
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `otp_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `attempts` tinyint unsigned NOT NULL DEFAULT '0',
  `expires_at` timestamp NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table ggg_inventory.password_reset_otps: ~0 rows (approximately)

-- Dumping structure for table ggg_inventory.password_reset_tokens
CREATE TABLE IF NOT EXISTS `password_reset_tokens` (
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `token` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table ggg_inventory.password_reset_tokens: ~0 rows (approximately)

-- Dumping structure for table ggg_inventory.products
CREATE TABLE IF NOT EXISTS `products` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `brand` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `model` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `unit_measure` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `image` longtext COLLATE utf8mb4_unicode_ci,
  `supplier_id` bigint unsigned DEFAULT NULL,
  `stock_on_hand` int NOT NULL DEFAULT '0',
  `unit_cost` decimal(12,2) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `products_code_unique` (`code`),
  KEY `products_supplier_id_foreign` (`supplier_id`),
  KEY `products_name_index` (`name`),
  KEY `products_category_index` (`category`),
  CONSTRAINT `products_supplier_id_foreign` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=25 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table ggg_inventory.products: ~5 rows (approximately)
INSERT INTO `products` (`id`, `code`, `name`, `category`, `brand`, `model`, `unit_measure`, `image`, `supplier_id`, `stock_on_hand`, `unit_cost`, `created_at`, `updated_at`, `deleted_at`) VALUES
	(13, 'PRD-5720', 'Iphone 11', 'Phone', 'Apple', 'Iphone 11 Pro Max', 'Units', NULL, 14, 0, NULL, '2026-10-03 11:13:13', '2026-10-05 14:10:58', NULL),
	(14, 'PRD-7647', 'Poco X6 Pro', 'Phone', 'Poco', 'X6 PRO', 'Units', NULL, 15, 0, NULL, '2026-10-03 15:53:47', '2026-10-05 13:58:11', NULL),
	(15, 'PRD-6089', 'Aula', 'Keyboard', 'Aula', 'F75', 'Boxes', NULL, 16, 37, NULL, '2026-10-03 16:19:46', '2026-10-05 19:57:11', NULL),
	(16, 'PRD-3852', 'Kanata RGB Gaming Mouse', 'Peripherals', 'Kanata', 'KN-14', 'Units', NULL, 18, 0, NULL, '2026-10-04 16:40:21', '2026-10-05 14:11:23', NULL),
	(24, 'PRD-1314', 'CherryMobile', 'Phone', 'Cherry', 'S6000', 'Boxes', NULL, 17, 0, NULL, '2026-10-05 13:47:54', '2026-10-21 02:05:57', NULL);

-- Dumping structure for table ggg_inventory.safety_stock
CREATE TABLE IF NOT EXISTS `safety_stock` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `product_id` bigint unsigned NOT NULL,
  `safety_stock` int NOT NULL DEFAULT '20',
  `annual_demand` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `lead_time_days` int unsigned DEFAULT NULL,
  `order_cycle_days` int unsigned DEFAULT NULL,
  `ordering_cost` decimal(12,2) DEFAULT NULL,
  `holding_cost` decimal(12,2) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `safety_stock_product_id_unique` (`product_id`),
  CONSTRAINT `safety_stock_product_id_foreign` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table ggg_inventory.safety_stock: ~0 rows (approximately)

-- Dumping structure for table ggg_inventory.sales_history
CREATE TABLE IF NOT EXISTS `sales_history` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `product_id` bigint unsigned NOT NULL,
  `period_date` date NOT NULL,
  `period_type` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'month',
  `units_sold` int NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sales_history_product_period_type_date_unique` (`product_id`,`period_type`,`period_date`),
  KEY `sales_history_period_date_index` (`period_date`),
  KEY `sales_history_product_id_index` (`product_id`),
  CONSTRAINT `sales_history_product_id_foreign` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=31 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table ggg_inventory.sales_history: ~7 rows (approximately)
INSERT INTO `sales_history` (`id`, `product_id`, `period_date`, `period_type`, `units_sold`, `created_at`, `updated_at`) VALUES
	(18, 15, '2026-09-01', 'month', 84, '2026-10-06 14:16:17', '2026-10-06 14:16:17'),
	(19, 15, '2026-08-01', 'month', 32, '2026-10-06 15:57:24', '2026-10-06 15:57:24'),
	(20, 15, '2026-07-01', 'month', 33, '2026-10-06 15:57:33', '2026-10-06 15:57:33'),
	(21, 15, '2026-06-01', 'month', 12, '2026-10-06 15:57:39', '2026-10-06 15:57:39'),
	(22, 15, '2026-05-01', 'month', 12, '2026-10-06 15:57:46', '2026-10-06 15:57:46'),
	(24, 24, '2026-01-01', 'month', 12, '2026-10-07 02:07:32', '2026-10-07 02:07:32'),
	(25, 15, '2026-01-01', 'month', 14, '2026-10-08 01:36:14', '2026-10-08 01:36:34'),
	(29, 15, '2026-10-01', 'month', 10, '2026-10-21 02:00:27', '2026-10-21 02:00:27'),
	(30, 15, '2026-11-01', 'month', 50, '2026-10-21 02:00:35', '2026-10-21 02:00:35');

-- Dumping structure for table ggg_inventory.sessions
CREATE TABLE IF NOT EXISTS `sessions` (
  `id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` bigint unsigned DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` text COLLATE utf8mb4_unicode_ci,
  `payload` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_activity` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `sessions_user_id_index` (`user_id`),
  KEY `sessions_last_activity_index` (`last_activity`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table ggg_inventory.sessions: ~5 rows (approximately)
INSERT INTO `sessions` (`id`, `user_id`, `ip_address`, `user_agent`, `payload`, `last_activity`) VALUES
	('PJbv2pjbjaWUS3eDSVVCH180DTJEkrQT7x5wUg8A', 3, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:158.0) Gecko/20100101 Firefox/158.0', 'eyJfdG9rZW4iOiI4WVdvRTZxbndkMGxpT0d4cURvWGRVOG4wUFpQQ0cxZndpWFZjQVVlIiwiX3ByZXZpb3VzIjp7InVybCI6Imh0dHA6XC9cLzEyNy4wLjAuMTo4MDAwXC9hcGlcL3Byb2R1Y3RzIiwicm91dGUiOm51bGx9LCJfZmxhc2giOnsib2xkIjpbXSwibmV3IjpbXX0sImxvZ2luX3dlYl81OWJhMzZhZGRjMmIyZjk0MDE1ODBmMDE0YzdmNThlYTRlMzA5ODlkIjozfQ==', 1792578844),
	('RW3mH840l4NeOuf0lRSO877z3qlsDe6lEDbPYyk4', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Code/1.141.1 Chrome/150.0.7871.250 Electron/43.7.7 Safari/537.36', 'eyJfdG9rZW4iOiI5Z3M5THBuWnE1OXdtWTMwM3dMaUh1VUJLMUl5U2lFN2d6UUlGY2pwIiwiX3ByZXZpb3VzIjp7InVybCI6Imh0dHA6XC9cLzEyNy4wLjAuMTo4MDAwXC9hdXRoXC91c2VyIiwicm91dGUiOm51bGx9LCJfZmxhc2giOnsib2xkIjpbXSwibmV3IjpbXX19', 1792574413),
	('zmHWvdq0ohiLPPj2qljsLRipQ8jnijVZ5O8WtqGV', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Code/1.141.1 Chrome/150.0.7871.250 Electron/43.7.7 Safari/537.36', 'eyJfdG9rZW4iOiJ4Vk11QnM1aGQxNmpteGZhNm1xY3MzcHFKQVhBTkRLNlFxUHFGWUhMIiwiX3ByZXZpb3VzIjp7InVybCI6Imh0dHA6XC9cLzEyNy4wLjAuMTo4MDAwIiwicm91dGUiOm51bGx9LCJfZmxhc2giOnsib2xkIjpbXSwibmV3IjpbXX19', 1792574321);

-- Dumping structure for table ggg_inventory.stock_movements
CREATE TABLE IF NOT EXISTS `stock_movements` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `product_id` bigint unsigned NOT NULL,
  `product_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `product_category` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `variant_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `movement_type` enum('in','out') COLLATE utf8mb4_unicode_ci NOT NULL,
  `qty` int NOT NULL,
  `remaining_stock` int NOT NULL,
  `notes` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `recorded_by` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `movement_date` date NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `is_adjustment` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `stock_movements_product_id_index` (`product_id`),
  KEY `stock_movements_movement_date_index` (`movement_date`),
  CONSTRAINT `stock_movements_product_id_foreign` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=35 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table ggg_inventory.stock_movements: ~2 rows (approximately)
INSERT INTO `stock_movements` (`id`, `product_id`, `product_name`, `product_category`, `variant_name`, `movement_type`, `qty`, `remaining_stock`, `notes`, `recorded_by`, `movement_date`, `created_at`, `updated_at`, `is_adjustment`) VALUES
	(33, 15, 'Aula', 'Keyboard', 'Black', 'in', 37, 37, 'New', 'Super Admin', '2026-10-06', '2026-10-05 14:18:24', '2026-10-05 19:57:11', 0);

-- Dumping structure for table ggg_inventory.suppliers
CREATE TABLE IF NOT EXISTS `suppliers` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `contact` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `company` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `suppliers_name_unique` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table ggg_inventory.suppliers: ~18 rows (approximately)
INSERT INTO `suppliers` (`id`, `name`, `contact`, `company`, `created_at`, `updated_at`) VALUES
	(1, 'Swiss Alliance Logistics Inc.', '+41 44 555 0180', 'Swiss Alliance Logistics Inc.', '2026-09-19 14:02:41', '2026-09-19 14:02:41'),
	(2, 'Pacific Rim Component Group', '+1 800 555 0143', 'Pacific Rim Component Group', '2026-09-19 14:02:41', '2026-09-19 14:02:41'),
	(3, 'Apex Global Distribution', '+44 20 7946 0123', 'Apex Global Distribution', '2026-09-19 14:02:41', '2026-09-19 14:02:41'),
	(4, 'EuroLeather Import Corp.', '+49 30 555 0117', 'EuroLeather Import Corp.', '2026-09-19 14:02:42', '2026-09-19 14:02:42'),
	(5, 'Tokyo Micro-Engineering', '+81 3 5555 0148', 'Tokyo Micro-Engineering', '2026-09-19 14:02:42', '2026-09-19 14:02:42'),
	(6, 'Iphone Company', NULL, 'Iphone Company', '2026-09-19 14:27:22', '2026-09-19 14:27:22'),
	(7, '0912345466', NULL, '0912345466', '2026-09-22 10:53:55', '2026-09-22 10:53:55'),
	(8, 'Apply Inc', NULL, 'Apply Inc', '2026-09-22 12:42:52', '2026-09-22 12:42:52'),
	(9, 'Apply Inc 123465', NULL, 'Apply Inc 123465', '2026-09-22 12:43:48', '2026-09-22 12:43:48'),
	(10, 'Samsung Inc.', NULL, 'Samsung Inc.', '2026-09-22 15:56:24', '2026-09-22 15:56:24'),
	(11, 'Samsung Inc', NULL, 'Samsung Inc', '2026-09-23 08:48:33', '2026-09-23 08:48:33'),
	(12, '231321', '1231', '231321', '2026-10-01 11:47:56', '2026-10-01 11:47:56'),
	(13, 'Pah Inc.', '1234567890', 'Pah Inc.', '2026-10-03 11:09:51', '2026-10-03 11:09:51'),
	(14, 'Apple Inc.', '123456788', 'Apple Inc.', '2026-10-03 11:13:13', '2026-10-03 11:13:13'),
	(15, 'Poco Inc', '13456789e', 'Poco Inc', '2026-10-03 15:53:47', '2026-10-03 15:53:47'),
	(16, 'Aula Inc.', '678329459', 'Aula Inc.', '2026-10-03 16:19:46', '2026-10-03 16:19:46'),
	(17, 'Cherry Mobile', '21464365', 'Cherry Mobile', '2026-10-05 13:47:54', '2026-10-05 13:47:54'),
	(18, 'KanataProduction. Inc', 'Kanata@gmail.com', 'KanataProduction. Inc', '2026-10-05 14:11:23', '2026-10-05 14:11:23');

-- Dumping structure for table ggg_inventory.users
CREATE TABLE IF NOT EXISTS `users` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` enum('super_admin','admin','staff') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'staff',
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `department` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email_verified_at` timestamp NULL DEFAULT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `remember_token` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `currency` varchar(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD',
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_unique` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table ggg_inventory.users: ~4 rows (approximately)
INSERT INTO `users` (`id`, `name`, `email`, `role`, `status`, `department`, `email_verified_at`, `password`, `remember_token`, `created_at`, `updated_at`, `currency`) VALUES
	(3, 'Super Admin User', 'superadmin@ggg.test', 'super_admin', 'active', NULL, NULL, '$2y$12$.X7qEj5vBfV.Vf6tG2DECe3jjCRkr.OBrpBeAO3kXLt1eKcVbyvUe', NULL, '2026-10-05 18:48:14', '2026-10-21 01:57:37', 'USD'),
	(4, 'Admin User', 'admin@ggg.test', 'admin', 'active', NULL, NULL, '$2y$12$Ygt9dB8AKy14ugcoyWHW6.pBa37Tu4t9is2KM9vb0jOsnXRn/2XU.', NULL, '2026-10-05 18:48:15', '2026-10-08 01:07:05', 'USD'),
	(5, 'Staff User', 'staff@ggg.test', 'staff', 'active', 'Warehouse', NULL, '$2y$12$8yrQHIA7IuxrpLtemDiNqeV.ufE5sBikDWeDLLJVoEVTyYAtnmwLi', NULL, '2026-10-05 18:48:15', '2026-10-08 01:07:10', 'USD'),
	(7, 'Test Staff', 'staff@ggg.com', 'staff', 'inactive', NULL, NULL, '$2y$12$ECnWH3Tk5nds5d9dXLNxsOhmpsyM8Lm9HlJXpBIeoFmLORtk1XQby', NULL, '2026-10-13 23:42:30', '2026-10-14 00:32:40', 'USD');

/*!40103 SET TIME_ZONE=IFNULL(@OLD_TIME_ZONE, 'system') */;
/*!40101 SET SQL_MODE=IFNULL(@OLD_SQL_MODE, '') */;
/*!40014 SET FOREIGN_KEY_CHECKS=IFNULL(@OLD_FOREIGN_KEY_CHECKS, 1) */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40111 SET SQL_NOTES=IFNULL(@OLD_SQL_NOTES, 1) */;
