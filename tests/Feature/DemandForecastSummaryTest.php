<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\SalesHistory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\AuthenticatesBusinessApi;
use Tests\TestCase;

class DemandForecastSummaryTest extends TestCase
{
    use RefreshDatabase;
    use AuthenticatesBusinessApi;

    public function test_report_forecast_matches_weighted_moving_average_method(): void
    {
        $product = Product::create([
            'code' => 'PRD-WMA-REPORT',
            'name' => 'WMA Report Product',
            'stock_on_hand' => 12,
        ]);

        foreach ([10, 20, 40, 80] as $index => $units) {
            SalesHistory::create([
                'product_id' => $product->id,
                'period_type' => 'month',
                'period_date' => now()->startOfMonth()->subMonths(3 - $index)->toDateString(),
                'units_sold' => $units,
            ]);
        }

        $this->getJson('/api/reports')
            ->assertOk()
            ->assertJsonPath('demandForecast.rows.0.forecastedDemand', 56.7);
    }
}
