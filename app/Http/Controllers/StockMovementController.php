<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\SalesHistory;
use App\Models\StockMovement;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class StockMovementController extends Controller
{
    /** GET /api/stock-movements */
    public function index(): JsonResponse
    {
        $movements = StockMovement::orderByDesc('movement_date')
            ->orderByDesc('id')
            ->get();

        return response()->json($movements->map(fn (StockMovement $movement) => $this->format($movement)));
    }

    /** POST /api/stock-movements */
    public function store(Request $request): JsonResponse
    {
        $data = $this->validatedMovement($request, false);

        $movement = DB::transaction(function () use ($data) {
            $product = $this->findProduct($data);
            $currentStock = (int) $product->stock_on_hand;
            $movementDate = $data['date'] ?? now()->toDateString();
            [$type, $qty, $isAdjustment, $delta] = $this->movementValues(
                $data,
                $currentStock,
                $data['type'] === 'Adjustment'
                    ? $this->balanceBeforeDate($product, $movementDate)
                    : null
            );
            $this->ensureNonNegative($currentStock + $delta);

            $movement = StockMovement::create([
                'product_id'       => $product->id,
                'product_name'     => $product->name,
                'product_category' => $product->category,
                'movement_type'    => $type,
                'is_adjustment'    => $isAdjustment,
                'qty'              => $qty,
                'variant_name'     => $data['variantName'] ?? null,
                'remaining_stock'  => $currentStock + $delta,
                'notes'            => $data['notes'] ?? null,
                'recorded_by'      => $data['recordedBy'] ?? null,
                'movement_date'    => $movementDate,
            ]);

            $product->update(['stock_on_hand' => $currentStock + $delta]);
            $this->reconcileMovementBalances($product);
            $this->syncSalesFromMovements($product);

            return $movement->fresh();
        });

        return response()->json($this->format($movement), 201);
    }

    /** PUT/PATCH /api/stock-movements/{stockMovement} */
    public function update(Request $request, StockMovement $stockMovement): JsonResponse
    {
        $data = $this->validatedMovement($request, true);

        $movement = DB::transaction(function () use ($data, $stockMovement) {
            $movement = StockMovement::query()->lockForUpdate()->findOrFail($stockMovement->id);
            $oldProduct = Product::query()->lockForUpdate()->findOrFail($movement->product_id);
            $oldDelta = $this->deltaFor($movement);

            $newProduct = $this->findProduct($data);
            if ($newProduct->id !== $oldProduct->id) {
                $newProduct = Product::query()->lockForUpdate()->findOrFail($newProduct->id);
            }

            $oldProduct->stock_on_hand = (int) $oldProduct->stock_on_hand - $oldDelta;
            if ($oldProduct->id === $newProduct->id) {
                $newProduct = $oldProduct;
            }

            $movementDate = $data['date'] ?? $movement->movement_date->toDateString();
            $stockWithoutOldMovement = (int) $newProduct->stock_on_hand;
            if ($newProduct->id === $oldProduct->id) {
                $stockWithoutOldMovement = (int) $oldProduct->stock_on_hand;
            }
            $adjustmentBaseline = $data['type'] === 'Adjustment'
                ? $this->balanceBeforeDate(
                    $newProduct,
                    $movementDate,
                    $newProduct->id === $oldProduct->id ? $movement->id : null,
                    $movement->id,
                    $stockWithoutOldMovement
                )
                : null;
            [$type, $qty, $isAdjustment, $delta] = $this->movementValues(
                $data,
                $stockWithoutOldMovement,
                $adjustmentBaseline
            );
            $this->ensureNonNegative((int) $newProduct->stock_on_hand + $delta);

            $movement->fill([
                'product_id'       => $newProduct->id,
                'product_name'     => $newProduct->name,
                'product_category' => $newProduct->category,
                'movement_type'    => $type,
                'is_adjustment'    => $isAdjustment,
                'qty'              => $qty,
                'variant_name'     => $data['variantName'] ?? null,
                'notes'            => $data['notes'] ?? null,
                'recorded_by'      => $data['recordedBy'] ?? null,
                'movement_date'    => $movementDate,
            ]);
            $movement->save();

            if ($oldProduct->id !== $newProduct->id) {
                $oldProduct->save();
            }
            $newProduct->update([
                'stock_on_hand' => (int) $newProduct->stock_on_hand + $delta,
            ]);

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

        return response()->json($this->format($movement));
    }

    /** DELETE /api/stock-movements/{stockMovement} */
    public function destroy(StockMovement $stockMovement): JsonResponse
    {
        DB::transaction(function () use ($stockMovement) {
            $movement = StockMovement::query()->lockForUpdate()->findOrFail($stockMovement->id);
            $product = Product::query()->lockForUpdate()->findOrFail($movement->product_id);
            $newStock = (int) $product->stock_on_hand - $this->deltaFor($movement);
            $this->ensureNonNegative($newStock);

            $movement->delete();
            $product->update(['stock_on_hand' => $newStock]);
            $this->reconcileMovementBalances($product);
            $this->syncSalesFromMovements($product);
        });

        return response()->json(['deleted' => true]);
    }

    private function validatedMovement(Request $request, bool $updating): array
    {
        $rules = [
            'productId'   => ['required_without:productName', 'nullable', 'string', 'exists:products,code'],
            'productName' => ['required_without:productId', 'nullable', 'string'],
            'type'        => ['required', 'in:Stock In,Stock Out,Adjustment,in,out'],
            'qty'         => ['required_unless:type,Adjustment', 'nullable', 'integer', 'min:1'],
            'countedStock'=> ['required_if:type,Adjustment', 'nullable', 'integer', 'min:0'],
            'variantName' => ['nullable', 'string', 'max:255'],
            'notes'       => ['nullable', 'string', 'max:255'],
            'recordedBy'  => ['nullable', 'string', 'max:255'],
            'date'        => [$updating ? 'sometimes' : 'nullable', 'date'],
        ];

        return $request->validate($rules);
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
    private function movementValues(array $data, int $currentStock, ?int $adjustmentBaseline = null): array
    {
        if ($data['type'] === 'Adjustment') {
            $delta = (int) $data['countedStock'] - ($adjustmentBaseline ?? $currentStock);
            return [$delta < 0 ? 'out' : 'in', abs($delta), true, $delta];
        }
        $isIn = in_array($data['type'], ['Stock In', 'in'], true);
        $qty = (int) $data['qty'];
        return [$isIn ? 'in' : 'out', $qty, false, $isIn ? $qty : -$qty];
    }

    private function balanceBeforeDate(
        Product $product,
        string $date,
        ?int $excludeMovementId = null,
        ?int $positionMovementId = null,
        ?int $stockWithoutExcludedMovement = null
    ): int {
        $movements = StockMovement::where('product_id', $product->id)
            ->when($excludeMovementId, fn ($query) => $query->where('id', '!=', $excludeMovementId))
            ->orderBy('movement_date')
            ->orderBy('id')
            ->get();
        $openingBalance = ($stockWithoutExcludedMovement ?? (int) $product->stock_on_hand)
            - $movements->sum(fn (StockMovement $movement) => $this->deltaFor($movement));
        $balance = $openingBalance;

        foreach ($movements as $movement) {
            $movementDate = $movement->movement_date->toDateString();
            if (
                $movementDate > $date ||
                ($movementDate === $date && $positionMovementId !== null && $movement->id >= $positionMovementId)
            ) {
                break;
            }
            $balance += $this->deltaFor($movement);
        }

        return $balance;
    }

    private function deltaFor(StockMovement $movement): int
    {
        return $movement->movement_type === 'in'
            ? (int) $movement->qty
            : -(int) $movement->qty;
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
     * Preserve any opening inventory while refreshing snapshots after a
     * movement is edited, moved to another product, or deleted.
     */
    private function reconcileMovementBalances(Product $product): void
    {
        $movements = StockMovement::where('product_id', $product->id)
            ->orderBy('movement_date')
            ->orderBy('id')
            ->get();

        $ledgerDelta = $movements->sum(fn (StockMovement $movement) => $this->deltaFor($movement));
        $balance = (int) $product->stock_on_hand - $ledgerDelta;

        foreach ($movements as $movement) {
            $balance += $this->deltaFor($movement);
            if ($movement->remaining_stock !== $balance) {
                $movement->update(['remaining_stock' => $balance]);
            }
        }
    }

    /**
     * Rebuild this product's monthly sales from its Stock Out movements.
     *
     * Stock Control is the single source of truth for stock in/out, so "units
     * sold" is derived here rather than entered twice: each real Stock Out
     * (not an Adjustment) counts as a sale, summed per calendar month into
     * sales_history (one row per product per month). Recomputed from scratch
     * on every add/edit/delete so the series always matches the ledger.
     */
    private function syncSalesFromMovements(Product $product): void
    {
        $monthlyUnits = StockMovement::where('product_id', $product->id)
            ->where('movement_type', 'out')
            ->where('is_adjustment', false)
            ->get()
            ->groupBy(fn (StockMovement $movement) => $movement->movement_date->startOfMonth()->toDateString())
            ->map(fn ($group) => $group->sum(fn (StockMovement $movement) => (int) $movement->qty));

        // Drop sales rows for months that no longer have any Stock Out.
        SalesHistory::where('product_id', $product->id)
            ->whereNotIn('period_date', $monthlyUnits->keys()->all())
            ->delete();

        foreach ($monthlyUnits as $period => $units) {
            SalesHistory::updateOrCreate(
                ['product_id' => $product->id, 'period_date' => $period],
                ['units_sold' => $units],
            );
        }
    }

    /** Format the movement shape used by Stock Control. */
    private function format(StockMovement $movement): array
    {
        return [
            'id'             => $movement->id,
            'productId'      => $movement->product?->code,
            'date'           => $movement->movement_date?->toDateString(),
            'productName'    => $movement->product_name,
            'category'       => $movement->product_category,
            'type'           => $movement->is_adjustment
                ? 'Adjustment'
                : ($movement->movement_type === 'in' ? 'Stock In' : 'Stock Out'),
            'qty'            => $movement->qty,
            'variance'       => $movement->is_adjustment ? $this->deltaFor($movement) : null,
            'variantName'    => $movement->variant_name,
            'remainingStock' => $movement->remaining_stock,
            'notes'          => $movement->notes,
            'recordedBy'     => $movement->recorded_by,
        ];
    }
}
