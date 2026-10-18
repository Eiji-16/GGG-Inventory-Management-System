<?php

namespace App\Services;

use App\Models\Product;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;

class SalesForecastService
{
    public const FORMULA = 'Weighted Moving Average';

    public function forecast(Product $product, string $periodType = 'month'): array
    {
        $history = $product->salesHistory()
            ->where('period_type', $periodType)
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
            'baseForecast' => round(max(0, $forecast), 1),
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
