<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\SeasonalEvent;
use App\Models\StockMovement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\Concerns\AuthenticatesBusinessApi;
use Tests\TestCase;

/**
 * Sales Forecasting: Weighted Moving Average over Stock Out transactions
 * (Stock Movement Tracking), with seasonal events applied afterwards.
 */
class SalesForecastTest extends TestCase
{
    use RefreshDatabase;
    use AuthenticatesBusinessApi;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_monthly_forecast_uses_completed_months_of_stock_out_sales(): void
    {
        $this->travelTo(Carbon::parse('2026-05-15'));
        $product = $this->createProduct();
        $this->stockOut($product, '2026-01-05', 600);
        $this->stockOut($product, '2026-01-20', 400);      // January total = 1000
        $this->stockOut($product, '2026-02-10', 10);
        $this->stockOut($product, '2026-03-10', 20);
        $this->stockOut($product, '2026-04-10', 40);
        $this->stockOut($product, '2026-05-02', 999);      // current month — not complete, ignored
        $this->stockIn($product, '2026-03-01', 500);       // deliveries are not sales
        $this->stockOut($product, '2026-04-12', 77, adjustment: true); // corrections are not sales

        $this->postJson('/api/forecasts', ['productId' => $product->code])
            ->assertOk()
            ->assertJsonPath('formula', 'Weighted Moving Average')
            ->assertJsonPath('source', 'stock_movements')
            ->assertJsonPath('forecastPeriod', '2026-05-01')
            ->assertJsonPath('dataPoints', 4)
            // (10×1 + 20×2 + 40×3) ÷ 6 = 28.3
            ->assertJsonPath('baseForecast', 28.3)
            ->assertJsonPath('adjustedForecast', 28.3)
            ->assertJsonPath('seasonalEnabled', false)
            ->assertJsonPath('confidence', 'Medium')
            ->assertJsonPath('history.0.unitsSold', 1000)
            ->assertJsonPath('history.0.weight', null)
            ->assertJsonPath('history.1.weight', 1)
            ->assertJsonPath('history.3.weight', 3)
            // April forecast = (1000×1 + 10×2 + 20×3) ÷ 6 = 180; variance 40 − 180 = −140
            ->assertJsonPath('history.3.wmaForecast', 180)
            ->assertJsonPath('history.3.variance', -140);
    }

    public function test_months_without_sales_count_as_zero(): void
    {
        $this->travelTo(Carbon::parse('2026-04-10'));
        $product = $this->createProduct();
        $this->stockOut($product, '2026-01-15', 30);
        $this->stockOut($product, '2026-03-15', 30);

        $this->getJson('/api/forecasts/history?product='.$product->code)
            ->assertOk()
            ->assertJsonPath('dataPoints', 3)
            ->assertJsonPath('rows.1.periodDate', '2026-02-01')
            ->assertJsonPath('rows.1.unitsSold', 0)
            // (30×1 + 0×2 + 30×3) ÷ 6 = 20
            ->assertJsonPath('nextForecast', 20);
    }

    public function test_weekly_forecast_groups_stock_outs_by_monday_weeks(): void
    {
        $this->travelTo(Carbon::parse('2026-03-31'));           // Tuesday; current week starts Mar 30
        $product = $this->createProduct();
        $this->stockOut($product, '2026-03-04', 10);            // week of Mar 2
        $this->stockOut($product, '2026-03-10', 20);            // week of Mar 9
        $this->stockOut($product, '2026-03-17', 30);            // week of Mar 16
        $this->stockOut($product, '2026-03-28', 40);            // week of Mar 23 (Saturday)

        $this->postJson('/api/forecasts', ['productId' => $product->code, 'periodType' => 'week'])
            ->assertOk()
            ->assertJsonPath('periodType', 'week')
            ->assertJsonPath('forecastPeriod', '2026-03-30')
            ->assertJsonPath('forecastPeriodEnd', '2026-04-05')
            ->assertJsonPath('dataPoints', 4)
            // (20×1 + 30×2 + 40×3) ÷ 6 = 33.3
            ->assertJsonPath('baseForecast', 33.3);
    }

    public function test_yearly_forecast_uses_completed_years(): void
    {
        $this->travelTo(Carbon::parse('2025-06-01'));
        $product = $this->createProduct();
        $this->stockOut($product, '2022-09-14', 10);
        $this->stockOut($product, '2023-06-10', 20);
        $this->stockOut($product, '2024-11-20', 40);

        $this->postJson('/api/forecasts', ['productId' => $product->code, 'periodType' => 'year'])
            ->assertOk()
            ->assertJsonPath('forecastPeriod', '2025-01-01')
            ->assertJsonPath('dataPoints', 3)
            ->assertJsonPath('baseForecast', 28.3);
    }

