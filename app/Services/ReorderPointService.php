<?php

namespace App\Services;

use App\Models\Product;
use App\Models\StockMovement;

/**
 * Reorder point = safety stock + (annual demand ÷ 365) × lead time.
 *
 * Annual demand comes only from real sales: Stock Out units in the last
 * 12 months. (A typed "annual demand" in the safety stock policy was removed
 * because it went stale and overrode real sales.) Lead time is the product's
 * override from the policy, else its supplier's lead time.
 */
class ReorderPointService
{
    public const DEFAULT_SAFETY_STOCK = 3;
    public const DEFAULT_LOW_POINT = 10;
    public const DEFAULT_CRITICAL_POINT = 5;

    /**
     * Annual demand for many products, read in ONE query by preload()
     * (product id => units). Null = not preloaded: ask per product.
     *
     * @var array<int, int>|null
     */
    private ?array $demandByProduct = null;

    /**
     * Speed-up for screens that list many products (Dashboard, Safety Stock,
     * Reports): read every product's annual demand in one query instead of
     * one query per product. Gives the same numbers as annualDemand().
     *
     * @param  iterable<Product>  $products
     */
    public function preload(iterable $products): static
    {
        $totals = StockMovement::query()
            ->where('movement_type', 'out')
            ->where('is_adjustment', false)
            ->where('movement_date', '>=', now()->subYear()->toDateString())
            ->selectRaw('product_id, SUM(qty) as total')
            ->groupBy('product_id')
            ->pluck('total', 'product_id');

        $this->demandByProduct = [];
        foreach ($products as $product) {
            $this->demandByProduct[$product->id] = (int) ($totals[$product->id] ?? 0);
        }

        return $this;
    }

    public function annualDemand(Product $product): int
    {
        if ($this->demandByProduct !== null && array_key_exists($product->id, $this->demandByProduct)) {
            return $this->demandByProduct[$product->id];
        }

        return (int) StockMovement::query()
            ->where('product_id', $product->id)
            ->where('movement_type', 'out')
            ->where('is_adjustment', false)
            ->where('movement_date', '>=', now()->subYear()->toDateString())
            ->sum('qty');
    }

    public function leadTimeDays(Product $product): ?int
    {
        $leadTime = $product->safetyStock?->lead_time_days ?? $product->supplier?->lead_time_days;

        return $leadTime === null ? null : (int) $leadTime;
    }

    public function safetyStock(Product $product): int
    {
        return (int) ($product->safetyStock?->safety_stock ?? self::DEFAULT_SAFETY_STOCK);
    }

    /**
     * The stock levels where a product turns Low and Critical.
     *   auto   (default): Low at the reorder point, Critical at safety stock
     *   manual: the owner's own Low and Critical points from the policy
     *
     * @return array{mode: string, low: int, critical: int}
     */
    public function statusPoints(Product $product): array
    {
        $policy = $product->safetyStock;
        if ($policy === null) {
            return [
                'mode' => 'manual',
                'low' => self::DEFAULT_LOW_POINT,
                'critical' => self::DEFAULT_CRITICAL_POINT,
            ];
        }
        if (($policy?->status_mode ?? 'auto') === 'manual' && $policy->low_point !== null && $policy->critical_point !== null) {
            return ['mode' => 'manual', 'low' => (int) $policy->low_point, 'critical' => (int) $policy->critical_point];
        }

        return ['mode' => 'auto', 'low' => $this->forProduct($product), 'critical' => $this->safetyStock($product)];
    }

    /**
     * Stock status (no hidden thresholds):
     *   out      = 0 or less
     *   critical = at or below the Critical point
     *   low      = at or below the Low point
     *   healthy  = above the Low point
     */
    public function statusFor(Product $product, ?int $stock = null): string
    {
        $stock ??= (int) $product->stock_on_hand;
        if ($stock <= 0) {
            return 'out';
        }
        $points = $this->statusPoints($product);
        if ($stock <= $points['critical']) {
            return 'critical';
        }

        return $stock <= $points['low'] ? 'low' : 'healthy';
    }

    public function forProduct(Product $product): int
    {
        $safetyStock = $this->safetyStock($product);
        $leadTimeDays = $this->leadTimeDays($product);
        $annualDemand = $this->annualDemand($product);

        if ($leadTimeDays === null || $annualDemand <= 0) {
            return $safetyStock;
        }

        return (int) ceil($safetyStock + ($annualDemand / 365) * $leadTimeDays);
    }
}
