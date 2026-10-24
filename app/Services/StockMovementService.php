<?php

namespace App\Services;

use App\Models\Product;
use App\Models\SalesHistory;
use App\Models\StockMovement;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class StockMovementService
{
    public function create(array $data): StockMovement
    {
        return DB::transaction(function () use ($data) {
            $product = $this->findProduct($data);
            $currentStock = (int) $product->stock_on_hand;
            $date = $data['date'] ?? now()->toDateString();
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
            $sameDayEntry = $isAdjustment ? null : $this->findSameDayEntry($product, $type, $date, $data);
            if ($sameDayEntry) {
                $previousQty = (int) $sameDayEntry->qty;
                $sameDayEntry->qty = $previousQty + $qty;
                $sameDayEntry->notes = $this->mergeNotes($sameDayEntry->notes, $data['notes'] ?? null);
                $sameDayEntry->save();

                $product->update(['stock_on_hand' => $newStock]);
                $this->reconcileMovementBalances($product);
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
            $this->reconcileMovementBalances($product);
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
            $this->reconcileMovementBalances($oldProduct);
            if ($oldProduct->id !== $newProduct->id) {
                $this->reconcileMovementBalances($newProduct);
            }
            $this->syncSalesFromMovements($oldProduct);
            if ($oldProduct->id !== $newProduct->id) {
                $this->syncSalesFromMovements($newProduct);
            }

            return $movement->fresh();
        });
    }

    public function delete(StockMovement $existingMovement): void
    {
        DB::transaction(function () use ($existingMovement) {
            $movement = StockMovement::query()
                ->lockForUpdate()
                ->findOrFail($existingMovement->id);
            $product = Product::query()
                ->lockForUpdate()
                ->findOrFail($movement->product_id);
            $newStock = (int) $product->stock_on_hand - $this->deltaFor($movement);
            $this->ensureNonNegative($newStock);

            $movement->delete();
            $product->update(['stock_on_hand' => $newStock]);
            $this->reconcileMovementBalances($product);
            $this->syncSalesFromMovements($product);
        });
    }

    public function clearProductStock(Product $existingProduct): int
    {
        return DB::transaction(function () use ($existingProduct) {
            $product = Product::query()
                ->lockForUpdate()
                ->findOrFail($existingProduct->id);

            $movementCount = $product->stockMovements()->count();
            $product->stockMovements()->delete();
            $product->update(['stock_on_hand' => 0]);
            // Its monthly sales came from those entries, so clear them too
            // (they were left behind before, and still showed on the Dashboard).
            $this->syncSalesFromMovements($product);

            return $movementCount;
        });
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

    private function reconcileMovementBalances(Product $product): void
{
    $movements = StockMovement::where('product_id', $product->id)
        ->orderBy('movement_date')
        ->orderBy('id')
        ->get();

    $balance = (int) $product->stock_on_hand
        - $movements->sum(fn (StockMovement $movement) => $this->deltaFor($movement));

    foreach ($movements as $movement) {
        $balance += $this->deltaFor($movement);
        if ($movement->remaining_stock !== $balance) {
            $movement->update(['remaining_stock' => $balance]);
        }
    }
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
