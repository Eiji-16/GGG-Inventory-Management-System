<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Services\ReorderPointService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Safety stock policy (Settings → Advanced Options, Super Admin).
 *
 * The policy is only: safety stock, plus an optional lead-time override for
 * products that ship slower or faster than their supplier's usual lead time.
 * Each row also returns the reorder point those values produce. Ordering and
 * holding costs are saved from the EOQ Calculator instead (see
 * saveEoqCosts) and are never changed by saving the policy.
 */
class SafetyStockController extends Controller
{
    public function index(ReorderPointService $reorderPoints): JsonResponse
    {
        $products = Product::with(['safetyStock', 'supplier'])->orderBy('name')->get();

        return response()->json($products->map(fn (Product $product) => [
            'productId' => $product->code,
            'productName' => $product->name,
            'safetyStock' => $product->safetyStock?->safety_stock,
            'leadTimeDays' => $product->safetyStock?->lead_time_days,
            'supplierName' => $product->supplier?->name,
            'supplierLeadTimeDays' => $product->supplier?->lead_time_days,
            'demandFromHistory' => $reorderPoints->annualDemand($product),
            'reorderPoint' => $reorderPoints->forProduct($product),
            'orderingCost' => auth()->user()?->isAdminOrAbove() ? $product->safetyStock?->ordering_cost : null,
            'holdingCost' => auth()->user()?->isAdminOrAbove() ? $product->safetyStock?->holding_cost : null,
            'configured' => $product->safetyStock !== null,
        ]));
    }

    /** PUT /api/safety-stock — safety stock and lead-time override only. */
    public function update(Request $request, ReorderPointService $reorderPoints): JsonResponse
    {
        $data = $request->validate([
            'policies' => ['required', 'array'],
            'policies.*.productId' => ['required', 'string', 'distinct', Rule::exists('products', 'code')->whereNull('deleted_at')],
            'policies.*.safetyStock' => ['required', 'integer', 'min:0'],
            'policies.*.leadTimeDays' => ['nullable', 'integer', 'min:0', 'max:365'],
        ]);

        DB::transaction(function () use ($data): void {
            foreach ($data['policies'] as $policy) {
                $product = Product::where('code', $policy['productId'])->firstOrFail();
                $product->safetyStock()->updateOrCreate(
                    ['product_id' => $product->id],
                    [
                        'safety_stock' => $policy['safetyStock'],
                        'lead_time_days' => $policy['leadTimeDays'] ?? null,
                    ]
                );
            }
        });

        return $this->index($reorderPoints);
    }

    /**
     * PUT /api/products/{code}/eoq-costs — save ordering and holding cost as
     * this product's defaults for the EOQ Calculator (Admin and above).
     */
    public function saveEoqCosts(Request $request, string $code): JsonResponse
    {
        $data = $request->validate([
            'orderingCost' => ['required', 'numeric', 'min:0.01', 'max:9999999999'],
            'holdingCost' => ['required', 'numeric', 'min:0.01', 'max:9999999999'],
        ]);
        $product = Product::where('code', $code)->firstOrFail();
        $product->safetyStock()->updateOrCreate(
            ['product_id' => $product->id],
            ['ordering_cost' => $data['orderingCost'], 'holding_cost' => $data['holdingCost']]
        );
        $policy = $product->safetyStock()->first();

        return response()->json([
            'productId' => $product->code,
            'orderingCost' => $policy->ordering_cost,
            'holdingCost' => $policy->holding_cost,
        ]);
    }
}
