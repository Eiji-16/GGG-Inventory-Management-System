<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\SalesSeasonalAdjustment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SalesSeasonalAdjustmentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'product' => ['required', 'string', Rule::exists('products', 'code')],
        ]);
        $product = Product::withTrashed()->where('code', $data['product'])->firstOrFail();

        $adjustments = SalesSeasonalAdjustment::query()
            ->where('product_id', $product->id)
            ->orderBy('year')
            ->orderBy('month')
            ->get()
            ->map(fn (SalesSeasonalAdjustment $adjustment): array => $this->format($adjustment));

        return response()->json($adjustments);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'productId' => ['required', 'string', Rule::exists('products', 'code')->whereNull('deleted_at')],
            'year' => ['required', 'integer', 'between:1999,9999'],
            'month' => ['required', 'integer', 'between:1,12'],
            'enabled' => ['required', 'boolean'],
            'events' => ['present', 'array', 'max:20'],
            'events.*.name' => ['required', 'string', 'max:120'],
            'events.*.adjustmentPct' => ['required', 'numeric', 'between:-100,1000'],
        ]);
        $product = Product::where('code', $data['productId'])->firstOrFail();

        $adjustment = SalesSeasonalAdjustment::updateOrCreate(
            [
                'product_id' => $product->id,
                'year' => $data['year'],
                'month' => $data['month'],
            ],
            [
                'enabled' => $data['enabled'],
                'events' => array_values(array_map(
                    fn (array $event): array => [
                        'name' => trim($event['name']),
                        'adjustmentPct' => round((float) $event['adjustmentPct'], 2),
                    ],
                    $data['events']
                )),
            ]
        );

        return response()->json($this->format($adjustment));
    }

    private function format(SalesSeasonalAdjustment $adjustment): array
    {
        return [
            'id' => $adjustment->id,
            'productId' => $adjustment->product?->code,
            'year' => $adjustment->year,
            'month' => $adjustment->month,
            'enabled' => $adjustment->enabled,
            'events' => $adjustment->events ?? [],
        ];
    }
}
