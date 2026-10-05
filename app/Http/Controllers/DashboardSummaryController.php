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
        $products = Product::with('safetyStock')
            ->orderBy('name')
            ->get()
            ->map(fn (Product $product) => [
                'id' => $product->code,
                'name' => $product->name,
                'category' => $product->category,
                'stock' => $product->stock_on_hand,
                'safetyStock' => $product->safetyStock?->safety_stock,
                'supplierId' => $product->supplier_id,
            ]);

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
            'products' => $products,
            'salesHistory' => $salesHistory,
            'stockMovements' => $stockMovements,
            'supplierCount' => Supplier::count(),
            'userCount' => User::count(),
            'generatedAt' => now()->toIso8601String(),
        ]);
    }
}