    public function test_active_seasonal_events_adjust_the_forecast_for_matching_products(): void
    {
        $this->travelTo(Carbon::parse('2026-04-10'));
        $product = $this->createProduct(category: 'Tops');
        $other = $this->createProduct('PRD-OTHER', 'Bags');
        foreach ([['2026-01-10', 10], ['2026-02-10', 20], ['2026-03-10', 40]] as [$date, $qty]) {
            $this->stockOut($product, $date, $qty);
        }

        $this->event('Spring Sale', '2026-04-01', '2026-04-30', 20);                                   // all products
        $this->event('Tops Promo', '2026-04-15', '2026-05-15', 10, 'categories', categories: ['Tops']); // overlaps April
        $this->event('Bag Week', '2026-04-01', '2026-04-30', 50, 'products', productIds: [$other->code]);
        $this->event('Paused', '2026-04-01', '2026-04-30', 90, active: false);
        $this->event('Christmas', '2026-12-01', '2026-12-25', 35);                                      // not this month

        $this->postJson('/api/forecasts', ['productId' => $product->code])
            ->assertOk()
            ->assertJsonPath('forecastPeriod', '2026-04-01')
            ->assertJsonPath('baseForecast', 28.3)
            ->assertJsonPath('seasonalEnabled', true)
            ->assertJsonCount(2, 'seasonalEvents')
            ->assertJsonPath('seasonalEvents.0.name', 'Spring Sale')
            ->assertJsonPath('seasonalEvents.1.name', 'Tops Promo')
            // Spring Sale (+20%) covers all 30 days of April. Tops Promo (+10%)
            // covers Apr 15–30, but those days already carry the stronger +20%,
            // so it is not counted on top: 20 × 30 ÷ 30 = +20%.
            ->assertJsonPath('adjustmentPct', 20)
            ->assertJsonPath('periodDays', 30)
            ->assertJsonPath('seasonalEvents.0.appliedDays', 30)
            ->assertJsonPath('seasonalEvents.0.contributionPct', 20)
            ->assertJsonPath('seasonalEvents.1.overlapDays', 16)
            ->assertJsonPath('seasonalEvents.1.appliedDays', 0)
            ->assertJsonPath('seasonalEvents.1.contributionPct', 0)
            // 28.3 × 1.20 = 33.96 → 34.0
            ->assertJsonPath('adjustedForecast', 34);
    }

    public function test_seasonal_events_also_apply_to_weekly_forecasts(): void
    {
        $this->travelTo(Carbon::parse('2026-12-02'));            // week of Nov 30 – Dec 6
        $product = $this->createProduct();
        foreach (['2026-11-10', '2026-11-17', '2026-11-24'] as $date) {
            $this->stockOut($product, $date, 12);
        }
        $this->event('Christmas Sale', '2026-12-01', '2026-12-25', 50);

        $this->postJson('/api/forecasts', ['productId' => $product->code, 'periodType' => 'week'])
            ->assertOk()
            ->assertJsonPath('forecastPeriod', '2026-11-30')
            ->assertJsonPath('baseForecast', 12)
            // Christmas Sale covers 6 of the week's 7 days: 50 × 6 ÷ 7 = +42.86%
            ->assertJsonPath('adjustmentPct', 42.86)
            ->assertJsonPath('seasonalEvents.0.overlapDays', 6)
            // 12 × 1.4286 = 17.14 → 17.1
            ->assertJsonPath('adjustedForecast', 17.1);
    }

    public function test_year_view_prorates_events_instead_of_adding_their_full_percentage(): void
    {
        $this->travelTo(Carbon::parse('2026-03-10'));
        $product = $this->createProduct();
        foreach (['2023-06-10', '2024-06-10', '2025-06-10'] as $date) {
            $this->stockOut($product, $date, 100);
        }
        $this->event('Valentines', '2026-02-10', '2026-02-14', 20);
        $this->event('Summer Sale', '2026-04-01', '2026-04-30', 15);
        $this->event('Christmas Sale', '2026-12-01', '2026-12-25', 35);

        // Old behaviour added 20 + 15 + 35 = +70%. Prorated over 365 days:
        // (20 × 5 + 15 × 30 + 35 × 25) ÷ 365 = 1425 ÷ 365 = +3.90%
        $this->postJson('/api/forecasts', ['productId' => $product->code, 'periodType' => 'year'])
            ->assertOk()
            ->assertJsonPath('forecastPeriod', '2026-01-01')
            ->assertJsonPath('periodDays', 365)
            ->assertJsonPath('baseForecast', 100)
            ->assertJsonPath('adjustmentPct', 3.9)
            ->assertJsonPath('seasonalEvents.2.contributionPct', 2.4)   // 35 × 25 ÷ 365
            ->assertJsonPath('adjustedForecast', 103.9);
    }

