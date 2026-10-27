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
 * result in proportion to the days they cover (see seasonalAdjustment()).
 */
class SalesForecastService
{
    public const FORMULA = 'Weighted Moving Average';

    /** Oldest history shown/used, per period type. */
    private const MAX_PERIODS = ['week' => 104, 'month' => 60, 'year' => 20];

    /**
     * Sales data for many products, read once by preload() so screens that
     * forecast every product don't ask the database again for each one.
     * Null = not preloaded: each method reads what it needs, as before.
     *
     * @var array{ids: array<int, true>, sales: array<int, array>, past: array<int, array>, first: array<int, string>}|null
     */
    private ?array $preloaded = null;

    /** Seasonal events per forecast period (only while preloaded). */
    private array $eventsByPeriod = [];

    /**
     * Speed-up: read the Stock Out sales, past monthly sales and first
     * recorded date of these products in three queries in total. The
     * forecasts come out exactly the same as without it.
     *
     * @param  iterable<Product>  $products
     */
    public function preload(iterable $products): static
    {
        $ids = [];
        foreach ($products as $product) {
            $ids[$product->id] = true;
        }
        $keys = array_keys($ids);
        $data = ['ids' => $ids, 'sales' => [], 'past' => [], 'first' => []];

        foreach (array_chunk($keys, 1000) as $chunk) {
            StockMovement::query()
                ->whereIn('product_id', $chunk)
                ->where('movement_type', 'out')
                ->where('is_adjustment', false)
                ->get(['product_id', 'qty', 'movement_date'])
                ->each(function (StockMovement $row) use (&$data): void {
                    $data['sales'][$row->product_id][] = [Carbon::parse($row->movement_date)->toDateString(), (int) $row->qty];
                });
            PastSale::query()
                ->whereIn('product_id', $chunk)
                ->get(['product_id', 'period_type', 'period_date', 'units_sold'])
                ->each(function (PastSale $row) use (&$data): void {
                    $data['past'][$row->product_id][] = [Carbon::parse($row->period_date)->toDateString(), (int) $row->units_sold, $row->period_type ?: 'month'];
                });
            StockMovement::query()
                ->whereIn('product_id', $chunk)
                ->selectRaw('product_id, MIN(movement_date) as first_date')
                ->groupBy('product_id')
                ->pluck('first_date', 'product_id')
                ->each(function ($date, $productId) use (&$data): void {
                    $data['first'][$productId] = $date;
                });
        }

        $this->preloaded = $data;
        $this->eventsByPeriod = [];

        return $this;
    }

    private function isPreloaded(Product $product): bool
    {
        return $this->preloaded !== null && isset($this->preloaded['ids'][$product->id]);
    }

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
        $first = $this->isPreloaded($product)
            ? ($this->preloaded['first'][$product->id] ?? null)
            : StockMovement::query()->where('product_id', $product->id)->min('movement_date');

