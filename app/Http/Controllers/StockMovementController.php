<?php

namespace App\Http\Controllers;

use App\Models\StockMovement;
use App\Services\StockMovementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StockMovementController extends Controller
{
    public function __construct(private readonly StockMovementService $stockMovements)
    {
    }

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
        $movement = $this->stockMovements->create($this->validatedMovement($request, false));
        $dir = $movement->movement_type === 'in' ? 'Stock in' : ($movement->is_adjustment ? 'Adjusted' : 'Stock out');
        \App\Models\ActivityLog::record(
            'stock.'.$movement->movement_type,
            "{$dir} — {$movement->qty} unit(s) of {$movement->product_name}",
            'boxes',
            ['product' => $movement->product_name, 'qty' => $movement->qty]
        );
        return response()->json($this->format($movement), 201);
    }

    /** PUT/PATCH /api/stock-movements/{stockMovement} */
    public function update(Request $request, StockMovement $stockMovement): JsonResponse
    {
        $movement = $this->stockMovements->replace(
            $stockMovement,
            $this->validatedMovement($request, true)
        );
        return response()->json($this->format($movement));
    }

    /** DELETE /api/stock-movements/{stockMovement} */
    public function destroy(StockMovement $stockMovement): JsonResponse
    {
        $this->stockMovements->delete($stockMovement);
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
            'variance'       => $movement->is_adjustment
                ? ($movement->movement_type === 'in' ? (int) $movement->qty : -(int) $movement->qty)
                : null,
            'variantName'    => $movement->variant_name,
            'remainingStock' => $movement->remaining_stock,
            'notes'          => $movement->notes,
            'recordedBy'     => $movement->recorded_by,
        ];
    }
}
