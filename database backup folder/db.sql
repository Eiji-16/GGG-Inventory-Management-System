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
CREATE DATABASE IF NOT EXISTS `ggg_inventory` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;
USE `ggg_inventory`;

-- Dumping structure for table ggg_inventory.activity_logs
CREATE TABLE IF NOT EXISTS `activity_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned DEFAULT NULL,
  `action` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `icon` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `meta` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `activity_logs_user_id_created_at_index` (`user_id`,`created_at`),
  CONSTRAINT `activity_logs_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=230 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table ggg_inventory.activity_logs: ~166 rows (approximately)
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
	(27, 3, 'stock.clear', 'Cleared stock for CherryMobile (30 units)', 'boxes', '{"product": "CherryMobile", "totalQty": 0, "productId": "PRD-1314", "deletedMovements": 1, "previousTotalQty": 30}', '2026-10-21 02:05:57', '2026-10-21 02:05:57'),
	(28, 3, 'login', 'Signed in', 'login', NULL, '2026-10-21 02:52:01', '2026-10-21 02:52:01'),
	(29, 3, 'product.delete', 'Deleted product — CherryMobile', 'boxes', '{"product": "CherryMobile", "productId": "PRD-1314", "stockOnHand": 0}', '2026-10-21 02:55:36', '2026-10-21 02:55:36'),
	(30, 3, 'product.delete', 'Deleted product — Iphone 11', 'boxes', '{"product": "Iphone 11", "productId": "PRD-5720", "stockOnHand": 0}', '2026-10-21 02:55:39', '2026-10-21 02:55:39'),
	(31, 3, 'product.delete', 'Deleted product — Poco X6 Pro', 'boxes', '{"product": "Poco X6 Pro", "productId": "PRD-7647", "stockOnHand": 0}', '2026-10-21 02:55:45', '2026-10-21 02:55:45'),
	(32, 3, 'product.delete', 'Deleted product — Kanata RGB Gaming Mouse', 'boxes', '{"product": "Kanata RGB Gaming Mouse", "productId": "PRD-3852", "stockOnHand": 0}', '2026-10-21 02:55:49', '2026-10-21 02:55:49'),
	(33, 3, 'stock.edit', 'Updated Aula movement: +37 → −7', 'boxes', '{"qty": 7, "date": "2026-10-06", "type": "Stock Out", "change": -7, "product": "Aula", "totalQty": 30, "productId": "PRD-6089", "movementId": 33, "previousType": "Stock In", "previousChange": 37, "previousProductId": "PRD-6089"}', '2026-10-21 02:56:08', '2026-10-21 02:56:08'),
	(34, 3, 'stock.edit', 'Updated Aula movement: −7 → −20', 'boxes', '{"qty": 20, "date": "2026-10-06", "type": "Stock Out", "change": -20, "product": "Aula", "totalQty": 10, "productId": "PRD-6089", "movementId": 33, "previousType": "Stock Out", "previousChange": -7, "previousProductId": "PRD-6089"}', '2026-10-21 02:59:03', '2026-10-21 02:59:03'),
	(35, 3, 'stock.clear', 'Cleared stock for Aula (10 units)', 'boxes', '{"product": "Aula", "totalQty": 0, "productId": "PRD-6089", "deletedMovements": 1, "previousTotalQty": 10}', '2026-10-21 03:00:05', '2026-10-21 03:00:05'),
	(36, 3, 'product.delete', 'Deleted product — Aula', 'boxes', '{"product": "Aula", "productId": "PRD-6089", "stockOnHand": 0}', '2026-10-21 03:00:14', '2026-10-21 03:00:14'),
	(37, 3, 'product.create', 'Added product — Poco X6 Pro', 'boxes', '{"product": "Poco X6 Pro"}', '2026-10-21 03:02:00', '2026-10-21 03:02:00'),
	(38, 3, 'stock.in', 'Stock In +20 for Poco X6 Pro', 'boxes', '{"qty": 20, "date": "2026-10-21", "type": "Stock In", "change": 20, "product": "Poco X6 Pro", "totalQty": 20, "productId": "PRD-4158", "movementId": 35, "previousType": null, "previousChange": null, "previousProductId": null}', '2026-10-21 03:02:22', '2026-10-21 03:02:22'),
	(39, 3, 'stock.edit', 'Updated Poco X6 Pro movement: +20 → −5', 'boxes', '{"qty": 5, "date": "2026-10-21", "type": "Stock Out", "change": -5, "product": "Poco X6 Pro", "totalQty": 15, "productId": "PRD-4158", "movementId": 35, "previousType": "Stock In", "previousChange": 20, "previousProductId": "PRD-4158"}', '2026-10-21 03:07:40', '2026-10-21 03:07:40'),
	(40, 3, 'login', 'Signed in', 'login', NULL, '2026-10-22 00:50:09', '2026-10-22 00:50:09'),
	(41, 3, 'stock.edit', 'Updated Poco X6 Pro movement: −5 → +1', 'boxes', '{"qty": 1, "date": "2026-10-21", "type": "Stock In", "change": 1, "product": "Poco X6 Pro", "totalQty": 16, "productId": "PRD-4158", "movementId": 35, "previousType": "Stock Out", "previousChange": -5, "previousProductId": "PRD-4158"}', '2026-10-22 00:50:26', '2026-10-22 00:50:26'),
	(42, 3, 'formula.compute', 'Computed EOQ — 24 units for Poco X6 Pro', 'calculator', '{"by": "Super Admin User", "unit": "units", "inputs": {"holdingCost": 10000, "annualDemand": 234, "annualOrders": 9.874208829065749, "orderingCost": 12000}, "result": 23.6981011897578, "formula": "EOQ", "product": "Poco X6 Pro", "forecast": {"periodType": "month", "baseForecast": 19.5, "adjustmentPct": 0, "annualPeriods": 12, "seasonalEvent": null, "forecastPeriod": "2026-11-01", "seasonalEnabled": false, "adjustedForecast": 19.5}, "productId": "PRD-4158", "demandSource": "forecast", "recommendedOrderQuantity": 24}', '2026-10-22 01:24:35', '2026-10-22 01:24:35'),
	(43, 3, 'formula.compute', 'Computed EOQ — 21 units for Poco X6 Pro', 'calculator', '{"by": "Super Admin User", "unit": "units", "inputs": {"holdingCost": 20000, "annualDemand": 234, "annualOrders": 11.40175425099138, "orderingCost": 18000}, "result": 20.523157651784484, "formula": "EOQ", "product": "Poco X6 Pro", "forecast": {"periodType": "month", "baseForecast": 19.5, "adjustmentPct": 0, "annualPeriods": 12, "seasonalEvent": null, "forecastPeriod": "2026-11-01", "seasonalEnabled": false, "adjustedForecast": 19.5}, "productId": "PRD-4158", "demandSource": "forecast", "recommendedOrderQuantity": 21}', '2026-10-22 01:42:45', '2026-10-22 01:42:45'),
	(44, 3, 'formula.compute', 'Computed EOQ — 22 units for Poco X6 Pro', 'calculator', '{"by": "Super Admin User", "unit": "units", "inputs": {"holdingCost": 20000, "annualDemand": 234, "annualOrders": 10.816653826391969, "orderingCost": 20000}, "result": 21.633307652783937, "formula": "EOQ", "product": "Poco X6 Pro", "forecast": {"periodType": "month", "baseForecast": 19.5, "adjustmentPct": 0, "annualPeriods": 12, "seasonalEvent": null, "forecastPeriod": "2026-11-01", "seasonalEnabled": false, "adjustedForecast": 19.5}, "productId": "PRD-4158", "demandSource": "forecast", "recommendedOrderQuantity": 22}', '2026-10-22 01:43:04', '2026-10-22 01:43:04'),
	(45, 3, 'login', 'Signed in', 'login', NULL, '2026-10-22 03:59:54', '2026-10-22 03:59:54'),
	(46, 3, 'formula.compute', 'Computed EOQ — 32 units for Poco X6 Pro', 'calculator', '{"by": "Super Admin User", "unit": "units", "inputs": {"holdingCost": 2800, "annualDemand": 2868, "annualOrders": 89.61249912819082, "orderingCost": 500}, "result": 32.00446397435386, "formula": "EOQ", "product": "Poco X6 Pro", "forecast": {"periodType": "month", "baseForecast": 239, "adjustmentPct": 0, "annualPeriods": 12, "seasonalEvent": null, "forecastPeriod": "2026-11-01", "seasonalEnabled": false, "adjustedForecast": 239}, "productId": "PRD-4158", "demandSource": "forecast", "recommendedOrderQuantity": 32}', '2026-10-22 04:04:49', '2026-10-22 04:04:49'),
	(47, 3, 'stock.edit', 'Updated Poco X6 Pro movement: +1 → −6', 'boxes', '{"qty": 6, "date": "2026-10-21", "type": "Stock Out", "change": -6, "product": "Poco X6 Pro", "totalQty": 10, "productId": "PRD-4158", "movementId": 35, "previousType": "Stock In", "previousChange": 1, "previousProductId": "PRD-4158"}', '2026-10-22 04:25:07', '2026-10-22 04:25:07'),
	(48, 3, 'stock.edit', 'Updated Poco X6 Pro movement: −6 → +5', 'boxes', '{"qty": 5, "date": "2026-10-21", "type": "Stock In", "change": 5, "product": "Poco X6 Pro", "totalQty": 15, "productId": "PRD-4158", "movementId": 35, "previousType": "Stock Out", "previousChange": -6, "previousProductId": "PRD-4158"}', '2026-10-22 04:29:53', '2026-10-22 04:29:53'),
	(49, 3, 'stock.edit', 'Updated Poco X6 Pro movement: +5 → −5', 'boxes', '{"qty": 5, "date": "2026-10-21", "type": "Stock Out", "change": -5, "product": "Poco X6 Pro", "totalQty": 10, "productId": "PRD-4158", "movementId": 35, "previousType": "Stock In", "previousChange": 5, "previousProductId": "PRD-4158"}', '2026-10-22 04:33:03', '2026-10-22 04:33:03'),
	(50, 3, 'stock.edit', 'Updated Poco X6 Pro movement: −5 → −5', 'boxes', '{"qty": 5, "date": "2026-10-21", "type": "Stock Out", "change": -5, "product": "Poco X6 Pro", "totalQty": 5, "productId": "PRD-4158", "movementId": 35, "previousType": "Stock Out", "previousChange": -5, "previousProductId": "PRD-4158"}', '2026-10-22 04:33:43', '2026-10-22 04:33:43'),
	(51, 3, 'stock.edit', 'Updated Poco X6 Pro movement: −5 → −1', 'boxes', '{"qty": 1, "date": "2026-10-21", "type": "Stock Out", "change": -1, "product": "Poco X6 Pro", "totalQty": 4, "productId": "PRD-4158", "movementId": 35, "previousType": "Stock Out", "previousChange": -5, "previousProductId": "PRD-4158"}', '2026-10-22 04:34:18', '2026-10-22 04:34:18'),
	(52, 3, 'stock.edit', 'Updated Poco X6 Pro movement: −1 → +6', 'boxes', '{"qty": 6, "date": "2026-10-21", "type": "Stock In", "change": 6, "product": "Poco X6 Pro", "totalQty": 10, "productId": "PRD-4158", "movementId": 35, "previousType": "Stock Out", "previousChange": -1, "previousProductId": "PRD-4158"}', '2026-10-22 04:35:06', '2026-10-22 04:35:06'),
	(53, 3, 'stock.edit', 'Updated Poco X6 Pro movement: +6 → −1', 'boxes', '{"qty": 1, "date": "2026-10-21", "type": "Stock Out", "change": -1, "product": "Poco X6 Pro", "totalQty": 9, "productId": "PRD-4158", "movementId": 35, "previousType": "Stock In", "previousChange": 6, "previousProductId": "PRD-4158"}', '2026-10-22 04:35:20', '2026-10-22 04:35:20'),
	(54, 3, 'stock.edit', 'Updated Poco X6 Pro movement: −1 → −1', 'boxes', '{"qty": 1, "date": "2026-10-21", "type": "Stock Out", "change": -1, "product": "Poco X6 Pro", "totalQty": 8, "productId": "PRD-4158", "movementId": 35, "previousType": "Stock Out", "previousChange": -1, "previousProductId": "PRD-4158"}', '2026-10-22 04:35:28', '2026-10-22 04:35:28'),
	(55, 3, 'stock.edit', 'Updated Poco X6 Pro movement: −1 → −1', 'boxes', '{"qty": 1, "date": "2026-10-21", "type": "Stock Out", "change": -1, "product": "Poco X6 Pro", "totalQty": 7, "productId": "PRD-4158", "movementId": 35, "previousType": "Stock Out", "previousChange": -1, "previousProductId": "PRD-4158"}', '2026-10-22 04:35:39', '2026-10-22 04:35:39'),
	(56, 3, 'product.create', 'Added product — Iphone 11', 'boxes', '{"product": "Iphone 11"}', '2026-10-22 04:37:59', '2026-10-22 04:37:59'),
	(57, 3, 'stock.in', 'Stock In +20 for Iphone 11', 'boxes', '{"qty": 20, "date": "2026-10-22", "type": "Stock In", "change": 20, "product": "Iphone 11", "totalQty": 20, "productId": "PRD-9284", "movementId": 36, "previousType": null, "previousChange": null, "previousProductId": null}', '2026-10-22 04:38:28', '2026-10-22 04:38:28'),
	(58, 3, 'stock.edit', 'Updated Iphone 11 movement: +20 → −1', 'boxes', '{"qty": 1, "date": "2026-10-22", "type": "Stock Out", "change": -1, "product": "Iphone 11", "totalQty": 19, "productId": "PRD-9284", "movementId": 36, "previousType": "Stock In", "previousChange": 20, "previousProductId": "PRD-9284"}', '2026-10-22 04:40:47', '2026-10-22 04:40:47'),
	(59, 5, 'login', 'Signed in', 'login', NULL, '2026-10-22 04:51:06', '2026-10-22 04:51:06'),
	(60, 5, 'stock.edit', 'Updated Iphone 11 movement: −1 → −1', 'boxes', '{"qty": 1, "date": "2026-10-22", "type": "Stock Out", "change": -1, "product": "Iphone 11", "totalQty": 18, "productId": "PRD-9284", "movementId": 36, "previousType": "Stock Out", "previousChange": -1, "previousProductId": "PRD-9284"}', '2026-10-22 04:51:24', '2026-10-22 04:51:24'),
	(61, 5, 'stock.edit', 'Updated Iphone 11 movement: −1 → −1', 'boxes', '{"qty": 1, "date": "2026-10-22", "type": "Stock Out", "change": -1, "product": "Iphone 11", "totalQty": 17, "productId": "PRD-9284", "movementId": 36, "previousType": "Stock Out", "previousChange": -1, "previousProductId": "PRD-9284"}', '2026-10-22 04:55:47', '2026-10-22 04:55:47'),
	(62, 4, 'login', 'Signed in', 'login', NULL, '2026-10-22 04:56:35', '2026-10-22 04:56:35'),
	(63, 4, 'stock.edit', 'Updated Iphone 11 movement: −1 → +1', 'boxes', '{"qty": 1, "date": "2026-10-22", "type": "Stock In", "change": 1, "product": "Iphone 11", "totalQty": 18, "productId": "PRD-9284", "movementId": 36, "previousType": "Stock Out", "previousChange": -1, "previousProductId": "PRD-9284"}', '2026-10-22 04:57:00', '2026-10-22 04:57:00'),
	(64, 3, 'login', 'Signed in', 'login', NULL, '2026-10-22 04:57:51', '2026-10-22 04:57:51'),
	(65, 3, 'login', 'Signed in', 'login', NULL, '2026-10-23 00:56:28', '2026-10-23 00:56:28'),
	(66, 3, 'stock.edit', 'Updated Iphone 11 movement: +1 → −8', 'boxes', '{"qty": 8, "date": "2026-10-22", "type": "Stock Out", "change": -8, "product": "Iphone 11", "totalQty": 10, "productId": "PRD-9284", "movementId": 36, "previousType": "Stock In", "previousChange": 1, "previousProductId": "PRD-9284"}', '2026-10-23 01:53:11', '2026-10-23 01:53:11'),
	(67, 3, 'stock.edit', 'Updated details of Iphone 11 movement', 'boxes', '{"date": "2026-10-22", "type": "Stock Out", "product": "Iphone 11", "productId": "PRD-9284", "movementId": 36}', '2026-10-23 02:06:15', '2026-10-23 02:06:15'),
	(68, 3, 'seasonal.create', 'Added seasonal event — Christmas Sales', 'calendar', '{"event": "Christmas Sales"}', '2026-10-23 02:30:11', '2026-10-23 02:30:11'),
	(69, 3, 'stock.edit', 'Updated Iphone 11 movement: −8 → +10', 'boxes', '{"qty": 10, "date": "2026-10-22", "type": "Stock In", "change": 10, "product": "Iphone 11", "totalQty": 20, "productId": "PRD-9284", "movementId": 36, "previousType": "Stock Out", "previousChange": -8, "previousProductId": "PRD-9284"}', '2026-10-23 02:32:43', '2026-10-23 02:32:43'),
	(70, 3, 'stock.edit', 'Updated Iphone 11 movement: +10 → +11', 'boxes', '{"qty": 11, "date": "2026-10-22", "type": "Stock In", "change": 11, "product": "Iphone 11", "totalQty": 31, "productId": "PRD-9284", "movementId": 36, "previousType": "Stock In", "previousChange": 10, "previousProductId": "PRD-9284"}', '2026-10-23 02:32:57', '2026-10-23 02:32:57'),
	(71, 3, 'stock.edit', 'Updated Iphone 11 movement: +11 → −28', 'boxes', '{"qty": 28, "date": "2026-10-22", "type": "Stock Out", "change": -28, "product": "Iphone 11", "totalQty": 3, "productId": "PRD-9284", "movementId": 36, "previousType": "Stock In", "previousChange": 11, "previousProductId": "PRD-9284"}', '2026-10-23 02:33:19', '2026-10-23 02:33:19'),
	(72, 3, 'seasonal.update', 'Updated seasonal event — Christmas Sales', 'calendar', '{"event": "Christmas Sales"}', '2026-10-23 02:47:17', '2026-10-23 02:47:17'),
	(73, 3, 'seasonal.update', 'Updated seasonal event — Christmas Sales', 'calendar', '{"event": "Christmas Sales"}', '2026-10-23 02:47:21', '2026-10-23 02:47:21'),
	(74, 3, 'stock.edit', 'Updated details of Poco X6 Pro movement', 'boxes', '{"date": "2026-10-21", "type": "Stock Out", "product": "Poco X6 Pro", "productId": "PRD-4158", "movementId": 35}', '2026-10-23 02:48:20', '2026-10-23 02:48:20'),
	(75, 3, 'stock.edit', 'Updated Poco X6 Pro movement: −1 → −7', 'boxes', '{"qty": 7, "date": "2026-10-21", "type": "Stock Out", "change": -7, "product": "Poco X6 Pro", "totalQty": 0, "productId": "PRD-4158", "movementId": 35, "previousType": "Stock Out", "previousChange": -1, "previousProductId": "PRD-4158"}', '2026-10-23 02:52:24', '2026-10-23 02:52:24'),
	(76, 3, 'stock.edit', 'Updated details of Iphone 11 movement', 'boxes', '{"date": "2026-10-22", "type": "Stock Out", "product": "Iphone 11", "productId": "PRD-9284", "movementId": 36}', '2026-10-23 02:56:48', '2026-10-23 02:56:48'),
	(77, 3, 'stock.edit', 'Updated details of Iphone 11 movement', 'boxes', '{"date": "2026-10-22", "type": "Stock Out", "product": "Iphone 11", "productId": "PRD-9284", "movementId": 36}', '2026-10-23 02:57:15', '2026-10-23 02:57:15'),
	(78, 3, 'stock.clear', 'Cleared stock for Iphone 11 (3 units)', 'boxes', '{"product": "Iphone 11", "totalQty": 0, "productId": "PRD-9284", "deletedMovements": 1, "previousTotalQty": 3}', '2026-10-23 02:57:35', '2026-10-23 02:57:35'),
	(79, 3, 'stock.in', 'Stock In +10 for Iphone 11', 'boxes', '{"qty": 10, "date": "2026-07-15", "type": "Stock In", "change": 10, "product": "Iphone 11", "totalQty": 10, "productId": "PRD-9284", "movementId": 37, "previousType": null, "previousChange": null, "previousProductId": null}', '2026-10-23 02:58:10', '2026-10-23 02:58:10'),
	(80, 3, 'stock.edit', 'Updated Iphone 11 movement: +10 → −10', 'boxes', '{"qty": 10, "date": "2026-07-15", "type": "Stock Out", "change": -10, "product": "Iphone 11", "totalQty": 0, "productId": "PRD-9284", "movementId": 37, "previousType": "Stock In", "previousChange": 10, "previousProductId": "PRD-9284"}', '2026-10-23 02:58:27', '2026-10-23 02:58:27'),
	(81, 3, 'stock.edit', 'Updated Iphone 11 movement: −10 → +5', 'boxes', '{"qty": 5, "date": "2026-07-16", "type": "Stock In", "change": 5, "product": "Iphone 11", "totalQty": 5, "productId": "PRD-9284", "movementId": 37, "previousType": "Stock Out", "previousChange": -10, "previousProductId": "PRD-9284"}', '2026-10-23 02:59:36', '2026-10-23 02:59:36'),
	(82, 3, 'stock.edit', 'Updated Iphone 11 movement: +5 → −2', 'boxes', '{"qty": 2, "date": "2026-08-16", "type": "Stock Out", "change": -2, "product": "Iphone 11", "totalQty": 3, "productId": "PRD-9284", "movementId": 37, "previousType": "Stock In", "previousChange": 5, "previousProductId": "PRD-9284"}', '2026-10-23 02:59:43', '2026-10-23 02:59:43'),
	(83, 3, 'stock.edit', 'Updated Iphone 11 movement: −2 → −1', 'boxes', '{"qty": 1, "date": "2026-09-16", "type": "Stock Out", "change": -1, "product": "Iphone 11", "totalQty": 2, "productId": "PRD-9284", "movementId": 37, "previousType": "Stock Out", "previousChange": -2, "previousProductId": "PRD-9284"}', '2026-10-23 02:59:54', '2026-10-23 02:59:54'),
	(84, 3, 'stock.clear', 'Cleared stock for Poco X6 Pro (0 units)', 'boxes', '{"product": "Poco X6 Pro", "totalQty": 0, "productId": "PRD-4158", "deletedMovements": 1, "previousTotalQty": 0}', '2026-10-23 03:00:42', '2026-10-23 03:00:42'),
	(85, 3, 'stock.edit', 'Updated Iphone 11 movement: −1 → +50', 'boxes', '{"qty": 50, "date": "2026-06-16", "type": "Stock In", "change": 50, "product": "Iphone 11", "totalQty": 52, "productId": "PRD-9284", "movementId": 37, "previousType": "Stock Out", "previousChange": -1, "previousProductId": "PRD-9284"}', '2026-10-23 03:01:08', '2026-10-23 03:01:08'),
	(86, 3, 'stock.edit', 'Updated Iphone 11 movement: +50 → −8', 'boxes', '{"qty": 8, "date": "2026-07-16", "type": "Stock Out", "change": -8, "product": "Iphone 11", "totalQty": 44, "productId": "PRD-9284", "movementId": 37, "previousType": "Stock In", "previousChange": 50, "previousProductId": "PRD-9284"}', '2026-10-23 03:01:49', '2026-10-23 03:01:49'),
	(87, 3, 'stock.edit', 'Updated Iphone 11 movement: −8 → −14', 'boxes', '{"qty": 14, "date": "2026-08-16", "type": "Stock Out", "change": -14, "product": "Iphone 11", "totalQty": 30, "productId": "PRD-9284", "movementId": 37, "previousType": "Stock Out", "previousChange": -8, "previousProductId": "PRD-9284"}', '2026-10-23 03:02:13', '2026-10-23 03:02:13'),
	(88, 3, 'stock.clear', 'Cleared stock for Iphone 11 (30 units)', 'boxes', '{"product": "Iphone 11", "totalQty": 0, "productId": "PRD-9284", "deletedMovements": 1, "previousTotalQty": 30}', '2026-10-23 03:05:24', '2026-10-23 03:05:24'),
	(89, 3, 'stock.in', 'Stock In +50 for Iphone 11', 'boxes', '{"qty": 50, "date": "2026-10-23", "type": "Stock In", "change": 50, "product": "Iphone 11", "totalQty": 50, "productId": "PRD-9284", "movementId": 38, "previousType": null, "previousChange": null, "previousProductId": null}', '2026-10-23 03:05:52', '2026-10-23 03:05:52'),
	(90, 3, 'stock.out', 'Stock Out −5 for Iphone 11', 'boxes', '{"qty": 5, "date": "2026-07-15", "type": "Stock Out", "change": -5, "product": "Iphone 11", "totalQty": 45, "productId": "PRD-9284", "movementId": 39, "previousType": null, "previousChange": null, "previousProductId": null}', '2026-10-23 03:06:50', '2026-10-23 03:06:50'),
	(91, 3, 'stock.out', 'Stock Out −5 for Iphone 11', 'boxes', '{"qty": 5, "date": "2026-08-15", "type": "Stock Out", "change": -5, "product": "Iphone 11", "totalQty": 40, "productId": "PRD-9284", "movementId": 40, "previousType": null, "previousChange": null, "previousProductId": null}', '2026-10-23 03:07:43', '2026-10-23 03:07:43'),
	(92, 3, 'stock.clear', 'Cleared stock for Iphone 11 (40 units)', 'boxes', '{"product": "Iphone 11", "totalQty": 0, "productId": "PRD-9284", "deletedMovements": 3, "previousTotalQty": 40}', '2026-10-23 03:14:43', '2026-10-23 03:14:43'),
	(93, 3, 'stock.clear', 'Cleared stock for Iphone 11 (0 units)', 'boxes', '{"product": "Iphone 11", "totalQty": 0, "productId": "PRD-9284", "deletedMovements": 0, "previousTotalQty": 0}', '2026-10-23 03:14:46', '2026-10-23 03:14:46'),
	(94, 3, 'pastsales.save', 'Updated past monthly sales — Poco X6 Pro', 'boxes', '{"product": "Poco X6 Pro"}', '2026-10-23 03:23:06', '2026-10-23 03:23:06'),
	(95, 3, 'pastsales.save', 'Updated past monthly sales — Poco X6 Pro', 'boxes', '{"product": "Poco X6 Pro"}', '2026-10-23 03:24:47', '2026-10-23 03:24:47'),
	(96, 3, 'formula.compute', 'Computed EOQ — 12 units for Poco X6 Pro', 'calculator', '{"by": "Super Admin User", "unit": "units", "inputs": {"holdingCost": 2600, "annualDemand": 402, "annualOrders": 32.3295530436163, "orderingCost": 500}, "result": 12.43444347831396, "formula": "EOQ", "product": "Poco X6 Pro", "forecast": {"periodType": "month", "baseForecast": 33.5, "adjustmentPct": 0, "annualPeriods": 12, "seasonalEvent": null, "forecastPeriod": "2026-10-01", "seasonalEnabled": false, "adjustedForecast": 33.5}, "productId": "PRD-4158", "demandSource": "forecast", "recommendedOrderQuantity": 12}', '2026-10-23 03:33:20', '2026-10-23 03:33:20'),
	(97, 3, 'seasonal.update', 'Updated seasonal event — Christmas Sales', 'calendar', '{"event": "Christmas Sales"}', '2026-10-23 03:35:19', '2026-10-23 03:35:19'),
	(98, 3, 'formula.compute', 'Computed EOQ — 11 units for Poco X6 Pro', 'calculator', '{"by": "Super Admin User", "unit": "units", "inputs": {"holdingCost": 2600, "annualDemand": 402, "annualOrders": 35.06632371412107, "orderingCost": 425}, "result": 11.463990445001118, "formula": "EOQ", "product": "Poco X6 Pro", "forecast": {"periodType": "month", "baseForecast": 33.5, "adjustmentPct": 0, "annualPeriods": 12, "seasonalEvent": null, "forecastPeriod": "2026-10-01", "seasonalEnabled": false, "adjustedForecast": 33.5}, "productId": "PRD-4158", "demandSource": "forecast", "recommendedOrderQuantity": 11}', '2026-10-23 03:40:09', '2026-10-23 03:40:09'),
	(99, 3, 'formula.compute', 'Computed EOQ — 4 units for Poco X6 Pro', 'calculator', '{"by": "Super Admin User", "unit": "units", "inputs": {"holdingCost": 20000, "annualDemand": 402, "annualOrders": 89.66604708583958, "orderingCost": 500}, "result": 4.483302354291979, "formula": "EOQ", "product": "Poco X6 Pro", "forecast": {"periodType": "month", "baseForecast": 33.5, "adjustmentPct": 0, "annualPeriods": 12, "seasonalEvent": null, "forecastPeriod": "2026-10-01", "seasonalEnabled": false, "adjustedForecast": 33.5}, "productId": "PRD-4158", "demandSource": "forecast", "recommendedOrderQuantity": 4}', '2026-10-23 03:46:03', '2026-10-23 03:46:03'),
	(100, 3, 'formula.compute', 'Computed EOQ — 11 units for Poco X6 Pro', 'calculator', '{"by": "Super Admin User", "unit": "units", "inputs": {"holdingCost": 2600, "annualDemand": 402, "annualOrders": 35.06632371412107, "orderingCost": 425}, "result": 11.463990445001118, "formula": "EOQ", "product": "Poco X6 Pro", "forecast": {"periodType": "month", "baseForecast": 33.5, "adjustmentPct": 0, "annualPeriods": 12, "seasonalEvent": null, "forecastPeriod": "2026-10-01", "seasonalEnabled": false, "adjustedForecast": 33.5}, "productId": "PRD-4158", "demandSource": "forecast", "recommendedOrderQuantity": 11}', '2026-10-23 03:54:01', '2026-10-23 03:54:01'),
	(101, 3, 'login', 'Signed in', 'login', NULL, '2026-10-23 18:38:17', '2026-10-23 18:38:17'),
	(102, 3, 'stock.in', 'Stock In +20 for Poco X6 Pro', 'boxes', '{"qty": 20, "date": "2026-10-24", "type": "Stock In", "change": 20, "product": "Poco X6 Pro", "totalQty": 20, "productId": "PRD-4158", "movementId": 41, "previousType": null, "previousChange": null, "previousProductId": null}', '2026-10-23 19:14:18', '2026-10-23 19:14:18'),
	(103, 3, 'stock.edit', 'Updated Poco X6 Pro movement: +20 → +2', 'boxes', '{"qty": 2, "date": "2026-10-24", "type": "Stock In", "change": 2, "product": "Poco X6 Pro", "totalQty": 22, "productId": "PRD-4158", "movementId": 41, "previousType": "Stock In", "previousChange": 20, "previousProductId": "PRD-4158"}', '2026-10-23 19:14:58', '2026-10-23 19:14:58'),
	(104, 3, 'stock.edit', 'Updated Poco X6 Pro movement: +2 → −3', 'boxes', '{"qty": 3, "date": "2026-10-24", "type": "Stock Out", "change": -3, "product": "Poco X6 Pro", "totalQty": 19, "productId": "PRD-4158", "movementId": 41, "previousType": "Stock In", "previousChange": 2, "previousProductId": "PRD-4158"}', '2026-10-23 19:15:05', '2026-10-23 19:15:05'),
	(105, 3, 'formula.compute', 'Computed EOQ — 6 units for Poco X6 Pro', 'calculator', '{"by": "Super Admin User", "unit": "units", "inputs": {"holdingCost": 10000, "annualDemand": 402, "annualOrders": 63.403469936589424, "orderingCost": 500}, "result": 6.340346993658944, "formula": "EOQ", "product": "Poco X6 Pro", "forecast": {"periodType": "month", "baseForecast": 33.5, "adjustmentPct": 0, "annualPeriods": 12, "seasonalEvent": null, "forecastPeriod": "2026-10-01", "seasonalEnabled": false, "adjustedForecast": 33.5}, "productId": "PRD-4158", "demandSource": "forecast", "recommendedOrderQuantity": 6}', '2026-10-23 19:15:37', '2026-10-23 19:15:37'),
	(106, 3, 'stock.edit', 'Updated Poco X6 Pro movement: −3 → −1', 'boxes', '{"qty": 1, "date": "2026-10-24", "type": "Stock Out", "change": -1, "product": "Poco X6 Pro", "totalQty": 18, "productId": "PRD-4158", "movementId": 41, "previousType": "Stock Out", "previousChange": -3, "previousProductId": "PRD-4158"}', '2026-10-23 19:19:07', '2026-10-23 19:19:07'),
	(107, 3, 'stock.edit', 'Updated Poco X6 Pro movement: −1 → −2', 'boxes', '{"qty": 2, "date": "2026-10-24", "type": "Stock Out", "change": -2, "product": "Poco X6 Pro", "totalQty": 16, "productId": "PRD-4158", "movementId": 41, "previousType": "Stock Out", "previousChange": -1, "previousProductId": "PRD-4158"}', '2026-10-23 19:27:46', '2026-10-23 19:27:46'),
	(108, 3, 'settings.currency', 'Changed system currency from PHP to USD', 'settings', '{"to": "USD", "from": "PHP"}', '2026-10-23 19:36:21', '2026-10-23 19:36:21'),
	(109, 3, 'formula.compute', 'Computed EOQ — 11 units for Poco X6 Pro', 'calculator', '{"by": "Super Admin User", "unit": "units", "inputs": {"holdingCost": 2222, "annualDemand": 402, "annualOrders": 37.30074790661072, "orderingCost": 321}, "result": 10.777263796599494, "formula": "EOQ", "product": "Poco X6 Pro", "forecast": null, "productId": "PRD-4158", "demandSource": "historical", "recommendedOrderQuantity": 11}', '2026-10-23 19:37:01', '2026-10-23 19:37:01'),
	(110, 3, 'stock.edit', 'Updated Poco X6 Pro movement: −2 → −9', 'boxes', '{"qty": 9, "date": "2026-10-24", "type": "Stock Out", "change": -9, "product": "Poco X6 Pro", "totalQty": 7, "productId": "PRD-4158", "movementId": 41, "previousType": "Stock Out", "previousChange": -2, "previousProductId": "PRD-4158"}', '2026-10-23 19:44:47', '2026-10-23 19:44:47'),
	(111, 3, 'stock.edit', 'Updated Poco X6 Pro movement: −9 → −4', 'boxes', '{"qty": 4, "date": "2026-10-24", "type": "Stock Out", "change": -4, "product": "Poco X6 Pro", "totalQty": 3, "productId": "PRD-4158", "movementId": 41, "previousType": "Stock Out", "previousChange": -9, "previousProductId": "PRD-4158"}', '2026-10-23 19:44:54', '2026-10-23 19:44:54'),
	(112, 3, 'stock.edit', 'Updated Poco X6 Pro movement: −4 → +3', 'boxes', '{"qty": 3, "date": "2026-10-24", "type": "Stock In", "change": 3, "product": "Poco X6 Pro", "totalQty": 6, "productId": "PRD-4158", "movementId": 41, "previousType": "Stock Out", "previousChange": -4, "previousProductId": "PRD-4158"}', '2026-10-23 19:56:49', '2026-10-23 19:56:49'),
	(113, 3, 'stock.edit', 'Updated Poco X6 Pro movement: +3 → −1', 'boxes', '{"qty": 1, "date": "2026-10-24", "type": "Stock Out", "change": -1, "product": "Poco X6 Pro", "totalQty": 5, "productId": "PRD-4158", "movementId": 41, "previousType": "Stock In", "previousChange": 3, "previousProductId": "PRD-4158"}', '2026-10-23 19:56:55', '2026-10-23 19:56:55'),
	(114, 3, 'stock.safety', 'Poco X6 Pro fell below safety stock (5 left, minimum 5)', 'alert', '{"product": "Poco X6 Pro", "totalQty": 5, "productId": "PRD-4158", "movementId": 41, "outOfStock": false, "safetyStock": 5, "stockBefore": 6, "reorderPoint": 5}', '2026-10-23 19:56:55', '2026-10-23 19:56:55'),
	(115, 3, 'stock.edit', 'Updated Poco X6 Pro movement: −1 → −1', 'boxes', '{"qty": 1, "date": "2026-10-24", "type": "Stock Out", "change": -1, "product": "Poco X6 Pro", "totalQty": 4, "productId": "PRD-4158", "movementId": 41, "previousType": "Stock Out", "previousChange": -1, "previousProductId": "PRD-4158"}', '2026-10-23 19:57:01', '2026-10-23 19:57:01'),
	(116, 3, 'stock.edit', 'Updated Poco X6 Pro movement: −1 → −1', 'boxes', '{"qty": 1, "date": "2026-10-24", "type": "Stock Out", "change": -1, "product": "Poco X6 Pro", "totalQty": 3, "productId": "PRD-4158", "movementId": 41, "previousType": "Stock Out", "previousChange": -1, "previousProductId": "PRD-4158"}', '2026-10-23 20:07:10', '2026-10-23 20:07:10'),
	(117, 3, 'formula.compute', 'Computed EOQ — 2 units for Poco X6 Pro', 'calculator', '{"by": "Super Admin User", "unit": "units", "inputs": {"holdingCost": 222, "annualDemand": 1, "annualOrders": 0.5880428492239018, "orderingCost": 321}, "result": 1.7005563477556078, "formula": "EOQ", "product": "Poco X6 Pro", "forecast": null, "productId": "PRD-4158", "demandSource": "historical", "recommendedOrderQuantity": 2}', '2026-10-23 20:40:07', '2026-10-23 20:40:07'),
	(118, 3, 'stock.edit', 'Updated Poco X6 Pro movement: −1 → +10', 'boxes', '{"qty": 10, "date": "2026-10-24", "type": "Stock In", "change": 10, "product": "Poco X6 Pro", "totalQty": 13, "productId": "PRD-4158", "movementId": 41, "previousType": "Stock Out", "previousChange": -1, "previousProductId": "PRD-4158"}', '2026-10-23 20:59:45', '2026-10-23 20:59:45'),
	(119, 3, 'stock.edit', 'Updated Poco X6 Pro movement: +10 → −3', 'boxes', '{"qty": 3, "date": "2026-10-24", "type": "Stock Out", "change": -3, "product": "Poco X6 Pro", "totalQty": 10, "productId": "PRD-4158", "movementId": 41, "previousType": "Stock In", "previousChange": 10, "previousProductId": "PRD-4158"}', '2026-10-23 20:59:51', '2026-10-23 20:59:51'),
	(120, 3, 'stock.edit', 'Updated Poco X6 Pro movement: −3 → −6', 'boxes', '{"qty": 6, "date": "2026-10-24", "type": "Stock Out", "change": -6, "product": "Poco X6 Pro", "totalQty": 4, "productId": "PRD-4158", "movementId": 41, "previousType": "Stock Out", "previousChange": -3, "previousProductId": "PRD-4158"}', '2026-10-23 21:00:51', '2026-10-23 21:00:51'),
	(121, 3, 'stock.safety', 'Poco X6 Pro fell below safety stock (4 left, minimum 5)', 'alert', '{"product": "Poco X6 Pro", "totalQty": 4, "productId": "PRD-4158", "movementId": 41, "outOfStock": false, "safetyStock": 5, "stockBefore": 10, "reorderPoint": 5}', '2026-10-23 21:00:52', '2026-10-23 21:00:52'),
	(122, 3, 'formula.compute', 'Computed EOQ — 16 units for Poco X6 Pro', 'calculator', '{"by": "Super Admin User", "unit": "units", "inputs": {"holdingCost": 1000, "annualDemand": 402, "annualOrders": 25.023353578189024, "orderingCost": 321}, "result": 16.064992997197354, "formula": "EOQ", "product": "Poco X6 Pro", "forecast": {"periodType": "month", "baseForecast": 33.5, "adjustmentPct": 0, "annualPeriods": 12, "seasonalEvent": null, "forecastPeriod": "2026-10-01", "seasonalEnabled": false, "adjustedForecast": 33.5}, "productId": "PRD-4158", "demandSource": "forecast", "recommendedOrderQuantity": 16}', '2026-10-23 21:01:57', '2026-10-23 21:01:57'),
	(123, 3, 'product.create', 'Added product — Honor X3', 'boxes', '{"product": "Honor X3"}', '2026-10-23 21:05:34', '2026-10-23 21:05:34'),
	(124, 3, 'product.create', 'Added product — Aula Keyboard', 'boxes', '{"product": "Aula Keyboard"}', '2026-10-23 21:07:28', '2026-10-23 21:07:28'),
	(125, 3, 'stock.in', 'Stock In +50 for Aula Keyboard', 'boxes', '{"qty": 50, "date": "2026-10-24", "type": "Stock In", "change": 50, "product": "Aula Keyboard", "totalQty": 50, "productId": "PRD-5704", "movementId": 42, "previousType": null, "previousChange": null, "previousProductId": null}', '2026-10-23 21:08:02', '2026-10-23 21:08:02'),
	(126, 3, 'stock.in', 'Stock In +30 for Honor X3', 'boxes', '{"qty": 30, "date": "2026-10-24", "type": "Stock In", "change": 30, "product": "Honor X3", "totalQty": 30, "productId": "PRD-7113", "movementId": 43, "previousType": null, "previousChange": null, "previousProductId": null}', '2026-10-23 21:08:33', '2026-10-23 21:08:33'),
	(127, 3, 'stock.in', 'Stock In +25 for Iphone 11', 'boxes', '{"qty": 25, "date": "2026-10-24", "type": "Stock In", "change": 25, "product": "Iphone 11", "totalQty": 25, "productId": "PRD-9284", "movementId": 44, "previousType": null, "previousChange": null, "previousProductId": null}', '2026-10-23 21:09:02', '2026-10-23 21:09:02'),
	(128, 3, 'stock.edit', 'Updated Iphone 11 movement: +25 → −19', 'boxes', '{"qty": 19, "date": "2026-10-24", "type": "Stock Out", "change": -19, "product": "Iphone 11", "totalQty": 6, "productId": "PRD-9284", "movementId": 44, "previousType": "Stock In", "previousChange": 25, "previousProductId": "PRD-9284"}', '2026-10-23 21:10:14', '2026-10-23 21:10:14'),
	(129, 3, 'stock.edit', 'Updated Honor X3 movement: +30 → −28', 'boxes', '{"qty": 28, "date": "2026-10-24", "type": "Stock Out", "change": -28, "product": "Honor X3", "totalQty": 2, "productId": "PRD-7113", "movementId": 43, "previousType": "Stock In", "previousChange": 30, "previousProductId": "PRD-7113"}', '2026-10-23 21:10:24', '2026-10-23 21:10:24'),
	(130, 3, 'stock.safety', 'Honor X3 fell below safety stock (2 left, minimum 5)', 'alert', '{"product": "Honor X3", "totalQty": 2, "productId": "PRD-7113", "movementId": 43, "outOfStock": false, "safetyStock": 5, "stockBefore": 30, "reorderPoint": 5}', '2026-10-23 21:10:24', '2026-10-23 21:10:24'),
	(131, 3, 'stock.edit', 'Updated Aula Keyboard movement: +50 → −47', 'boxes', '{"qty": 47, "date": "2026-10-24", "type": "Stock Out", "change": -47, "product": "Aula Keyboard", "totalQty": 3, "productId": "PRD-5704", "movementId": 42, "previousType": "Stock In", "previousChange": 50, "previousProductId": "PRD-5704"}', '2026-10-23 21:10:38', '2026-10-23 21:10:38'),
	(132, 3, 'stock.safety', 'Aula Keyboard fell below safety stock (3 left, minimum 5)', 'alert', '{"product": "Aula Keyboard", "totalQty": 3, "productId": "PRD-5704", "movementId": 42, "outOfStock": false, "safetyStock": 5, "stockBefore": 50, "reorderPoint": 5}', '2026-10-23 21:10:38', '2026-10-23 21:10:38'),
	(133, 3, 'product.create', 'Added product — Kanata RGB Gaming Mouse', 'boxes', '{"product": "Kanata RGB Gaming Mouse"}', '2026-10-23 21:14:58', '2026-10-23 21:14:58'),
	(134, 3, 'product.create', 'Added product — HP Laptop', 'boxes', '{"product": "HP Laptop"}', '2026-10-23 21:16:04', '2026-10-23 21:16:04'),
	(135, 3, 'stock.in', 'Stock In +10 for HP Laptop', 'boxes', '{"qty": 10, "date": "2026-10-24", "type": "Stock In", "change": 10, "product": "HP Laptop", "totalQty": 10, "productId": "PRD-4722", "movementId": 45, "previousType": null, "previousChange": null, "previousProductId": null}', '2026-10-23 21:16:24', '2026-10-23 21:16:24'),
	(136, 3, 'stock.in', 'Stock In +15 for Kanata RGB Gaming Mouse', 'boxes', '{"qty": 15, "date": "2026-10-24", "type": "Stock In", "change": 15, "product": "Kanata RGB Gaming Mouse", "totalQty": 15, "productId": "PRD-7214", "movementId": 46, "previousType": null, "previousChange": null, "previousProductId": null}', '2026-10-23 21:16:49', '2026-10-23 21:16:49'),
	(137, 3, 'stock.edit', 'Updated Aula Keyboard movement: −47 → −3', 'boxes', '{"qty": 3, "date": "2026-10-24", "type": "Stock Out", "change": -3, "product": "Aula Keyboard", "totalQty": 0, "productId": "PRD-5704", "movementId": 42, "previousType": "Stock Out", "previousChange": -47, "previousProductId": "PRD-5704"}', '2026-10-23 21:26:22', '2026-10-23 21:26:22'),
	(138, 3, 'stock.safety', 'Aula Keyboard is now out of stock', 'alert', '{"product": "Aula Keyboard", "totalQty": 0, "productId": "PRD-5704", "movementId": 42, "outOfStock": true, "safetyStock": 5, "stockBefore": 3, "reorderPoint": 5}', '2026-10-23 21:26:23', '2026-10-23 21:26:23'),
	(139, 3, 'stock.edit', 'Updated TitanPlay Wireless Game Controller movement: +11 → −1', 'boxes', '{"qty": 1, "date": "2026-10-24", "type": "Stock Out", "change": -1, "product": "TitanPlay Wireless Game Controller", "totalQty": 10, "productId": "PRD-TECH-0010", "movementId": 56, "previousType": "Stock In", "previousChange": 11, "previousProductId": "PRD-TECH-0010"}', '2026-10-23 21:49:16', '2026-10-23 21:49:16'),
	(140, 3, 'formula.compute', 'Computed EOQ — 16 units for Poco X6 Pro', 'calculator', '{"by": "Super Admin User", "unit": "units", "inputs": {"holdingCost": 1000, "annualDemand": 402, "annualOrders": 25.023353578189024, "orderingCost": 321}, "result": 16.064992997197354, "formula": "EOQ", "product": "Poco X6 Pro", "forecast": {"periodType": "month", "baseForecast": 33.5, "adjustmentPct": 0, "annualPeriods": 12, "seasonalEvent": null, "forecastPeriod": "2026-10-01", "seasonalEnabled": false, "adjustedForecast": 33.5}, "productId": "PRD-4158", "demandSource": "forecast", "recommendedOrderQuantity": 16}', '2026-10-23 21:55:00', '2026-10-23 21:55:00'),
	(141, 3, 'login', 'Signed in', 'login', NULL, '2026-10-24 01:22:46', '2026-10-24 01:22:46'),
	(142, 3, 'stock.clear', 'Cleared stock for TitanPlay Wireless Game Controller (10 units)', 'boxes', '{"product": "TitanPlay Wireless Game Controller", "totalQty": 0, "productId": "PRD-TECH-0010", "deletedMovements": 1, "previousTotalQty": 10}', '2026-10-24 02:14:03', '2026-10-24 02:14:03'),
	(143, 3, 'stock.edit', 'Updated ArcLight USB-C Docking Station movement: +25 → +10', 'boxes', '{"qty": 10, "date": "2026-10-24", "type": "Stock In", "change": 10, "product": "ArcLight USB-C Docking Station", "totalQty": 35, "productId": "PRD-TECH-0009", "movementId": 55, "previousType": "Stock In", "previousChange": 25, "previousProductId": "PRD-TECH-0009"}', '2026-10-24 02:15:00', '2026-10-24 02:15:00'),
	(144, 3, 'stock.edit', 'Updated ArcLight USB-C Docking Station movement: +10 → +10', 'boxes', '{"qty": 10, "date": "2026-10-24", "type": "Stock In", "change": 10, "product": "ArcLight USB-C Docking Station", "totalQty": 45, "productId": "PRD-TECH-0009", "movementId": 55, "previousType": "Stock In", "previousChange": 10, "previousProductId": "PRD-TECH-0009"}', '2026-10-24 02:15:01', '2026-10-24 02:15:01'),
	(145, 3, 'stock.in', 'Stock In +8 for Poco X6 Pro', 'boxes', '{"qty": 8, "date": "2026-10-24", "type": "Stock In", "change": 8, "product": "Poco X6 Pro", "totalQty": 12, "productId": "PRD-4158", "movementId": 57, "previousType": null, "previousChange": null, "previousProductId": null}', '2026-10-24 02:20:22', '2026-10-24 02:20:22'),
	(146, 3, 'stock.in', 'Stock In +9 for Poco X6 Pro', 'boxes', '{"qty": 9, "date": "2026-10-24", "type": "Stock In", "change": 9, "product": "Poco X6 Pro", "totalQty": 21, "productId": "PRD-4158", "movementId": 58, "previousType": null, "previousChange": null, "previousProductId": null}', '2026-10-24 02:20:40', '2026-10-24 02:20:40'),
	(147, 3, 'stock.clear', 'Cleared stock for Poco X6 Pro (21 units)', 'boxes', '{"product": "Poco X6 Pro", "totalQty": 0, "productId": "PRD-4158", "deletedMovements": 3, "previousTotalQty": 21}', '2026-10-24 02:39:54', '2026-10-24 02:39:54'),
	(148, 3, 'stock.in', 'Stock In +20 for Poco X6 Pro', 'boxes', '{"qty": 20, "date": "2026-10-24", "type": "Stock In", "change": 20, "product": "Poco X6 Pro", "totalQty": 20, "productId": "PRD-4158", "movementId": 59, "previousType": null, "previousChange": null, "previousProductId": null}', '2026-10-24 02:40:50', '2026-10-24 02:40:50'),
	(149, 3, 'stock.in', 'Stock In +10 for Poco X6 Pro', 'boxes', '{"qty": 10, "date": "2026-10-24", "type": "Stock In", "change": 10, "product": "Poco X6 Pro", "totalQty": 30, "productId": "PRD-4158", "movementId": 60, "previousType": null, "previousChange": null, "previousProductId": null}', '2026-10-24 02:40:59', '2026-10-24 02:40:59'),
	(150, 3, 'stock.delete', 'Deleted Stock In +20 for Poco X6 Pro', 'boxes', '{"qty": 20, "date": "2026-10-24", "type": "Stock In", "change": 20, "product": "Poco X6 Pro", "totalQty": 10, "productId": "PRD-4158", "movementId": 59}', '2026-10-24 02:53:41', '2026-10-24 02:53:41'),
	(151, 3, 'stock.in', 'Stock In +12 for Poco X6 Pro', 'boxes', '{"qty": 12, "date": "2026-10-24", "type": "Stock In", "change": 12, "product": "Poco X6 Pro", "totalQty": 22, "productId": "PRD-4158", "movementId": 61, "previousType": null, "previousChange": null, "previousProductId": null}', '2026-10-24 02:58:35', '2026-10-24 02:58:35'),
	(152, 3, 'stock.edit', 'Updated details of Poco X6 Pro movement', 'boxes', '{"date": "2026-10-24", "type": "Stock In", "product": "Poco X6 Pro", "productId": "PRD-4158", "movementId": 60}', '2026-10-24 02:59:14', '2026-10-24 02:59:14'),
	(153, 3, 'stock.clear', 'Cleared stock for Poco X6 Pro (22 units)', 'boxes', '{"product": "Poco X6 Pro", "totalQty": 0, "productId": "PRD-4158", "deletedMovements": 2, "previousTotalQty": 22}', '2026-10-24 02:59:28', '2026-10-24 02:59:28'),
	(154, 3, 'stock.in', 'Stock In +12 for Poco X6 Pro', 'boxes', '{"qty": 12, "date": "2026-10-24", "type": "Stock In", "change": 12, "product": "Poco X6 Pro", "totalQty": 12, "productId": "PRD-4158", "movementId": 62, "previousType": null, "previousChange": null, "previousProductId": null}', '2026-10-24 02:59:41', '2026-10-24 02:59:41'),
	(155, 3, 'stock.in', 'Stock In +3 for Poco X6 Pro (added to the same day\'s entry, now +15)', 'boxes', '{"qty": 3, "date": "2026-10-24", "type": "Stock In", "change": 3, "product": "Poco X6 Pro", "totalQty": 15, "productId": "PRD-4158", "movementId": 62, "previousType": null, "previousChange": null, "previousProductId": null}', '2026-10-24 02:59:50', '2026-10-24 02:59:50'),
	(156, 3, 'stock.in', 'Stock In +12 for Poco X6 Pro', 'boxes', '{"qty": 12, "date": "2026-10-24", "type": "Stock In", "change": 12, "product": "Poco X6 Pro", "totalQty": 27, "productId": "PRD-4158", "movementId": 63, "previousType": null, "previousChange": null, "previousProductId": null}', '2026-10-24 03:00:09', '2026-10-24 03:00:09'),
	(157, 3, 'stock.edit', 'Updated Poco X6 Pro movement: +15 → −12', 'boxes', '{"qty": 12, "date": "2026-10-24", "type": "Stock Out", "change": -12, "product": "Poco X6 Pro", "totalQty": 15, "productId": "PRD-4158", "movementId": 62, "previousType": "Stock In", "previousChange": 15, "previousProductId": "PRD-4158"}', '2026-10-24 03:06:20', '2026-10-24 03:06:20'),
	(158, 3, 'stock.clear', 'Cleared stock for Poco X6 Pro (15 units)', 'boxes', '{"product": "Poco X6 Pro", "totalQty": 0, "productId": "PRD-4158", "deletedMovements": 2, "previousTotalQty": 15}', '2026-10-24 03:16:03', '2026-10-24 03:16:03'),
	(159, 3, 'settings.logo', 'Changed the sidebar picture', 'settings', NULL, '2026-10-24 03:26:11', '2026-10-24 03:26:11'),
	(160, 5, 'login', 'Signed in', 'login', NULL, '2026-10-24 03:27:14', '2026-10-24 03:27:14'),
	(161, 3, 'login', 'Signed in', 'login', NULL, '2026-10-24 03:29:18', '2026-10-24 03:29:18'),
	(162, 3, 'formula.compute', 'Computed EOQ — 1 units for Aula Keyboard', 'calculator', '{"by": "Super Admin User", "unit": "units", "inputs": {"holdingCost": 3000, "annualDemand": 3, "annualOrders": 4.743416490252569, "orderingCost": 200}, "result": 0.6324555320336759, "formula": "EOQ", "product": "Aula Keyboard", "forecast": null, "productId": "PRD-5704", "demandSource": "historical", "recommendedOrderQuantity": 1}', '2026-10-24 03:42:36', '2026-10-24 03:42:36'),
	(163, 3, 'formula.compute', 'Computed EOQ — 1 units for Aula Keyboard', 'calculator', '{"by": "Super Admin User", "unit": "units", "inputs": {"holdingCost": 3000, "annualDemand": 3, "annualOrders": 4.743416490252569, "orderingCost": 200}, "result": 0.6324555320336759, "formula": "EOQ", "product": "Aula Keyboard", "forecast": null, "productId": "PRD-5704", "demandSource": "historical", "recommendedOrderQuantity": 1}', '2026-10-24 03:44:19', '2026-10-24 03:44:19'),
	(164, 5, 'login', 'Signed in', 'login', NULL, '2026-10-24 03:47:30', '2026-10-24 03:47:30'),
	(165, 4, 'login', 'Signed in', 'login', NULL, '2026-10-24 03:58:30', '2026-10-24 03:58:30'),
	(166, 4, 'formula.compute', 'Computed EOQ — 7 units', 'calculator', '{"by": "Admin User", "unit": "units", "inputs": {"holdingCost": 22, "annualDemand": 22, "annualOrders": 3.3166247903554, "orderingCost": 22}, "result": 6.6332495807108, "formula": "EOQ", "product": null, "forecast": null, "productId": null, "demandSource": "historical", "recommendedOrderQuantity": 7}', '2026-10-24 03:59:00', '2026-10-24 03:59:00'),
	(167, 3, 'login', 'Signed in', 'login', NULL, '2026-10-24 04:01:35', '2026-10-24 04:01:35'),
	(168, 3, 'login', 'Signed in', 'login', NULL, '2026-10-24 18:32:09', '2026-10-24 18:32:09'),
	(169, 5, 'login', 'Signed in', 'login', NULL, '2026-10-24 18:34:06', '2026-10-24 18:34:06'),
	(170, 4, 'login', 'Signed in', 'login', NULL, '2026-10-24 18:35:34', '2026-10-24 18:35:34'),
	(171, 5, 'login', 'Signed in', 'login', NULL, '2026-10-24 18:38:06', '2026-10-24 18:38:06'),
	(172, 5, 'login', 'Signed in', 'login', NULL, '2026-10-24 18:42:18', '2026-10-24 18:42:18'),
	(173, 3, 'login', 'Signed in', 'login', NULL, '2026-10-24 18:46:04', '2026-10-24 18:46:04'),
	(174, 3, 'formula.compute', 'Computed EOQ — 1 units for Aula Keyboard', 'calculator', '{"by": "Super Admin User", "unit": "units", "inputs": {"holdingCost": 3000, "annualDemand": 3, "annualOrders": 4.743416490252569, "orderingCost": 200}, "result": 0.6324555320336759, "formula": "EOQ", "product": "Aula Keyboard", "forecast": null, "productId": "PRD-5704", "demandSource": "historical", "recommendedOrderQuantity": 1}', '2026-10-24 18:50:50', '2026-10-24 18:50:50'),
	(175, 3, 'settings.role_access', 'Changed Role Access (1 change)', 'settings', '{"changes": ["Staff: Open Products & Suppliers on"]}', '2026-10-24 19:30:00', '2026-10-24 19:30:00'),
	(176, 3, 'settings.role_access', 'Changed Role Access (2 changes)', 'settings', '{"changes": ["Staff: Open Products & Suppliers off", "Staff: Add products on"]}', '2026-10-24 19:30:10', '2026-10-24 19:30:10'),
	(177, 3, 'settings.role_access', 'Changed Role Access (1 change)', 'settings', '{"changes": ["Staff: Edit products on"]}', '2026-10-24 19:30:28', '2026-10-24 19:30:28'),
	(178, 5, 'login', 'Signed in', 'login', NULL, '2026-10-24 19:30:40', '2026-10-24 19:30:40'),
	(179, 3, 'login', 'Signed in', 'login', NULL, '2026-10-24 19:31:04', '2026-10-24 19:31:04'),
	(180, 3, 'settings.role_access', 'Changed Role Access (1 change)', 'settings', '{"changes": ["Staff: Open Products & Suppliers on"]}', '2026-10-24 19:31:13', '2026-10-24 19:31:13'),
	(181, 5, 'login', 'Signed in', 'login', NULL, '2026-10-24 19:31:40', '2026-10-24 19:31:40'),
	(182, 3, 'login', 'Signed in', 'login', NULL, '2026-10-24 19:31:57', '2026-10-24 19:31:57'),
	(183, 3, 'settings.role_access', 'Changed Role Access (3 changes)', 'settings', '{"changes": ["Staff: Open Products & Suppliers off", "Staff: Add products off", "Staff: Edit products off"]}', '2026-10-24 19:32:07', '2026-10-24 19:32:07'),
	(184, 5, 'login', 'Signed in', 'login', NULL, '2026-10-24 19:32:57', '2026-10-24 19:32:57'),
	(185, 3, 'login', 'Signed in', 'login', NULL, '2026-10-24 19:37:10', '2026-10-24 19:37:10'),
	(186, 3, 'login', 'Signed in', 'login', NULL, '2026-10-24 19:46:17', '2026-10-24 19:46:17'),
	(187, 3, 'stock.edit', 'Updated PixelWave 27-Inch Monitor movement: +4 → −4', 'boxes', '{"qty": 4, "date": "2026-10-24", "type": "Stock Out", "change": -4, "product": "PixelWave 27-Inch Monitor", "totalQty": 0, "productId": "PRD-TECH-0004", "movementId": 50, "previousType": "Stock In", "previousChange": 4, "previousProductId": "PRD-TECH-0004"}', '2026-10-24 19:52:38', '2026-10-24 19:52:38'),
	(188, 3, 'stock.safety', 'PixelWave 27-Inch Monitor is now out of stock', 'alert', '{"product": "PixelWave 27-Inch Monitor", "totalQty": 0, "productId": "PRD-TECH-0004", "movementId": 50, "outOfStock": true, "safetyStock": 3, "stockBefore": 4, "reorderPoint": 3}', '2026-10-24 19:52:39', '2026-10-24 19:52:39'),
	(189, 3, 'stock.edit', 'Updated Honor X3 movement: −28 → −2', 'boxes', '{"qty": 2, "date": "2026-10-24", "type": "Stock Out", "change": -2, "product": "Honor X3", "totalQty": 0, "productId": "PRD-7113", "movementId": 43, "previousType": "Stock Out", "previousChange": -28, "previousProductId": "PRD-7113"}', '2026-10-24 19:53:59', '2026-10-24 19:53:59'),
	(190, 3, 'stock.safety', 'Honor X3 is now out of stock', 'alert', '{"product": "Honor X3", "totalQty": 0, "productId": "PRD-7113", "movementId": 43, "outOfStock": true, "safetyStock": 5, "stockBefore": 2, "reorderPoint": 5}', '2026-10-24 19:53:59', '2026-10-24 19:53:59'),
	(191, 4, 'login', 'Signed in', 'login', NULL, '2026-10-24 20:05:02', '2026-10-24 20:05:02'),
	(192, 3, 'login', 'Signed in', 'login', NULL, '2026-10-24 20:05:16', '2026-10-24 20:05:16'),
	(193, 3, 'stock.edit', 'Updated ArcLight USB-C Docking Station movement: +10 → −45', 'boxes', '{"qty": 45, "date": "2026-10-24", "type": "Stock Out", "change": -45, "product": "ArcLight USB-C Docking Station", "totalQty": 0, "productId": "PRD-TECH-0009", "movementId": 55, "previousType": "Stock In", "previousChange": 10, "previousProductId": "PRD-TECH-0009"}', '2026-10-24 20:05:44', '2026-10-24 20:05:44'),
	(194, 3, 'stock.safety', 'ArcLight USB-C Docking Station is now out of stock', 'alert', '{"product": "ArcLight USB-C Docking Station", "totalQty": 0, "productId": "PRD-TECH-0009", "movementId": 55, "outOfStock": true, "safetyStock": 3, "stockBefore": 45, "reorderPoint": 3}', '2026-10-24 20:05:44', '2026-10-24 20:05:44'),
	(195, 5, 'login', 'Signed in', 'login', NULL, '2026-10-24 21:33:13', '2026-10-24 21:33:13'),
	(196, 4, 'login', 'Signed in', 'login', NULL, '2026-10-24 21:36:03', '2026-10-24 21:36:03'),
	(197, 4, 'stock.in', 'Stock In +9 for Iphone 11', 'boxes', '{"qty": 9, "date": "2026-10-25", "type": "Stock In", "change": 9, "product": "Iphone 11", "totalQty": 15, "productId": "PRD-9284", "movementId": 64, "previousType": null, "previousChange": null, "previousProductId": null}', '2026-10-24 21:37:57', '2026-10-24 21:37:57'),
	(198, 4, 'stock.edit', 'Updated details of Iphone 11 movement', 'boxes', '{"date": "2026-10-25", "type": "Stock In", "product": "Iphone 11", "productId": "PRD-9284", "movementId": 64}', '2026-10-24 21:38:14', '2026-10-24 21:38:14'),
	(199, 4, 'stock.clear', 'Cleared stock for Iphone 11 (15 units)', 'boxes', '{"product": "Iphone 11", "totalQty": 0, "productId": "PRD-9284", "deletedMovements": 2, "previousTotalQty": 15}', '2026-10-24 21:38:31', '2026-10-24 21:38:31'),
	(200, 3, 'login', 'Signed in', 'login', NULL, '2026-10-24 21:40:06', '2026-10-24 21:40:06'),
	(201, 3, 'settings.currency', 'Changed system currency from USD to PHP', 'settings', '{"to": "PHP", "from": "USD"}', '2026-10-24 21:44:01', '2026-10-24 21:44:01'),
	(202, 3, 'formula.compute', 'Computed order quantity — 4 units for Poco X6 Pro', 'calculator', '{"by": "Super Admin User", "unit": "units", "inputs": {"holdingCost": 20000, "annualDemand": 402, "annualOrders": 111.90783925168653, "orderingCost": 321}, "result": 3.592241639979137, "formula": "EOQ", "product": "Poco X6 Pro", "forecast": {"periodType": "month", "baseForecast": 33.5, "adjustmentPct": 0, "annualPeriods": 12, "seasonalEvent": null, "forecastPeriod": "2026-10-01", "seasonalEnabled": false, "adjustedForecast": 33.5}, "productId": "PRD-4158", "demandSource": "forecast", "recommendedOrderQuantity": 4}', '2026-10-24 21:44:52', '2026-10-24 21:44:52'),
	(203, 3, 'formula.compute', 'Computed order quantity — 4 units for Poco X6 Pro', 'calculator', '{"by": "Super Admin User", "unit": "units", "inputs": {"holdingCost": 20000, "annualDemand": 402, "annualOrders": 111.90783925168653, "orderingCost": 321}, "result": 3.592241639979137, "formula": "EOQ", "product": "Poco X6 Pro", "forecast": {"periodType": "month", "baseForecast": 33.5, "adjustmentPct": 0, "annualPeriods": 12, "seasonalEvent": null, "forecastPeriod": "2026-10-01", "seasonalEnabled": false, "adjustedForecast": 33.5}, "productId": "PRD-4158", "demandSource": "forecast", "recommendedOrderQuantity": 4}', '2026-10-24 21:46:21', '2026-10-24 21:46:21'),
	(204, 3, 'formula.compute', 'Computed order quantity — 16 units for Poco X6 Pro', 'calculator', '{"by": "Super Admin User", "unit": "units", "inputs": {"holdingCost": 1000, "annualDemand": 402, "annualOrders": 25.023353578189024, "orderingCost": 321}, "result": 16.064992997197354, "formula": "EOQ", "product": "Poco X6 Pro", "forecast": {"periodType": "month", "baseForecast": 33.5, "adjustmentPct": 0, "annualPeriods": 12, "seasonalEvent": null, "forecastPeriod": "2026-10-01", "seasonalEnabled": false, "adjustedForecast": 33.5}, "productId": "PRD-4158", "demandSource": "forecast", "recommendedOrderQuantity": 16}', '2026-10-24 21:47:03', '2026-10-24 21:47:03'),
	(205, 3, 'formula.compute', 'Computed order quantity — 16 units for Poco X6 Pro', 'calculator', '{"by": "Super Admin User", "unit": "units", "inputs": {"holdingCost": 1000, "annualDemand": 402, "annualOrders": 25.023353578189024, "orderingCost": 321}, "result": 16.064992997197354, "formula": "EOQ", "product": "Poco X6 Pro", "forecast": {"periodType": "month", "baseForecast": 33.5, "adjustmentPct": 0, "annualPeriods": 12, "seasonalEvent": null, "forecastPeriod": "2026-10-01", "seasonalEnabled": false, "adjustedForecast": 33.5}, "productId": "PRD-4158", "demandSource": "forecast", "recommendedOrderQuantity": 16}', '2026-10-24 21:47:34', '2026-10-24 21:47:34'),
	(206, 5, 'login', 'Signed in', 'login', NULL, '2026-10-24 23:59:50', '2026-10-24 23:59:50'),
	(207, 3, 'login', 'Signed in', 'login', NULL, '2026-10-25 00:03:03', '2026-10-25 00:03:03'),
	(208, 5, 'login', 'Signed in', 'login', NULL, '2026-10-25 00:05:00', '2026-10-25 00:05:00'),
	(209, 5, 'restock.request', 'Asked to restock Aula Keyboard — Need urgent', 'boxes', '{"note": "Need urgent", "product": "Aula Keyboard", "productId": "PRD-5704"}', '2026-10-25 00:05:22', '2026-10-25 00:05:22'),
	(210, 4, 'login', 'Signed in', 'login', NULL, '2026-10-25 00:05:39', '2026-10-25 00:05:39'),
	(211, 4, 'restock.done', 'Closed the restock request for Aula Keyboard', 'boxes', '{"product": "Aula Keyboard", "productId": "PRD-5704"}', '2026-10-25 00:16:13', '2026-10-25 00:16:13'),
	(212, 4, 'restock.ordered', 'Marked as ordered: Aula Keyboard — 10 arriving Oct 25', 'boxes', '{"product": "Aula Keyboard", "quantity": 10, "productId": "PRD-5704", "expectedDate": "2026-10-25"}', '2026-10-25 00:17:24', '2026-10-25 00:17:24'),
	(213, 3, 'login', 'Signed in', 'login', NULL, '2026-10-25 00:52:47', '2026-10-25 00:52:47'),
	(214, 3, 'stock.in', 'Stock In +10 for Honor X3', 'boxes', '{"qty": 10, "date": "2026-10-25", "type": "Stock In", "change": 10, "product": "Honor X3", "totalQty": 10, "productId": "PRD-7113", "movementId": 65, "previousType": null, "previousChange": null, "previousProductId": null}', '2026-10-25 00:56:35', '2026-10-25 00:56:35'),
	(215, 3, 'stock.edit', 'Updated details of Honor X3 movement', 'boxes', '{"date": "2026-10-25", "type": "Stock In", "product": "Honor X3", "productId": "PRD-7113", "movementId": 65}', '2026-10-25 00:56:50', '2026-10-25 00:56:50'),
	(216, 3, 'stock.edit', 'Updated Honor X3 movement: +10 → −5', 'boxes', '{"qty": 5, "date": "2026-10-25", "type": "Stock Out", "change": -5, "product": "Honor X3", "totalQty": 5, "productId": "PRD-7113", "movementId": 65, "previousType": "Stock In", "previousChange": 10, "previousProductId": "PRD-7113"}', '2026-10-25 01:31:50', '2026-10-25 01:31:50'),
	(217, 3, 'stock.safety', 'Honor X3 fell below safety stock (5 left, minimum 5)', 'alert', '{"product": "Honor X3", "totalQty": 5, "productId": "PRD-7113", "movementId": 65, "outOfStock": false, "safetyStock": 5, "stockBefore": 10, "reorderPoint": 5}', '2026-10-25 01:31:50', '2026-10-25 01:31:50'),
	(218, 3, 'stock.delete', 'Deleted Stock Out −5 for Honor X3', 'boxes', '{"qty": 5, "date": "2026-10-25", "type": "Stock Out", "change": -5, "product": "Honor X3", "totalQty": 10, "productId": "PRD-7113", "movementId": 65}', '2026-10-25 01:36:14', '2026-10-25 01:36:14'),
	(219, 3, 'stock.delete', 'Deleted Stock Out −2 for Honor X3', 'boxes', '{"qty": 2, "date": "2026-10-24", "type": "Stock Out", "change": -2, "product": "Honor X3", "totalQty": 12, "productId": "PRD-7113", "movementId": 43}', '2026-10-25 01:37:12', '2026-10-25 01:37:12'),
	(220, 3, 'stock.in', 'Stock In +10 for Honor X3', 'boxes', '{"qty": 10, "date": "2026-10-25", "type": "Stock In", "change": 10, "product": "Honor X3", "totalQty": 22, "productId": "PRD-7113", "movementId": 66, "previousType": null, "previousChange": null, "previousProductId": null}', '2026-10-25 01:37:30', '2026-10-25 01:37:30'),
	(221, 3, 'stock.edit', 'Updated Honor X3 movement: +10 → −1', 'boxes', '{"qty": 1, "date": "2026-10-25", "type": "Stock Out", "change": -1, "product": "Honor X3", "totalQty": 21, "productId": "PRD-7113", "movementId": 66, "previousType": "Stock In", "previousChange": 10, "previousProductId": "PRD-7113"}', '2026-10-25 01:40:44', '2026-10-25 01:40:44'),
	(222, 3, 'stock.edit', 'Updated Honor X3 movement: −1 → −7', 'boxes', '{"qty": 7, "date": "2026-10-25", "type": "Stock Out", "change": -7, "product": "Honor X3", "totalQty": 14, "productId": "PRD-7113", "movementId": 66, "previousType": "Stock Out", "previousChange": -1, "previousProductId": "PRD-7113"}', '2026-10-25 01:40:52', '2026-10-25 01:40:52'),
	(223, 3, 'stock.edit', 'Updated Honor X3 movement: −7 → −14', 'boxes', '{"qty": 14, "date": "2026-10-25", "type": "Stock Out", "change": -14, "product": "Honor X3", "totalQty": 0, "productId": "PRD-7113", "movementId": 66, "previousType": "Stock Out", "previousChange": -7, "previousProductId": "PRD-7113"}', '2026-10-25 01:41:02', '2026-10-25 01:41:02'),
	(224, 3, 'stock.safety', 'Honor X3 is now out of stock', 'alert', '{"product": "Honor X3", "totalQty": 0, "productId": "PRD-7113", "movementId": 66, "outOfStock": true, "safetyStock": 5, "stockBefore": 14, "reorderPoint": 5}', '2026-10-25 01:41:03', '2026-10-25 01:41:03'),
	(225, 3, 'settings.currency', 'Changed system currency from PHP to USD', 'settings', '{"to": "USD", "from": "PHP"}', '2026-10-25 01:44:10', '2026-10-25 01:44:10'),
	(226, 3, 'stock.edit', 'Updated Honor X3 movement: −14 → +20', 'boxes', '{"qty": 20, "date": "2026-10-25", "type": "Stock In", "change": 20, "product": "Honor X3", "totalQty": 20, "productId": "PRD-7113", "movementId": 66, "previousType": "Stock Out", "previousChange": -14, "previousProductId": "PRD-7113"}', '2026-10-25 01:44:26', '2026-10-25 01:44:26'),
	(227, 3, 'stock.in', 'Stock In +10 for Honor X3 (added to the same day\'s entry, now +30)', 'boxes', '{"qty": 10, "date": "2026-10-25", "type": "Stock In", "change": 10, "product": "Honor X3", "totalQty": 30, "productId": "PRD-7113", "movementId": 66, "previousType": null, "previousChange": null, "previousProductId": null}', '2026-10-25 01:44:44', '2026-10-25 01:44:44'),
	(228, 3, 'stock.in', 'Stock In +10 for Honor X3', 'boxes', '{"qty": 10, "date": "2026-10-25", "type": "Stock In", "change": 10, "product": "Honor X3", "totalQty": 40, "productId": "PRD-7113", "movementId": 67, "previousType": null, "previousChange": null, "previousProductId": null}', '2026-10-25 01:45:02', '2026-10-25 01:45:02'),
	(229, 3, 'stock.delete', 'Deleted Stock In +10 for Honor X3', 'boxes', '{"qty": 10, "date": "2026-10-25", "type": "Stock In", "change": 10, "product": "Honor X3", "totalQty": 30, "productId": "PRD-7113", "movementId": 67}', '2026-10-25 01:45:10', '2026-10-25 01:45:10');

