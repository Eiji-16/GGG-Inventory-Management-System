<?php

use App\Http\Controllers\DashboardSummaryController;
use App\Http\Controllers\DataVersionController;
use App\Http\Controllers\CurrencyPreferenceController;
use App\Http\Controllers\ForecastController;
use App\Http\Controllers\PastSalesController;
use App\Http\Controllers\ProductController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\RestockRequestController;
use App\Http\Controllers\RoleAccessController;
use App\Http\Controllers\SafetyStockController;
use App\Http\Controllers\SeasonalEventController;
use App\Http\Controllers\StockMovementController;
use App\Http\Controllers\SupplierController;
use App\Http\Controllers\SystemDataController;
use App\Http\Controllers\TrashBinController;
use Illuminate\Support\Facades\Route;

Route::middleware(['web', 'auth', 'active'])->group(function (): void {
    // Role Access (Settings): everyone reads their own; Super Admin saves.
    Route::get('/role-access', [RoleAccessController::class, 'show']);
    Route::put('/role-access', [RoleAccessController::class, 'update']);

    Route::put('/settings/currency', [CurrencyPreferenceController::class, 'update'])->middleware('feature:settings.currency');
    Route::get('/dashboard/summary', DashboardSummaryController::class);
    Route::get('/reports', [ReportController::class, 'index'])->middleware('feature:reports.view');
    // Tiny "has anything changed?" check used for automatic refresh.
    Route::get('/data-version', DataVersionController::class);
    // Product list is read by Stock Control, Reorder Alerts, the calculator
    // and Forecasting, so reading stays open to every signed-in user.
    Route::get('/products', [ProductController::class, 'index']);
    Route::get('/products/{product}', [ProductController::class, 'show']);
    Route::get('/stock-movements', [StockMovementController::class, 'index']);
    Route::get('/stock-activities', [StockMovementController::class, 'activities'])->middleware('feature:stock.history');
    Route::get('/safety-stock', [SafetyStockController::class, 'index']);

    // Stock Control — each action has its own Role Access box.
    Route::post('/stock-movements', [StockMovementController::class, 'store'])->middleware('feature:stock.create');
    Route::match(['put', 'patch'], '/stock-movements/{stockMovement}', [StockMovementController::class, 'update'])->middleware('feature:stock.edit');
    Route::delete('/stock-movements/{stockMovement}', [StockMovementController::class, 'destroy'])->middleware('feature:stock.delete');
    // Clearing ALL of a product's stock records.
    Route::delete('/stock-movements/products/{productCode}', [StockMovementController::class, 'clearProduct'])->middleware('feature:stock.clear');

    // Products & Suppliers
    Route::post('/products', [ProductController::class, 'store'])->middleware('feature:products.create');
    Route::match(['put', 'patch'], '/products/{product}', [ProductController::class, 'update'])->middleware('feature:products.edit');
    Route::delete('/products/{product}', [ProductController::class, 'destroy'])->middleware('feature:products.delete');
    // The supplier list is also needed by the Add/Edit Product form.
    Route::get('/suppliers', [SupplierController::class, 'index'])->middleware('feature:products.view');
    Route::get('/suppliers/{supplier}', [SupplierController::class, 'show'])->middleware('feature:products.view');
    Route::post('/suppliers', [SupplierController::class, 'store'])->middleware('feature:suppliers.manage');
    Route::match(['put', 'patch'], '/suppliers/{supplier}', [SupplierController::class, 'update'])->middleware('feature:suppliers.manage');
    Route::delete('/suppliers/{supplier}', [SupplierController::class, 'destroy'])->middleware('feature:suppliers.manage');

    // Order Quantity Calculator
    Route::put('/products/{code}/eoq-costs', [SafetyStockController::class, 'saveEoqCosts'])->middleware('feature:calculator.save_costs');

    // Forecasting. "Order Now" and the calculator buttons also ask for a
    // forecast, so the calculator box is enough for that one request.
    Route::post('/forecasts', [ForecastController::class, 'store'])->middleware('feature:forecast.view|calculator.use');
    Route::get('/forecasts/history', [ForecastController::class, 'history'])->middleware('feature:forecast.view');
    Route::get('/seasonal-events', [SeasonalEventController::class, 'index'])->middleware('feature:forecast.view');
    Route::post('/seasonal-events/suggest', [SeasonalEventController::class, 'suggest'])->middleware('feature:forecast.events');
    Route::post('/seasonal-events', [SeasonalEventController::class, 'store'])->middleware('feature:forecast.events');
    Route::match(['put', 'patch'], '/seasonal-events/{seasonal_event}', [SeasonalEventController::class, 'update'])->middleware('feature:forecast.events');
    Route::delete('/seasonal-events/{seasonal_event}', [SeasonalEventController::class, 'destroy'])->middleware('feature:forecast.events');
    Route::get('/past-sales', [PastSalesController::class, 'index'])->middleware('feature:forecast.view');
    Route::put('/past-sales', [PastSalesController::class, 'save'])->middleware('feature:forecast.past_sales');
    Route::post('/past-sales/import', [PastSalesController::class, 'import'])->middleware('feature:forecast.past_sales');

    // Restock requests (Staff "Notify" in Reorder Alerts).
    Route::get('/restock-requests', [RestockRequestController::class, 'index'])->middleware('feature:reorder.notify|reorder.requests');
    Route::post('/restock-requests', [RestockRequestController::class, 'store'])->middleware('feature:reorder.notify');
    Route::put('/restock-requests/{restockRequest}/done', [RestockRequestController::class, 'done'])->middleware('feature:reorder.requests');

    // Trash Bin: deleted products and stock entries (soft deletes).
    Route::get('/trash', [TrashBinController::class, 'index'])->middleware('feature:trash.view');
    Route::post('/trash/products/{code}/restore', [TrashBinController::class, 'restoreProduct'])->middleware('feature:trash.restore');
    Route::delete('/trash/products/{code}', [TrashBinController::class, 'forceDeleteProduct'])->middleware('feature:trash.purge');
    Route::post('/trash/stock-movements/{id}/restore', [TrashBinController::class, 'restoreMovement'])->whereNumber('id')->middleware('feature:trash.restore');
    Route::delete('/trash/stock-movements/{id}', [TrashBinController::class, 'forceDeleteMovement'])->whereNumber('id')->middleware('feature:trash.purge');
    Route::post('/trash/suppliers/{id}/restore', [TrashBinController::class, 'restoreSupplier'])->whereNumber('id')->middleware('feature:trash.restore');
    Route::delete('/trash/suppliers/{id}', [TrashBinController::class, 'forceDeleteSupplier'])->whereNumber('id')->middleware('feature:trash.purge');
    Route::post('/trash/seasonal-events/{id}/restore', [TrashBinController::class, 'restoreEvent'])->whereNumber('id')->middleware('feature:trash.restore');
    Route::delete('/trash/seasonal-events/{id}', [TrashBinController::class, 'forceDeleteEvent'])->whereNumber('id')->middleware('feature:trash.purge');
    // Several at once (the controller checks restore vs. delete permission) and Empty Trash.
    Route::post('/trash/bulk', [TrashBinController::class, 'bulk'])->middleware('feature:trash.restore|trash.purge');
    Route::delete('/trash', [TrashBinController::class, 'empty'])->middleware('feature:trash.purge');

    // Safety Stock Policy stays Super Admin only (not in Role Access).
    Route::put('/safety-stock', [SafetyStockController::class, 'update'])
        ->middleware('role:super_admin');
});

// Settings → Data & System: full backup, import and System Reset.
// Super Admin only, and each action also needs the password (and a typed
// confirm phrase for import / reset). Limited to 5 tries per 10 minutes.
Route::middleware(['web', 'auth', 'active', 'role:super_admin'])->prefix('system')->group(function (): void {
    Route::get('/overview', [SystemDataController::class, 'overview']);
    Route::middleware('throttle:5,10')->group(function (): void {
        Route::post('/export', [SystemDataController::class, 'export']);
        Route::post('/import', [SystemDataController::class, 'import']);
        Route::post('/reset', [SystemDataController::class, 'reset']);
    });
});
