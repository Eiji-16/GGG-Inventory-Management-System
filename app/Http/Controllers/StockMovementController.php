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
    private const PRICE_MESSAGES = [
        'unitPrice.required' => 'Enter the unit price: cost per unit for Stock In, selling price per unit for Stock Out.',
        'unitPrice.required_unless' => 'Enter the unit price: cost per unit for Stock In, selling price per unit for Stock Out.',
    ];

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

        $withProof = $this->movementIdsWithProof();

        return response()->json($movements->map(fn (StockMovement $movement) => $this->format($movement) + [
            'hasProof' => isset($withProof[$movement->id]),
        ]));
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
            // The delivery arrived, so the product is no longer "In Restock
            // Report, waiting for delivery" (Reorder List). Received already
            // did this; a Stock In from Stock Control now does it too.
            $code = Product::whereKey($movement->product_id)->value('code');
            if ($code) {
                \App\Models\AppSetting::query()->whereKey(self::restockReportKey($code))->delete();
            }
        }
        $this->recordMovementActivity(
            $movement->mergedFromQty !== null ? 'merge' : 'add',
            $movement,
            sourceMovementId: isset($data['sourceMovementId']) ? (int) $data['sourceMovementId'] : null
        );
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

    /*
     * ===== RECEIVED (Reorder List, 2026-11-03) =====
     * POST /api/reorder/receive — multipart form:
     *   productId, qty, unitPrice, date, notes, photo (optional),
     *   choice = suggested | custom | report, suggestedQty (optional)
     * The delivery is saved as a normal Stock In (same rules as Stock
     * Control, including the same-day merge) and the proof photo is kept on
     * the private disk in delivery-proofs/{movement id}/. Admins see it in
     * Recent Activity; the product's saved Restock Report quantity is done.
     */
    public function receive(Request $request): JsonResponse
    {
        $request->validate([
            // Optional since 2026-11-06: a delivery can be recorded without a picture.
            'photo' => ['nullable', 'file', 'image', 'mimes:jpg,jpeg,png,webp,gif', 'max:5120'],
            'choice' => ['nullable', 'in:suggested,custom,report'],
            'suggestedQty' => ['nullable', 'integer', 'min:0', 'max:9999'],
        ], [
            'photo.image' => 'The proof must be a picture (JPG, PNG, WEBP or GIF).',
            'photo.mimes' => 'The proof must be a picture (JPG, PNG, WEBP or GIF).',
            'photo.max' => 'The photo is too large. Use a picture up to 5 MB.',
        ]);
        $request->merge(['type' => 'Stock In', 'mergeSameDay' => true]);

        // A product with sizes/colours must say which one arrived (2026-11-07),
        // so the delivery counts toward that variant in Stock Control.
        $receivedProduct = Product::where('code', (string) $request->input('productId'))->first();
        if ($receivedProduct && ! empty($receivedProduct->variants) && trim((string) $request->input('variantName', '')) === '') {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'variantName' => "Choose which variant of {$receivedProduct->name} arrived.",
            ]);
        }

        $choice = $request->input('choice', 'custom');
        $suggested = $request->filled('suggestedQty') ? (int) $request->input('suggestedQty') : null;
        $note = trim((string) $request->input('notes', ''));
        $extra = array_filter([
            $suggested !== null ? "System suggested: {$suggested}" : null,
            match ($choice) {
                'suggested' => 'Used the system suggestion',
                'report' => 'Used the saved Restock Report quantity',
                default => 'Custom quantity',
            },
            $request->hasFile('photo') ? 'Proof photo attached' : null,
        ]);
        $request->merge(['notes' => mb_substr(implode('; ', array_filter([$note, ...$extra])), 0, 255)]);

        $response = $this->store($request);
        $body = $response->getData(true);
        $movementId = (int) ($body['id'] ?? 0);

        $path = null;
        $file = $request->file('photo');
        if ($file) {
            $extension = strtolower($file->guessExtension() ?: $file->getClientOriginalExtension() ?: 'jpg');
            $path = $file->storeAs(
                'delivery-proofs/'.$movementId,
                now()->format('Ymd-His').'-'.\Illuminate\Support\Str::random(6).'.'.$extension,
                'local'
            );
        }

        $product = Product::where('code', $request->input('productId'))->first();
        if ($product) {
            \App\Models\AppSetting::query()->whereKey(self::restockReportKey($product->code))->delete();
        }
        ActivityLog::record('stock.received', "Received {$request->input('qty')} × ".($product?->name ?? 'a product').($path ? ' (proof photo attached)' : ''), 'boxes', [
            'productId' => $product?->code,
            'product' => $product?->name,
            'movementId' => $movementId,
            'qty' => (int) $request->input('qty'),
            'suggestedQty' => $suggested,
            'choice' => $choice,
        ]);

        return response()->json($body + ['hasProof' => (bool) $path], 201);
    }

    /** GET /api/stock-movements/{stockMovement}/proof — newest proof photo. */
    public function proof(StockMovement $stockMovement)
    {
        $disk = \Illuminate\Support\Facades\Storage::disk('local');
        $files = collect($disk->files('delivery-proofs/'.$stockMovement->id))->sort()->values();
        abort_if($files->isEmpty(), 404, 'No proof photo for this entry.');

        return $disk->response($files->last(), null, [
            'Cache-Control' => 'private, max-age=600',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    /*
     * ===== SAVED RESTOCK REPORT QUANTITIES =====
     * "Save Report" keeps each product's final quantity (the owner's number)
     * in app_settings ("restock_report.{product code}"), so the Received
     * window can offer it. Received clears it again.
     */
    public static function restockReportKey(string $code): string
    {
        return 'restock_report.'.$code;
    }

    /** GET /api/restock-report — { "P-001": { qty, suggested, savedAt, savedBy } } */
    public function restockReport(): JsonResponse
    {
        $rows = \App\Models\AppSetting::query()->where('key', 'like', 'restock_report.%')->get(['key', 'value']);
        $saved = [];
        foreach ($rows as $row) {
            $value = json_decode((string) $row->value, true);
            if (is_array($value)) {
                $saved[substr($row->key, strlen('restock_report.'))] = $value;
            }
        }

        return response()->json($saved)->header('Cache-Control', 'no-store');
    }

    /** POST /api/restock-report — items: [{ productId, qty, suggested }] */
    public function saveRestockReport(Request $request): JsonResponse
    {
        $data = $request->validate([
            'items' => ['required', 'array', 'min:1', 'max:200'],
            'items.*.productId' => ['required', 'string', Rule::exists('products', 'code')->whereNull('deleted_at')],
            'items.*.qty' => ['required', 'integer', 'min:1', 'max:9999'],
            'items.*.suggested' => ['nullable', 'integer', 'min:0', 'max:9999'],
        ]);
        $by = mb_substr((string) ($request->user()?->name ?: $request->user()?->email), 0, 60);
        foreach ($data['items'] as $item) {
            \App\Models\AppSetting::put(self::restockReportKey($item['productId']), json_encode([
                'qty' => (int) $item['qty'],
                'suggested' => isset($item['suggested']) ? (int) $item['suggested'] : null,
                'savedAt' => now()->toDateString(),
                'savedBy' => $by,
            ]));
        }
        ActivityLog::record('restock.report', 'Saved a Restock Report for '.count($data['items']).' product'.(count($data['items']) === 1 ? '' : 's'), 'boxes', [
            'products' => array_column($data['items'], 'productId'),
        ]);

        return response()->json(['saved' => count($data['items'])]);
    }

    /** Movement ids that have a proof photo folder (one disk listing). */
    private function movementIdsWithProof(): array
    {
        try {
            $ids = [];
            foreach (\Illuminate\Support\Facades\Storage::disk('local')->directories('delivery-proofs') as $dir) {
                $ids[(int) basename($dir)] = true;
            }

            return $ids;
        } catch (\Throwable) {
            return [];
        }
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
                // Required on Stock In / Stock Out rows; older count corrections have no price.
                'unitPrice'   => [$stockMovement->is_adjustment ? 'nullable' : 'required', 'nullable', 'numeric', 'min:0', 'max:99999.99'],
            ], self::PRICE_MESSAGES);
            $this->assertVariantBelongsToProduct(
                ['productId' => $stockMovement->product?->code, 'variantName' => $data['variantName'] ?? null],
                $stockMovement->variant_name
            );
            // Checked save (2026-11-08): changing the variant may not make
            // any variant go below zero.
            $this->stockMovements->updateDetails($stockMovement, [
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

    /** DELETE /api/stock-movements/{stockMovement} — moves the entry to the Trash Bin. */
    public function destroy(Request $request, StockMovement $stockMovement): JsonResponse
    {
        $before = $this->activitySnapshot($stockMovement->loadMissing('product'));
        $this->stockMovements->delete($stockMovement, $request->user());
        $currentTotal = Product::where('code', $before['productId'])->value('stock_on_hand');
        ActivityLog::record(
            'stock.delete',
            "Moved {$before['type']} {$before['changeText']} for {$before['product']} to the Trash Bin",
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

        return response()->json(['deleted' => true, 'trashed' => true]);
    }

    /** DELETE /api/stock-movements/products/{productCode} — moves all its entries to the Trash Bin. */
    public function clearProduct(Request $request, string $productCode): JsonResponse
    {
        $product = Product::where('code', $productCode)->firstOrFail();
        $productName = $product->name;
        $previousStock = (int) $product->stock_on_hand;
        $movementCount = $this->stockMovements->clearProductStock($product, $request->user());

        ActivityLog::record(
            'stock.clear',
            "Cleared stock for {$productName} ({$previousStock} units, {$movementCount} entries moved to the Trash Bin)",
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

    private function recordMovementActivity(
        string $event,
        StockMovement $movement,
        ?array $before = null,
        ?int $sourceMovementId = null
    ): void
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
            'sourceMovementId' => $sourceMovementId,
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
            'sourceMovementId' => ['required_if:mergeSameDay,false', 'nullable', 'integer', 'min:1'],
            'mergeSameDay' => ['sometimes', 'boolean'],
            'type'        => ['required', 'in:Stock In,Stock Out,Adjustment,in,out'],
            // At most 4 digits (9,999); the screen asks to confirm 1,000 or more.
            'qty'         => ['required_unless:type,Adjustment', 'nullable', 'integer', 'min:1', 'max:9999'],
            'countedStock'=> ['required_if:type,Adjustment', 'nullable', 'integer', 'min:0'],
            'variantName' => ['nullable', 'string', 'max:255'],
            // Required for Stock In / Stock Out (0 is allowed); a count correction has no price.
            // At most 99,999.99 — the same limit as the calculator's money boxes (2026-11-10).
            'unitPrice'   => ['required_unless:type,Adjustment', 'nullable', 'numeric', 'min:0', 'max:99999.99'],
            'notes'       => ['nullable', 'string', 'max:255'],
            'recordedBy'  => ['nullable', 'string', 'max:255'],
            // No future dates. "Today" is the shop's date (Philippines), not the server's UTC date.
            'date'        => [$updating ? 'sometimes' : 'nullable', 'date', 'before_or_equal:'.now(config('app.business_timezone', 'Asia/Manila'))->toDateString()],
        ];

        return $request->validate($rules, [
            'date.before_or_equal' => 'The date cannot be in the future.',
            'qty.max' => 'The quantity can have at most 4 digits (up to 9,999).',
        ] + self::PRICE_MESSAGES);
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
            // When it was recorded (date + time) — Stock Control → History.
            'createdAt'      => $movement->created_at?->toIso8601String(),
        ];
    }
}
