<?php

namespace App\Http\Controllers;

use App\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class SafetyStockController extends Controller
{
    public function index(): JsonResponse
    {
        $products = Product::with('safetyStock')->orderBy('name')->get();

        return response()->json($products->map(fn (Product $product) => [
            'productId' => $product->code,
            'productName' => $product->name,
            'safetyStock' => $product->safetyStock?->safety_stock,
            'annualDemand' => $product->safetyStock?->annual_demand,
            'leadTimeDays' => $product->safetyStock?->lead_time_days,
            'orderingCost' => auth()->user()?->isAdminOrAbove() ? $product->safetyStock?->ordering_cost : null,
            'holdingCost' => auth()->user()?->isAdminOrAbove() ? $product->safetyStock?->holding_cost : null,
            'orderCycleDays' => $product->safetyStock?->order_cycle_days,
            'configured' => $product->safetyStock !== null,
        ]));
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'policies' => ['required', 'array'],
            'policies.*.productId' => ['required', 'string', 'distinct', Rule::exists('products', 'code')->whereNull('deleted_at')],
            'policies.*.safetyStock' => ['required', 'integer', 'min:0'],
            'policies.*.annualDemand' => ['nullable', 'integer', 'min:0'],
            'policies.*.leadTimeDays' => ['nullable', 'integer', 'min:0'],
            'policies.*.orderCycleDays' => ['nullable', 'integer', 'min:1'],
            'policies.*.orderingCost' => ['nullable', 'numeric', 'min:0.01'],
            'policies.*.holdingCost' => ['nullable', 'numeric', 'min:0.01'],
        ]);

        DB::transaction(function () use ($data): void {
            foreach ($data['policies'] as $policy) {
                $product = Product::where('code', $policy['productId'])->firstOrFail();
                $product->safetyStock()->updateOrCreate(
                    ['product_id' => $product->id],
                    [
                        'safety_stock' => $policy['safetyStock'],
                        'annual_demand' => $policy['annualDemand'] ?? null,
                        'lead_time_days' => $policy['leadTimeDays'] ?? null,
                        'order_cycle_days' => $policy['orderCycleDays'] ?? null,
                        'ordering_cost' => $policy['orderingCost'] ?? null,
                        'holding_cost' => $policy['holdingCost'] ?? null,
                    ]
                );
            }
        });

        return $this->index();
    }
}
