<?php

namespace App\Services;

use App\Models\PastSale;
use App\Models\Product;
use App\Models\SeasonalEvent;
use App\Models\StockMovement;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;

/**
 * SalesForecastService — Weighted Moving Average (WMA) demand forecasting.
 *
 * Historical "sales" are the Stock Out transactions recorded in Stock Movement
 * Tracking (adjustments excluded), totalled per completed week / month / year.
 * The newest three completed periods are weighted 1, 2 and 3, and active
 * seasonal events whose date range overlaps the forecast period adjust the
 * result by their percentage.
 */
class SalesForecastService
{
    public const FORMULA = 'Weighted Moving Average';

    /** Oldest history shown/used, per period type. */
    private const MAX_PERIODS = ['week' => 104, 'month' => 60, 'year' => 20];

    public function periodStart(Carbon $date, string $periodType): Carbon
    {
        return match ($periodType) {
            'week' => $date->copy()->startOfWeek(Carbon::MONDAY)->startOfDay(),
            'year' => $date->copy()->startOfYear(),
            default => $date->copy()->startOfMonth(),
        };
    }

    public function periodEnd(Carbon $start, string $periodType): Carbon
    {
        return match ($periodType) {
            'week' => $start->copy()->addDays(6),
            'year' => $start->copy()->endOfYear()->startOfDay(),
            default => $start->copy()->endOfMonth()->startOfDay(),
        };
    }

    private function nextPeriod(Carbon $start, string $periodType): Carbon
    {
        return match ($periodType) {
            'week' => $start->copy()->addWeek(),
            'year' => $start->copy()->addYear(),
            default => $start->copy()->addMonthNoOverflow(),
        };
    }

    private function subPeriods(Carbon $start, string $periodType, int $count): Carbon
    {
        return match ($periodType) {
            'week' => $start->copy()->subWeeks($count),
            'year' => $start->copy()->subYears($count),
            default => $start->copy()->subMonthsNoOverflow($count),
        };
    }

    /**
     * First day of the month in which this product's Stock Control records
     * begin (its earliest stock movement of any kind), or null if none yet.
     */
    public function recordingStart(Product $product): ?Carbon
    {
        $first = StockMovement::query()->where('product_id', $product->id)->min('movement_date');

        return $first ? Carbon::parse($first)->startOfMonth() : null;
    }

    /**
     * Past monthly sales (entered or imported from Excel) are used only for
     * months BEFORE this date: before the product's Stock Control records
     * begin, and never for the current, unfinished month. From this month on,
     * Stock Out transactions are the only source, so nothing is counted twice.
     */
    public function pastSalesCutoff(Product $product): Carbon
    {
        $currentMonth = now()->startOfMonth();
        $recordingStart = $this->recordingStart($product);

        return $recordingStart && $recordingStart->lt($currentMonth) ? $recordingStart : $currentMonth;
    }

    /**
     * Units sold per completed period, oldest first, zero-filled from the first
     * period with a sale up to the last completed period.
     *
     * Sources: Stock Out transactions (Stock Movement Tracking) plus, for
     * month and year views, past monthly sales for months before the product's
     * Stock Control records begin. Weekly views use Stock Out records only,
     * because monthly totals cannot be split into weeks.
     *
     * @return array<int, array{periodDate: string, unitsSold: int, source: string}>
     */
    public function salesSeries(Product $product, string $periodType = 'month'): array
    {
        $current = $this->periodStart(now(), $periodType);

        $totals = [];
        $sources = [];
        $first = null;
        $add = function (Carbon $date, int $units, string $source) use (&$totals, &$sources, &$first, $periodType): void {
            $start = $this->periodStart($date, $periodType);
            $key = $start->toDateString();
            $totals[$key] = ($totals[$key] ?? 0) + $units;
            $sources[$key][$source] = true;
            if ($first === null || $start->lt($first)) {
                $first = $start;
            }
        };

        $movements = StockMovement::query()
            ->where('product_id', $product->id)
            ->where('movement_type', 'out')
            ->where('is_adjustment', false)
            ->where('movement_date', '<', $current->toDateString())
            ->get(['qty', 'movement_date']);
        foreach ($movements as $movement) {
            $add(Carbon::parse($movement->movement_date), (int) $movement->qty, 'stock');
        }

        if ($periodType !== 'week') {
            $pastSales = PastSale::query()
                ->where('product_id', $product->id)
                ->where('period_date', '<', $this->pastSalesCutoff($product)->toDateString())
                ->get(['period_date', 'units_sold']);
            foreach ($pastSales as $pastSale) {
                $add(Carbon::parse($pastSale->period_date), (int) $pastSale->units_sold, 'past');
            }
        }

        if ($first === null || ! $first->lt($current)) {
            return [];
        }

        $earliest = $this->subPeriods($current, $periodType, self::MAX_PERIODS[$periodType] ?? 60);
        if ($first->lt($earliest)) {
            $first = $earliest;
        }

        $series = [];
        for ($period = $first->copy(); $period->lt($current); $period = $this->nextPeriod($period, $periodType)) {
            $key = $period->toDateString();
            $kinds = array_keys($sources[$key] ?? []);
            $series[] = [
                'periodDate' => $key,
                'unitsSold'  => (int) ($totals[$key] ?? 0),
                'source'     => count($kinds) > 1 ? 'mixed' : ($kinds[0] ?? 'none'),
            ];
        }

        return $series;
    }

