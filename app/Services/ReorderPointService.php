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
    public const DEFAULT_SAFETY_STOCK = 20;

    public function annualDemand(Product $product): int
    {
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

    public function forProduct(Product $product): int
    {
        $safetyStock = (int) ($product->safetyStock?->safety_stock ?? self::DEFAULT_SAFETY_STOCK);
        $leadTimeDays = $this->leadTimeDays($product);
        $annualDemand = $this->annualDemand($product);

        if ($leadTimeDays === null || $annualDemand <= 0) {
            return $safetyStock;
        }

        return (int) ceil($safetyStock + ($annualDemand / 365) * $leadTimeDays);
    }
}
