<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\SalesHistory;
use App\Models\StockMovement;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Http\JsonResponse;

class DashboardSummaryController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $productRecords = Product::with('safetyStock')->orderBy('name')->get();

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
                'supplierId' => $product->supplier_id,
                // True once the product has any movement; used to keep brand-new
                // products out of the Stock Alerts list until they're tracked.
                'inStockControl' => isset($movedSet[$product->id]),
            ]);

        $kpis = [
            'totalProducts' => $productRecords->count(),
            'totalStockUnits' => (int) $productRecords->sum('stock_on_hand'),
            'lowStockItems' => $productRecords->filter(function (Product $product) use ($movedSet): bool {
                return isset($movedSet[$product->id])
                    && (int) $product->stock_on_hand <= (int) ($product->safetyStock?->safety_stock ?? 20);
            })->count(),
            'stockMovementsToday' => StockMovement::query()
                ->whereDate('movement_date', today()->toDateString())
                ->count(),
        ];

        $salesHistory = SalesHistory::with('product:id,code,name')
            ->orderBy('period_date')
            ->get()
            ->map(fn (SalesHistory $record) => [
                'id' => $record->id,
                'productId' => $record->product?->code,
                'productName' => $record->product?->name,
                'periodDate' => $record->period_date?->toDateString(),
                'unitsSold' => $record->units_sold,
            ]);

        $stockMovements = StockMovement::query()
            ->orderBy('movement_date')
            ->orderBy('id')
            ->get(['id', 'product_name', 'movement_date', 'movement_type', 'qty', 'created_at'])
            ->map(fn (StockMovement $movement) => [
                'id' => $movement->id,
                'productName' => $movement->product_name,
                'date' => $movement->movement_date?->toDateString(),
                'type' => $movement->movement_type,
                'qty' => $movement->qty,
                'createdAt' => $movement->created_at?->toIso8601String(),
            ]);

        return response()->json([
            'kpis' => $kpis,
            'products' => $products,
            'salesHistory' => $salesHistory,
            'stockMovements' => $stockMovements,
            'supplierCount' => Supplier::count(),
            'userCount' => User::count(),
            'generatedAt' => now()->toIso8601String(),
        ]);
    }
}
