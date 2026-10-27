<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Product;
use App\Models\StockMovement;
use App\Services\ProductPhotoService;
use App\Services\StockMovementService;
use Illuminate\Http\JsonResponse;

/**
 * Trash Bin — deleted products and stock entries.
 *
 * Deleting never erases anything right away: it moves the item here
 * (soft delete) with who deleted it and when. From here an allowed user
 * can restore it, or (Super Admin by default) permanently delete it.
 *
 * GET    /api/trash                                  list everything in the Trash Bin
 * POST   /api/trash/products/{code}/restore          restore a product (+ its entries)
 * DELETE /api/trash/products/{code}                  permanently delete a product
 * POST   /api/trash/stock-movements/{id}/restore     restore one stock entry
 * DELETE /api/trash/stock-movements/{id}             permanently delete one stock entry
 */
class TrashBinController extends Controller
{
    public function __construct(private readonly StockMovementService $stockMovements)
    {
    }

    public function index(): JsonResponse
    {
        $products = Product::onlyTrashed()
            ->withoutPhoto()
            ->addSelect('products.deleted_by_name')
            ->orderByDesc('deleted_at')
            ->get();

        // How many entries went to the Trash Bin together with each product.
        $entriesWithProduct = StockMovement::onlyTrashed()
            ->where('deleted_with_product', true)
            ->whereIn('product_id', $products->pluck('id'))
            ->selectRaw('product_id, COUNT(*) as total')
            ->groupBy('product_id')
            ->pluck('total', 'product_id');

        $movements = StockMovement::onlyTrashed()
            ->with('product:id,code,name,category,deleted_at')
            ->orderByDesc('deleted_at')
            ->orderByDesc('id')
            ->limit(1000)
            ->get();

        return response()->json([
            'products' => $products->map(fn (Product $product) => [
                'id' => $product->code,
                'name' => $product->name,
                'category' => $product->category,
                'brand' => $product->brand,
                'stock' => (int) $product->stock_on_hand,
                'entries' => (int) ($entriesWithProduct[$product->id] ?? 0),
                'deletedAt' => $product->deleted_at?->toIso8601String(),
                'deletedBy' => $product->deleted_by_name,
            ])->values(),
            'movements' => $movements->map(fn (StockMovement $movement) => $this->formatMovement($movement))->values(),
        ])->header('Cache-Control', 'no-store');
    }

    public function restoreProduct(string $code): JsonResponse
    {
        $product = Product::onlyTrashed()->where('code', $code)->firstOrFail();

        // Same "no duplicate products" rule as Add/Edit Product.
        app(ProductController::class)->ensureNotDuplicate([
            'name' => $product->name,
            'category' => $product->category,
            'brand' => $product->brand,
            'model' => $product->model,
            'unit_measure' => $product->unit_measure,
            'supplier_id' => $product->supplier_id,
        ], $product->id);

        $entries = $this->stockMovements->restoreProduct($product);

        ActivityLog::record('trash.restore', "Restored product from the Trash Bin — {$product->name}", 'boxes', [
            'productId' => $product->code,
            'product' => $product->name,
            'restoredEntries' => $entries,
        ]);

        return response()->json(['restored' => true, 'restoredEntries' => $entries]);
    }

    public function forceDeleteProduct(string $code): JsonResponse
    {
        $product = Product::onlyTrashed()->where('code', $code)->firstOrFail();
        $image = $product->image;
        $entries = $this->stockMovements->forceDeleteProduct($product);
        // Remove a stored photo file too (links and old in-database photos need nothing).
        app(ProductPhotoService::class)->deleteIfStored($image);

        ActivityLog::record('trash.purge', "Permanently deleted product — {$product->name}", 'boxes', [
            'productId' => $product->code,
            'product' => $product->name,
            'deletedEntries' => $entries,
        ]);

        return response()->json(['deleted' => true, 'deletedEntries' => $entries]);
    }

    public function restoreMovement(int $id): JsonResponse
    {
        $movement = $this->stockMovements->restore($id);
        $movement->loadMissing('product');
        $text = $this->changeText($movement);

        // stock.* so it also shows in Stock Control's activity history.
        ActivityLog::record('stock.restore', "Restored {$this->typeLabel($movement)} {$text} for {$movement->product_name} from the Trash Bin", 'boxes', [
            'productId' => $movement->product?->code,
            'product' => $movement->product_name,
            'movementId' => $movement->id,
            'type' => $this->typeLabel($movement),
            'change' => $this->change($movement),
            'qty' => (int) $movement->qty,
            'totalQty' => $movement->product?->stock_on_hand,
            'date' => $movement->movement_date?->toDateString(),
        ]);

        return response()->json(['restored' => true, 'movement' => $this->formatMovement($movement)]);
    }

    public function forceDeleteMovement(int $id): JsonResponse
    {
        $movement = $this->stockMovements->forceDelete($id);
        $movement->loadMissing('product');

        ActivityLog::record('trash.purge', "Permanently deleted {$this->typeLabel($movement)} {$this->changeText($movement)} for {$movement->product_name}", 'boxes', [
            'productId' => $movement->product?->code,
            'product' => $movement->product_name,
            'movementId' => $movement->id,
            'date' => $movement->movement_date?->toDateString(),
        ]);

        return response()->json(['deleted' => true]);
    }

    private function formatMovement(StockMovement $movement): array
    {
        return [
            'id' => $movement->id,
            'productId' => $movement->product?->code,
            'productName' => $movement->product?->name ?? $movement->product_name,
            'category' => $movement->product?->category ?? $movement->product_category,
            'productInTrash' => (bool) $movement->product?->trashed(),
            'withProduct' => (bool) $movement->deleted_with_product,
            'type' => $this->typeLabel($movement),
            'qty' => (int) $movement->qty,
            'change' => $this->change($movement),
            'variantName' => $movement->variant_name,
            'unitPrice' => $movement->unit_price !== null ? (float) $movement->unit_price : null,
            'date' => $movement->movement_date?->toDateString(),
            'notes' => $movement->notes,
            'recordedBy' => $movement->recorded_by,
            'deletedAt' => $movement->deleted_at?->toIso8601String(),
            'deletedBy' => $movement->deleted_by_name,
        ];
    }

    private function typeLabel(StockMovement $movement): string
    {
        if ($movement->is_adjustment) {
            return 'Adjustment';
        }

        return $movement->movement_type === 'in' ? 'Stock In' : 'Stock Out';
    }

    private function change(StockMovement $movement): int
    {
        return $movement->movement_type === 'in' ? (int) $movement->qty : -(int) $movement->qty;
    }

    private function changeText(StockMovement $movement): string
    {
        $change = $this->change($movement);

        return ($change >= 0 ? '+' : '−').abs($change);
    }
}
