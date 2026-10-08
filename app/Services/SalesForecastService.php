<?php

namespace App\Services;

use App\Models\Product;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;

class SalesForecastService
{
    public const FORMULA = 'Weighted Moving Average';

    public function forecast(Product $product): array
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

        $forecast = $this->weightedMovingAverage($units);

        $lastPeriod = Carbon::parse($history->last()->period_date);

        return [
            'product' => [
                'id' => $product->code,
                'name' => $product->name,
                'category' => $product->category,
                'brand' => $product->brand,
                'stock' => $product->stock_on_hand,
            ],
            'formula' => self::FORMULA,
            'baseForecast' => round(max(0, $forecast), 1),
            'forecastPeriod' => $lastPeriod->copy()->startOfMonth()->addMonth()->toDateString(),
            'dataPoints' => $count,
            'averageDemand' => round(array_sum($units) / $count, 1),
        ];
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
}
