<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Product;
use App\Models\SeasonalEvent;
use App\Models\StockMovement;
use App\Models\Supplier;
use App\Services\ProductPhotoService;
use App\Services\StockMovementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/**
 * Trash Bin — deleted products, stock entries, suppliers and seasonal events.
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
 * POST   /api/trash/suppliers/{id}/restore           restore a supplier
 * DELETE /api/trash/suppliers/{id}                   permanently delete a supplier
 * POST   /api/trash/seasonal-events/{id}/restore     restore a seasonal event
 * DELETE /api/trash/seasonal-events/{id}             permanently delete a seasonal event
 * POST   /api/trash/bulk                             restore / delete several at once
 * DELETE /api/trash                                  empty the whole Trash Bin (password)
 */
class TrashBinController extends Controller
{
    public function __construct(private readonly StockMovementService $stockMovements)
    {
    }

    /** The kinds of things that can be in the Trash Bin (tab order on screen). */
    public const KINDS = ['product', 'entry', 'supplier', 'event'];

    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'search' => ['nullable', 'string', 'max:200'],
            'kind' => ['nullable', 'string', 'in:all,'.implode(',', self::KINDS)],
            'deleted_by' => ['nullable', 'string', 'max:255'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);
        $search = mb_strtolower(trim($filters['search'] ?? ''));
        $kind = $filters['kind'] ?? 'all';
        $deletedBy = $filters['deleted_by'] ?? null;
        $perPage = (int) ($filters['per_page'] ?? 50);

        $all = $this->allRecords();

        // Counts per tab and the people who deleted things (for the filters),
        // worked out before the tab/search filters so the tabs show totals.
        $counts = array_fill_keys(self::KINDS, 0);
        foreach ($all as $record) {
            $counts[$record['kind']]++;
        }
        $deleters = $all->pluck('deletedBy')->filter()->unique()->sort()->values();

        $filtered = $all
            ->when($kind !== 'all', fn ($records) => $records->where('kind', $kind))
            ->when($deletedBy, fn ($records) => $records->where('deletedBy', $deletedBy))
            ->when($search !== '', fn ($records) => $records->filter(
                fn (array $record) => str_contains($record['_search'], $search)
            ))
            ->sortByDesc(fn (array $record) => $record['deletedAt'].'|'.str_pad((string) $record['id'], 12, '0', STR_PAD_LEFT))
            ->values();

        $total = $filtered->count();
        $lastPage = max(1, (int) ceil($total / $perPage));
        $page = min((int) ($filters['page'] ?? 1), $lastPage);