        return $first ? Carbon::parse($first)->startOfMonth() : null;
    }

    /** The exact date of the product's first stock movement, or null if none yet. */
    public function firstMovementDate(Product $product): ?Carbon
    {
        $first = $this->isPreloaded($product)
            ? ($this->preloaded['first'][$product->id] ?? null)
            : StockMovement::query()->where('product_id', $product->id)->min('movement_date');

        return $first ? Carbon::parse($first)->startOfDay() : null;
    }

    /**
     * Weekly past sales are used only for weeks BEFORE this Monday: the week
     * in which the product's Stock Control records begin, and never the
     * current, unfinished week. Same idea as pastSalesCutoff() for months.
     */
    public function weeklyPastSalesCutoff(Product $product): Carbon
    {
        $currentWeek = now()->startOfWeek(Carbon::MONDAY)->startOfDay();
        $first = $this->firstMovementDate($product);
        $firstWeek = $first?->copy()->startOfWeek(Carbon::MONDAY);

        return $firstWeek && $firstWeek->lt($currentWeek) ? $firstWeek : $currentWeek;
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
     * Sources: Stock Out transactions (Stock Movement Tracking) plus Past
     * Sales from before the product's Stock Control records begin:
     *  - month and year views use the MONTHLY past sales,
     *  - the week view uses the WEEKLY past sales (a monthly total cannot be
     *    split into weeks, and weeks are never added into months), so the
     *    same sale is never counted twice.
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

        if ($this->isPreloaded($product)) {
            // Same rows as the queries below, already read by preload().
            $currentDate = $current->toDateString();
            foreach ($this->preloaded['sales'][$product->id] ?? [] as [$date, $qty]) {
                if ($date < $currentDate) {
                    $add(Carbon::parse($date), $qty, 'stock');
                }
            }
            $pastType = $periodType === 'week' ? 'week' : 'month';
            $cutoff = ($pastType === 'week' ? $this->weeklyPastSalesCutoff($product) : $this->pastSalesCutoff($product))->toDateString();
            foreach ($this->preloaded['past'][$product->id] ?? [] as [$date, $units, $type]) {
                if ($type === $pastType && $date < $cutoff) {
                    $add(Carbon::parse($date), $units, 'past');
                }
            }
        } else {
            $movements = StockMovement::query()
                ->where('product_id', $product->id)
                ->where('movement_type', 'out')
                ->where('is_adjustment', false)
                ->where('movement_date', '<', $current->toDateString())
                ->get(['qty', 'movement_date']);
            foreach ($movements as $movement) {
                $add(Carbon::parse($movement->movement_date), (int) $movement->qty, 'stock');
            }

            $pastType = $periodType === 'week' ? 'week' : 'month';
            $cutoff = $pastType === 'week' ? $this->weeklyPastSalesCutoff($product) : $this->pastSalesCutoff($product);
            $pastSales = PastSale::query()
                ->where('product_id', $product->id)
                ->where('period_type', $pastType)
                ->where('period_date', '<', $cutoff->toDateString())
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
                'productId' => "No completed {$periodType} of sales yet. Record Stock Out transactions in Stock Control, or add past sales in Forecasting → Past Sales.",
            ]);
        }

        $units = array_map(fn (array $row) => (float) $row['unitsSold'], $history['rows']);
        $baseForecast = (float) $history['nextForecast'];

        $forecastStart = Carbon::parse($history['nextPeriod']);
        $forecastEnd = $this->periodEnd($forecastStart, $periodType);
        $loadEvents = fn () => SeasonalEvent::query()
            ->overlapping($forecastStart, $forecastEnd)
            ->orderBy('start_date')
            ->get();
        // While preloaded, every product forecasting the same period shares one read.
        $periodEvents = $this->isPreloaded($product)
            ? ($this->eventsByPeriod[$forecastStart->toDateString().'|'.$forecastEnd->toDateString()] ??= $loadEvents())
            : $loadEvents();
        $events = $periodEvents
            ->filter(fn (SeasonalEvent $event) => $event->appliesTo($product))
            ->values();

        $seasonal = $this->seasonalAdjustment($events->all(), $forecastStart, $forecastEnd);
        $seasonalEvents = $seasonal['events'];

        // Round first so the EOQ check (CalculationController) can reproduce
        // the adjusted forecast exactly from the submitted percentage.
        $adjustmentPct = round($seasonal['adjustmentPct'], 2);
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
            'adjustmentPct'     => $adjustmentPct,
            'periodDays'        => $seasonal['periodDays'],
            'forecastPeriod'    => $forecastStart->toDateString(),
            'forecastPeriodEnd' => $forecastEnd->toDateString(),
            'dataPoints'        => $history['dataPoints'],
            'confidence'        => $this->confidenceFor($history['dataPoints']),
            'averageDemand'     => round(array_sum($units) / count($units), 1),
            'meanAbsoluteDeviation' => $history['meanAbsoluteDeviation'],
            'history'           => $history['rows'],
        ];
    }

    /**
     * Seasonal adjustment for one forecast period, prorated by day.
     *
     * Each day of the period gets the percentage of the event covering it;
     * when several events cover the same day, only the strongest one (largest
     * absolute percentage) counts, so one demand spike is never added twice.
     * The period adjustment is the average of those daily percentages:
     *
     *     adjustment = Σ (event % × days it is the applied event) ÷ days in period
     *
     * Example: Christmas Sale +35% on Dec 1–25 adds 35 × 25 ÷ 31 = +28.23% to a
     * December forecast, but only 35 × 25 ÷ 365 = +2.40% to a whole-year one.
     *
     * @param  array<int, SeasonalEvent>  $events  events that apply to the product
     * @return array{adjustmentPct: float, periodDays: int, events: array<int, array<string, mixed>>}
     */
    public function seasonalAdjustment(array $events, Carbon $periodStart, Carbon $periodEnd): array
    {
        $start = $periodStart->copy()->startOfDay();
        $end = $periodEnd->copy()->startOfDay();
        $periodDays = (int) $start->diffInDays($end) + 1;

        $overlapDays = [];
        $appliedDays = [];
        $pctDays = 0.0;
        for ($day = $start->copy(); $day->lte($end); $day->addDay()) {
            $applied = null;
            foreach ($events as $event) {
                if ($day->lt($event->start_date->copy()->startOfDay()) || $day->gt($event->end_date->copy()->startOfDay())) {
                    continue;
                }
                $overlapDays[$event->id] = ($overlapDays[$event->id] ?? 0) + 1;
                $pct = (float) $event->adjustment_pct;
                $current = $applied ? (float) $applied->adjustment_pct : null;
                if ($current === null || abs($pct) > abs($current) || (abs($pct) === abs($current) && $pct > $current)) {
                    $applied = $event;
                }
            }
            if ($applied) {
                $appliedDays[$applied->id] = ($appliedDays[$applied->id] ?? 0) + 1;
                $pctDays += (float) $applied->adjustment_pct;
            }
        }

        $details = [];
        foreach ($events as $event) {
            $overlap = $overlapDays[$event->id] ?? 0;
            if ($overlap === 0) {
                continue;
            }
            $applied = $appliedDays[$event->id] ?? 0;
            $details[] = [
                'id'              => $event->id,
                'name'            => $event->name,
                'adjustmentPct'   => (float) $event->adjustment_pct,
                'startDate'       => $event->start_date->toDateString(),
                'endDate'         => $event->end_date->toDateString(),
                'overlapDays'     => $overlap,
                'appliedDays'     => $applied,
                'contributionPct' => round((float) $event->adjustment_pct * $applied / $periodDays, 2),
            ];
        }

        return [
            'adjustmentPct' => $periodDays > 0 ? max(-100, min(1000, $pctDays / $periodDays)) : 0.0,
            'periodDays'    => $periodDays,
            'events'        => $details,
        ];
    }

    /**
     * Suggest a seasonal adjustment for a planned event from past sales.
     *
     * Looks at the same calendar month(s) in earlier years and compares the
     * units actually sold with what the WMA would have forecast for that month
     * (the "WMA Forecast" column of the forecast table), across every product
     * the event would affect. Months are weighted by how many event days fall
     * in them. Returns a null suggestion with a reason when there is no
     * comparable history (a month needs three earlier months to have a WMA).
     *
     * @param  iterable<Product>  $products
     */
    public function suggestAdjustment(iterable $products, Carbon $eventStart, Carbon $eventEnd): array
    {
        // Event days per calendar month (1–12).
        $daysPerMonth = [];
        $end = $eventEnd->copy()->startOfDay();
        for ($day = $eventStart->copy()->startOfDay(); $day->lte($end); $day->addDay()) {
            $daysPerMonth[$day->month] = ($daysPerMonth[$day->month] ?? 0) + 1;
        }

        $actual = [];
        $expected = [];
        $basis = [];
        $productCount = 0;
        foreach ($products as $product) {
            $productCount++;
            foreach ($this->history($product, 'month')['rows'] as $row) {
                $date = Carbon::parse($row['periodDate']);
                if (! isset($daysPerMonth[$date->month]) || $row['wmaForecast'] === null || $row['wmaForecast'] <= 0) {
                    continue;
                }
                $key = $date->format('Y-m');
                $actual[$date->month] = ($actual[$date->month] ?? 0) + $row['unitsSold'];
                $expected[$date->month] = ($expected[$date->month] ?? 0) + $row['wmaForecast'];
                $basis[$key]['period'] = $key;
                $basis[$key]['actual'] = ($basis[$key]['actual'] ?? 0) + $row['unitsSold'];
                $basis[$key]['expected'] = round(($basis[$key]['expected'] ?? 0) + $row['wmaForecast'], 1);
            }
        }

        if ($productCount === 0) {
            return ['suggestedPct' => null, 'basis' => [], 'message' => 'No products match this event yet, so there is no history to learn from. Enter the adjustment manually.'];
        }

        $weighted = 0.0;
        $weights = 0;
        foreach ($daysPerMonth as $month => $days) {
            if (empty($expected[$month])) {
                continue;
            }
            $weighted += $days * (($actual[$month] / $expected[$month]) - 1) * 100;
            $weights += $days;
        }

        if ($weights === 0) {
            return [
                'suggestedPct' => null,
                'basis' => [],
                'message' => 'Not enough sales history for these months yet. A suggestion needs the same month in an earlier year, with at least three months of sales before it. Enter the adjustment manually for now.',
            ];
        }

        ksort($basis);
        $basis = array_values(array_map(fn (array $row) => $row + [
            'upliftPct' => round((($row['actual'] / $row['expected']) - 1) * 100, 1),
        ], $basis));
        $suggested = (int) round(max(-100, min(1000, $weighted / $weights)));
        $years = count(array_unique(array_map(fn (array $row) => substr($row['period'], 0, 4), $basis)));

        return [
            'suggestedPct' => $suggested,
            'basis' => $basis,
            'message' => sprintf(
                'Based on %d past month%s across %d year%s: sales in these months ran %s%d%% compared with the weighted moving average forecast.%s',
                count($basis),
                count($basis) === 1 ? '' : 's',
                $years,
                $years === 1 ? '' : 's',
                $suggested > 0 ? '+' : '',
                $suggested,
                $years < 2 ? ' Only one year of data, so treat it as a rough guide.' : '',
            ),
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
