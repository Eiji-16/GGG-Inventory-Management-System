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

    public function test_weekly_forecast_uses_weekly_history_and_returns_the_next_week(): void
    {
        $product = $this->createProduct();
        $this->addSales($product, '2026-03-02', 10, 'week');
        $this->addSales($product, '2026-03-09', 20, 'week');
        $this->addSales($product, '2026-03-16', 30, 'week');
        $this->addSales($product, '2026-03-23', 40, 'week');

        $this->postJson('/api/forecasts', [
            'productId' => $product->code,
            'periodType' => 'week',
        ])
            ->assertOk()
            ->assertJsonPath('periodType', 'week')
            ->assertJsonPath('baseForecast', 33.3)
            ->assertJsonPath('forecastPeriod', '2026-03-30')
            ->assertJsonPath('dataPoints', 4);
    }

    public function test_yearly_forecast_uses_yearly_history_and_returns_the_next_year(): void
    {
        $product = $this->createProduct();
        $this->addSales($product, '2022-09-14', 10, 'year');
        $this->addSales($product, '2023-06-10', 20, 'year');
        $this->addSales($product, '2024-11-20', 40, 'year');

        $this->postJson('/api/forecasts', [
            'productId' => $product->code,
            'periodType' => 'year',
        ])
            ->assertOk()
            ->assertJsonPath('periodType', 'year')
            ->assertJsonPath('baseForecast', 28.3)
            ->assertJsonPath('forecastPeriod', '2025-01-01')
            ->assertJsonPath('dataPoints', 3);
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
            ->assertJsonPath('periodType', 'month')
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

    public function test_weekly_sales_history_normalizes_weeks_and_keeps_monthly_data_separate(): void
    {
        $product = $this->createProduct();

        $this->postJson('/api/sales-history', [
            'productId' => $product->code,
            'periodDate' => '2026-03-04',
            'periodType' => 'week',
            'unitsSold' => 12,
        ])->assertCreated()
            ->assertJsonPath('periodDate', '2026-03-02')
            ->assertJsonPath('periodType', 'week');

        $this->postJson('/api/sales-history', [
            'productId' => $product->code,
            'periodDate' => '2026-03-06',
            'periodType' => 'week',
            'unitsSold' => 18,
        ])->assertCreated()->assertJsonPath('unitsSold', 18);

        $this->postJson('/api/sales-history', [
            'productId' => $product->code,
            'periodDate' => '2026-03-02',
            'periodType' => 'month',
            'unitsSold' => 45,
        ])->assertCreated()->assertJsonPath('periodDate', '2026-03-01');

        $this->assertDatabaseCount('sales_history', 2);
        $this->getJson('/api/sales-history?product='.$product->code.'&periodType=week')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.unitsSold', 18);
        $this->getJson('/api/sales-history?product='.$product->code)
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.periodType', 'month')
            ->assertJsonPath('0.unitsSold', 45);
    }

    private function createProduct(string $code = 'PRD-FORECAST'): Product
    {
        return Product::create([
            'code' => $code,
            'name' => 'Forecast Test Item',
            'stock_on_hand' => 12,
        ]);
    }

    private function addSales(Product $product, string $periodDate, int $units, string $periodType = 'month'): void
    {
        SalesHistory::create([
            'product_id' => $product->id,
            'period_date' => $periodDate,
            'period_type' => $periodType,
            'units_sold' => $units,
        ]);
    }
}
