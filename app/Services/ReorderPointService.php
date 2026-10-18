<?php

namespace App\Services;

use App\Models\Product;
use App\Models\StockMovement;

class ReorderPointService
{
    public function annualDemand(Product $product): int
    {
        $configuredDemand = (int) ($product->safetyStock?->annual_demand ?? 0);
        if ($configuredDemand > 0) {
            return $configuredDemand;
        }

        return (int) StockMovement::query()
            ->where('product_id', $product->id)
            ->where('movement_type', 'out')
            ->where('is_adjustment', false)
            ->where('movement_date', '>=', now()->subYear()->toDateString())
            ->sum('qty');
    }

    public function forProduct(Product $product): int
    {
        $safetyStock = (int) ($product->safetyStock?->safety_stock ?? 20);
        $leadTimeDays = $product->safetyStock?->lead_time_days;
        $annualDemand = $this->annualDemand($product);

        if ($leadTimeDays === null || $annualDemand <= 0) {
            return $safetyStock;
        }

        return (int) ceil($safetyStock + ($annualDemand / 365) * (int) $leadTimeDays);
    }
}
