<?php

namespace App\Services;

use App\Models\Product;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;

/**
 * DemandReorderService — the "Demand-Linked Reordering" model (Chapter 2,
 * Synthesis): reorder suggestions driven by the WMA forecast (with seasonal
 * adjustment) instead of only past sales or a fixed threshold.
 *
 * READ-ONLY. It never creates orders or changes stock; current stock always
 * comes from products.stock_on_hand (the inventory record of truth).
 *
 * For each product, with F = next month's adjusted forecast:
 *   daily demand        d   = F ÷ days in that month
 *   forecast reorder pt ROP = ceil(safety stock + d × lead time)
 *   days of cover           = current stock ÷ d
 *   suggested order qty     = ceil(safety stock + d × lead time + F − current stock)
 *                             (enough to cover the lead time AND next month's
 *                             forecast while keeping the safety buffer)
 * A product is suggested when stock is at/below ROP, next month's forecast is
 * more than the stock above safety stock, or stock runs out before a delivery
 * could arrive. Products without enough history fall back to the existing
 * reorder point (past 12 months of sales) and say so; their suggested qty is
 * ceil(reorder point + one month of past sales − current stock).
 */
class DemandReorderService
{
    public const DEFAULT_SAFETY_STOCK = ReorderPointService::DEFAULT_SAFETY_STOCK;

    public function __construct(
        private readonly SalesForecastService $forecasts,
        private readonly ReorderPointService $reorderPoints,
    ) {}

    /**
     * @param  iterable<Product>  $products  products tracked in Stock Control
     * @return array<int, array<string, mixed>>
     */
    public function suggestions(iterable $products): array
    {
        $suggestions = [];
        foreach ($products as $product) {
            $suggestion = $this->forProduct($product);
            if ($suggestion !== null) {
                $suggestions[] = $suggestion;
            }
        }

        // Most urgent first: out of stock, then fewest days of cover.
        usort($suggestions, fn (array $a, array $b) => [$a['currentStock'] > 0, $a['daysOfCover'] ?? INF]
            <=> [$b['currentStock'] > 0, $b['daysOfCover'] ?? INF]);

        return $suggestions;
    }

    public function forProduct(Product $product): ?array
    {
        $stock = (int) $product->stock_on_hand;
        $safetyStock = (int) ($product->safetyStock?->safety_stock ?? self::DEFAULT_SAFETY_STOCK);
        $leadTime = $product->safetyStock?->lead_time_days ?? $product->supplier?->lead_time_days;
        $leadTime = $leadTime === null ? null : (int) $leadTime;

        try {
            $forecast = $this->forecasts->forecast($product, 'month');
        } catch (ValidationException) {
            $forecast = null;
        }

        $base = [
            'productId'    => $product->code,
            'productName'  => $product->name,
            'category'     => $product->category,
            'currentStock' => $stock,
            'safetyStock'  => $safetyStock,
            'leadTimeDays' => $leadTime,
        ];

        if ($forecast === null || (float) $forecast['adjustedForecast'] <= 0) {
            // No usable forecast: fall back to the existing reorder point.
            $reorderPoint = $this->reorderPoints->forProduct($product);
            if ($stock > $reorderPoint) {
                return null;
            }
            $pastMonthly = $this->reorderPoints->annualDemand($product) / 12;

            return $base + [
                'basis'          => 'reorder_point',
                'forecastPeriod' => null,
                'forecastDemand' => null,
                'dailyDemand'    => null,
                'reorderPoint'   => $reorderPoint,
                'daysOfCover'    => null,
                // Back above the reorder point plus one month of past sales.
                'suggestedQty'   => max(1, (int) ceil($reorderPoint + $pastMonthly - $stock)),
                'reasons'        => array_values(array_filter([
                    $stock <= 0 ? 'Out of stock.' : null,
                    "Stock ({$stock}) is at or below its reorder point ({$reorderPoint}).",
                    'No forecast yet (not enough completed months of sales), so this uses the reorder point from past sales.',
                ])),
            ];
        }

        $monthly = (float) $forecast['adjustedForecast'];
        $periodDays = (int) ($forecast['periodDays'] ?? Carbon::parse($forecast['forecastPeriod'])->daysInMonth);
        $daily = $monthly / max(1, $periodDays);
        $leadDemand = $daily * ($leadTime ?? 0);
        $reorderPoint = (int) ceil($safetyStock + $leadDemand);
        $daysOfCover = $daily > 0 ? round($stock / $daily, 1) : null;
        $available = $stock - $safetyStock;

        $reasons = [];
        if ($stock <= 0) {
            $reasons[] = 'Out of stock.';
        }
        if ($stock <= $reorderPoint) {
            $reasons[] = $leadTime !== null
                ? sprintf('Stock (%d) is at or below the forecast reorder point (%d = safety stock %d + %s/day × %d-day lead time).', $stock, $reorderPoint, $safetyStock, $this->num($daily), $leadTime)
                : sprintf('Stock (%d) is at or below the safety stock (%d). Set a lead time to include delivery days.', $stock, $safetyStock);
        }
        if ($monthly > $available) {
            $reasons[] = sprintf('Next month’s forecast demand (%s units%s) is more than the %d units available above safety stock.',
                $this->num($monthly),
                ($forecast['adjustmentPct'] ?? 0) != 0 ? sprintf(', incl. %s%s%% seasonal', $forecast['adjustmentPct'] > 0 ? '+' : '', $this->num($forecast['adjustmentPct'])) : '',
                max(0, $available));
        }
        if ($leadTime !== null && $daysOfCover !== null && $daysOfCover < $leadTime) {
            $reasons[] = sprintf('Stock lasts about %s days at forecast demand, less than the %d-day supplier lead time.', $this->num($daysOfCover), $leadTime);
        }

        if ($reasons === []) {
            return null;
        }

        return $base + [
            'basis'          => 'forecast',
            'forecastPeriod' => $forecast['forecastPeriod'],
            'forecastDemand' => $monthly,
            'dailyDemand'    => round($daily, 2),
            'reorderPoint'   => $reorderPoint,
            'daysOfCover'    => $daysOfCover,
            'suggestedQty'   => max(1, (int) ceil($safetyStock + $leadDemand + $monthly - $stock)),
            'reasons'        => $reasons,
        ];
    }

    private function num(float|int $value): string
    {
        return rtrim(rtrim(number_format((float) $value, 1, '.', ''), '0'), '.');
    }
}
