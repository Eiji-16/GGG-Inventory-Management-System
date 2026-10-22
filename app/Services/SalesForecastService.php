<?php

namespace App\Services;

use App\Models\Product;
use App\Models\SalesSeasonalAdjustment;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;

class SalesForecastService
{
    public const FORMULA = 'Weighted Moving Average';

    public function forecast(Product $product, string $periodType = 'month'): array
    {
        $history = $product->salesHistory()
            ->where('period_type', $periodType)
            ->where('units_sold', '>', 0)
            ->orderBy('period_date')
            ->get(['id', 'period_date', 'units_sold']);

        if ($history->isEmpty()) {
            throw ValidationException::withMessages([
                'productId' => "Add at least one {$periodType} of sales history before forecasting.",
            ]);
        }

        $units = $history->pluck('units_sold')->map(fn ($value) => (float) $value)->all();
        $count = count($units);

        $forecast = $this->weightedMovingAverage($units);

        $lastPeriod = Carbon::parse($history->last()->period_date);
        $forecastPeriod = match ($periodType) {
            'week' => $lastPeriod->copy()->startOfWeek(Carbon::MONDAY)->addWeek(),
            'year' => $lastPeriod->copy()->startOfYear()->addYear(),
            default => $lastPeriod->copy()->startOfMonth()->addMonth(),
        };
        $seasonalAdjustment = $periodType === 'month'
            ? SalesSeasonalAdjustment::query()
                ->where('product_id', $product->id)
                ->where('year', $forecastPeriod->year)
                ->where('month', $forecastPeriod->month)
                ->first()
            : null;
        $seasonalEvents = $seasonalAdjustment?->events ?? [];
        $baseForecast = round(max(0, $forecast), 1);
        $adjustmentPct = $seasonalAdjustment?->enabled
            ? max(-100, min(1000, array_sum(array_column($seasonalEvents, 'adjustmentPct'))))
            : 0.0;
        $adjustedForecast = round(max(0, $baseForecast * (1 + $adjustmentPct / 100)), 1);

        return [
            'product' => [
                'id' => $product->code,
                'name' => $product->name,
                'category' => $product->category,
                'brand' => $product->brand,
                'stock' => $product->stock_on_hand,
            ],
            'formula' => self::FORMULA,
            'periodType' => $periodType,
            'baseForecast' => $baseForecast,
            'adjustedForecast' => $adjustedForecast,
            'seasonalEnabled' => (bool) ($seasonalAdjustment?->enabled && $seasonalEvents),
            'seasonalEvents' => $seasonalEvents,
            'adjustmentPct' => round($adjustmentPct, 2),
            'forecastPeriod' => $forecastPeriod->toDateString(),
            'dataPoints' => $count,
            'averageDemand' => round(array_sum($units) / $count, 1),
        ];
    }

    public function weightedMovingAverage(array $units): float
    {
        $recent = array_slice($units, -3);
        $weightedTotal = 0;
        $weightTotal = 0;

        foreach ($recent as $index => $value) {
            $weight = $index + 1;
            $weightedTotal += $value * $weight;
            $weightTotal += $weight;
        }

        return $weightedTotal / $weightTotal;
    }
}
