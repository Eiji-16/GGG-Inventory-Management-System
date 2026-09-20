<?php

use App\Http\Controllers\ProductController;
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

// Sales history — Forecasting tab. GET accepts ?product={code}.
Route::get('/sales-history', [SalesHistoryController::class, 'index']);
Route::post('/sales-history', [SalesHistoryController::class, 'store']);
Route::delete('/sales-history/{salesHistory}', [SalesHistoryController::class, 'destroy']);
