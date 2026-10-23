<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\SalesHistory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\AuthenticatesBusinessApi;
use Tests\TestCase;

/**
 * Legacy endpoints kept for compatibility: manual sales history and the old
 * per-month seasonal adjustments. The forecast itself no longer reads these —
 * it uses Stock Out transactions (see SalesForecastTest).
 */
class LegacySalesHistoryTest extends TestCase
{
    use RefreshDatabase;
    use AuthenticatesBusinessApi;

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


    public function test_reset_sales_history_deletes_all_years_and_period_types_for_selected_product(): void
    {
        $product = $this->createProduct('PRD-RESET');
        $otherProduct = $this->createProduct('PRD-KEEP');
        $this->addSales($product, '2024-01-01', 20);
        $this->addSales($product, '2026-01-05', 8, 'week');
        $this->addSales($product, '2025-01-01', 11, 'year');
        $this->addSales($otherProduct, '2026-01-01', 15);

        $this->deleteJson('/api/sales-history/products/'.$product->code)
        ->assertOk()
        ->assertJsonPath('productId', $product->code)
        ->assertJsonPath('deleted', 3);

        $this->assertDatabaseMissing('sales_history', ['product_id' => $product->id]);
        $this->assertDatabaseHas('sales_history', [
        'product_id' => $otherProduct->id,
        'period_type' => 'month',
        'units_sold' => 15,
        ]);
        $this->assertDatabaseHas('products', [
        'id' => $product->id,
        'stock_on_hand' => 12,
        ]);
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
