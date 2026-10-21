<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\SalesHistory;
use App\Models\SalesSeasonalAdjustment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;
use Tests\Concerns\AuthenticatesBusinessApi;

class SalesForecastTest extends TestCase
{
    use RefreshDatabase;
    use AuthenticatesBusinessApi;

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

    public function test_monthly_forecast_applies_only_saved_events_for_its_forecast_month_and_year(): void
    {
        $product = $this->createProduct();
        $this->addSales($product, '2026-01-01', 10);
        $this->addSales($product, '2026-02-01', 20);
        $this->addSales($product, '2026-03-01', 40);
        SalesSeasonalAdjustment::create([
            'product_id' => $product->id,
            'year' => 2026,
            'month' => 4,
            'enabled' => true,
            'events' => [
                ['name' => 'Spring Sale', 'adjustmentPct' => 20],
                ['name' => 'Local Festival', 'adjustmentPct' => 10],
            ],
        ]);
        SalesSeasonalAdjustment::create([
            'product_id' => $product->id,
            'year' => 2027,
            'month' => 4,
            'enabled' => true,
            'events' => [['name' => 'Different year', 'adjustmentPct' => 90]],
        ]);

        $this->postJson('/api/forecasts', [
            'productId' => $product->code,
            'periodType' => 'month',
        ])
            ->assertOk()
            ->assertJsonPath('forecastPeriod', '2026-04-01')
            ->assertJsonPath('baseForecast', 28.3)
            ->assertJsonPath('adjustmentPct', 30)
            ->assertJsonPath('adjustedForecast', 36.8)
            ->assertJsonPath('seasonalEnabled', true)
            ->assertJsonPath('seasonalEvents.0.name', 'Spring Sale');
    }

    public function test_seasonal_events_are_saved_per_product_year_and_month(): void
    {
        $product = $this->createProduct();

        $this->putJson('/api/sales-seasonal-adjustments', [
            'productId' => $product->code,
            'year' => 2026,
            'month' => 4,
            'enabled' => true,
            'events' => [
                ['name' => 'Spring Sale', 'adjustmentPct' => 12.5],
                ['name' => 'Holiday', 'adjustmentPct' => -5],
            ],
        ])
            ->assertOk()
            ->assertJsonPath('enabled', true)
            ->assertJsonCount(2, 'events')
            ->assertJsonPath('events.0.adjustmentPct', 12.5);

        $this->getJson('/api/sales-seasonal-adjustments?product='.$product->code)
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.year', 2026)
            ->assertJsonPath('0.month', 4)
            ->assertJsonPath('0.events.1.name', 'Holiday');

        $this->putJson('/api/sales-seasonal-adjustments', [
            'productId' => $product->code,
            'year' => 2026,
            'month' => 4,
            'enabled' => false,
            'events' => [],
        ])->assertOk()->assertJsonCount(0, 'events');

        $this->assertDatabaseCount('sales_seasonal_adjustments', 1);
    }

    public function test_seasonal_adjustments_reject_values_below_negative_one_hundred_percent(): void
    {
        $product = $this->createProduct();

        $this->putJson('/api/sales-seasonal-adjustments', [
            'productId' => $product->code,
            'year' => 2026,
            'month' => 4,
            'enabled' => true,
            'events' => [['name' => 'Invalid', 'adjustmentPct' => -101]],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('events.0.adjustmentPct');
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

    public function test_bulk_sales_history_saves_and_deletes_only_the_submitted_periods(): void
    {
        $product = $this->createProduct();
        $this->addSales($product, '2025-01-01', 8);
        $this->addSales($product, '2026-01-01', 12);
        $this->addSales($product, '2026-01-05', 4, 'week');

        $this->putJson('/api/sales-history/bulk', [
            'productId' => $product->code,
            'periodType' => 'month',
            'records' => [
                ['periodDate' => '2026-02-11', 'unitsSold' => 24],
            ],
            'deleteDates' => ['2026-01-01'],
        ])->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.periodDate', '2026-02-01')
            ->assertJsonPath('0.unitsSold', 24);

        $this->assertDatabaseHas('sales_history', [
            'product_id' => $product->id,
            'period_type' => 'month',
            'period_date' => '2025-01-01 00:00:00',
            'units_sold' => 8,
        ]);
        $this->assertDatabaseHas('sales_history', [
            'product_id' => $product->id,
            'period_type' => 'week',
            'period_date' => '2026-01-05 00:00:00',
            'units_sold' => 4,
        ]);
        $this->assertDatabaseHas('sales_history', [
            'product_id' => $product->id,
            'period_type' => 'month',
            'period_date' => '2026-02-01',
            'units_sold' => 24,
        ]);
        $this->assertDatabaseMissing('sales_history', [
            'product_id' => $product->id,
            'period_type' => 'month',
            'period_date' => '2026-01-01 00:00:00',
        ]);

        $this->getJson('/api/sales-history?product='.$product->code.'&periodType=month')
            ->assertOk()
            ->assertJsonCount(2)
            ->assertJsonPath('0.productId', $product->code)
            ->assertJsonPath('0.periodType', 'month')
            ->assertJsonPath('0.periodDate', '2025-01-01')
            ->assertJsonPath('0.unitsSold', 8)
            ->assertJsonPath('1.periodDate', '2026-02-01')
            ->assertJsonPath('1.unitsSold', 24);

        $this->getJson('/api/sales-history?product='.$product->code.'&periodType=week')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.productId', $product->code)
            ->assertJsonPath('0.periodType', 'week')
            ->assertJsonPath('0.periodDate', '2026-01-05')
            ->assertJsonPath('0.unitsSold', 4);
    }

    public function test_bulk_sales_history_rejects_negative_units_and_duplicate_normalized_weeks(): void
    {
        $product = $this->createProduct();

        $this->putJson('/api/sales-history/bulk', [
            'productId' => $product->code,
            'periodType' => 'month',
            'records' => [
                ['periodDate' => '2026-01-01', 'unitsSold' => -1],
            ],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('records.0.unitsSold');

        $this->putJson('/api/sales-history/bulk', [
            'productId' => $product->code,
            'periodType' => 'week',
            'records' => [
                ['periodDate' => '2026-03-02', 'unitsSold' => 5],
                ['periodDate' => '2026-03-04', 'unitsSold' => 8],
            ],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('records');
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
