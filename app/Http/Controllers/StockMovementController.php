<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\StockMovement;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * StockMovementController — /api/stock-movements
 *
 * Returns/records the Stock In / Stock Out ledger in the shape Stock Control
 * uses (public/stockControl.json). Writing a movement recomputes and caches
 * products.stock_on_hand in the SAME transaction, with a row lock, so the
 * balance can never drift or be corrupted by concurrent entries.
 */
class StockMovementController extends Controller
{
    /** GET /api/stock-movements  (newest first) */
    public function index()
    {
        $movements = StockMovement::orderByDesc('movement_date')
            ->orderByDesc('id')
            ->get();

        return response()->json($movements->map(fn ($m) => $this->format($m)));
    }

    /** POST /api/stock-movements */
    public function store(Request $request)
    {
        $data = $request->validate([
            'productId'   => ['required_without:productName', 'nullable', 'string'], // product code
            'productName' => ['required_without:productId', 'nullable', 'string'],
            'type'        => ['required', 'in:Stock In,Stock Out,in,out'],
            'qty'         => ['required', 'integer', 'min:1'],
            'notes'       => ['nullable', 'string', 'max:255'],
            'recordedBy'  => ['nullable', 'string', 'max:255'],
            'date'        => ['nullable', 'date'],
        ]);

        $isIn = in_array($data['type'], ['Stock In', 'in'], true);

        $movement = DB::transaction(function () use ($data, $isIn) {
            // Lock the product row for the duration of the transaction so two
            // simultaneous movements can't both read the same starting balance.
            $product = Product::when(
                ! empty($data['productId']),
                fn ($q) => $q->where('code', $data['productId']),
                fn ($q) => $q->where('name', $data['productName'])
            )->lockForUpdate()->firstOrFail();

            $newRemaining = $isIn
                ? $product->stock_on_hand + $data['qty']
                : $product->stock_on_hand - $data['qty'];

            $movement = StockMovement::create([
                'product_id'       => $product->id,
                'product_name'     => $product->name,
                'product_category' => $product->category,
                'movement_type'    => $isIn ? 'in' : 'out',
                'qty'              => $data['qty'],
                'remaining_stock'  => $newRemaining,
                'notes'            => $data['notes'] ?? null,
                'recorded_by'      => $data['recordedBy'] ?? null,
                'movement_date'    => $data['date'] ?? now()->toDateString(),
            ]);

            // Keep the cached balance in lockstep with the ledger.
            $product->update(['stock_on_hand' => $newRemaining]);

            return $movement;
        });

        return response()->json($this->format($movement), 201);
    }

    /** Shape a StockMovement into the JSON Stock Control expects. */
    private function format(StockMovement $m): array
    {
        return [
            'id'             => $m->id,
            'date'           => $m->movement_date?->toDateString(),
            'productName'    => $m->product_name,
            'category'       => $m->product_category,
            'type'           => $m->movement_type === 'in' ? 'Stock In' : 'Stock Out',
            'qty'            => $m->qty,
            'remainingStock' => $m->remaining_stock,
            'notes'          => $m->notes,
            'recordedBy'     => $m->recorded_by,
        ];
    }
}
