<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\SalesHistory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SalesForecastTest extends TestCase
{
    use RefreshDatabase;

    public function test_forecast_uses_the_selected_products_monthly_sales_history(): void
    {
        $product = $this->createProduct();
        $this->addSales($product, '2026-01-01', 10);
        $this->addSales($product, '2026-02-01', 20);
        $this->addSales($product, '2026-03-01', 30);

        $this->postJson('/api/forecasts', [
            'productId' => $product->code,
            'formula' => 'Simple Moving Average',
        ])
            ->assertOk()
            ->assertJsonPath('product.id', $product->code)
            ->assertJsonPath('formula', 'Simple Moving Average')
            ->assertJsonPath('baseForecast', 20)
            ->assertJsonPath('forecastPeriod', '2026-04-01')
            ->assertJsonPath('dataPoints', 3)
            ->assertJsonPath('averageDemand', 20);
    }

    public function test_weighted_moving_average_weights_newer_months_more_heavily(): void
    {
        $product = $this->createProduct();
        $this->addSales($product, '2026-01-01', 10);
        $this->addSales($product, '2026-02-01', 20);
        $this->addSales($product, '2026-03-01', 40);

        $this->postJson('/api/forecasts', [
            'productId' => $product->code,
            'formula' => 'Weighted Moving Average',
        ])
            ->assertOk()
            ->assertJsonPath('baseForecast', 28.3);
    }

    public function test_exponential_smoothing_applies_the_configured_half_weight(): void
    {
        $product = $this->createProduct();
        $this->addSales($product, '2026-01-01', 10);
        $this->addSales($product, '2026-02-01', 20);
        $this->addSales($product, '2026-03-01', 30);

        $this->postJson('/api/forecasts', [
            'productId' => $product->code,
            'formula' => 'Exponential Smoothing',
        ])
            ->assertOk()
            ->assertJsonPath('baseForecast', 22.5);
    }

    public function test_linear_trend_projects_the_next_month_and_never_returns_negative_demand(): void
    {
        $product = $this->createProduct();
        $this->addSales($product, '2026-01-01', 10);
        $this->addSales($product, '2026-02-01', 20);
        $this->addSales($product, '2026-03-01', 30);

        $this->postJson('/api/forecasts', [
            'productId' => $product->code,
            'formula' => 'Linear Trend Regression',
        ])
            ->assertOk()
            ->assertJsonPath('baseForecast', 40);

        $declining = $this->createProduct('PRD-DECLINE');
        $this->addSales($declining, '2026-01-01', 30);
        $this->addSales($declining, '2026-02-01', 20);
        $this->addSales($declining, '2026-03-01', 10);

        $this->postJson('/api/forecasts', [
            'productId' => $declining->code,
            'formula' => 'Linear Trend Regression',
        ])
            ->assertOk()
            ->assertJsonPath('baseForecast', 0);
    }

    public function test_forecasting_requires_existing_sales_history_and_a_supported_formula(): void
    {
        $product = $this->createProduct();

        $this->postJson('/api/forecasts', [
            'productId' => $product->code,
            'formula' => 'Simple Moving Average',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('productId');

        $this->postJson('/api/forecasts', [
            'productId' => $product->code,
            'formula' => 'Holt-Winters',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('formula');
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
