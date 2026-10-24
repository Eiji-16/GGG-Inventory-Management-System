<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Services\ReorderPointService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;

/**
 * Safety stock policy (Settings → Advanced Options, Super Admin).
 *
 * The policy is: safety stock, an optional lead-time override for products
 * that ship slower or faster than their supplier's usual lead time, and the
 * status points (Automatic, or Manual Low/Critical values).
 * Each row also returns the reorder point those values produce. Ordering and
 * holding costs are saved from the EOQ Calculator instead (see
 * saveEoqCosts) and are never changed by saving the policy.
 */
class SafetyStockController extends Controller
{
    public function index(ReorderPointService $reorderPoints): JsonResponse
    {
        $products = Product::with(['safetyStock', 'supplier'])->orderBy('name')->get();

        return response()->json($products->map(function (Product $product) use ($reorderPoints) {
            $policy = $product->safetyStock;
            $hasPolicy = $policy !== null;

            return [
                'productId' => $product->code,
                'productName' => $product->name,
                'category' => $product->category,
                'brand' => $product->brand,
                'model' => $product->model,
                'safetyStock' => $policy?->safety_stock ?? ReorderPointService::DEFAULT_SAFETY_STOCK,
                'leadTimeDays' => $policy?->lead_time_days,
                'supplierName' => $product->supplier?->name,
                'supplierLeadTimeDays' => $product->supplier?->lead_time_days,
                'demandFromHistory' => $reorderPoints->annualDemand($product),
                'reorderPoint' => $reorderPoints->forProduct($product),
                'statusMode' => $policy?->status_mode ?? ($hasPolicy ? 'auto' : 'manual'),
                'lowPoint' => $hasPolicy ? $policy->low_point : ReorderPointService::DEFAULT_LOW_POINT,
                'criticalPoint' => $hasPolicy ? $policy->critical_point : ReorderPointService::DEFAULT_CRITICAL_POINT,
                'orderingCost' => auth()->user()?->isAdminOrAbove() ? $policy?->ordering_cost : null,
                'holdingCost' => auth()->user()?->isAdminOrAbove() ? $policy?->holding_cost : null,
                'configured' => $hasPolicy,
            ];
        }));
    }

    /** PUT /api/safety-stock — safety stock and lead-time override only. */
    public function update(Request $request, ReorderPointService $reorderPoints): JsonResponse
    {
        $data = $request->validate([
            'policies' => ['required', 'array'],
            'policies.*.productId' => ['required', 'string', 'distinct', Rule::exists('products', 'code')->whereNull('deleted_at')],
            'policies.*.safetyStock' => ['required', 'integer', 'min:0'],
            'policies.*.leadTimeDays' => ['nullable', 'integer', 'min:0', 'max:365'],
            'policies.*.statusMode' => ['sometimes', Rule::in(['auto', 'manual'])],
            'policies.*.lowPoint' => ['nullable', 'integer', 'min:0', 'required_if:policies.*.statusMode,manual'],
            'policies.*.criticalPoint' => ['nullable', 'integer', 'min:0', 'required_if:policies.*.statusMode,manual'],
        ]);
        foreach ($data['policies'] as $index => $policy) {
            if (($policy['statusMode'] ?? 'auto') === 'manual' && (int) $policy['criticalPoint'] > (int) $policy['lowPoint']) {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    "policies.{$index}.criticalPoint" => 'The Critical point must be at or below the Low point.',
                ]);
            }
        }

        // Status-point columns arrive with the 2026_10_24_000003 migration;
        // until it runs, save the rest instead of failing.
        $hasStatusPoints = Schema::hasColumn('safety_stock', 'status_mode');

        DB::transaction(function () use ($data, $hasStatusPoints): void {
            foreach ($data['policies'] as $policy) {
                if (! $hasStatusPoints) {
                    unset($policy['statusMode']);
                }
                $product = Product::where('code', $policy['productId'])->firstOrFail();
                $product->safetyStock()->updateOrCreate(
                    ['product_id' => $product->id],
                    [
                        'safety_stock' => $policy['safetyStock'],
                        'lead_time_days' => $policy['leadTimeDays'] ?? null,
                    ] + (array_key_exists('statusMode', $policy) ? [
                        'status_mode' => $policy['statusMode'],
                        'low_point' => $policy['statusMode'] === 'manual' ? $policy['lowPoint'] : null,
                        'critical_point' => $policy['statusMode'] === 'manual' ? $policy['criticalPoint'] : null,
                    ] : [])
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
