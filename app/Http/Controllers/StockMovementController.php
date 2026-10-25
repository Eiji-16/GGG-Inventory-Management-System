<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Product;
use App\Models\StockMovement;
use App\Services\ReorderPointService;
use App\Services\StockMovementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class StockMovementController extends Controller
{
    public function __construct(private readonly StockMovementService $stockMovements)
    {
    }

    /** GET /api/stock-movements */
    public function index(): JsonResponse
    {
        $movements = StockMovement::with('product:id,code,name,category,stock_on_hand,deleted_at')
            ->orderByDesc('movement_date')
            ->orderByDesc('id')
            ->get();

        return response()->json($movements->map(fn (StockMovement $movement) => $this->format($movement)));
    }

    /** GET /api/stock-activities */
    public function activities(Request $request): JsonResponse
    {
        $logs = ActivityLog::query()
            ->with('user:id,name')
            ->where('action', 'like', 'stock.%')
            ->when($request->filled('productId'), function ($query) use ($request) {
                $productId = $request->query('productId');
                $query->where(function ($productQuery) use ($productId) {
                    $productQuery->where('meta->productId', $productId)
                        ->orWhere('meta->previousProductId', $productId);
                });
            })
            ->latest()
            ->limit(200)
            ->get();

        return response()->json($logs->map(fn (ActivityLog $log) => [
            'id' => $log->id,
            'action' => $log->action,
            'description' => $log->description,
            'userName' => $log->user?->name,
            'meta' => $log->meta ?? [],
            'createdAt' => $log->created_at?->toIso8601String(),
        ]));
    }

    /** POST /api/stock-movements */
    public function store(Request $request): JsonResponse
    {
        $data = $this->validatedMovement($request, false);
        $this->assertVariantBelongsToProduct($data);
        // Recorded By always comes from the signed-in account, never the form.
        $data['recordedBy'] = $this->recorderName($request);
        $stockBefore = $this->currentStockFor($data);
        $movement = $this->stockMovements->create($data);
        // Stock came in: any open restock request (Staff "Notify") for this
        // product is answered, so close it.
        if ($movement->movement_type === 'in' && ! $movement->is_adjustment) {
            \App\Models\RestockRequest::closeForProduct($movement->product_id, $request->user()?->id);
        }
        $this->recordMovementActivity($movement->mergedFromQty !== null ? 'merge' : 'add', $movement);
        $this->recordSafetyCrossing($movement, $stockBefore);

        $body = $this->format($movement);
        if ($movement->mergedFromQty !== null) {
            // Tells the screen this was added to an existing same-day entry.
            $body['merged'] = true;
            $body['mergedFromQty'] = $movement->mergedFromQty;
            $body['addedQty'] = $movement->mergedAddedQty;
        }

        return response()->json($body, 201);
    }

    /** PUT/PATCH /api/stock-movements/{stockMovement} */
    public function update(Request $request, StockMovement $stockMovement): JsonResponse
    {
        // Details-only edit: keep quantity, type and balances; update the rest.
        if ($request->boolean('detailsOnly')) {
            $data = $request->validate([
                'variantName' => ['nullable', 'string', 'max:255'],
                'notes'       => ['nullable', 'string', 'max:255'],
                'recordedBy'  => ['nullable', 'string', 'max:255'],
                'unitPrice'   => ['nullable', 'numeric', 'min:0', 'max:9999999999'],
            ]);
            $this->assertVariantBelongsToProduct(
                ['productId' => $stockMovement->product?->code, 'variantName' => $data['variantName'] ?? null],
                $stockMovement->variant_name
            );
            $stockMovement->update([
                'variant_name' => $data['variantName'] ?? null,
                'notes'        => $data['notes'] ?? null,
                'recorded_by'  => $stockMovement->recorded_by ?: $this->recorderName($request),
                'unit_price'   => $data['unitPrice'] ?? null,
            ]);
            $movement = $stockMovement->fresh()->loadMissing('product');
            ActivityLog::record('stock.edit', "Updated details of {$movement->product_name} movement", 'boxes', [
                'productId'  => $movement->product?->code,
                'product'    => $movement->product_name,
                'movementId' => $movement->id,
                'type'       => $movement->is_adjustment ? 'Adjustment' : ($movement->movement_type === 'in' ? 'Stock In' : 'Stock Out'),
                'date'       => $movement->movement_date?->toDateString(),
            ]);

            return response()->json($this->format($movement));
        }

        $before = $this->activitySnapshot($stockMovement->loadMissing('product'));
        $data = $this->validatedMovement($request, true);
        $this->assertVariantBelongsToProduct($data, $stockMovement->variant_name);
        // Keep who originally recorded the row (audit trail); fill it from the
        // signed-in account only when an older row has none.
        $data['recordedBy'] = $stockMovement->recorded_by ?: $this->recorderName($request);
        $stockBefore = $this->currentStockFor($data);
        $movement = $this->stockMovements->replace($stockMovement, $data);
        $this->recordMovementActivity('edit', $movement, $before);
        $this->recordSafetyCrossing($movement, $stockBefore);

        return response()->json($this->format($movement));
    }

    /** DELETE /api/stock-movements/{stockMovement} */
    public function destroy(StockMovement $stockMovement): JsonResponse
    {
        $before = $this->activitySnapshot($stockMovement->loadMissing('product'));
        $this->stockMovements->delete($stockMovement);
        $currentTotal = Product::where('code', $before['productId'])->value('stock_on_hand');
        ActivityLog::record(
            'stock.delete',
            "Deleted {$before['type']} {$before['changeText']} for {$before['product']}",
            'boxes',
            [
                'productId' => $before['productId'],
                'product' => $before['product'],
                'movementId' => $before['movementId'],
                'type' => $before['type'],
                'change' => $before['change'],
                'qty' => $before['qty'],
                'totalQty' => $currentTotal,
                'date' => $before['date'],
            ]
        );

        return response()->json(['deleted' => true]);
    }

    /** DELETE /api/stock-movements/products/{productCode} */
    public function clearProduct(string $productCode): JsonResponse
    {
        $product = Product::where('code', $productCode)->firstOrFail();
        $productName = $product->name;
        $previousStock = (int) $product->stock_on_hand;
        $movementCount = $this->stockMovements->clearProductStock($product);

        ActivityLog::record(
            'stock.clear',
            "Cleared stock for {$productName} ({$previousStock} units)",
            'boxes',
            [
                'productId' => $productCode,
                'product' => $productName,
                'previousTotalQty' => $previousStock,
                'deletedMovements' => $movementCount,
                'totalQty' => 0,
            ]
        );

        return response()->json([
            'cleared' => true,
            'productId' => $productCode,
            'deletedMovements' => $movementCount,
            'totalQty' => 0,
        ]);
    }

    /**
     * READ-ONLY: the product's stock right before a save, so we can tell
     * whether the save crossed safety stock. Does not change any stock.
     */
    private function currentStockFor(array $data): ?int
    {
        $query = Product::query();
        ! empty($data['productId'])
            ? $query->where('code', $data['productId'])
            : $query->where('name', $data['productName'] ?? '');
        $stock = $query->value('stock_on_hand');

        return $stock === null ? null : (int) $stock;
    }

    /**
     * Safety-stock handler (warn, never block): when a save takes a product
     * from above its safety stock to at/below it — or to zero — record a
     * "fell below safety stock" activity so the owner sees who and when.
     */
    private function recordSafetyCrossing(StockMovement $movement, ?int $stockBefore): void
    {
        $product = $movement->product()->with(['safetyStock', 'supplier'])->first();
        if (! $product || $stockBefore === null) {
            return;
        }
        $points = app(ReorderPointService::class);
        $after = (int) $product->stock_on_hand;
        $safety = $points->safetyStock($product);
        $wentOut = $after <= 0 && $stockBefore > 0;
        $wentCritical = $after <= $safety && $stockBefore > $safety;
        if (! $wentOut && ! $wentCritical) {
            return;
        }

        ActivityLog::record(
            'stock.safety',
            $wentOut
                ? "{$product->name} is now out of stock"
                : "{$product->name} fell below safety stock ({$after} left, minimum {$safety})",
            'alert',
            [
                'productId' => $product->code,
                'product' => $product->name,
                'movementId' => $movement->id,
                'stockBefore' => $stockBefore,
                'totalQty' => $after,
                'safetyStock' => $safety,
                'reorderPoint' => $points->forProduct($product),
                'outOfStock' => $wentOut,
            ]
        );
    }

    /** Display name of the signed-in user, used for Recorded By. */
    private function recorderName(Request $request): ?string
    {
        $user = $request->user();

        return $user ? ($user->name ?: $user->email) : null;
    }

    private function recordMovementActivity(string $event, StockMovement $movement, ?array $before = null): void
    {
        $snapshot = $this->activitySnapshot($movement->loadMissing('product'));
        if ($event === 'merge') {
            // Log the amount just added, not the entry's new total.
            $sign = $movement->movement_type === 'in' ? 1 : -1;
            $snapshot['change'] = $sign * (int) $movement->mergedAddedQty;
            $snapshot['changeText'] = ($snapshot['change'] >= 0 ? '+' : '−').abs($snapshot['change']);
            $snapshot['qty'] = (int) $movement->mergedAddedQty;
        }
        $action = match ($event) {
            'edit' => 'stock.edit',
            default => $snapshot['change'] < 0 ? 'stock.out' : 'stock.in',
        };
        $previousChangeText = $before
            ? (($before['change'] >= 0 ? '+' : '−').abs($before['change']))
            : '—';
        $description = match ($event) {
            'edit' => "Updated {$snapshot['product']} movement: {$previousChangeText} → {$snapshot['changeText']}",
            'merge' => "{$snapshot['type']} {$snapshot['changeText']} for {$snapshot['product']} (added to the same day's entry, now "
                .($movement->movement_type === 'in' ? '+' : '−').(int) $movement->qty.')',
            default => "{$snapshot['type']} {$snapshot['changeText']} for {$snapshot['product']}",
        };

        ActivityLog::record($action, $description, 'boxes', [
            'productId' => $snapshot['productId'],
            'product' => $snapshot['product'],
            'movementId' => $snapshot['movementId'],
            'type' => $snapshot['type'],
            'change' => $snapshot['change'],
            'qty' => $snapshot['qty'],
            'totalQty' => $snapshot['totalQty'],
            'date' => $snapshot['date'],
            'previousChange' => $before['change'] ?? null,
            'previousType' => $before['type'] ?? null,
            'previousProductId' => $before['productId'] ?? null,
        ]);
    }

    private function activitySnapshot(StockMovement $movement): array
    {
        $change = $movement->movement_type === 'in' ? (int) $movement->qty : -(int) $movement->qty;

        return [
            'productId' => $movement->product?->code,
            'product' => $movement->product_name,
            'movementId' => $movement->id,
            'type' => $movement->is_adjustment
                ? 'Adjustment'
                : ($movement->movement_type === 'in' ? 'Stock In' : 'Stock Out'),
            'change' => $change,
            'changeText' => ($change >= 0 ? '+' : '−').abs($change),
            'qty' => (int) $movement->qty,
            'totalQty' => $movement->product?->stock_on_hand ?? $movement->remaining_stock,
            'date' => $movement->movement_date?->toDateString(),
        ];
    }

    private function validatedMovement(Request $request, bool $updating): array
    {
        $rules = [
            'productId'   => ['required_without:productName', 'nullable', 'string', Rule::exists('products', 'code')->whereNull('deleted_at')],
            'productName' => ['required_without:productId', 'nullable', 'string'],
            'type'        => ['required', 'in:Stock In,Stock Out,Adjustment,in,out'],
            'qty'         => ['required_unless:type,Adjustment', 'nullable', 'integer', 'min:1'],
            'countedStock'=> ['required_if:type,Adjustment', 'nullable', 'integer', 'min:0'],
            'variantName' => ['nullable', 'string', 'max:255'],
            'unitPrice'   => ['nullable', 'numeric', 'min:0', 'max:9999999999'],
            'notes'       => ['nullable', 'string', 'max:255'],
            'recordedBy'  => ['nullable', 'string', 'max:255'],
            // No future dates. "Today" is the shop's date (Philippines), not the server's UTC date.
            'date'        => [$updating ? 'sometimes' : 'nullable', 'date', 'before_or_equal:'.now(config('app.business_timezone', 'Asia/Manila'))->toDateString()],
        ];

        return $request->validate($rules, [
            'date.before_or_equal' => 'The date cannot be in the future.',
        ]);
    }

    /**
     * A variant must be one of the product's own variants (Add/Edit Product).
     * Skipped when the variant is blank, unchanged from the saved row (so old
     * entries stay editable), or the product has no variant list.
     */
    private function assertVariantBelongsToProduct(array $data, ?string $currentVariant = null): void
    {
        $variant = trim((string) ($data['variantName'] ?? ''));
        if ($variant === '' || mb_strtolower($variant) === mb_strtolower(trim((string) $currentVariant))) {
            return;
        }

        $product = ! empty($data['productId'])
            ? Product::where('code', $data['productId'])->first()
            : Product::where('name', $data['productName'] ?? '')->first();
        $defined = array_map(fn ($v) => mb_strtolower(trim((string) $v)), $product?->variants ?? []);
        if ($product === null || $defined === [] || in_array(mb_strtolower($variant), $defined, true)) {
            return;
        }

        throw \Illuminate\Validation\ValidationException::withMessages([
            'variantName' => "\"{$variant}\" is not a variant of {$product->name}. Add it in Products first, or pick one from the list.",
        ]);
    }

    /** Format the movement shape used by Stock Control. */
    private function format(StockMovement $movement): array
    {
        return [
            'id'             => $movement->id,
            'productId'      => $movement->product?->code,
            'date'           => $movement->movement_date?->toDateString(),
            // The product's CURRENT name/category, so a rename shows on every
            // row (the saved product_name is only a fallback for old rows).
            'productName'    => $movement->product?->name ?? $movement->product_name,
            'category'       => $movement->product?->category ?? $movement->product_category,
            // Product was deleted: the row stays as history, but can't be edited.
            'productDeleted' => (bool) $movement->product?->trashed(),
            'type'           => $movement->is_adjustment
                ? 'Adjustment'
                : ($movement->movement_type === 'in' ? 'Stock In' : 'Stock Out'),
            'qty'            => $movement->qty,
            'unitPrice'      => $movement->unit_price !== null ? (float) $movement->unit_price : null,
            'variance'       => $movement->is_adjustment
                ? ($movement->movement_type === 'in' ? (int) $movement->qty : -(int) $movement->qty)
                : null,
            'variantName'    => $movement->variant_name,
            'remainingStock' => $movement->remaining_stock,
            'totalQty'       => $movement->product?->stock_on_hand ?? $movement->remaining_stock,
            'notes'          => $movement->notes,
            'recordedBy'     => $movement->recorded_by,
        ];
    }
}
