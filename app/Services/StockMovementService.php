<?php

namespace App\Services;

use App\Models\Product;
use App\Models\SalesHistory;
use App\Models\StockMovement;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class StockMovementService
{
    public function create(array $data): StockMovement
    {
        return DB::transaction(function () use ($data) {
            $product = $this->findProduct($data);
            if (isset($data['sourceMovementId'])) {
                $sourceMovement = StockMovement::query()
                    ->lockForUpdate()
                    ->find($data['sourceMovementId']);
                $requestedVariant = mb_strtolower(trim((string) ($data['variantName'] ?? '')));
                $sourceVariant = mb_strtolower(trim((string) $sourceMovement?->variant_name));

                if (
                    ! $sourceMovement
                    || $sourceMovement->product_id !== $product->id
                    || $sourceVariant !== $requestedVariant
                ) {
                    throw ValidationException::withMessages([
                        'sourceMovementId' => 'The selected stock movement no longer matches this product and variant. Refresh the stock list and try again.',
                    ]);
                }
            }

            $currentStock = (int) $product->stock_on_hand;
            // No date sent: use the shop's today (Philippines), not the server's UTC date.
            $date = $data['date'] ?? now(config('app.business_timezone', 'Asia/Manila'))->toDateString();
            $lowestBefore = $this->historyLow($product)['min'];
            $adjustmentBaseline = $data['type'] === 'Adjustment'
                ? $this->balanceBeforeDate($product, $date, $currentStock)
                : null;

            [$type, $qty, $isAdjustment, $delta] = $this->movementValues($data, $adjustmentBaseline);
            $newStock = $currentStock + $delta;
            $this->ensureNonNegative($newStock);

            // Same product + same day + same action = one row: a Stock In /
            // Stock Out that matches an existing entry (same product, type, date,
            // variant and unit price) is added to that entry instead of creating
            // a second row. Corrections (Adjustment) set a counted total, so
            // they never merge.
            $sameDayEntry = $isAdjustment || ($data['mergeSameDay'] ?? true) === false
                ? null
                : $this->findSameDayEntry($product, $type, $date, $data);
            if ($sameDayEntry) {
                $previousQty = (int) $sameDayEntry->qty;
                $sameDayEntry->qty = $previousQty + $qty;
                $sameDayEntry->notes = $this->mergeNotes($sameDayEntry->notes, $data['notes'] ?? null);
                $sameDayEntry->save();

                $product->update(['stock_on_hand' => $newStock]);
                $this->assertHistoryNotNegative($product, $this->reconcileMovementBalances($product), $lowestBefore, $type === 'out' ? $qty : null, $date);
                $this->syncSalesFromMovements($product);

                $merged = $sameDayEntry->fresh();
                $merged->mergedFromQty = $previousQty;
                $merged->mergedAddedQty = $qty;

                return $merged;
            }

            $movement = StockMovement::create([
                'product_id' => $product->id,
                'product_name' => $product->name,
                'product_category' => $product->category,
                'movement_type' => $type,
                'is_adjustment' => $isAdjustment,
                'qty' => $qty,
                'unit_price' => $data['unitPrice'] ?? null,
                'variant_name' => $data['variantName'] ?? null,
                'remaining_stock' => $newStock,
                'notes' => $data['notes'] ?? null,
                'recorded_by' => $data['recordedBy'] ?? null,
                'movement_date' => $date,
            ]);

            $product->update(['stock_on_hand' => $newStock]);
            $this->assertHistoryNotNegative($product, $this->reconcileMovementBalances($product), $lowestBefore, ! $isAdjustment && $type === 'out' ? $qty : null, $date);
            $this->syncSalesFromMovements($product);
            if (! $isAdjustment) {
                $movement->update(['remaining_stock' => $newStock]);
            }

            return $movement->fresh();
        });
    }

    public function replace(StockMovement $existingMovement, array $data): StockMovement
    {
        return DB::transaction(function () use ($existingMovement, $data) {
            $movement = StockMovement::query()
                ->lockForUpdate()
                ->findOrFail($existingMovement->id);
            $oldProduct = Product::query()
                ->lockForUpdate()
                ->findOrFail($movement->product_id);

            $oldDelta = $this->deltaFor($movement);
            $newProduct = $this->findProduct($data);
            $oldLowestBefore = $this->historyLow($oldProduct)['min'];
            $newLowestBefore = $newProduct->id === $oldProduct->id ? $oldLowestBefore : $this->historyLow($newProduct)['min'];

            if ($newProduct->id === $oldProduct->id) {
                $newProduct = $oldProduct;
                // An edit enters the new change to apply to today's stock; the
                // previous row amount becomes part of the opening balance.
                $stockBeforeReplacement = (int) $oldProduct->stock_on_hand;
            } else {
                $oldProduct->stock_on_hand = (int) $oldProduct->stock_on_hand - $oldDelta;
                $oldProduct->save();
                $stockBeforeReplacement = (int) $newProduct->stock_on_hand;
            }

            $date = $data['date'] ?? $movement->movement_date->toDateString();
            $adjustmentBaseline = $data['type'] === 'Adjustment'
                ? $this->balanceBeforeDate(
                    $newProduct,
                    $date,
                    $stockBeforeReplacement,
                    $newProduct->id === $oldProduct->id ? $movement->id : null,
                    $movement->id
                )
                : null;

            [$type, $qty, $isAdjustment, $delta] = $this->movementValues($data, $adjustmentBaseline);
            $newStock = $stockBeforeReplacement + $delta;
            $this->ensureNonNegative($newStock);

            $movement->fill([
                'product_id' => $newProduct->id,
                'product_name' => $newProduct->name,
                'product_category' => $newProduct->category,
                'movement_type' => $type,
                'is_adjustment' => $isAdjustment,
                'qty' => $qty,
                'unit_price' => $data['unitPrice'] ?? null,
                'variant_name' => $data['variantName'] ?? null,
                'notes' => $data['notes'] ?? null,
                'recorded_by' => $data['recordedBy'] ?? null,
                'movement_date' => $date,
            ]);
            $movement->save();

            $newProduct->update(['stock_on_hand' => $newStock]);
            $this->assertHistoryNotNegative($oldProduct, $this->reconcileMovementBalances($oldProduct), $oldLowestBefore);
            if ($oldProduct->id !== $newProduct->id) {
                $this->assertHistoryNotNegative($newProduct, $this->reconcileMovementBalances($newProduct), $newLowestBefore);
            }
            $this->syncSalesFromMovements($oldProduct);
            if ($oldProduct->id !== $newProduct->id) {
                $this->syncSalesFromMovements($newProduct);
            }

            return $movement->fresh();
        });
    }

    /**
     * Move one entry to the Trash Bin. The stock goes back to what it was
     * before that entry (same as before), but the row is kept so it can be
     * restored. Trashed rows are skipped by every normal query.
     */
    public function delete(StockMovement $existingMovement, ?User $deletedBy = null): void
    {
        DB::transaction(function () use ($existingMovement, $deletedBy) {
            $movement = StockMovement::query()
                ->lockForUpdate()
                ->findOrFail($existingMovement->id);
            $product = Product::query()
                ->lockForUpdate()
                ->findOrFail($movement->product_id);
            $newStock = (int) $product->stock_on_hand - $this->deltaFor($movement);
            $this->ensureNonNegative($newStock);
            $lowestBefore = $this->historyLow($product)['min'];

            $movement->forceFill($this->deletedByColumns($deletedBy) + ['deleted_with_product' => false])->save();
            $movement->delete();
            $product->update(['stock_on_hand' => $newStock]);
            $this->assertHistoryNotNegative($product, $this->reconcileMovementBalances($product), $lowestBefore);
            $this->syncSalesFromMovements($product);
        });
    }

    /** "Clear stock": move ALL of a product's entries to the Trash Bin and set its stock to 0. */
    public function clearProductStock(Product $existingProduct, ?User $deletedBy = null): int
    {
        return DB::transaction(function () use ($existingProduct, $deletedBy) {
            $product = Product::query()
                ->lockForUpdate()
                ->findOrFail($existingProduct->id);

            $movementCount = $product->stockMovements()->count();
            $product->stockMovements()->update($this->deletedByColumns($deletedBy) + [
                'deleted_at' => now(),
                'deleted_with_product' => false,
            ]);
            $product->update(['stock_on_hand' => 0]);
            // Its monthly sales came from those entries, so clear them too
            // (they were left behind before, and still showed on the Dashboard).
            $this->syncSalesFromMovements($product);

            return $movementCount;
        });
    }

    /* ===================== TRASH BIN ===================== */

    /**
     * Bring one entry back from the Trash Bin. Its quantity is applied to the
     * stock again (a restored Stock In adds, a restored Stock Out subtracts)
     * and every "Balance After" is recalculated. Refused if the product is
     * itself in the Trash Bin, or if it would make the stock go below zero.
     */
    public function restore(int $movementId): StockMovement
    {
        return DB::transaction(function () use ($movementId) {
            $movement = StockMovement::onlyTrashed()->lockForUpdate()->findOrFail($movementId);
            $product = $movement->product_id === null
                ? null
                : Product::withTrashed()->lockForUpdate()->find($movement->product_id);

            if ($product === null) {
                throw ValidationException::withMessages([
                    'product' => "{$movement->product_name} no longer exists. This historical stock entry cannot be restored.",
                ]);
            }

            if ($product->trashed()) {
                throw ValidationException::withMessages([
                    'product' => "{$product->name} is in the Trash Bin. Restore the product first.",
                ]);
            }

            $lowestBefore = $this->historyLow($product)['min'];
            $newStock = (int) $product->stock_on_hand + $this->deltaFor($movement);
            if ($newStock < 0) {
                throw ValidationException::withMessages([
                    'qty' => "Restoring this entry would make {$product->name}'s stock go below zero ({$newStock}). Record the missing Stock In first.",
                ]);
            }

            $movement->restore();
            $movement->forceFill(['deleted_by' => null, 'deleted_by_name' => null, 'deleted_with_product' => false])->save();
            $product->update(['stock_on_hand' => $newStock]);
            $this->assertHistoryNotNegative($product, $this->reconcileMovementBalances($product), $lowestBefore);
            $this->syncSalesFromMovements($product);

            return $movement->fresh();
        });
    }

    /** Erase one entry from the Trash Bin for good. Stock is not changed (it was already taken out). */
    public function forceDelete(int $movementId): StockMovement
    {
        return DB::transaction(function () use ($movementId) {
            $movement = StockMovement::onlyTrashed()->lockForUpdate()->findOrFail($movementId);
            $copy = $movement->replicate();
            $copy->id = $movement->id;
            $movement->forceDelete();

            return $copy;
        });
    }

    /**
     * Move a product to the Trash Bin together with all of its active stock
     * entries. Its stock number is left as it is, so restoring the product
     * later brings everything back exactly as it was.
     */
    public function trashProduct(Product $existingProduct, ?User $deletedBy = null): int
    {
        return DB::transaction(function () use ($existingProduct, $deletedBy) {
            $product = Product::query()->lockForUpdate()->findOrFail($existingProduct->id);
            $columns = $this->deletedByColumns($deletedBy);

            $entryCount = $product->stockMovements()->count();
            $product->stockMovements()->update($columns + [
                'deleted_at' => now(),
                'deleted_with_product' => true,
            ]);

            $product->forceFill($columns)->save();
            $product->delete();
            // Its saved monthly sales are kept (nothing is erased); screens
            // skip products in the Trash Bin, and a restore recalculates them.

            return $entryCount;
        });
    }

    /** Bring a product back from the Trash Bin with the entries that went there with it. */
    public function restoreProduct(Product $trashedProduct): int
    {
        return DB::transaction(function () use ($trashedProduct) {
            $product = Product::onlyTrashed()->lockForUpdate()->findOrFail($trashedProduct->id);

            $product->restore();
            $product->forceFill(['deleted_by' => null, 'deleted_by_name' => null])->save();

            $entryCount = StockMovement::onlyTrashed()
                ->where('product_id', $product->id)
                ->where('deleted_with_product', true)
                ->update([
                    'deleted_at' => null,
                    'deleted_by' => null,
                    'deleted_by_name' => null,
                    'deleted_with_product' => false,
                ]);

            $this->reconcileMovementBalances($product);
            $this->syncSalesFromMovements($product);

            return $entryCount;
        });
    }

    /**
     * Erase a product and its product-only records. Historical stock entries
     * and sales records are preserved with a null product reference by their
     * database foreign keys.
     */
    public function forceDeleteProduct(Product $trashedProduct): int
    {
        return DB::transaction(function () use ($trashedProduct) {
            $product = Product::onlyTrashed()->lockForUpdate()->findOrFail($trashedProduct->id);

            $entryCount = StockMovement::withTrashed()->where('product_id', $product->id)->count();
            $product->forceDelete();

            return $entryCount;
        });
    }

    /** @return array{deleted_by: ?int, deleted_by_name: ?string} */
    private function deletedByColumns(?User $user): array
    {
        return [
            'deleted_by' => $user?->id,
            'deleted_by_name' => $user ? ($user->name ?: $user->email) : null,
        ];
    }

    /**
     * The existing entry a new Stock In / Stock Out should be added to, if any:
     * same product, same direction, same date, same variant (ignoring case and
     * spaces; blank = none) and same unit price (blank = none).
     */
    private function findSameDayEntry(Product $product, string $type, string $date, array $data): ?StockMovement
    {
        $variant = mb_strtolower(trim((string) ($data['variantName'] ?? '')));
        $price = $data['unitPrice'] ?? null;
        $price = ($price === null || $price === '') ? null : round((float) $price, 2);

        $query = StockMovement::query()
            ->where('product_id', $product->id)
            ->where('movement_type', $type)
            ->where('is_adjustment', false)
            ->whereDate('movement_date', $date)
            ->whereRaw("LOWER(TRIM(COALESCE(variant_name, ''))) = ?", [$variant]);

        $price === null
            ? $query->whereNull('unit_price')
            : $query->where('unit_price', $price);

        return $query->orderByDesc('id')->lockForUpdate()->first();
    }

    /** Keep the old note and add the new one after it (skipping repeats). */
    private function mergeNotes(?string $old, ?string $new): ?string
    {
        $old = trim((string) $old);
        $new = trim((string) $new);
        if ($new === '' || mb_strtolower($new) === mb_strtolower($old)) {
            return $old === '' ? null : $old;
        }
        if ($old === '') {
            return $new;
        }

        // notes column allows 255 characters.
        return mb_substr("{$old}; {$new}", 0, 255);
    }

    private function findProduct(array $data): Product
    {
        $query = Product::query();
        if (! empty($data['productId'])) {
            $query->where('code', $data['productId']);
        } else {
            $query->where('name', $data['productName']);
        }

        $products = $query->lockForUpdate()->limit(2)->get();
        if ($products->count() !== 1) {
            throw ValidationException::withMessages([
                'productId' => $products->isEmpty()
                    ? 'The selected product could not be found.'
                    : 'More than one product has this name. Select the product by its ID.',
            ]);
        }

        return $products->first();
    }

    /** @return array{0: string, 1: int, 2: bool, 3: int} */
    private function movementValues(array $data, ?int $adjustmentBaseline = null): array
    {
        if ($data['type'] === 'Adjustment') {
            $delta = (int) $data['countedStock'] - (int) $adjustmentBaseline;

            return [$delta < 0 ? 'out' : 'in', abs($delta), true, $delta];
        }

        $isStockIn = in_array($data['type'], ['Stock In', 'in'], true);
        $qty = (int) $data['qty'];

        return [$isStockIn ? 'in' : 'out', $qty, false, $isStockIn ? $qty : -$qty];
    }

    private function balanceBeforeDate(
        Product $product,
        string $date,
        int $currentStock,
        ?int $excludeMovementId = null,
        ?int $positionMovementId = null
    ): int {
        $movements = StockMovement::where('product_id', $product->id)
            ->when($excludeMovementId, fn ($query) => $query->where('id', '!=', $excludeMovementId))
            ->orderBy('movement_date')
            ->orderBy('id')
            ->get();

        $balance = $currentStock - $movements->sum(fn (StockMovement $row) => $this->deltaFor($row));

        foreach ($movements as $row) {
            $movementDate = $row->movement_date->toDateString();
            if (
                $movementDate > $date ||
                ($movementDate === $date && $positionMovementId !== null && $row->id >= $positionMovementId)
            ) {
                break;
            }
            $balance += $this->deltaFor($row);
        }

        return $balance;
    }

    private function deltaFor(StockMovement $movement): int
    {
        $qty = (int) $movement->qty;

        return $movement->movement_type === 'in' ? $qty : -$qty;
    }

    private function ensureNonNegative(int $stock): void
    {
        if ($stock < 0) {
            throw ValidationException::withMessages([
                'qty' => 'This stock movement would make the product balance negative.',
            ]);
        }
    }

    /**
     * Rewrite every row's "Balance After" in date order.
     *
     * @return array{min: int, date: ?string, balance: ?int} the lowest balance
     *         and the first date it went below zero (if it did)
     */
    private function reconcileMovementBalances(Product $product): array
    {
        $movements = StockMovement::where('product_id', $product->id)
            ->orderBy('movement_date')
            ->orderBy('id')
            ->get();

        $balance = (int) $product->stock_on_hand
            - $movements->sum(fn (StockMovement $movement) => $this->deltaFor($movement));

        $low = ['min' => $balance, 'date' => null, 'balance' => null];
        foreach ($movements as $movement) {
            $balance += $this->deltaFor($movement);
            if ($movement->remaining_stock !== $balance) {
                $movement->update(['remaining_stock' => $balance]);
            }
            $low = $this->trackLow($low, $balance, $movement);
        }

        return $low;
    }

    /** The same lowest-balance figure, without changing anything (read before a change). */
    private function historyLow(Product $product): array
    {
        $movements = StockMovement::where('product_id', $product->id)
            ->orderBy('movement_date')
            ->orderBy('id')
            ->get(['id', 'movement_type', 'qty', 'movement_date']);

        $balance = (int) $product->stock_on_hand
            - $movements->sum(fn (StockMovement $movement) => $this->deltaFor($movement));

        $low = ['min' => $balance, 'date' => null, 'balance' => null];
        foreach ($movements as $movement) {
            $balance += $this->deltaFor($movement);
            $low = $this->trackLow($low, $balance, $movement);
        }

        return $low;
    }

    private function trackLow(array $low, int $balance, StockMovement $movement): array
    {
        if ($balance < $low['min']) {
            $low['min'] = $balance;
        }
        if ($balance < 0 && $low['date'] === null) {
            $low['date'] = $movement->movement_date->toDateString();
            $low['balance'] = $balance;
        }

        return $low;
    }

    /**
     * A back-dated entry (or an edit/delete) must not make the stock go below
     * zero on any day. Checking today's total is not enough: e.g. 10 in, 10
     * out, 10 in again, then a Stock Out of 5 dated between the first two
     * would leave the history at -5. Only blocks changes that make the history
     * lower than it already was, so older records never lock a product.
     */
    private function assertHistoryNotNegative(Product $product, array $after, int $lowestBefore, ?int $stockOutQty = null, ?string $date = null): void
    {
        if ($after['min'] >= 0 || $after['min'] >= $lowestBefore) {
            return;
        }

        $when = $after['date'] ? \Illuminate\Support\Carbon::parse($after['date'])->format('M j, Y') : 'an earlier date';
        $message = "This would make {$product->name}'s stock go below zero on {$when} ({$after['balance']}).";
        if ($stockOutQty !== null && $date !== null) {
            $most = max(0, $stockOutQty + $after['min']);
            $message .= ' The most you can take out on '.\Illuminate\Support\Carbon::parse($date)->format('M j, Y')." is {$most}.";
        }
        $message .= ' If stock really came in before that, record the missing Stock In first.';

        throw ValidationException::withMessages(['qty' => $message]);
    }

    private function syncSalesFromMovements(Product $product): void
    {
        $monthlyUnits = StockMovement::where('product_id', $product->id)
            ->where('movement_type', 'out')
            ->where('is_adjustment', false)
            ->get()
            ->groupBy(fn (StockMovement $movement) => $movement->movement_date->startOfMonth()->toDateString())
            ->map(fn ($group) => $group->sum(fn (StockMovement $movement) => (int) $movement->qty));

        SalesHistory::where('product_id', $product->id)
            ->where('period_type', 'month')
            ->whereNotIn('period_date', $monthlyUnits->keys()->all())
            ->delete();

        foreach ($monthlyUnits as $period => $units) {
            SalesHistory::updateOrCreate(
                ['product_id' => $product->id, 'period_type' => 'month', 'period_date' => $period],
                ['units_sold' => $units]
            );
        }
    }
}
