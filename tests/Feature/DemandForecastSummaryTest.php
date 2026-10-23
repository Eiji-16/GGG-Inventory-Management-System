<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\StockMovement;
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

        // Stock-out sales for the last four completed months: 10, 20, 40, 80.
        foreach ([10, 20, 40, 80] as $index => $units) {
            StockMovement::create([
                'product_id' => $product->id,
                'product_name' => $product->name,
                'movement_type' => 'out',
                'is_adjustment' => false,
                'qty' => $units,
                'remaining_stock' => 0,
                'movement_date' => now()->startOfMonth()->subMonths(4 - $index)->addDays(4)->toDateString(),
            ]);
        }

        $this->getJson('/api/reports')
            ->assertOk()
            // (20×1 + 40×2 + 80×3) ÷ 6 = 56.7
            ->assertJsonPath('demandForecast.rows.0.forecastedDemand', 56.7);
    }
}
