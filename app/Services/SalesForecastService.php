<?php

namespace App\Services;

use App\Models\Product;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;

class SalesForecastService
{
    public const FORMULAS = [
        'Simple Moving Average',
        'Weighted Moving Average',
        'Exponential Smoothing',
        'Linear Trend Regression',
    ];

    public function forecast(Product $product, string $formula): array
    {
        $history = $product->salesHistory()
            ->orderBy('period_date')
            ->get(['id', 'period_date', 'units_sold']);

        if ($history->isEmpty()) {
            throw ValidationException::withMessages([
                'productId' => 'Add at least one month of sales history before forecasting.',
            ]);
        }

        $units = $history->pluck('units_sold')->map(fn ($value) => (float) $value)->all();
        $count = count($units);

        $forecast = match ($formula) {
            'Simple Moving Average' => $this->simpleMovingAverage($units),
            'Weighted Moving Average' => $this->weightedMovingAverage($units),
            'Exponential Smoothing' => $this->exponentialSmoothing($units),
            'Linear Trend Regression' => $this->linearTrendRegression($units),
        };

        $lastPeriod = Carbon::parse($history->last()->period_date);

        return [
            'product' => [
                'id' => $product->code,
                'name' => $product->name,
                'category' => $product->category,
                'brand' => $product->brand,
                'stock' => $product->stock_on_hand,
            ],
            'formula' => $formula,
            'baseForecast' => round(max(0, $forecast), 1),
            'forecastPeriod' => $lastPeriod->copy()->startOfMonth()->addMonth()->toDateString(),
            'dataPoints' => $count,
            'averageDemand' => round(array_sum($units) / $count, 1),
        ];
    }

    private function simpleMovingAverage(array $units): float
    {
        $recent = array_slice($units, -3);

        return array_sum($recent) / count($recent);
    }

    private function weightedMovingAverage(array $units): float
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

    private function exponentialSmoothing(array $units): float
    {
        $smoothed = $units[0];
        foreach (array_slice($units, 1) as $actual) {
            $smoothed = 0.5 * $actual + 0.5 * $smoothed;
        }

        return $smoothed;
    }

    private function linearTrendRegression(array $units): float
    {
        $count = count($units);
        $xMean = ($count + 1) / 2;
        $yMean = array_sum($units) / $count;
        $numerator = 0;
        $denominator = 0;

        foreach ($units as $index => $value) {
            $x = $index + 1;
            $numerator += ($x - $xMean) * ($value - $yMean);
            $denominator += ($x - $xMean) ** 2;
        }

        $slope = $denominator === 0.0 ? 0.0 : $numerator / $denominator;

        return $yMean + $slope * ($count + 1 - $xMean);
    }
}
