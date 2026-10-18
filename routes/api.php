<?php

use App\Http\Controllers\DashboardSummaryController;
use App\Http\Controllers\ForecastController;
use App\Http\Controllers\ProductController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\SafetyStockController;
use App\Http\Controllers\SalesHistoryController;
use App\Http\Controllers\StockMovementController;
use App\Http\Controllers\SupplierController;
use Illuminate\Support\Facades\Route;

Route::middleware(['web', 'auth', 'active'])->group(function (): void {
    Route::get('/dashboard/summary', DashboardSummaryController::class);
    Route::get('/reports', [ReportController::class, 'index']);
    Route::get('/products', [ProductController::class, 'index']);
    Route::get('/products/{product}', [ProductController::class, 'show']);
    Route::get('/stock-movements', [StockMovementController::class, 'index']);
    Route::get('/stock-activities', [StockMovementController::class, 'activities']);
    Route::get('/safety-stock', [SafetyStockController::class, 'index']);

    Route::post('/stock-movements', [StockMovementController::class, 'store']);
    Route::match(['put', 'patch'], '/stock-movements/{stockMovement}', [StockMovementController::class, 'update']);
    Route::delete('/stock-movements/products/{productCode}', [StockMovementController::class, 'clearProduct']);
    Route::delete('/stock-movements/{stockMovement}', [StockMovementController::class, 'destroy']);

    Route::middleware('role:super_admin,admin')->group(function (): void {
        Route::post('/products', [ProductController::class, 'store']);
        Route::match(['put', 'patch'], '/products/{product}', [ProductController::class, 'update']);
        Route::delete('/products/{product}', [ProductController::class, 'destroy']);
        Route::apiResource('suppliers', SupplierController::class);
        Route::get('/sales-history', [SalesHistoryController::class, 'index']);
        Route::post('/sales-history', [SalesHistoryController::class, 'store']);
        Route::delete('/sales-history/{salesHistory}', [SalesHistoryController::class, 'destroy']);
        Route::post('/forecasts', [ForecastController::class, 'store']);

    });

    Route::put('/safety-stock', [SafetyStockController::class, 'update'])
        ->middleware('role:super_admin');
});
