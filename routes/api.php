<?php

use App\Http\Controllers\DashboardSummaryController;
use App\Http\Controllers\CustomFormulaController;
use App\Http\Controllers\ForecastController;
use App\Http\Controllers\ProductController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\SalesHistoryController;
use App\Http\Controllers\StockMovementController;
use App\Http\Controllers\SupplierController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes  (prefixed with /api by bootstrap/app.php)
|--------------------------------------------------------------------------
| These are the URLs the React frontend calls to read/write the database.
| NOTE: none of these are authenticated yet — auth (Sanctum + user roles) is
| a later phase. Do not expose this server publicly until that's in place.
*/

// Products — Product & Supplier tab. {product} is the "PRD-XXXX" code.
Route::get('/dashboard/summary', DashboardSummaryController::class);
Route::get('/reports', [ReportController::class, 'index']);
Route::get('/products', [ProductController::class, 'index']);
Route::post('/products', [ProductController::class, 'store']);
Route::get('/products/{product}', [ProductController::class, 'show']);
Route::match(['put', 'patch'], '/products/{product}', [ProductController::class, 'update']);
Route::delete('/products/{product}', [ProductController::class, 'destroy']);

// Suppliers — managed on their own from the Product & Supplier tab.
Route::apiResource('suppliers', SupplierController::class);

// Stock movements — Stock Control ledger (Stock In / Stock Out).
Route::get('/stock-movements', [StockMovementController::class, 'index']);
Route::post('/stock-movements', [StockMovementController::class, 'store']);
Route::match(['put', 'patch'], '/stock-movements/{stockMovement}', [StockMovementController::class, 'update']);
Route::delete('/stock-movements/{stockMovement}', [StockMovementController::class, 'destroy']);

// Sales history — Forecasting tab. GET accepts ?product={code}.
Route::get('/sales-history', [SalesHistoryController::class, 'index']);
Route::post('/sales-history', [SalesHistoryController::class, 'store']);
Route::delete('/sales-history/{salesHistory}', [SalesHistoryController::class, 'destroy']);
Route::post('/forecasts', [ForecastController::class, 'store']);

// Custom formulas — Auto Calculator. The EOQ default lives in the frontend;
// everything the user adds is stored and evaluated server-side.
Route::get('/formulas', [CustomFormulaController::class, 'index']);
Route::post('/formulas', [CustomFormulaController::class, 'store']);
Route::match(['put', 'patch'], '/formulas/{customFormula}', [CustomFormulaController::class, 'update']);
Route::delete('/formulas/{customFormula}', [CustomFormulaController::class, 'destroy']);
Route::post('/formulas/{customFormula}/compute', [CustomFormulaController::class, 'compute']);
