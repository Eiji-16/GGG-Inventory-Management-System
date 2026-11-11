<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Product;
use App\Models\SeasonalEvent;
use App\Models\StockMovement;
use App\Models\Supplier;
use App\Models\User;
use App\Services\ProductPhotoService;
use App\Services\RoleAccessService;
use App\Services\StockMovementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Trash Bin and Archive — deleted products, accounts, stock entries,
 * suppliers and seasonal events.
 *
 * Deleting never erases anything right away: it moves the item here
 * (soft delete) with who deleted it and when. From here an allowed user
 * can restore it or move it to the Archive. Only a Super Admin can access
 * the Archive and permanently delete archived items.
 *
 * GET  /api/trash?space=trash|archive
 * POST /api/trash/bulk { space, action: restore|archive|purge, items }
 */
class TrashBinController extends Controller
{
    public function __construct(private readonly StockMovementService $stockMovements)
    {
    }

    /** The kinds of things that can be in the Trash Bin (tab order on screen). */
    public const KINDS = ['product', 'account', 'entry', 'supplier', 'event'];

    /**
     * False for an Admin with "Open Trash Bin and restore" (2026-11-11):
     * they see only Trash Bin items that are not accounts and can only
     * restore them. The Super Admin has full access.
     */
    private bool $fullAccess = true;

    private function setAccess(Request $request): void
    {
        $this->fullAccess = RoleAccessService::isSuperAdmin($request->user());
    }

    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'space' => ['nullable', 'in:trash,archive'],
            'search' => ['nullable', 'string', 'max:200'],
            'kind' => ['nullable', 'string', 'in:all,'.implode(',', self::KINDS)],
            'deleted_by' => ['nullable', 'string', 'max:255'],
            'archived_by' => ['nullable', 'string', 'max:255'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);
        $search = mb_strtolower(trim($filters['search'] ?? ''));
        $space = $filters['space'] ?? 'trash';
        $kind = $filters['kind'] ?? 'all';
        $this->setAccess($request);
        abort_if(! $this->fullAccess && $space === 'archive', 403, 'Only the Super Admin can open the Archive.');
        abort_if(! $this->fullAccess && $kind === 'account', 403, 'Only the Super Admin can see deleted accounts.');
        $actorFilter = $space === 'archive'
            ? ($filters['archived_by'] ?? null)
            : ($filters['deleted_by'] ?? null);
        $perPage = (int) ($filters['per_page'] ?? 50);

        $baseQueries = $this->recordQueries($space);
        $matchingQueries = $this->recordQueries($space, $search, $actorFilter);
        $counts = array_fill_keys(self::KINDS, 0);
        foreach ($baseQueries as $recordKind => $query) {
            $counts[$recordKind] = (clone $query)->count();
        }
        $total = 0;
        foreach ($matchingQueries as $recordKind => $query) {
            if ($kind === 'all' || $kind === $recordKind) {
                $total += (clone $query)->count();
            }
        }
        $lastPage = max(1, (int) ceil($total / $perPage));
        $page = min((int) ($filters['page'] ?? 1), $lastPage);
        $keys = $this->recordKeys($space, $search, $actorFilter, $kind, ($page - 1) * $perPage, $perPage);
        $idsByKind = $keys->groupBy('kind')->map(fn ($rows) => $rows->pluck('row_id')->all())->all();
        $recordMap = $this->allRecords($space, $search, $actorFilter, $idsByKind)
            ->keyBy(fn (array $record) => $record['kind'].'|'.$record['id']);
        $records = $keys->map(fn ($key) => $recordMap->get($key->kind.'|'.$key->public_id))
            ->filter()
            ->map(function (array $record): array {
                return $record;
            })->values();