-- Dumping structure for table ggg_inventory.app_settings
CREATE TABLE IF NOT EXISTS `app_settings` (
  `key` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table ggg_inventory.app_settings: ~1 rows (approximately)
INSERT INTO `app_settings` (`key`, `value`, `created_at`, `updated_at`) VALUES
	('currency', 'USD', '2026-10-23 19:35:44', '2026-10-25 01:44:10'),
	('logo', 'branding/RsfYH8DtzaWaPFFOMX30fsd0PxMV1KpLItFTjXHI.webp', '2026-10-24 03:26:11', '2026-10-24 03:26:11'),
	('role_access_admin', 'pv,pc,pe,pd,px,sv,sm,kv,kc,ke,kd,kl,kx,kh,rv,cu,cs,ch,cx,fv,fx,fp,fe,tv,t1,t2,t3,t4,t5,t6,t7,t8,tx,nv,sc', '2026-10-24 19:29:59', '2026-10-24 19:29:59'),
	('role_access_staff', 'kv,kc,ke,kd,kx,kh,rv,tv,t1,t2,t3,t4,t5,t6,t7,t8,tx,nv', '2026-10-24 19:30:00', '2026-10-24 19:32:07');

-- Dumping structure for table ggg_inventory.cache
CREATE TABLE IF NOT EXISTS `cache` (
  `key` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `expiration` bigint NOT NULL,
  PRIMARY KEY (`key`),
  KEY `cache_expiration_index` (`expiration`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table ggg_inventory.cache: ~0 rows (approximately)
INSERT INTO `cache` (`key`, `value`, `expiration`) VALUES
	('laravel-cache-4f50de7223b8615f385a14b93377a51c', 'i:1;', 1792918426),
	('laravel-cache-4f50de7223b8615f385a14b93377a51c:timer', 'i:1792918426;', 1792918426),
	('laravel-cache-94d92f976fd06fd3e8cf53ec4e03d646', 'i:1;', 1792918426),
	('laravel-cache-94d92f976fd06fd3e8cf53ec4e03d646:timer', 'i:1792918426;', 1792918426);

-- Dumping structure for table ggg_inventory.cache_locks
CREATE TABLE IF NOT EXISTS `cache_locks` (
  `key` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `owner` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `expiration` bigint NOT NULL,
  PRIMARY KEY (`key`),
  KEY `cache_locks_expiration_index` (`expiration`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table ggg_inventory.cache_locks: ~0 rows (approximately)

-- Dumping structure for table ggg_inventory.custom_formulas
CREATE TABLE IF NOT EXISTS `custom_formulas` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `full_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `expression` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `result_unit` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
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
  `uuid` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `connection` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `queue` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `exception` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `failed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `failed_jobs_uuid_unique` (`uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table ggg_inventory.failed_jobs: ~0 rows (approximately)

-- Dumping structure for table ggg_inventory.jobs
CREATE TABLE IF NOT EXISTS `jobs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `queue` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
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
  `id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `total_jobs` int NOT NULL,
  `pending_jobs` int NOT NULL,
  `failed_jobs` int NOT NULL,
  `failed_job_ids` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `options` mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `cancelled_at` int DEFAULT NULL,
  `created_at` int NOT NULL,
  `finished_at` int DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table ggg_inventory.job_batches: ~0 rows (approximately)

-- Dumping structure for table ggg_inventory.migrations
CREATE TABLE IF NOT EXISTS `migrations` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `migration` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `batch` int NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=37 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table ggg_inventory.migrations: ~33 rows (approximately)
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
	(24, '2026_10_21_000002_add_soft_deletes_to_products_table', 4),
	(25, '2026_10_21_000003_create_sales_seasonal_adjustments_table', 5),
	(26, '2026_10_23_000001_create_seasonal_events_table', 6),
	(27, '2026_10_23_000002_add_lead_time_to_suppliers_table', 6),
	(28, '2026_10_23_000003_add_unit_price_to_stock_movements_table', 6),
	(29, '2026_10_23_000004_create_past_sales_table', 7),
	(30, '2026_10_24_000001_add_variants_to_products_table', 8),
	(31, '2026_10_24_000002_create_app_settings_table', 9),
	(32, '2026_10_24_000003_add_status_points_to_safety_stock_table', 10),
	(33, '2026_10_24_000004_update_default_safety_stock', 11),
	(34, '2026_10_25_000001_create_restock_requests_table', 12),
	(35, '2026_10_25_000002_add_order_details_to_restock_requests_table', 13),
	(36, '2026_10_25_000003_remove_order_details_from_restock_requests_table', 14);

-- Dumping structure for table ggg_inventory.password_reset_otps
CREATE TABLE IF NOT EXISTS `password_reset_otps` (
  `email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `otp_hash` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `attempts` tinyint unsigned NOT NULL DEFAULT '0',
  `expires_at` timestamp NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table ggg_inventory.password_reset_otps: ~0 rows (approximately)

-- Dumping structure for table ggg_inventory.password_reset_tokens
CREATE TABLE IF NOT EXISTS `password_reset_tokens` (
  `email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `token` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table ggg_inventory.password_reset_tokens: ~0 rows (approximately)

-- Dumping structure for table ggg_inventory.past_sales
CREATE TABLE IF NOT EXISTS `past_sales` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `product_id` bigint unsigned NOT NULL,
  `period_date` date NOT NULL,
  `units_sold` int unsigned NOT NULL,
  `source` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'manual',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `past_sales_product_id_period_date_unique` (`product_id`,`period_date`),
  CONSTRAINT `past_sales_product_id_foreign` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table ggg_inventory.past_sales: ~21 rows (approximately)
INSERT INTO `past_sales` (`id`, `product_id`, `period_date`, `units_sold`, `source`, `created_at`, `updated_at`) VALUES
	(1, 25, '2026-01-01', 18, 'manual', '2026-10-23 03:23:06', '2026-10-23 03:23:06'),
	(2, 25, '2026-02-01', 22, 'manual', '2026-10-23 03:23:06', '2026-10-23 03:23:06'),
	(3, 25, '2026-03-01', 20, 'manual', '2026-10-23 03:23:06', '2026-10-23 03:23:06'),
	(4, 25, '2026-04-01', 25, 'manual', '2026-10-23 03:23:06', '2026-10-23 03:23:06'),
	(5, 25, '2026-05-01', 27, 'manual', '2026-10-23 03:23:06', '2026-10-23 03:23:06'),
	(6, 25, '2026-06-01', 24, 'manual', '2026-10-23 03:23:06', '2026-10-23 03:23:06'),
	(7, 25, '2026-07-01', 30, 'manual', '2026-10-23 03:23:06', '2026-10-23 03:23:06'),
	(8, 25, '2026-08-01', 33, 'manual', '2026-10-23 03:23:06', '2026-10-23 03:23:06'),
	(9, 25, '2026-09-01', 35, 'manual', '2026-10-23 03:23:06', '2026-10-23 03:23:06'),
	(10, 25, '2025-01-01', 12, 'manual', '2026-10-23 03:24:47', '2026-10-23 03:24:47'),
	(11, 25, '2025-02-01', 32, 'manual', '2026-10-23 03:24:47', '2026-10-23 03:24:47'),
	(12, 25, '2025-03-01', 22, 'manual', '2026-10-23 03:24:47', '2026-10-23 03:24:47'),
	(13, 25, '2025-04-01', 11, 'manual', '2026-10-23 03:24:47', '2026-10-23 03:24:47'),
	(14, 25, '2025-05-01', 12, 'manual', '2026-10-23 03:24:47', '2026-10-23 03:24:47'),
	(15, 25, '2025-06-01', 3, 'manual', '2026-10-23 03:24:47', '2026-10-23 03:24:47'),
	(16, 25, '2025-07-01', 33, 'manual', '2026-10-23 03:24:47', '2026-10-23 03:24:47'),
	(17, 25, '2025-08-01', 112, 'manual', '2026-10-23 03:24:47', '2026-10-23 03:24:47'),
	(18, 25, '2025-09-01', 33, 'manual', '2026-10-23 03:24:47', '2026-10-23 03:24:47'),
	(19, 25, '2025-10-01', 32, 'manual', '2026-10-23 03:24:47', '2026-10-23 03:24:47'),
	(20, 25, '2025-11-01', 21, 'manual', '2026-10-23 03:24:47', '2026-10-23 03:24:47'),
	(21, 25, '2025-12-01', 21, 'manual', '2026-10-23 03:24:47', '2026-10-23 03:24:47');

-- Dumping structure for table ggg_inventory.products
CREATE TABLE IF NOT EXISTS `products` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `brand` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `model` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `unit_measure` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `variants` json DEFAULT NULL,
  `image` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
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
) ENGINE=InnoDB AUTO_INCREMENT=41 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table ggg_inventory.products: ~21 rows (approximately)
INSERT INTO `products` (`id`, `code`, `name`, `category`, `brand`, `model`, `unit_measure`, `variants`, `image`, `supplier_id`, `stock_on_hand`, `unit_cost`, `created_at`, `updated_at`, `deleted_at`) VALUES
	(13, 'PRD-5720', 'Iphone 11', 'Phone', 'Apple', 'Iphone 11 Pro Max', 'Units', NULL, NULL, 14, 0, NULL, '2026-10-03 11:13:13', '2026-10-21 02:55:39', '2026-10-21 02:55:39'),
	(14, 'PRD-7647', 'Poco X6 Pro', 'Phone', 'Poco', 'X6 PRO', 'Units', NULL, NULL, 15, 0, NULL, '2026-10-03 15:53:47', '2026-10-21 02:55:45', '2026-10-21 02:55:45'),
	(15, 'PRD-6089', 'Aula', 'Keyboard', 'Aula', 'F75', 'Boxes', NULL, NULL, NULL, 0, NULL, '2026-10-03 16:19:46', '2026-10-21 03:00:14', '2026-10-21 03:00:14'),
	(16, 'PRD-3852', 'Kanata RGB Gaming Mouse', 'Peripherals', 'Kanata', 'KN-14', 'Units', NULL, NULL, NULL, 0, NULL, '2026-10-04 16:40:21', '2026-10-21 02:55:49', '2026-10-21 02:55:49'),
	(24, 'PRD-1314', 'CherryMobile', 'Phone', 'Cherry', 'S6000', 'Boxes', NULL, NULL, NULL, 0, NULL, '2026-10-05 13:47:54', '2026-10-21 02:55:36', '2026-10-21 02:55:36'),
	(25, 'PRD-4158', 'Poco X6 Pro', 'Phone', 'Poco', 'X6 PRO', 'Units', '["Black"]', 'https://down-ph.img.susercontent.com/file/ph-11134207-820l7-mrd141r0eznka6', 15, 0, NULL, '2026-10-21 03:02:00', '2026-10-24 03:16:03', NULL),
	(26, 'PRD-9284', 'Iphone 11', 'Phone', 'apple', 'IP11Pro', 'Units', '["White"]', 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS-WDmnL8beU-iNZENpJQJ4532nb_qfVKBpBYPBvDSoYg&s=10', 14, 0, NULL, '2026-10-22 04:37:59', '2026-10-24 21:38:30', NULL),
	(27, 'PRD-7113', 'Honor X3', 'Phone', 'Honor Inc.', 'X3', 'Units', '["Orange"]', 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR_Jphk3ZaFyIOxEbi69xBauuNB2W62yTQXuExDuWY06g&s=10', 19, 30, NULL, '2026-10-23 21:05:34', '2026-10-25 01:45:10', NULL),
	(28, 'PRD-5704', 'Aula Keyboard', 'Keyboard', 'Aula', 'S98', 'Units', '["Pink", "Gray", "Gray/Black"]', 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTO6myb1EEi0O9dI3GNt0icRoXe4y9z1x8n_MQRn77kWg&s=10', 20, 0, NULL, '2026-10-23 21:07:28', '2026-10-23 21:26:22', NULL),
	(29, 'PRD-7214', 'Kanata RGB Gaming Mouse', 'Peripherals', 'Kanata', 'X6 Wired', 'Units', '["Black"]', NULL, 21, 15, NULL, '2026-10-23 21:14:58', '2026-10-23 21:16:49', NULL),
	(30, 'PRD-4722', 'HP Laptop', 'Gadget', 'HP', 'Ryzen 5 2400g', 'Units', '["Silver"]', NULL, 22, 10, NULL, '2026-10-23 21:16:04', '2026-10-23 21:16:24', NULL),
	(31, 'PRD-TECH-0001', 'AeroBook Pro 14 Laptop', 'Computers', 'AeroTech', 'ABP-14', 'Units', NULL, NULL, NULL, 7, NULL, '2026-10-23 21:32:20', '2026-10-23 21:35:16', NULL),
	(32, 'PRD-TECH-0002', 'NovaCore Wireless Mouse', 'Computer Accessories', 'NovaCore', 'NC-MW-2', 'Units', NULL, NULL, NULL, 18, NULL, '2026-10-23 21:32:20', '2026-10-23 21:35:16', NULL),
	(33, 'PRD-TECH-0003', 'VoltEdge Mechanical Keyboard', 'Computer Accessories', 'VoltEdge', 'VE-MK-87', 'Units', NULL, NULL, NULL, 12, NULL, '2026-10-23 21:32:20', '2026-10-23 21:35:16', NULL),
	(34, 'PRD-TECH-0004', 'PixelWave 27-Inch Monitor', 'Displays', 'PixelWave', 'PW-27Q', 'Units', NULL, NULL, NULL, 0, NULL, '2026-10-23 21:32:20', '2026-10-24 19:52:38', NULL),
	(35, 'PRD-TECH-0005', 'LinkForge Wi-Fi 6 Router', 'Networking', 'LinkForge', 'LF-RX6', 'Units', NULL, NULL, NULL, 22, NULL, '2026-10-23 21:32:20', '2026-10-23 21:35:16', NULL),
	(36, 'PRD-TECH-0006', 'SonicPulse Noise-Canceling Headphones', 'Audio', 'SonicPulse', 'SP-ANC500', 'Units', NULL, NULL, NULL, 15, NULL, '2026-10-23 21:32:21', '2026-10-23 21:35:16', NULL),
	(37, 'PRD-TECH-0007', 'CoreVault 1TB Portable SSD', 'Storage', 'CoreVault', 'CV-SSD1T', 'Units', NULL, NULL, NULL, 9, NULL, '2026-10-23 21:32:21', '2026-10-23 21:35:16', NULL),
	(38, 'PRD-TECH-0008', 'Streamline 1080p Webcam', 'Computer Accessories', 'Streamline', 'SL-CAM1080', 'Units', NULL, NULL, NULL, 3, NULL, '2026-10-23 21:32:21', '2026-10-23 21:35:16', NULL),
	(39, 'PRD-TECH-0009', 'ArcLight USB-C Docking Station', 'Computer Accessories', 'ArcLight', 'AL-DOCK8', 'Units', NULL, NULL, NULL, 0, NULL, '2026-10-23 21:32:21', '2026-10-24 20:05:44', NULL),
	(40, 'PRD-TECH-0010', 'TitanPlay Wireless Game Controller', 'Gaming', 'TitanPlay', 'TP-WC2', 'Units', NULL, NULL, NULL, 0, NULL, '2026-10-23 21:32:21', '2026-10-24 02:14:02', NULL);

-- Dumping structure for table ggg_inventory.restock_requests
CREATE TABLE IF NOT EXISTS `restock_requests` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `product_id` bigint unsigned NOT NULL,
  `requested_by` bigint unsigned DEFAULT NULL,
  `note` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
  `resolved_by` bigint unsigned DEFAULT NULL,
  `resolved_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `restock_requests_product_id_foreign` (`product_id`),
  KEY `restock_requests_requested_by_foreign` (`requested_by`),
  KEY `restock_requests_resolved_by_foreign` (`resolved_by`),
  KEY `restock_requests_status_product_id_index` (`status`,`product_id`),
  CONSTRAINT `restock_requests_product_id_foreign` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `restock_requests_requested_by_foreign` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `restock_requests_resolved_by_foreign` FOREIGN KEY (`resolved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table ggg_inventory.restock_requests: ~1 rows (approximately)
INSERT INTO `restock_requests` (`id`, `product_id`, `requested_by`, `note`, `status`, `resolved_by`, `resolved_at`, `created_at`, `updated_at`) VALUES
	(1, 28, 5, 'Need urgent', 'done', 4, '2026-10-25 00:16:13', '2026-10-25 00:05:22', '2026-10-25 00:16:13');

-- Dumping structure for table ggg_inventory.safety_stock
CREATE TABLE IF NOT EXISTS `safety_stock` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `product_id` bigint unsigned NOT NULL,
  `safety_stock` int NOT NULL DEFAULT '3',
  `annual_demand` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `lead_time_days` int unsigned DEFAULT NULL,
  `order_cycle_days` int unsigned DEFAULT NULL,
  `ordering_cost` decimal(12,2) DEFAULT NULL,
  `holding_cost` decimal(12,2) DEFAULT NULL,
  `status_mode` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'auto',
  `low_point` int DEFAULT NULL,
  `critical_point` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `safety_stock_product_id_unique` (`product_id`),
  CONSTRAINT `safety_stock_product_id_foreign` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table ggg_inventory.safety_stock: ~16 rows (approximately)
INSERT INTO `safety_stock` (`id`, `product_id`, `safety_stock`, `annual_demand`, `created_at`, `updated_at`, `lead_time_days`, `order_cycle_days`, `ordering_cost`, `holding_cost`, `status_mode`, `low_point`, `critical_point`) VALUES
	(1, 25, 5, NULL, '2026-10-21 03:02:41', '2026-10-24 21:47:19', 6, NULL, 321.00, 1000.00, 'auto', NULL, NULL),
	(2, 26, 5, NULL, '2026-10-23 19:43:11', '2026-10-23 21:43:21', 4, NULL, NULL, NULL, 'auto', NULL, NULL),
	(3, 28, 5, NULL, '2026-10-23 21:09:53', '2026-10-23 21:43:21', NULL, NULL, NULL, NULL, 'auto', NULL, NULL),
	(4, 27, 5, NULL, '2026-10-23 21:09:53', '2026-10-23 21:43:21', NULL, NULL, NULL, NULL, 'auto', NULL, NULL),
	(5, 31, 3, NULL, '2026-10-23 21:43:21', '2026-10-23 21:43:21', NULL, NULL, NULL, NULL, 'auto', NULL, NULL),
	(6, 39, 3, NULL, '2026-10-23 21:43:21', '2026-10-23 21:43:21', NULL, NULL, NULL, NULL, 'auto', NULL, NULL),
	(7, 37, 3, NULL, '2026-10-23 21:43:21', '2026-10-23 21:43:21', NULL, NULL, NULL, NULL, 'auto', NULL, NULL),
	(8, 30, 3, NULL, '2026-10-23 21:43:21', '2026-10-23 21:43:21', NULL, NULL, NULL, NULL, 'auto', NULL, NULL),
	(9, 29, 3, NULL, '2026-10-23 21:43:21', '2026-10-23 21:43:21', NULL, NULL, NULL, NULL, 'auto', NULL, NULL),
	(10, 35, 3, NULL, '2026-10-23 21:43:21', '2026-10-23 21:43:21', NULL, NULL, NULL, NULL, 'auto', NULL, NULL),
	(11, 32, 3, NULL, '2026-10-23 21:43:21', '2026-10-23 21:43:21', NULL, NULL, NULL, NULL, 'auto', NULL, NULL),
	(12, 34, 3, NULL, '2026-10-23 21:43:21', '2026-10-23 21:43:21', NULL, NULL, NULL, NULL, 'auto', NULL, NULL),
	(13, 36, 3, NULL, '2026-10-23 21:43:21', '2026-10-23 21:43:21', NULL, NULL, NULL, NULL, 'auto', NULL, NULL),
	(14, 38, 3, NULL, '2026-10-23 21:43:21', '2026-10-23 21:43:21', NULL, NULL, NULL, NULL, 'auto', NULL, NULL),
	(15, 40, 3, NULL, '2026-10-23 21:43:21', '2026-10-23 21:43:21', NULL, NULL, NULL, NULL, 'auto', NULL, NULL),
	(16, 33, 3, NULL, '2026-10-23 21:43:21', '2026-10-23 21:43:21', NULL, NULL, NULL, NULL, 'auto', NULL, NULL);

-- Dumping structure for table ggg_inventory.sales_history
CREATE TABLE IF NOT EXISTS `sales_history` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `product_id` bigint unsigned NOT NULL,
  `period_date` date NOT NULL,
  `period_type` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'month',
  `units_sold` int NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sales_history_product_period_type_date_unique` (`product_id`,`period_type`,`period_date`),
  KEY `sales_history_period_date_index` (`period_date`),
  KEY `sales_history_product_id_index` (`product_id`),
  CONSTRAINT `sales_history_product_id_foreign` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table ggg_inventory.sales_history: ~7 rows (approximately)
INSERT INTO `sales_history` (`id`, `product_id`, `period_date`, `period_type`, `units_sold`, `created_at`, `updated_at`) VALUES
	(94, 28, '2026-10-01', 'month', 3, '2026-10-23 21:10:38', '2026-10-23 21:26:22'),
	(97, 34, '2026-10-01', 'month', 4, '2026-10-24 19:52:38', '2026-10-24 19:52:38'),
	(98, 39, '2026-10-01', 'month', 45, '2026-10-24 20:05:44', '2026-10-24 20:05:44');

-- Dumping structure for table ggg_inventory.sales_seasonal_adjustments
CREATE TABLE IF NOT EXISTS `sales_seasonal_adjustments` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `product_id` bigint unsigned NOT NULL,
  `year` smallint unsigned NOT NULL,
  `month` tinyint unsigned NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT '0',
  `events` json NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sales_seasonal_adjustments_product_period_unique` (`product_id`,`year`,`month`),
  CONSTRAINT `sales_seasonal_adjustments_product_id_foreign` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table ggg_inventory.sales_seasonal_adjustments: ~3 rows (approximately)
INSERT INTO `sales_seasonal_adjustments` (`id`, `product_id`, `year`, `month`, `enabled`, `events`, `created_at`, `updated_at`) VALUES
	(1, 25, 2026, 10, 1, '[{"name": "Holiday Sales", "adjustmentPct": 50}]', '2026-10-21 03:59:36', '2026-10-21 03:59:42'),
	(2, 25, 2025, 10, 1, '[]', '2026-10-21 03:59:53', '2026-10-21 03:59:53'),
	(3, 25, 2025, 12, 1, '[{"name": "Christmas sale", "adjustmentPct": 70}, {"name": "Big holiday Sales", "adjustmentPct": 95}]', '2026-10-21 04:08:28', '2026-10-21 04:12:15');

-- Dumping structure for table ggg_inventory.seasonal_events
CREATE TABLE IF NOT EXISTS `seasonal_events` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `adjustment_pct` decimal(7,2) NOT NULL,
  `scope` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'all',
  `categories` json DEFAULT NULL,
  `product_ids` json DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `seasonal_events_start_date_end_date_index` (`start_date`,`end_date`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table ggg_inventory.seasonal_events: ~1 rows (approximately)
INSERT INTO `seasonal_events` (`id`, `name`, `start_date`, `end_date`, `adjustment_pct`, `scope`, `categories`, `product_ids`, `is_active`, `created_at`, `updated_at`) VALUES
	(1, 'Christmas Sales', '2026-12-20', '2026-12-27', 20.00, 'products', NULL, '["PRD-9284"]', 1, '2026-10-23 02:30:11', '2026-10-23 03:35:19');

-- Dumping structure for table ggg_inventory.sessions
CREATE TABLE IF NOT EXISTS `sessions` (
  `id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` bigint unsigned DEFAULT NULL,
  `ip_address` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_activity` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `sessions_user_id_index` (`user_id`),
  KEY `sessions_last_activity_index` (`last_activity`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table ggg_inventory.sessions: ~1 rows (approximately)
INSERT INTO `sessions` (`id`, `user_id`, `ip_address`, `user_agent`, `payload`, `last_activity`) VALUES
	('brivmA0gk22aNW19B9ucAavMcC6A3ARIzL1II7rT', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36', 'eyJfdG9rZW4iOiJtbUhNbFRScEpFc2RWMW81QVZwcnBqNWJyaVRWbVl2S3o2YmZKdk1FIiwiX2ZsYXNoIjp7Im9sZCI6W10sIm5ldyI6W119fQ==', 1792915176),
	('tWC5UPGXRtCcponnhnl2BeOVwEkqbeCf168xa9Du', 3, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36', 'eyJfdG9rZW4iOiJ2Rk5iVzdzWVFqMzBaZ3FoS1NOZ3J5Tmo1aDJqWDB1OGhjTFVVTFB5IiwiX2ZsYXNoIjp7Im9sZCI6W10sIm5ldyI6W119LCJsb2dpbl93ZWJfNTliYTM2YWRkYzJiMmY5NDAxNTgwZjAxNGM3ZjU4ZWE0ZTMwOTg5ZCI6MywiX3ByZXZpb3VzIjp7InVybCI6Imh0dHA6XC9cLzEyNy4wLjAuMTo4MDAwXC9hcGlcL3Jlc3RvY2stcmVxdWVzdHMiLCJyb3V0ZSI6bnVsbH19', 1792922134);

-- Dumping structure for table ggg_inventory.stock_movements
CREATE TABLE IF NOT EXISTS `stock_movements` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `product_id` bigint unsigned NOT NULL,
  `product_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `product_category` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `variant_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `movement_type` enum('in','out') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `qty` int NOT NULL,
  `unit_price` decimal(12,2) DEFAULT NULL,
  `remaining_stock` int NOT NULL,
  `notes` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `recorded_by` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `movement_date` date NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `is_adjustment` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `stock_movements_product_id_index` (`product_id`),
  KEY `stock_movements_movement_date_index` (`movement_date`),
  CONSTRAINT `stock_movements_product_id_foreign` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=68 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table ggg_inventory.stock_movements: ~14 rows (approximately)
INSERT INTO `stock_movements` (`id`, `product_id`, `product_name`, `product_category`, `variant_name`, `movement_type`, `qty`, `unit_price`, `remaining_stock`, `notes`, `recorded_by`, `movement_date`, `created_at`, `updated_at`, `is_adjustment`) VALUES
	(42, 28, 'Aula Keyboard', 'Keyboard', 'Gray', 'out', 3, 99.00, 0, 'Opening stock', 'Super Admin User', '2026-10-24', '2026-10-23 21:08:02', '2026-10-23 21:26:22', 0),
	(45, 30, 'HP Laptop', 'Gadget', 'Silver', 'in', 10, 599.00, 10, 'New', 'Super Admin User', '2026-10-24', '2026-10-23 21:16:24', '2026-10-23 21:16:24', 0),
	(46, 29, 'Kanata RGB Gaming Mouse', 'Peripherals', 'Black', 'in', 15, 50.00, 15, 'New', 'Super Admin User', '2026-10-24', '2026-10-23 21:16:49', '2026-10-23 21:16:49', 0),
	(47, 31, 'AeroBook Pro 14 Laptop', 'Computers', NULL, 'in', 7, NULL, 7, 'Opening stock', NULL, '2026-10-24', '2026-10-23 21:35:16', '2026-10-23 21:35:16', 0),
	(48, 32, 'NovaCore Wireless Mouse', 'Computer Accessories', NULL, 'in', 18, NULL, 18, 'Opening stock', NULL, '2026-10-24', '2026-10-23 21:35:16', '2026-10-23 21:35:16', 0),
	(49, 33, 'VoltEdge Mechanical Keyboard', 'Computer Accessories', NULL, 'in', 12, NULL, 12, 'Opening stock', NULL, '2026-10-24', '2026-10-23 21:35:16', '2026-10-23 21:35:16', 0),
	(50, 34, 'PixelWave 27-Inch Monitor', 'Displays', NULL, 'out', 4, NULL, 0, 'Opening stock', 'Super Admin User', '2026-10-24', '2026-10-23 21:35:16', '2026-10-24 19:52:38', 0),
	(51, 35, 'LinkForge Wi-Fi 6 Router', 'Networking', NULL, 'in', 22, NULL, 22, 'Opening stock', NULL, '2026-10-24', '2026-10-23 21:35:16', '2026-10-23 21:35:16', 0),
	(52, 36, 'SonicPulse Noise-Canceling Headphones', 'Audio', NULL, 'in', 15, NULL, 15, 'Opening stock', NULL, '2026-10-24', '2026-10-23 21:35:16', '2026-10-23 21:35:16', 0),
	(53, 37, 'CoreVault 1TB Portable SSD', 'Storage', NULL, 'in', 9, NULL, 9, 'Opening stock', NULL, '2026-10-24', '2026-10-23 21:35:16', '2026-10-23 21:35:16', 0),
	(54, 38, 'Streamline 1080p Webcam', 'Computer Accessories', NULL, 'in', 3, NULL, 3, 'Opening stock', NULL, '2026-10-24', '2026-10-23 21:35:16', '2026-10-23 21:35:16', 0),
	(55, 39, 'ArcLight USB-C Docking Station', 'Computer Accessories', NULL, 'out', 45, NULL, 0, 'Opening stock', 'Super Admin User', '2026-10-24', '2026-10-23 21:35:16', '2026-10-24 20:05:44', 0),
	(66, 27, 'Honor X3', 'Phone', 'Orange', 'in', 30, 299.00, 30, 'Opening stock', 'Super Admin User', '2026-10-25', '2026-10-25 01:37:30', '2026-10-25 01:44:44', 0);

-- Dumping structure for table ggg_inventory.suppliers
CREATE TABLE IF NOT EXISTS `suppliers` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `contact` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `company` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lead_time_days` smallint unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `suppliers_name_unique` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table ggg_inventory.suppliers: ~6 rows (approximately)
INSERT INTO `suppliers` (`id`, `name`, `contact`, `company`, `lead_time_days`, `created_at`, `updated_at`) VALUES
	(14, 'Apple Inc.', '123456788', 'Apple Inc.', NULL, '2026-10-03 11:13:13', '2026-10-03 11:13:13'),
	(15, 'Poco Inc', '13456789e', 'Poco Inc', NULL, '2026-10-03 15:53:47', '2026-10-03 15:53:47'),
	(19, 'Honor Inc.', '1234599335', 'Honor Inc.', NULL, '2026-10-23 21:05:34', '2026-10-23 21:05:34'),
	(20, 'Aula Inc.', '4589348954', 'Aula Inc.', NULL, '2026-10-23 21:07:28', '2026-10-23 21:07:28'),
	(21, 'Kanata Inc.', '7733888433', 'Kanata Inc.', NULL, '2026-10-23 21:14:58', '2026-10-23 21:14:58'),
	(22, 'HP Store', '7775488383', 'HP Store', NULL, '2026-10-23 21:16:04', '2026-10-23 21:16:04');

-- Dumping structure for table ggg_inventory.users
CREATE TABLE IF NOT EXISTS `users` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` enum('super_admin','admin','staff') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'staff',
  `status` enum('active','inactive') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `department` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email_verified_at` timestamp NULL DEFAULT NULL,
  `password` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `remember_token` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `currency` varchar(3) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD',
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_unique` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dumping data for table ggg_inventory.users: ~4 rows (approximately)
INSERT INTO `users` (`id`, `name`, `email`, `role`, `status`, `department`, `email_verified_at`, `password`, `remember_token`, `created_at`, `updated_at`, `currency`) VALUES
	(3, 'Super Admin User', 'superadmin@ggg.test', 'super_admin', 'active', NULL, NULL, '$2y$12$.X7qEj5vBfV.Vf6tG2DECe3jjCRkr.OBrpBeAO3kXLt1eKcVbyvUe', NULL, '2026-10-05 18:48:14', '2026-10-23 02:10:35', 'USD'),
	(4, 'Admin User', 'admin@ggg.test', 'admin', 'active', NULL, NULL, '$2y$12$Ygt9dB8AKy14ugcoyWHW6.pBa37Tu4t9is2KM9vb0jOsnXRn/2XU.', NULL, '2026-10-05 18:48:15', '2026-10-08 01:07:05', 'USD'),
	(5, 'Staff User', 'staff@ggg.test', 'staff', 'active', 'Warehouse', NULL, '$2y$12$8yrQHIA7IuxrpLtemDiNqeV.ufE5sBikDWeDLLJVoEVTyYAtnmwLi', NULL, '2026-10-05 18:48:15', '2026-10-08 01:07:10', 'USD'),
	(7, 'Test Staff', 'staff@ggg.com', 'staff', 'inactive', NULL, NULL, '$2y$12$ECnWH3Tk5nds5d9dXLNxsOhmpsyM8Lm9HlJXpBIeoFmLORtk1XQby', NULL, '2026-10-13 23:42:30', '2026-10-14 00:32:40', 'USD');

/*!40103 SET TIME_ZONE=IFNULL(@OLD_TIME_ZONE, 'system') */;
/*!40101 SET SQL_MODE=IFNULL(@OLD_SQL_MODE, '') */;
/*!40014 SET FOREIGN_KEY_CHECKS=IFNULL(@OLD_FOREIGN_KEY_CHECKS, 1) */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40111 SET SQL_NOTES=IFNULL(@OLD_SQL_NOTES, 1) */;
