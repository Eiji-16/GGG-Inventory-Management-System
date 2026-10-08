<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\SalesHistory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SalesForecastTest extends TestCase
{
    use RefreshDatabase;

    public function test_forecast_always_uses_weighted_moving_average(): void
    {
        $product = $this->createProduct();
        $this->addSales($product, '2026-01-01', 1000);
        $this->addSales($product, '2026-02-01', 10);
        $this->addSales($product, '2026-03-01', 20);
        $this->addSales($product, '2026-04-01', 40);

        $this->postJson('/api/forecasts', [
            'productId' => $product->code,
        ])
            ->assertOk()
            ->assertJsonPath('product.id', $product->code)
            ->assertJsonPath('formula', 'Weighted Moving Average')
            ->assertJsonPath('baseForecast', 28.3)
            ->assertJsonPath('forecastPeriod', '2026-05-01')
            ->assertJsonPath('dataPoints', 4)
            ->assertJsonPath('averageDemand', 267.5);
    }

    public function test_legacy_formula_input_cannot_change_the_fixed_forecast_method(): void
    {
        $product = $this->createProduct();
        $this->addSales($product, '2026-01-01', 10);
        $this->addSales($product, '2026-02-01', 20);
        $this->addSales($product, '2026-03-01', 40);

        $this->postJson('/api/forecasts', [
            'productId' => $product->code,
            'formula' => 'Linear Trend Regression',
        ])
            ->assertOk()
            ->assertJsonPath('formula', 'Weighted Moving Average')
            ->assertJsonPath('baseForecast', 28.3);
    }

    public function test_forecasting_requires_existing_sales_history(): void
    {
        $product = $this->createProduct();

        $this->postJson('/api/forecasts', [
            'productId' => $product->code,
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('productId');
    }

    public function test_sales_history_can_be_added_updated_and_deleted_for_forecasting(): void
    {
        $product = $this->createProduct();

        $entry = $this->postJson('/api/sales-history', [
            'productId' => $product->code,
            'periodDate' => '2026-02-19',
            'unitsSold' => 15,
        ])
            ->assertCreated()
            ->assertJsonPath('periodDate', '2026-02-01')
            ->assertJsonPath('unitsSold', 15)
            ->json();

        $this->postJson('/api/sales-history', [
            'productId' => $product->code,
            'periodDate' => '2026-02-01',
            'unitsSold' => 22,
        ])->assertCreated()->assertJsonPath('unitsSold', 22);

        $this->assertDatabaseCount('sales_history', 1);
        $this->getJson('/api/sales-history?product='.$product->code)
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.unitsSold', 22);

        $this->deleteJson('/api/sales-history/'.$entry['id'])
            ->assertOk()
            ->assertJsonPath('deleted', true);
        $this->assertDatabaseCount('sales_history', 0);
    }

    private function createProduct(string $code = 'PRD-FORECAST'): Product
    {
        return Product::create([
            'code' => $code,
            'name' => 'Forecast Test Item',
            'stock_on_hand' => 12,
        ]);
    }

    private function addSales(Product $product, string $periodDate, int $units): void
    {
        SalesHistory::create([
            'product_id' => $product->id,
            'period_date' => $periodDate,
            'units_sold' => $units,
        ]);
    }
}
