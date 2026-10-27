<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Product;
use App\Models\StockMovement;
use App\Services\ProductPhotoService;
use App\Services\StockMovementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

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

    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'search' => ['nullable', 'string', 'max:200'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);
        $search = mb_strtolower(trim($filters['search'] ?? ''));
        $perPage = (int) ($filters['per_page'] ?? 50);

        $products = DB::table('products')
            ->whereNotNull('products.deleted_at')
            ->selectRaw(
                "'product' as kind, 'Product' as type, products.code as record_id,
                products.deleted_at as deleted_at, products.deleted_by_name as deleted_by,
                products.name as product_name, products.code as product_identifier,
                products.category as category, products.brand as brand,
                NULL as variant_name, NULL as movement_type, NULL as movement_label,
                0 as is_adjustment, products.stock_on_hand as qty, products.unit_cost as unit_price,
                products.deleted_at as movement_date, NULL as recorded_by, NULL as notes,
                1 as product_in_trash, 0 as with_product, 0 as product_missing"
            );

        $entries = DB::table('stock_movements')
            ->leftJoin('products', 'products.id', '=', 'stock_movements.product_id')
            ->whereNotNull('stock_movements.deleted_at')
            ->selectRaw(
                "'entry' as kind, 'Stock Entry' as type, stock_movements.id as record_id,
                stock_movements.deleted_at as deleted_at, stock_movements.deleted_by_name as deleted_by,
                COALESCE(products.name, stock_movements.product_name) as product_name,
                products.code as product_identifier,
                COALESCE(products.category, stock_movements.product_category) as category,
                NULL as brand, stock_movements.variant_name as variant_name,
                stock_movements.movement_type as movement_type,
                CASE WHEN stock_movements.is_adjustment = 1 THEN 'Adjustment'
                     WHEN stock_movements.movement_type = 'in' THEN 'Stock In'
                     ELSE 'Stock Out' END as movement_label,
                stock_movements.is_adjustment as is_adjustment, stock_movements.qty as qty,
                stock_movements.unit_price as unit_price, stock_movements.movement_date as movement_date,
                stock_movements.recorded_by as recorded_by, stock_movements.notes as notes,
                CASE WHEN products.deleted_at IS NOT NULL THEN 1 ELSE 0 END as product_in_trash,
                stock_movements.deleted_with_product as with_product,
                CASE WHEN products.id IS NULL THEN 1 ELSE 0 END as product_missing"
            );

        $records = $products->unionAll($entries);
        $query = DB::query()->fromSub($records, 'trash_records');
        if ($search !== '') {
            $like = '%'.$search.'%';
            $query->where(function ($filtered) use ($like): void {
                foreach ([
                    'type', 'record_id', 'deleted_at', 'deleted_by', 'product_name', 'product_identifier',
                    'category', 'brand', 'variant_name', 'movement_type', 'movement_label',
                    'qty', 'unit_price', 'movement_date', 'recorded_by', 'notes',
                ] as $column) {
                    $filtered->orWhereRaw("LOWER(COALESCE(CAST({$column} AS CHAR), '')) LIKE ?", [$like]);
                }
            });
        }

        $total = (clone $query)->count();
        $lastPage = max(1, (int) ceil($total / $perPage));
        $page = min((int) ($filters['page'] ?? 1), $lastPage);
        $rows = $query
            ->orderByDesc('deleted_at')
            ->orderBy('kind')
            ->orderByDesc('record_id')
            ->offset(($page - 1) * $perPage)
            ->limit($perPage)
            ->get();

        return response()->json([
            'records' => $rows->map(function ($row): array {
                $isProduct = $row->kind === 'product';
                $deletedAt = Carbon::parse($row->deleted_at);
                $movementLabel = $row->movement_label;
                $change = $row->movement_type === 'in' ? (int) $row->qty : -(int) $row->qty;

                return [
                    'kind' => $row->kind,
                    'id' => $row->record_id,
                    'type' => $row->type,
                    'date' => $deletedAt->toDateString(),
                    'productName' => $row->product_name,
                    'productId' => $row->product_identifier,
                    'category' => $row->category,
                    'variantName' => $row->variant_name,
                    'details' => $isProduct ? [
                        'brand' => $row->brand,
                        'stockOnHand' => (int) $row->qty,
                    ] : [
                        'movementType' => $movementLabel,
                        'quantity' => $change,
                        'unitPrice' => $row->unit_price !== null ? (float) $row->unit_price : null,
                        'movementDate' => $row->movement_date,
                        'recordedBy' => $row->recorded_by,
                        'notes' => $row->notes,
                    ],
                    'deletedBy' => $row->deleted_by,
                    'deletedAt' => $deletedAt->toIso8601String(),
                    'productInTrash' => (bool) $row->product_in_trash,
                    'productMissing' => (bool) $row->product_missing,
                    'withProduct' => (bool) $row->with_product,
                ];
            })->values(),
            'pagination' => [
                'page' => $page,
                'perPage' => $perPage,
                'lastPage' => $lastPage,
                'total' => $total,
            ],
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

    public function forceDeleteProduct(Request $request, string $code): JsonResponse
    {
        $this->confirmPassword($request);
        $product = Product::onlyTrashed()->where('code', $code)->firstOrFail();
        $image = $product->image;
        $entries = $this->stockMovements->forceDeleteProduct($product);
        // Remove a stored photo file too (links and old in-database photos need nothing).
        app(ProductPhotoService::class)->deleteIfStored($image);

        ActivityLog::record('trash.purge', "Permanently deleted product — {$product->name}; retained {$entries} historical stock entries", 'boxes', [
            'productId' => $product->code,
            'product' => $product->name,
            'retainedEntries' => $entries,
        ]);

        return response()->json(['deleted' => true, 'retainedEntries' => $entries]);
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

    public function forceDeleteMovement(Request $request, int $id): JsonResponse
    {
        $this->confirmPassword($request);
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

    private function confirmPassword(Request $request): void
    {
        $data = $request->validate([
            'current_password' => ['required', 'string'],
        ]);

        if (! Hash::check($data['current_password'], $request->user()->password)) {
            throw ValidationException::withMessages([
                'current_password' => 'Your current password is incorrect.',
            ]);
        }
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