        return response()->json([
            'records' => $filtered->slice(($page - 1) * $perPage, $perPage)
                ->map(function (array $record): array {
                    unset($record['_search']);

                    return $record;
                })->values(),
            'counts' => $counts + ['all' => array_sum($counts)],
            'deleters' => $deleters,
            'pagination' => [
                'page' => $page,
                'perPage' => $perPage,
                'lastPage' => $lastPage,
                'total' => $total,
            ],
        ])->header('Cache-Control', 'no-store');
    }

    /** Everything in the Trash Bin, as one list of plain records. */
    private function allRecords(): \Illuminate\Support\Collection
    {
        $records = collect();
        $now = now();
        $base = function (string $kind, string $type, $id, $deletedAt, ?string $deletedBy, string $name) use ($now): array {
            $at = Carbon::parse($deletedAt);

            return [
                'kind' => $kind,
                'id' => $id,
                'type' => $type,
                'date' => $at->toDateString(),
                'productName' => $name,
                'deletedBy' => $deletedBy,
                'deletedAt' => $at->toIso8601String(),
                'daysInTrash' => (int) $at->copy()->startOfDay()->diffInDays($now->copy()->startOfDay()),
            ];
        };

        Product::onlyTrashed()->withoutPhoto()->with(['supplier' => fn ($q) => $q->withTrashed()])->get()
            ->each(function (Product $product) use ($records, $base): void {
                $records->push($base('product', 'Product', $product->code, $product->deleted_at, $product->deleted_by_name, $product->name) + [
                    'productId' => $product->code,
                    'category' => $product->category,
                    'variantName' => null,
                    'details' => [
                        'brand' => $product->brand,
                        'stockOnHand' => (int) $product->stock_on_hand,
                        'supplier' => $product->supplier?->name,
                        'supplierInTrash' => (bool) $product->supplier?->trashed(),
                    ],
                    'productInTrash' => true,
                    'productMissing' => false,
                    'withProduct' => false,
                    '_search' => mb_strtolower(implode(' ', ['product', $product->name, $product->code, $product->category, $product->brand, $product->deleted_by_name])),
                ]);
            });

        StockMovement::onlyTrashed()->with(['product' => fn ($q) => $q->withTrashed()->withoutPhoto()])->get()
            ->each(function (StockMovement $movement) use ($records, $base): void {
                $label = $this->typeLabel($movement);
                $name = $movement->product?->name ?? $movement->product_name;
                $records->push($base('entry', 'Stock Entry', $movement->id, $movement->deleted_at, $movement->deleted_by_name, (string) $name) + [
                    'productId' => $movement->product?->code,
                    'category' => $movement->product?->category ?? $movement->product_category,
                    'variantName' => $movement->variant_name,
                    'details' => [
                        'movementType' => $label,
                        'quantity' => $this->change($movement),
                        'unitPrice' => $movement->unit_price !== null ? (float) $movement->unit_price : null,
                        'movementDate' => $movement->movement_date?->toDateString(),
                        'recordedBy' => $movement->recorded_by,
                        'notes' => $movement->notes,
                    ],
                    'productInTrash' => (bool) $movement->product?->trashed(),
                    'productMissing' => $movement->product === null,
                    'withProduct' => (bool) $movement->deleted_with_product,
                    '_search' => mb_strtolower(implode(' ', ['stock entry', $name, $movement->product?->code, $label, $movement->movement_type, $movement->qty, $movement->movement_date?->toDateString(), $movement->recorded_by, $movement->notes, $movement->deleted_by_name, $movement->variant_name])),
                ]);
            });

        Supplier::onlyTrashed()->withCount(['products' => fn ($q) => $q->withTrashed()])->get()
            ->each(function (Supplier $supplier) use ($records, $base): void {
                $records->push($base('supplier', 'Supplier', $supplier->id, $supplier->deleted_at, $supplier->deleted_by_name, $supplier->name) + [
                    'productId' => null,
                    'category' => null,
                    'variantName' => null,
                    'details' => [
                        'company' => $supplier->company,
                        'contact' => $supplier->contact,
                        'leadTimeDays' => $supplier->lead_time_days,
                        'linkedProducts' => (int) $supplier->products_count,
                    ],
                    'productInTrash' => false,
                    'productMissing' => false,
                    'withProduct' => false,
                    '_search' => mb_strtolower(implode(' ', ['supplier', $supplier->name, $supplier->company, $supplier->contact, $supplier->deleted_by_name])),
                ]);
            });

        SeasonalEvent::onlyTrashed()->get()
            ->each(function (SeasonalEvent $event) use ($records, $base): void {
                $records->push($base('event', 'Seasonal Event', $event->id, $event->deleted_at, $event->deleted_by_name, $event->name) + [
                    'productId' => null,
                    'category' => null,
                    'variantName' => null,
                    'details' => [
                        'startDate' => $event->start_date?->toDateString(),
                        'endDate' => $event->end_date?->toDateString(),
                        'adjustmentPct' => (float) $event->adjustment_pct,
                        'scope' => $event->scope,
                    ],
                    'productInTrash' => false,
                    'productMissing' => false,
                    'withProduct' => false,
                    '_search' => mb_strtolower(implode(' ', ['seasonal event', $event->name, $event->start_date?->toDateString(), $event->end_date?->toDateString(), $event->deleted_by_name])),
                ]);
            });

        return $records;
    }

    /* ===== Suppliers ===== */

    public function restoreSupplier(int $id): JsonResponse
    {
        $supplier = Supplier::onlyTrashed()->findOrFail($id);
        $supplier->restore();
        $supplier->forceFill(['deleted_by' => null, 'deleted_by_name' => null])->save();
        ActivityLog::record('trash.restore', "Restored supplier from the Trash Bin — {$supplier->name}", 'users', ['supplier' => $supplier->name]);

        return response()->json(['restored' => true]);
    }

    public function forceDeleteSupplier(Request $request, int $id): JsonResponse
    {
        $this->confirmPassword($request);
        $this->purgeSupplier(Supplier::onlyTrashed()->findOrFail($id));

        return response()->json(['deleted' => true]);
    }

    private function purgeSupplier(Supplier $supplier): void
    {
        // Its products stay; they just no longer have a supplier.
        $unlinked = Product::withTrashed()->where('supplier_id', $supplier->id)->update(['supplier_id' => null]);
        $name = $supplier->name;
        $supplier->forceDelete();
        ActivityLog::record('trash.purge', "Permanently deleted supplier — {$name}; {$unlinked} product(s) now have no supplier", 'users', ['supplier' => $name, 'unlinkedProducts' => $unlinked]);
    }

    /* ===== Seasonal events ===== */

    public function restoreEvent(int $id): JsonResponse
    {
        $event = SeasonalEvent::onlyTrashed()->findOrFail($id);
        $event->restore();
        $event->forceFill(['deleted_by' => null, 'deleted_by_name' => null])->save();
        ActivityLog::record('trash.restore', "Restored seasonal event from the Trash Bin — {$event->name}", 'calendar', ['event' => $event->name]);

        return response()->json(['restored' => true]);
    }

    public function forceDeleteEvent(Request $request, int $id): JsonResponse
    {
        $this->confirmPassword($request);
        $this->purgeEvent(SeasonalEvent::onlyTrashed()->findOrFail($id));

        return response()->json(['deleted' => true]);
    }

    private function purgeEvent(SeasonalEvent $event): void
    {
        $name = $event->name;
        $event->forceDelete();
        ActivityLog::record('trash.purge', "Permanently deleted seasonal event — {$name}", 'calendar', ['event' => $name]);
    }

    /* ===== Several at once ===== */

    /**
     * POST /api/trash/bulk  { action: restore|purge, items: [{kind, id}], current_password? }
     * Restores parents first (suppliers → products → entries); deletes children
     * first. Each item is done on its own, so one refusal doesn't stop the rest.
     */
    public function bulk(Request $request): JsonResponse
    {
        $data = $request->validate([
            'action' => ['required', 'in:restore,purge'],
            'items' => ['required', 'array', 'min:1', 'max:500'],
            'items.*.kind' => ['required', 'in:'.implode(',', self::KINDS)],
            'items.*.id' => ['required'],
        ]);
        $feature = $data['action'] === 'restore' ? 'trash.restore' : 'trash.purge';
        abort_unless(\App\Services\RoleAccessService::allows($request->user(), $feature), 403, 'Your role does not have access to this feature. Ask the Super Admin to turn it on in Settings → Role Access.');
        if ($data['action'] === 'purge') {
            $this->confirmPassword($request);
        }

        $order = $data['action'] === 'restore'
            ? ['supplier' => 0, 'product' => 1, 'entry' => 2, 'event' => 3]
            : ['entry' => 0, 'product' => 1, 'supplier' => 2, 'event' => 3];
        $items = collect($data['items'])->sortBy(fn ($item) => $order[$item['kind']])->values();

        $done = 0;
        $failed = [];
        foreach ($items as $item) {
            try {
                $this->applyOne($request, $data['action'], $item['kind'], (string) $item['id']);
                $done++;
            } catch (\Illuminate\Database\Eloquent\ModelNotFoundException) {
                // Already restored or deleted (e.g. an entry that came back with its product).
                $done++;
            } catch (ValidationException $error) {
                $failed[] = ['kind' => $item['kind'], 'id' => $item['id'], 'message' => collect($error->errors())->flatten()->first()];
            } catch (\Throwable $error) {
                report($error);
                $failed[] = ['kind' => $item['kind'], 'id' => $item['id'], 'message' => 'Could not be processed.'];
            }
        }

        return response()->json(['done' => $done, 'failed' => $failed]);
    }

    /** DELETE /api/trash  { current_password } — permanently delete EVERYTHING in the Trash Bin. */
    public function empty(Request $request): JsonResponse
    {
        $this->confirmPassword($request);
        $before = $this->allRecords()->count();

        foreach (StockMovement::onlyTrashed()->where('deleted_with_product', false)->pluck('id') as $id) {
            $this->stockMovements->forceDelete((int) $id);
        }
        foreach (Product::onlyTrashed()->get() as $product) {
            $image = $product->image;
            $this->stockMovements->forceDeleteProduct($product);
            app(ProductPhotoService::class)->deleteIfStored($image);
        }
        foreach (StockMovement::onlyTrashed()->pluck('id') as $id) {   // anything left over
            $this->stockMovements->forceDelete((int) $id);
        }
        Supplier::onlyTrashed()->get()->each(fn (Supplier $supplier) => $this->purgeSupplier($supplier));
        SeasonalEvent::onlyTrashed()->get()->each(fn (SeasonalEvent $event) => $this->purgeEvent($event));

        ActivityLog::record('trash.empty', "Emptied the Trash Bin ({$before} items permanently deleted)", 'trash', ['items' => $before]);

        return response()->json(['deleted' => $before]);
    }

    private function applyOne(Request $request, string $action, string $kind, string $id): void
    {
        match ("{$action}:{$kind}") {
            'restore:product' => $this->restoreProduct($id),
            'restore:entry' => $this->restoreMovement((int) $id),
            'restore:supplier' => $this->restoreSupplier((int) $id),
            'restore:event' => $this->restoreEvent((int) $id),
            'purge:product' => $this->purgeProductQuietly($id),
            'purge:entry' => $this->purgeMovementQuietly((int) $id),
            'purge:supplier' => $this->purgeSupplier(Supplier::onlyTrashed()->findOrFail((int) $id)),
            'purge:event' => $this->purgeEvent(SeasonalEvent::onlyTrashed()->findOrFail((int) $id)),
        };
    }

    /* The single-item purge actions ask for the password themselves; in bulk
       it was already checked once, so these skip that step. */
    private function purgeProductQuietly(string $code): void
    {
        $product = Product::onlyTrashed()->where('code', $code)->firstOrFail();
        $image = $product->image;
        $entries = $this->stockMovements->forceDeleteProduct($product);
        app(ProductPhotoService::class)->deleteIfStored($image);
        ActivityLog::record('trash.purge', "Permanently deleted product — {$product->name}; retained {$entries} historical stock entries", 'boxes', [
            'productId' => $product->code, 'product' => $product->name, 'retainedEntries' => $entries,
        ]);
    }

    private function purgeMovementQuietly(int $id): void
    {
        $movement = $this->stockMovements->forceDelete($id);
        ActivityLog::record('trash.purge', "Permanently deleted {$this->typeLabel($movement)} {$this->changeText($movement)} for {$movement->product_name}", 'boxes', [
            'product' => $movement->product_name, 'movementId' => $movement->id,
        ]);
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

        // Safety check: a product whose supplier is also in the Trash Bin gets
        // its supplier back too, so it doesn't return without one.
        $supplier = $product->supplier_id ? Supplier::onlyTrashed()->find($product->supplier_id) : null;
        if ($supplier) {
            $supplier->restore();
            $supplier->forceFill(['deleted_by' => null, 'deleted_by_name' => null])->save();
            ActivityLog::record('trash.restore', "Restored supplier from the Trash Bin (with product {$product->name}) — {$supplier->name}", 'users', ['supplier' => $supplier->name]);
        }

        $entries = $this->stockMovements->restoreProduct($product);

        ActivityLog::record('trash.restore', "Restored product from the Trash Bin — {$product->name}", 'boxes', [
            'productId' => $product->code,
            'product' => $product->name,
            'restoredEntries' => $entries,
        ]);

        return response()->json(['restored' => true, 'restoredEntries' => $entries, 'restoredSupplier' => $supplier?->name]);
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