    public function test_events_crossing_the_period_boundary_only_count_their_days_inside_it(): void
    {
        $this->travelTo(Carbon::parse('2026-04-10'));
        $product = $this->createProduct();
        foreach ([['2026-01-10', 30], ['2026-02-10', 30], ['2026-03-10', 30]] as [$date, $qty]) {
            $this->stockOut($product, $date, $qty);
        }
        $this->event('Late March Promo', '2026-03-25', '2026-04-10', 30);   // 10 days in April

        // 30 × 10 ÷ 30 = +10%
        $this->postJson('/api/forecasts', ['productId' => $product->code])
            ->assertOk()
            ->assertJsonPath('seasonalEvents.0.overlapDays', 10)
            ->assertJsonPath('adjustmentPct', 10)
            ->assertJsonPath('adjustedForecast', 33);
    }

    public function test_overlapping_events_count_the_stronger_one_on_shared_days(): void
    {
        $this->travelTo(Carbon::parse('2026-04-10'));
        $product = $this->createProduct();
        foreach ([['2026-01-10', 30], ['2026-02-10', 30], ['2026-03-10', 30]] as [$date, $qty]) {
            $this->stockOut($product, $date, $qty);
        }
        $this->event('Early April', '2026-04-01', '2026-04-20', 20);
        $this->event('Late April', '2026-04-11', '2026-04-30', 30);

        // Apr 1–10 at +20%, Apr 11–30 at +30% (stronger wins on Apr 11–20):
        // (20 × 10 + 30 × 20) ÷ 30 = +26.67%
        $this->postJson('/api/forecasts', ['productId' => $product->code])
            ->assertOk()
            ->assertJsonPath('adjustmentPct', 26.67)
            ->assertJsonPath('seasonalEvents.0.appliedDays', 10)
            ->assertJsonPath('seasonalEvents.0.contributionPct', 6.67)
            ->assertJsonPath('seasonalEvents.1.appliedDays', 20)
            ->assertJsonPath('seasonalEvents.1.contributionPct', 20)
            ->assertJsonPath('adjustedForecast', 38);
    }

    public function test_suggest_adjustment_uses_the_same_month_in_earlier_years(): void
    {
        $this->travelTo(Carbon::parse('2026-11-10'));
        $product = $this->createProduct();
        for ($month = 1; $month <= 11; $month++) {
            $this->stockOut($product, sprintf('2025-%02d-10', $month), 10);
        }
        $this->stockOut($product, '2025-12-10', 20);   // WMA expected 10 → +100%

        $this->postJson('/api/seasonal-events/suggest', [
            'startDate' => '2026-12-01',
            'endDate' => '2026-12-25',
            'scope' => 'all',
        ])
            ->assertOk()
            ->assertJsonPath('suggestedPct', 100)
            ->assertJsonPath('basis.0.period', '2025-12')
            ->assertJsonPath('basis.0.actual', 20)
            ->assertJsonPath('basis.0.expected', 10);
    }

    public function test_suggest_adjustment_explains_when_history_is_too_short(): void
    {
        $this->travelTo(Carbon::parse('2026-04-10'));
        $product = $this->createProduct();
        $this->stockOut($product, '2026-03-10', 10);

        $response = $this->postJson('/api/seasonal-events/suggest', [
            'startDate' => '2026-12-01',
            'endDate' => '2026-12-25',
            'scope' => 'products',
            'productIds' => [$product->code],
        ])
            ->assertOk()
            ->assertJsonPath('suggestedPct', null);
        $this->assertStringContainsString('manually', $response->json('message'));
    }

    public function test_forecast_requires_completed_stock_out_sales(): void
    {
        $this->travelTo(Carbon::parse('2026-04-10'));
        $product = $this->createProduct();
        $this->stockOut($product, '2026-04-02', 5);              // only the current month

        $this->getJson('/api/forecasts/history?product='.$product->code)
            ->assertOk()
            ->assertJsonPath('dataPoints', 0)
            ->assertJsonCount(0, 'rows');

        $this->postJson('/api/forecasts', ['productId' => $product->code])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('productId');
    }

