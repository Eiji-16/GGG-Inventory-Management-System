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
 * could arrive. Products without enough history fall back to the product's
 * Low point (the reorder point in Auto mode) and say so; their suggested qty is
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

    /**
     * The Dashboard's Reorder List card (2026-11-07): exactly the products
     * the Reorder List page shows — stock at or below the product's Low
     * point (Low, Critical or Out). The forecast only adds "about N days
     * left"; it no longer decides which products appear, so the card and
     * the page always list the same products.
     *
     * @param  iterable<Product>  $products  products tracked in Stock Control
     * @return array<int, array<string, mixed>>
     */
    public function reorderList(iterable $products): array
    {
        $rows = [];
        foreach ($products as $product) {
            $status = $this->reorderPoints->statusFor($product);
            if ($status === 'healthy') {
                continue;
            }
            $stock = (int) $product->stock_on_hand;
            $lowPoint = $this->reorderPoints->statusPoints($product)['low'];

            $daily = null;
            try {
                $forecast = $this->forecasts->forecast($product, 'month');
                $monthly = (float) $forecast['adjustedForecast'];
                $days = (int) ($forecast['periodDays'] ?? Carbon::parse($forecast['forecastPeriod'])->daysInMonth);
                $daily = $monthly > 0 ? $monthly / max(1, $days) : null;
            } catch (ValidationException) {
                $daily = null;
            }
            $daysOfCover = $daily ? round(max(0, $stock) / $daily, 1) : null;

            $rows[] = [
                'productId'    => $product->code,
                'productName'  => $product->name,
                'category'     => $product->category,
                'currentStock' => $stock,
                'safetyStock'  => $this->reorderPoints->safetyStock($product),
                'leadTimeDays' => $this->reorderPoints->leadTimeDays($product),
                'reorderPoint' => $lowPoint,
                'status'       => $status,
                'daysOfCover'  => $daysOfCover,
                'reasons'      => array_values(array_filter([
                    $stock <= 0 ? 'Out of stock.' : "Stock ({$stock}) is at or below its Low level ({$lowPoint}).",
                    $daysOfCover !== null ? 'At this month’s forecast it lasts about '.$this->num(floor($daysOfCover)).' days.' : null,
                ])),
            ];
        }

        // Same order as the Reorder List page: furthest below the Low level first.
        usort($rows, fn (array $a, array $b) => ($a['currentStock'] - $a['reorderPoint']) <=> ($b['currentStock'] - $b['reorderPoint']));

        return $rows;
    }

    public function forProduct(Product $product): ?array
    {
        $stock = (int) $product->stock_on_hand;
        $safetyStock = (int) ($product->safetyStock?->safety_stock ?? self::DEFAULT_SAFETY_STOCK);
        // Same lead time as the reorder point (includes the default from Settings).
        $leadTime = $this->reorderPoints->leadTimeDays($product);

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
            // No usable forecast: fall back to the product's Low point — the
            // same point that marks it Low/Critical in Stock Alerts (Auto: the
            // reorder point; Manual or no policy yet: the Low point). This way
            // every product shown as Low or Critical is also in Order Soon.
            $reorderPoint = $this->reorderPoints->statusPoints($product)['low'];
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