        return response()->json([
            'records' => $records,
            'counts' => $counts + ['all' => array_sum($counts)],
            'deleters' => $this->actorNames($space),
            'pagination' => [
                'page' => $page,
                'perPage' => $perPage,
                'lastPage' => $lastPage,
                'total' => $total,
            ],
        ])->header('Cache-Control', 'no-store');
    }

    /** Fetch the globally ordered page keys before hydrating record details. */
    private function recordKeys(
        string $space,
        string $search,
        ?string $actorFilter,
        string $kind,
        int $offset,
        int $limit
    ): \Illuminate\Support\Collection {
        $queries = $this->recordQueries($space, $search, $actorFilter);
        $dateColumn = $space === 'archive' ? 'archived_at' : 'deleted_at';
        $kinds = $kind === 'all' ? array_keys($queries) : [$kind];
        $union = null;

        foreach ($kinds as $recordKind) {
            $source = (clone $queries[$recordKind])
                ->select('id as row_id')
                ->selectRaw(($recordKind === 'product' ? 'code' : 'id').' as public_id')
                ->selectRaw('? as kind', [$recordKind])
                ->selectRaw("{$dateColumn} as sort_at")
                ->toBase();
            $union = $union === null ? $source : $union->unionAll($source);
        }

        return DB::query()->fromSub($union, 'retention_records')
            ->orderByDesc('sort_at')
            ->orderByDesc('public_id')
            ->orderBy('kind')
            ->offset($offset)
            ->limit($limit)
            ->get(['kind', 'row_id', 'public_id']);
    }

    /** Hydrate only the requested page of record details. */
    private function allRecords(
        string $space = 'trash',
        string $search = '',
        ?string $actorFilter = null,
        array $idsByKind = []
    ): \Illuminate\Support\Collection
    {
        $records = collect();
        $queries = $this->recordQueries($space, $search, $actorFilter);
        $now = now();
        $base = function (string $kind, string $type, $id, $deletedAt, ?string $deletedBy, string $name, $archivedAt = null, ?string $archivedBy = null) use ($now): array {
            $at = Carbon::parse($deletedAt);
            $archived = $archivedAt ? Carbon::parse($archivedAt) : null;

            return [
                'kind' => $kind,
                'id' => $id,
                'type' => $type,
                'date' => $at->toDateString(),
                'productName' => $name,
                'deletedBy' => $deletedBy,
                'deletedAt' => $at->toIso8601String(),
                'daysInTrash' => (int) $at->copy()->startOfDay()->diffInDays($now->copy()->startOfDay()),
                'archivedAt' => $archived?->toIso8601String(),
                'daysInArchive' => $archived ? (int) $archived->copy()->startOfDay()->diffInDays($now->copy()->startOfDay()) : null,
                'archivedBy' => $archivedBy,
            ];
        };
        if (!empty($idsByKind['product'])) {
        (clone $queries['product'])->whereIn('id', $idsByKind['product'])->get()
            ->each(function (Product $product) use ($records, $base): void {
                $records->push($base('product', 'Product', $product->code, $product->deleted_at, $product->deleted_by_name, $product->name, $product->archived_at, $product->archived_by_name) + [
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
                ]);
            });
        }

        if (!empty($idsByKind['entry'])) {
        (clone $queries['entry'])->whereIn('id', $idsByKind['entry'])->get()
            ->each(function (StockMovement $movement) use ($records, $base): void {
                $label = $this->typeLabel($movement);
                $name = $movement->product?->name ?? $movement->product_name;
                $records->push($base('entry', 'Stock Entry', $movement->id, $movement->deleted_at, $movement->deleted_by_name, (string) $name, $movement->archived_at, $movement->archived_by_name) + [
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
                ]);
            });
        }

        if (!empty($idsByKind['supplier'])) {
        (clone $queries['supplier'])->whereIn('id', $idsByKind['supplier'])->get()
            ->each(function (Supplier $supplier) use ($records, $base): void {
                $records->push($base('supplier', 'Supplier', $supplier->id, $supplier->deleted_at, $supplier->deleted_by_name, $supplier->name, $supplier->archived_at, $supplier->archived_by_name) + [
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
                ]);
            });
        }

        if (!empty($idsByKind['event'])) {
        (clone $queries['event'])->whereIn('id', $idsByKind['event'])->get()
            ->each(function (SeasonalEvent $event) use ($records, $base): void {
                $records->push($base('event', 'Seasonal Event', $event->id, $event->deleted_at, $event->deleted_by_name, $event->name, $event->archived_at, $event->archived_by_name) + [
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
                ]);
            });
        }

        if (!empty($idsByKind['account'])) {
        (clone $queries['account'])->whereIn('id', $idsByKind['account'])->get()
            ->each(function (User $user) use ($records, $base): void {
                $role = match ($user->role) {
                    User::ROLE_SUPER_ADMIN => 'Super Admin',
                    User::ROLE_ADMIN => 'Admin',
                    default => 'Staff',
                };
                $records->push($base('account', 'Account', $user->id, $user->deleted_at, $user->deleted_by_name, $user->name, $user->archived_at, $user->archived_by_name) + [
                    'productId' => null,
                    'category' => null,
                    'variantName' => null,
                    'details' => [
                        'email' => $user->email,
                        'role' => $role,
                        'status' => ucfirst($user->status),
                        'department' => $user->department,
                    ],
                    'productInTrash' => false,
                    'productMissing' => false,
                    'withProduct' => false,
                ]);
            });
        }

        return $records;
    }

    /**
     * Build one SQL query per record type for counts and globally paged results.
     */
    private function recordQueries(string $space, string $search = '', ?string $actorFilter = null): array
    {
        $queries = [
            'product' => Product::onlyTrashed()->withoutPhoto()->with(['supplier' => fn ($query) => $query->withTrashed()]),
            'entry' => StockMovement::onlyTrashed()->with(['product' => fn ($query) => $query->withTrashed()->withoutPhoto()]),
            'supplier' => Supplier::onlyTrashed()->withCount(['products' => fn ($query) => $query->withTrashed()]),
            'event' => SeasonalEvent::onlyTrashed(),
            'account' => User::onlyTrashed(),
        ];
        if (! $this->fullAccess) {
            unset($queries['account']); // deleted accounts: Super Admin only
        }

        foreach ($queries as $kind => $query) {
            $query->when($space === 'archive', fn ($builder) => $builder->whereNotNull('archived_at'), fn ($builder) => $builder->whereNull('archived_at'));
            if ($actorFilter !== null && $actorFilter !== '') {
                $query->where($space === 'archive' ? 'archived_by_name' : 'deleted_by_name', $actorFilter);
            }
            if ($search !== '') {
                $this->applySearch($query, $kind, $search);
            }
        }

        return $queries;
    }

    private function applySearch(\Illuminate\Database\Eloquent\Builder $query, string $kind, string $search): void
    {
        $like = '%'.mb_strtolower($search).'%';
        $column = $kind === 'account' ? 'name' : match ($kind) {
            'product' => 'name',
            'entry' => 'product_name',
            'supplier' => 'name',
            default => 'name',
        };
        $query->where(function ($builder) use ($kind, $like, $column): void {
            $builder->whereRaw("LOWER({$column}) LIKE ?", [$like]);
            match ($kind) {
                'product' => $builder
                    ->orWhereRaw('LOWER(code) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(category) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(brand) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(model) LIKE ?', [$like]),
                'entry' => $builder
                    ->orWhereRaw('LOWER(product_category) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(movement_type) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(variant_name) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(recorded_by) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(notes) LIKE ?', [$like])
                    ->orWhereHas('product', fn ($product) => $product
                        ->whereRaw('LOWER(code) LIKE ?', [$like])
                        ->orWhereRaw('LOWER(name) LIKE ?', [$like])),
                'supplier' => $builder
                    ->orWhereRaw('LOWER(company) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(contact) LIKE ?', [$like]),
                'event' => $builder
                    ->orWhereRaw('LOWER(start_date) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(end_date) LIKE ?', [$like]),
                'account' => $builder
                    ->orWhereRaw('LOWER(email) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(role) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(status) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(department) LIKE ?', [$like]),
            };
            $builder->orWhereRaw('LOWER(deleted_by_name) LIKE ?', [$like])
                ->orWhereRaw('LOWER(archived_by_name) LIKE ?', [$like]);
        });
    }

    private function actorNames(string $space): \Illuminate\Support\Collection
    {
        $column = $space === 'archive' ? 'archived_by_name' : 'deleted_by_name';
        $names = collect();
        $tables = ['products', 'stock_movements', 'suppliers', 'seasonal_events', 'users'];
        if (! $this->fullAccess) {
            array_pop($tables); // no account names for an Admin
        }
        foreach ($tables as $table) {
            $names = $names->merge(DB::table($table)
                ->whereNotNull('deleted_at')
                ->when($space === 'archive', fn ($query) => $query->whereNotNull('archived_at'), fn ($query) => $query->whereNull('archived_at'))
                ->whereNotNull($column)
                ->distinct()
                ->pluck($column));
        }

        return $names->filter()->unique()->sort()->values();
    }

    /* ===== Suppliers ===== */

    public function restoreSupplier(int $id): JsonResponse
    {
        $supplier = Supplier::onlyTrashed()->findOrFail($id);
        $supplier->restore();
        $supplier->forceFill(['deleted_by' => null, 'deleted_by_name' => null, 'archived_at' => null, 'archived_by_name' => null])->save();
        ActivityLog::record('trash.restore', "Restored supplier to active records — {$supplier->name}", 'users', ['supplier' => $supplier->name]);

        return response()->json(['restored' => true]);
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
        $event->forceFill(['deleted_by' => null, 'deleted_by_name' => null, 'archived_at' => null, 'archived_by_name' => null])->save();
        ActivityLog::record('trash.restore', "Restored seasonal event to active records — {$event->name}", 'calendar', ['event' => $event->name]);

        return response()->json(['restored' => true]);
    }

    private function purgeEvent(SeasonalEvent $event): void
    {
        $name = $event->name;
        $event->forceDelete();
        ActivityLog::record('trash.purge', "Permanently deleted seasonal event — {$name}", 'calendar', ['event' => $name]);
    }

    /* ===== Several at once ===== */

    /**
     * POST /api/trash/bulk  { space: trash|archive, action: restore|archive|purge, items: [...] }
     * Restores parents first and deletes children first. Each item is processed
     * independently so one refusal doesn't stop the rest.
     */
    public function bulk(Request $request): JsonResponse
    {
        $data = $request->validate([
            'space' => ['required', 'in:trash,archive'],
            'action' => ['required', 'in:restore,archive,purge'],
            'items' => ['required', 'array', 'min:1', 'max:500'],
            'items.*.kind' => ['required', 'in:'.implode(',', self::KINDS)],
            'items.*.id' => ['required'],
        ]);
        $this->setAccess($request);
        if (! $this->fullAccess) {
            abort_unless($data['action'] === 'restore' && $data['space'] === 'trash', 403, 'Only the Super Admin can archive or permanently delete.');
            abort_if(collect($data['items'])->contains('kind', 'account'), 403, 'Only the Super Admin can restore accounts.');
        }
        abort_if($data['action'] === 'archive' && $data['space'] !== 'trash', 422, 'Only Trash Bin items can be archived.');
        abort_if($data['action'] === 'purge' && $data['space'] !== 'archive', 422, 'Only archived items can be permanently deleted.');
        $order = match ($data['action']) {
            'restore' => ['supplier' => 0, 'account' => 0, 'product' => 1, 'entry' => 2, 'event' => 3],
            'purge' => ['entry' => 0, 'product' => 1, 'supplier' => 2, 'event' => 3, 'account' => 4],
            default => ['supplier' => 0, 'product' => 1, 'entry' => 2, 'event' => 3, 'account' => 4],
        };
        $items = collect($data['items'])->sortBy(fn ($item) => $order[$item['kind']])->values();

        $done = 0;
        $failed = [];
        foreach ($items as $item) {
            try {
                $this->applyOne($request, $data['action'], $item['kind'], (string) $item['id']);
                $done++;
            } catch (\Illuminate\Database\Eloquent\ModelNotFoundException $error) {
                // Already processed (e.g. a movement archived/restored with its product).
                if ($data['action'] === 'restore') {
                    $done++;
                } else {
                    $failed[] = ['kind' => $item['kind'], 'id' => $item['id'], 'message' => $data['action'] === 'archive' ? 'The deleted item was not found.' : 'The archived item was not found.'];
                }
            } catch (ValidationException $error) {
                $failed[] = ['kind' => $item['kind'], 'id' => $item['id'], 'message' => collect($error->errors())->flatten()->first()];
            } catch (\Throwable $error) {
                report($error);
                $failed[] = ['kind' => $item['kind'], 'id' => $item['id'], 'message' => 'Could not be processed.'];
            }
        }

        return response()->json(['done' => $done, 'failed' => $failed]);
    }

    private function applyOne(Request $request, string $action, string $kind, string $id): void
    {
        match ("{$action}:{$kind}") {
            'restore:product' => $this->restoreProduct($id),
            'restore:entry' => $this->restoreMovement((int) $id),
            'restore:supplier' => $this->restoreSupplier((int) $id),
            'restore:event' => $this->restoreEvent((int) $id),
            'restore:account' => $this->restoreAccount((int) $id),
            'archive:product' => $this->archiveProduct($id, $request->user()),
            'archive:entry' => $this->archiveMovement((int) $id, $request->user()),
            'archive:supplier' => $this->archiveRecord(Supplier::onlyTrashed()->whereNull('archived_at')->findOrFail((int) $id), $request->user(), 'supplier'),
            'archive:event' => $this->archiveRecord(SeasonalEvent::onlyTrashed()->whereNull('archived_at')->findOrFail((int) $id), $request->user(), 'event'),
            'archive:account' => $this->archiveRecord(User::onlyTrashed()->whereNull('archived_at')->findOrFail((int) $id), $request->user(), 'account'),
            'purge:product' => $this->purgeProductQuietly($id),
            'purge:entry' => $this->purgeMovementQuietly((int) $id),
            'purge:supplier' => $this->purgeSupplier(Supplier::onlyTrashed()->whereNotNull('archived_at')->findOrFail((int) $id)),
            'purge:event' => $this->purgeEvent(SeasonalEvent::onlyTrashed()->whereNotNull('archived_at')->findOrFail((int) $id)),
            'purge:account' => $this->purgeAccount((int) $id),
        };
    }

    private function archiveRecord(Product|StockMovement|Supplier|SeasonalEvent|User $record, User $actor, string $kind): void
    {
        $record->forceFill([
            'archived_at' => now(),
            'archived_by_name' => $actor->name ?: $actor->email,
        ])->save();
        $name = $record instanceof StockMovement ? $record->product_name : $record->name;
        ActivityLog::record('trash.archive', "Moved {$kind} to the Archive — {$name}", 'archive', ['kind' => $kind, 'id' => $record->getKey()]);
    }

    private function archiveProduct(string $code, User $actor): void
    {
        $product = Product::onlyTrashed()->whereNull('archived_at')->where('code', $code)->firstOrFail();
        DB::transaction(function () use ($product, $actor): void {
            $this->archiveRecord($product, $actor, 'product');
            StockMovement::onlyTrashed()->where('product_id', $product->id)
                ->where('deleted_with_product', true)
                ->whereNull('archived_at')
                ->update(['archived_at' => now(), 'archived_by_name' => $actor->name ?: $actor->email]);
        });
    }

    private function archiveMovement(int $id, User $actor): void
    {
        $movement = StockMovement::onlyTrashed()->findOrFail($id);
        if ($movement->archived_at !== null) {
            return;
        }
        $this->archiveRecord($movement, $actor, 'stock entry');
    }

    private function restoreAccount(int $id): void
    {
        $account = User::onlyTrashed()->findOrFail($id);
        $account->restore();
        $account->forceFill([
            'status' => User::STATUS_ACTIVE,
            'deleted_by' => null,
            'deleted_by_name' => null,
            'archived_at' => null,
            'archived_by_name' => null,
        ])->save();
        ActivityLog::record('trash.restore', "Restored account from retention — {$account->name}", 'user', ['userId' => $account->id]);
    }

    private function purgeAccount(int $id): void
    {
        $account = User::onlyTrashed()->whereNotNull('archived_at')->findOrFail($id);
        $configuredSuperAdminEmail = config('auth.super_admin_email');
        $isSuperAdminAccount = $account->role === User::ROLE_SUPER_ADMIN
            || (is_string($configuredSuperAdminEmail)
                && $configuredSuperAdminEmail !== ''
                && hash_equals(strtolower($configuredSuperAdminEmail), strtolower($account->email)));
        if ($isSuperAdminAccount) {
            $anotherSuperAdminExists = User::query()
                ->where('status', User::STATUS_ACTIVE)
                ->where('id', '!=', $account->id)
                ->where(function ($query) use ($configuredSuperAdminEmail): void {
                    $query->where('role', User::ROLE_SUPER_ADMIN);
                    if (is_string($configuredSuperAdminEmail) && $configuredSuperAdminEmail !== '') {
                        $query->orWhereRaw('LOWER(email) = ?', [strtolower($configuredSuperAdminEmail)]);
                    }
                })
                ->exists();
            if (!$anotherSuperAdminExists) {
                throw ValidationException::withMessages(['account' => 'The last active Super Admin account cannot be permanently deleted.']);
            }
        }

        DB::transaction(function () use ($account): void {
            $actor = request()->user();
            $name = $account->name;
            if (config('session.driver') === 'database') {
                DB::table(config('session.table', 'sessions'))->where('user_id', $account->id)->delete();
            }
            DB::table('password_reset_tokens')->where('email', $account->email)->delete();
            DB::table('password_reset_otps')->where('email', $account->email)->delete();
            \App\Models\AppSetting::query()->whereKey($account->avatarSettingKey())->delete();
            $photo = $account->avatarPath();
            if ($photo) {
                \Illuminate\Support\Facades\Storage::disk('local')->delete($photo);
            }
            $account->forceDelete();
            ActivityLog::create([
                'user_id' => $actor?->id,
                'action' => 'staff.purge',
                'description' => "Permanently deleted account {$name} from the Archive.",
                'icon' => 'user',
                'meta' => ['deleted_user_id' => $account->id, 'deleted_user_email' => $account->email],
            ]);
        });
    }

    private function purgeProductQuietly(string $code): void
    {
        $product = Product::onlyTrashed()->whereNotNull('archived_at')->where('code', $code)->firstOrFail();
        $image = $product->image;
        $entries = $this->stockMovements->forceDeleteProduct($product);
        app(ProductPhotoService::class)->deleteIfStored($image);
        ActivityLog::record('trash.purge', "Permanently deleted product — {$product->name}; retained {$entries} historical stock entries", 'boxes', [
            'productId' => $product->code, 'product' => $product->name, 'retainedEntries' => $entries,
        ]);
    }

    private function purgeMovementQuietly(int $id): void
    {
        StockMovement::onlyTrashed()->whereNotNull('archived_at')->findOrFail($id);
        $movement = $this->stockMovements->forceDelete($id);
        ActivityLog::record('trash.purge', "Permanently deleted {$this->typeLabel($movement)} {$this->changeText($movement)} for {$movement->product_name}", 'boxes', [
            'productId' => $movement->product?->code,
            'product' => $movement->product_name,
            'movementId' => $movement->id,
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

        // A removed supplier linked to this product returns with the product.
        $supplier = $product->supplier_id ? Supplier::onlyTrashed()->find($product->supplier_id) : null;
        if ($supplier) {
            $supplier->restore();
            $supplier->forceFill(['deleted_by' => null, 'deleted_by_name' => null, 'archived_at' => null, 'archived_by_name' => null])->save();
            ActivityLog::record('trash.restore', "Restored supplier with product {$product->name} — {$supplier->name}", 'users', ['supplier' => $supplier->name]);
        }

        $entries = $this->stockMovements->restoreProduct($product);

        ActivityLog::record('trash.restore', "Restored product to active records — {$product->name}", 'boxes', [
            'productId' => $product->code,
            'product' => $product->name,
            'restoredEntries' => $entries,
        ]);

        return response()->json(['restored' => true, 'restoredEntries' => $entries, 'restoredSupplier' => $supplier?->name]);
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