    public function test_legacy_formula_input_cannot_change_the_forecast_method(): void
    {
        $this->travelTo(Carbon::parse('2026-04-10'));
        $product = $this->createProduct();
        foreach ([['2026-01-10', 10], ['2026-02-10', 20], ['2026-03-10', 40]] as [$date, $qty]) {
            $this->stockOut($product, $date, $qty);
        }

        $this->postJson('/api/forecasts', ['productId' => $product->code, 'formula' => 'Linear Trend Regression'])
            ->assertOk()
            ->assertJsonPath('formula', 'Weighted Moving Average')
            ->assertJsonPath('baseForecast', 28.3);
    }

    public function test_confidence_follows_the_number_of_completed_periods(): void
    {
        $this->travelTo(Carbon::parse('2026-08-10'));
        $product = $this->createProduct();
        foreach (['2026-02-10', '2026-03-10', '2026-04-10', '2026-05-10', '2026-06-10', '2026-07-10'] as $date) {
            $this->stockOut($product, $date, 10);
        }

        $this->postJson('/api/forecasts', ['productId' => $product->code])
            ->assertOk()
            ->assertJsonPath('dataPoints', 6)
            ->assertJsonPath('confidence', 'High');
    }

    public function test_seasonal_events_can_be_created_listed_updated_and_deleted(): void
    {
        $this->travelTo(Carbon::parse('2026-12-10'));
        $product = $this->createProduct();

        $created = $this->postJson('/api/seasonal-events', [
            'name' => 'Christmas Sale',
            'startDate' => '2026-12-01',
            'endDate' => '2026-12-25',
            'adjustmentPct' => 35,
            'scope' => 'products',
            'productIds' => [$product->code],
        ])->assertCreated()
            ->assertJsonPath('status', 'Active')
            ->assertJsonPath('productNames.0', $product->name)
            ->json();

        $this->getJson('/api/seasonal-events')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.name', 'Christmas Sale')
            ->assertJsonPath('0.adjustmentPct', 35);

        $this->putJson('/api/seasonal-events/'.$created['id'], [
            'name' => 'Christmas Sale',
            'startDate' => '2026-12-01',
            'endDate' => '2026-12-25',
            'adjustmentPct' => -10,
            'scope' => 'all',
            'isActive' => false,
        ])->assertOk()
            ->assertJsonPath('adjustmentPct', -10)
            ->assertJsonPath('scope', 'all')
            ->assertJsonPath('productIds', [])
            ->assertJsonPath('status', 'Paused');

        $this->deleteJson('/api/seasonal-events/'.$created['id'])->assertOk();
        // Deleting moves it to the Trash Bin (soft delete); it no longer counts.
        $this->assertSame(0, \App\Models\SeasonalEvent::count());
        $this->assertSame(1, \App\Models\SeasonalEvent::onlyTrashed()->count());
    }

    public function test_seasonal_event_validation(): void
    {
        $this->postJson('/api/seasonal-events', [
            'name' => 'Backwards',
            'startDate' => '2026-12-25',
            'endDate' => '2026-12-01',
            'adjustmentPct' => -101,
            'scope' => 'categories',
            'categories' => [],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['endDate', 'adjustmentPct', 'categories']);
    }

    private function createProduct(string $code = 'PRD-FORECAST', ?string $category = null): Product
    {
        return Product::create([
            'code' => $code,
            'name' => 'Forecast Item '.$code,
            'category' => $category,
            'stock_on_hand' => 12,
        ]);
    }

    private function stockOut(Product $product, string $date, int $qty, bool $adjustment = false): void
    {
        $this->movement($product, $date, $qty, 'out', $adjustment);
    }

    private function stockIn(Product $product, string $date, int $qty): void
    {
        $this->movement($product, $date, $qty, 'in', false);
    }

    private function movement(Product $product, string $date, int $qty, string $type, bool $adjustment): void
    {
        StockMovement::create([
            'product_id' => $product->id,
            'product_name' => $product->name,
            'product_category' => $product->category,
            'movement_type' => $type,
            'is_adjustment' => $adjustment,
            'qty' => $qty,
            'remaining_stock' => 0,
            'movement_date' => $date,
        ]);
    }

    private function event(
        string $name,
        string $start,
        string $end,
        float $pct,
        string $scope = 'all',
        array $categories = [],
        array $productIds = [],
        bool $active = true,
    ): void {
        SeasonalEvent::create([
            'name' => $name,
            'start_date' => $start,
            'end_date' => $end,
            'adjustment_pct' => $pct,
            'scope' => $scope,
            'categories' => $scope === 'categories' ? $categories : null,
            'product_ids' => $scope === 'products' ? $productIds : null,
            'is_active' => $active,
        ]);
    }
}
