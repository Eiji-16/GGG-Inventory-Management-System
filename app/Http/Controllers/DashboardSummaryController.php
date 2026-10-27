<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\StockMovement;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use App\Services\DemandReorderService;
use App\Services\ReorderPointService;

class DashboardSummaryController extends Controller
{
    public function __invoke(ReorderPointService $reorderPoints, \App\Services\SalesForecastService $forecasts): JsonResponse
    {
        $productRecords = Product::with(['safetyStock', 'supplier'])->withoutPhoto()->orderBy('name')->get();
        // Speed: read every product's sales once instead of once per product.
        // The same two services are used for every number on this page.
        $reorderPoints->preload($productRecords);
        // Products in the Trash Bin are left out of every number here.
        // Only the columns used here (not the product photos).
        $productsById = Product::query()->get(['id', 'code', 'name', 'deleted_at'])->keyBy('id');
        $forecasts->preload($productsById);
        $demandReorder = new DemandReorderService($forecasts, $reorderPoints);

        // Product ids that have at least one stock movement — only these are
        // "live" in Stock Control and eligible for stock alerts.
        $movedProductIds = StockMovement::query()->distinct()->pluck('product_id')->filter()->all();
        $movedSet = array_flip($movedProductIds);

        $products = $productRecords
            ->map(fn (Product $product) => [
                'id' => $product->code,
                'name' => $product->name,
                'category' => $product->category,
                'stock' => $product->stock_on_hand,
                'safetyStock' => $product->safetyStock?->safety_stock,
                'annualDemand' => $reorderPoints->annualDemand($product),
                // Policy lead time, else the supplier's — the same rule the
                // server uses for statuses, so the Dashboard matches Stock Control.
                'leadTimeDays' => $reorderPoints->leadTimeDays($product),
                'supplierId' => $product->supplier_id,
                // True once the product has any movement; used to keep brand-new
                // products out of the Stock Alerts list until they're tracked.
                'inStockControl' => isset($movedSet[$product->id]),
            ]);

        $kpis = [
            'totalProducts' => $productRecords->count(),
            'totalStockUnits' => (int) $productRecords->sum('stock_on_hand'),
            'lowStockItems' => $productRecords->filter(function (Product $product) use ($movedSet, $reorderPoints): bool {
                return isset($movedSet[$product->id])
                    && $reorderPoints->statusFor($product) !== 'healthy';
            })->count(),
            'stockMovementsToday' => StockMovement::query()
                // The shop's today (Philippines), not the server's UTC date.
                ->whereDate('movement_date', today(config('app.business_timezone', 'Asia/Manila'))->toDateString())
                ->count(),
        ];

        // Monthly sales for the Sales History / Products with Sales cards:
        // real Stock Out entries (not corrections) plus Past Sales for months
        // before Stock Control began — the same sources the forecast uses.
        // (Read directly instead of the saved sales_history rows, which could
        // keep old numbers after a product's stock was cleared.)
        $monthly = [];
        $addSale = function (Product $product, string $month, int $units) use (&$monthly): void {
            $key = $product->id.'|'.$month;
            $monthly[$key] ??= [
                'productId' => $product->code,
                'productName' => $product->name,
                'periodDate' => $month,
                'unitsSold' => 0,
            ];
            $monthly[$key]['unitsSold'] += $units;
        };
        StockMovement::query()
            ->whereIn('product_id', $productsById->keys())
            ->where('movement_type', 'out')
            ->where('is_adjustment', false)
            ->get(['product_id', 'qty', 'movement_date'])
            ->each(fn (StockMovement $m) => $addSale(
                $productsById[$m->product_id],
                $m->movement_date->copy()->startOfMonth()->toDateString(),
                (int) $m->qty
            ));
        // Past sales per month — monthly entries, or complete months worked out
        // from weekly entries — exactly as the monthly forecast uses them.
        \App\Models\PastSale::query()
            ->whereIn('product_id', $productsById->keys())
            ->get(['product_id', 'period_type', 'period_date', 'units_sold'])
            ->groupBy('product_id')
            ->each(function ($pastRows, $productId) use ($productsById, $forecasts, $addSale): void {
                $product = $productsById[$productId];
                $rows = $pastRows->map(fn ($past) => [
                    \Illuminate\Support\Carbon::parse($past->period_date)->toDateString(),
                    (int) $past->units_sold,
                    $past->period_type ?: 'month',
                ])->all();
                foreach ($forecasts->pastMonthlyTotals($product, $rows) as $month => $row) {
                    $addSale($product, $month, $row['unitsSold']);
                }
            });
        $salesHistory = collect(array_values($monthly))
            ->sortBy('periodDate')
            ->values()
            ->map(fn (array $row, int $i) => ['id' => $i + 1] + $row);

        $stockMovements = StockMovement::with('product:id,code')
            ->orderBy('movement_date')
            ->orderBy('id')
            ->get(['id', 'product_id', 'product_name', 'movement_date', 'movement_type', 'is_adjustment', 'qty', 'created_at'])
            ->map(fn (StockMovement $movement) => [
                'id' => $movement->id,
                'productId' => $movement->product?->code,
                'productName' => $movement->product_name,
                'date' => $movement->movement_date?->toDateString(),
                'type' => $movement->movement_type,
                'isAdjustment' => (bool) $movement->is_adjustment,
                'qty' => $movement->qty,
                'createdAt' => $movement->created_at?->toIso8601String(),
            ]);

        return response()->json([
            'kpis' => $kpis,
            'products' => $products,
            'salesHistory' => $salesHistory,
            'stockMovements' => $stockMovements,
            // Demand-linked reorder suggestions (forecast-based, read-only).
            'reorderSuggestions' => $demandReorder->suggestions(
                $productRecords->filter(fn (Product $product) => isset($movedSet[$product->id]))
            ),
            'supplierCount' => Supplier::whereHas('products')->count(),
            'userCount' => User::count(),
            'generatedAt' => now()->toIso8601String(),
        ]);
    }
}