    /**
     * The WMA working table for a product: actual sales per completed period,
     * the weight each recent period carries in the next forecast, the WMA
     * forecast each past period would have received, and the variance.
     */
    public function history(Product $product, string $periodType = 'month'): array
    {
        return [
            'periodType' => $periodType,
            'nextPeriod' => $this->periodStart(now(), $periodType)->toDateString(),
        ] + $this->buildTable($this->salesSeries($product, $periodType));
    }

    /**
     * Pure WMA table builder (no database) — easy to verify by hand.
     *
     * For each period at index i >= 3, wmaForecast = WMA of periods i-3..i-1
     * with weights 1, 2, 3, and variance = actual − wmaForecast. The newest
     * three periods carry weights 1, 2, 3 for the next forecast.
     *
     * @param  array<int, array{periodDate: string, unitsSold: int|float}>  $series
     */
    public function buildTable(array $series): array
    {
        $series = array_values($series);
        $units = array_map(fn (array $row) => (float) $row['unitsSold'], $series);
        $count = count($units);
        $weighted = min(3, $count);

        $rows = [];
        foreach ($series as $index => $row) {
            $forecast = $index >= 3
                ? round($this->weightedMovingAverage(array_slice($units, $index - 3, 3)), 1)
                : null;

            $rows[] = [
                'periodDate'  => $row['periodDate'],
                'unitsSold'   => (int) $row['unitsSold'],
                'weight'      => $index >= $count - $weighted ? $index - ($count - $weighted) + 1 : null,
                'wmaForecast' => $forecast,
                'variance'    => $forecast === null ? null : round($units[$index] - $forecast, 1),
                'source'      => $row['source'] ?? 'stock',
            ];
        }

        $variances = array_values(array_filter(array_column($rows, 'variance'), fn ($value) => $value !== null));

        return [
            'rows'                  => $rows,
            'dataPoints'            => $count,
            'nextForecast'          => $count ? round(max(0, $this->weightedMovingAverage($units)), 1) : null,
            'meanAbsoluteDeviation' => $variances
                ? round(array_sum(array_map('abs', $variances)) / count($variances), 1)
                : null,
        ];
    }

    public function confidenceFor(int $dataPoints): string
    {
        return $dataPoints >= 6 ? 'High' : ($dataPoints >= 3 ? 'Medium' : 'Low');
    }

    public function forecast(Product $product, string $periodType = 'month'): array
    {
        $history = $this->history($product, $periodType);
        if ($history['dataPoints'] === 0) {
            throw ValidationException::withMessages([
                'productId' => "No completed {$periodType} of sales yet. Record Stock Out transactions in Stock Control, or add past monthly sales in Forecasting → Past Sales.",
            ]);
        }

        $units = array_map(fn (array $row) => (float) $row['unitsSold'], $history['rows']);
        $baseForecast = (float) $history['nextForecast'];

        $forecastStart = Carbon::parse($history['nextPeriod']);
        $forecastEnd = $this->periodEnd($forecastStart, $periodType);
        $events = SeasonalEvent::query()
            ->overlapping($forecastStart, $forecastEnd)
            ->orderBy('start_date')
            ->get()
            ->filter(fn (SeasonalEvent $event) => $event->appliesTo($product))
            ->values();

        $seasonalEvents = $events->map(fn (SeasonalEvent $event) => [
            'id'            => $event->id,
            'name'          => $event->name,
            'adjustmentPct' => (float) $event->adjustment_pct,
            'startDate'     => $event->start_date->toDateString(),
            'endDate'       => $event->end_date->toDateString(),
        ])->all();

        $adjustmentPct = $events->isEmpty()
            ? 0.0
            : max(-100, min(1000, (float) $events->sum(fn (SeasonalEvent $event) => (float) $event->adjustment_pct)));
        $adjustedForecast = round(max(0, $baseForecast * (1 + $adjustmentPct / 100)), 1);

        return [
            'product' => [
                'id'       => $product->code,
                'name'     => $product->name,
                'category' => $product->category,
                'brand'    => $product->brand,
                'stock'    => $product->stock_on_hand,
            ],
            'formula'           => self::FORMULA,
            'source'            => 'stock_movements',
            'recordingStart'    => $this->recordingStart($product)?->toDateString(),
            'periodType'        => $periodType,
            'baseForecast'      => $baseForecast,
            'adjustedForecast'  => $adjustedForecast,
            'seasonalEnabled'   => $events->isNotEmpty(),
            'seasonalEvents'    => $seasonalEvents,
            'adjustmentPct'     => round($adjustmentPct, 2),
            'forecastPeriod'    => $forecastStart->toDateString(),
            'forecastPeriodEnd' => $forecastEnd->toDateString(),
            'dataPoints'        => $history['dataPoints'],
            'confidence'        => $this->confidenceFor($history['dataPoints']),
            'averageDemand'     => round(array_sum($units) / count($units), 1),
            'meanAbsoluteDeviation' => $history['meanAbsoluteDeviation'],
            'history'           => $history['rows'],
        ];
    }

    /** Weights 1, 2, 3 on the newest three values (fewer if less history). */
    public function weightedMovingAverage(array $units): float
    {
        $recent = array_values(array_slice($units, -3));
        $weightedTotal = 0;
        $weightTotal = 0;

        foreach ($recent as $index => $value) {
            $weight = $index + 1;
            $weightedTotal += $value * $weight;
            $weightTotal += $weight;
        }

        return $weightTotal > 0 ? $weightedTotal / $weightTotal : 0.0;
    }
}
