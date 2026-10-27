<?php

namespace Tests\Feature;

use App\Models\PastSale;
use App\Models\Product;
use App\Models\StockMovement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\Concerns\AuthenticatesBusinessApi;
use Tests\TestCase;

/**
 * Past sales (before Stock Control records begin) as extra forecasting
 * history — manual month/week grid and Excel import.
 */
class PastSalesTest extends TestCase
{
    use RefreshDatabase;
    use AuthenticatesBusinessApi {
        setUp as authenticatedSetUp;
    }

    protected function setUp(): void
    {
        $this->authenticatedSetUp();
        $this->travelTo(Carbon::parse('2026-10-23'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_past_sales_fill_the_months_before_stock_control_records_begin(): void
    {
        $product = $this->product('PRD-IP11', 'Iphone 11');
        $this->movement($product, '2026-06-01', 'in', 50);   // Stock Control starts in June
        $this->movement($product, '2026-07-15', 'out', 5);
        $this->movement($product, '2026-08-12', 'out', 14);
        foreach (['2026-03' => 9, '2026-04' => 11, '2026-05' => 12, '2026-06' => 999, '2026-07' => 999] as $month => $units) {
            PastSale::create(['product_id' => $product->id, 'period_date' => "$month-01", 'units_sold' => $units]);
        }

        $rows = $this->getJson('/api/forecasts/history?product=PRD-IP11')->assertOk()->json('rows');

        $this->assertSame(
            ['2026-03-01:9:past', '2026-04-01:11:past', '2026-05-01:12:past', '2026-06-01:0:none', '2026-07-01:5:stock', '2026-08-01:14:stock', '2026-09-01:0:none'],
            array_map(fn ($r) => "{$r['periodDate']}:{$r['unitsSold']}:{$r['source']}", $rows)
        );
    }

    public function test_product_without_stock_control_records_forecasts_from_past_sales_only(): void
    {
        $product = $this->product('PRD-NEW', 'New Phone');
        foreach (['2026-07' => 10, '2026-08' => 20, '2026-09' => 40] as $month => $units) {
            PastSale::create(['product_id' => $product->id, 'period_date' => "$month-01", 'units_sold' => $units]);
        }

        $this->postJson('/api/forecasts', ['productId' => 'PRD-NEW'])
            ->assertOk()
            ->assertJsonPath('dataPoints', 3)
            ->assertJsonPath('baseForecast', 28.3)   // (10×1 + 20×2 + 40×3) ÷ 6
            ->assertJsonPath('forecastPeriod', '2026-10-01');
    }

    public function test_yearly_view_adds_past_months_to_their_year_and_weekly_view_ignores_them(): void
    {
        $product = $this->product('PRD-Y', 'Yearly Item');
        PastSale::create(['product_id' => $product->id, 'period_date' => '2025-03-01', 'units_sold' => 100]);
        PastSale::create(['product_id' => $product->id, 'period_date' => '2025-11-01', 'units_sold' => 50]);

        $this->getJson('/api/forecasts/history?product=PRD-Y&periodType=year')
            ->assertOk()
            ->assertJsonPath('rows.0.periodDate', '2025-01-01')
            ->assertJsonPath('rows.0.unitsSold', 150);
        $this->getJson('/api/forecasts/history?product=PRD-Y&periodType=week')
            ->assertOk()
            ->assertJsonPath('dataPoints', 0);
    }

    public function test_month_grid_saves_updates_and_clears_months_before_the_cutoff_only(): void
    {
        $product = $this->product('PRD-IP11', 'Iphone 11');
        $this->movement($product, '2026-06-01', 'in', 50);

        $this->putJson('/api/past-sales', ['productId' => 'PRD-IP11', 'records' => [
            ['month' => '2026-04', 'unitsSold' => 11],
            ['month' => '2026-05', 'unitsSold' => 12],
        ]])->assertOk()
            ->assertJsonPath('cutoff', '2026-06')
            ->assertJsonPath('recordingStart', '2026-06')
            ->assertJsonCount(2, 'rows');

        $this->putJson('/api/past-sales', ['productId' => 'PRD-IP11', 'records' => [
            ['month' => '2026-04', 'unitsSold' => null],
            ['month' => '2026-05', 'unitsSold' => 15],
        ]])->assertOk()
            ->assertJsonCount(1, 'rows')
            ->assertJsonPath('rows.0.unitsSold', 15)
            ->assertJsonPath('rows.0.source', 'manual');

        $this->putJson('/api/past-sales', ['productId' => 'PRD-IP11', 'records' => [
            ['month' => '2026-06', 'unitsSold' => 3],
        ]])->assertUnprocessable()->assertJsonValidationErrors('records.0.month');
    }

    public function test_import_preview_then_commit_with_totals_skips_and_errors(): void
    {
        $ip = $this->product('PRD-IP11', 'Iphone 11');
        $this->product('PRD-CASE', 'Phone Case');
        $this->product('PRD-D1', 'Duplicate Name');
        $this->product('PRD-D2', 'Duplicate Name');
        $this->movement($ip, '2026-06-01', 'in', 50);

        $rows = [
            ['row' => 2, 'productId' => 'prd-ip11', 'month' => '2026-04', 'unitsSold' => 7],     // id, any case
            ['row' => 3, 'productName' => ' iphone 11 ', 'month' => '2026-04', 'unitsSold' => 4], // same month → added
            ['row' => 4, 'productName' => 'Phone Case', 'month' => '2026-05', 'unitsSold' => '30'],
            ['row' => 5, 'productName' => 'Phone Case', 'month' => '2026-06', 'unitsSold' => ''], // blank → ignored
            ['row' => 6, 'productId' => 'PRD-IP11', 'month' => '2026-07', 'unitsSold' => 9],     // Stock Control month
            ['row' => 7, 'productName' => 'Phone Case', 'month' => '2026-10', 'unitsSold' => 9], // current month
            ['row' => 8, 'productName' => 'Unknown Thing', 'month' => '2026-05', 'unitsSold' => 1],
            ['row' => 9, 'productName' => 'Duplicate Name', 'month' => '2026-05', 'unitsSold' => 1],
            ['row' => 10, 'productName' => 'Phone Case', 'month' => 'banana', 'unitsSold' => 1],
            ['row' => 11, 'productName' => 'Phone Case', 'month' => '2026-03', 'unitsSold' => -2],
            ['row' => 12, 'productName' => 'Phone Case', 'month' => '2026-02', 'unitsSold' => 2.5],
        ];

        $preview = $this->postJson('/api/past-sales/import', ['rows' => $rows])->assertOk()->json();
        $this->assertFalse($preview['committed']);
        $this->assertSame(['rowsRead' => 11, 'readyMonths' => 2, 'products' => 2, 'totalUnits' => 41, 'errors' => 5, 'skipped' => 2], $preview['summary']);
        $this->assertSame(11, collect($preview['ready'])->firstWhere('productId', 'PRD-IP11')['unitsSold']);
        $this->assertSame(0, PastSale::count());
        $this->assertSame('Already recorded in Stock Control from Jun 2026.', collect($preview['issues'])->firstWhere('row', 6)['message']);

        $this->postJson('/api/past-sales/import', ['rows' => $rows, 'commit' => true])
            ->assertOk()
            ->assertJsonPath('saved', 2);
        $this->assertDatabaseHas('past_sales', ['product_id' => $ip->id, 'units_sold' => 11, 'source' => 'import']);

        // Re-importing replaces (does not double) the month totals.
        $this->postJson('/api/past-sales/import', ['rows' => $rows, 'commit' => true])->assertOk();
        $this->assertSame(2, PastSale::count());
        $this->assertSame(11, PastSale::where('product_id', $ip->id)->value('units_sold'));
    }

    public function test_week_grid_saves_weeks_before_stock_control_begins_and_keeps_months_separate(): void
    {
        $product = $this->product('PRD-WK', 'Weekly Item');
        $this->movement($product, '2026-09-16', 'in', 50);   // a Wednesday → weekly cutoff is Mon Sep 14

        $this->putJson('/api/past-sales', ['productId' => 'PRD-WK', 'periodType' => 'week', 'records' => [
            ['week' => '2026-08-31', 'unitsSold' => 10],
            ['week' => '2026-09-07', 'unitsSold' => 20],
        ]])->assertOk()
            ->assertJsonPath('periodType', 'week')
            ->assertJsonPath('cutoff', '2026-09-14')
            ->assertJsonCount(2, 'rows')
            ->assertJsonPath('rows.0.week', '2026-08-31');

        // The week Stock Control starts, and a non-Monday date, are refused.
        $this->putJson('/api/past-sales', ['productId' => 'PRD-WK', 'periodType' => 'week', 'records' => [
            ['week' => '2026-09-14', 'unitsSold' => 5],
        ]])->assertUnprocessable()->assertJsonValidationErrors('records.0.week');
        $this->putJson('/api/past-sales', ['productId' => 'PRD-WK', 'periodType' => 'week', 'records' => [
            ['week' => '2026-09-08', 'unitsSold' => 5],
        ]])->assertUnprocessable()->assertJsonValidationErrors('records.0.week');

        // A monthly row for the same dates is stored separately.
        $this->putJson('/api/past-sales', ['productId' => 'PRD-WK', 'records' => [
            ['month' => '2026-08', 'unitsSold' => 40],
        ]])->assertOk()->assertJsonCount(1, 'rows');
        $this->getJson('/api/past-sales?product=PRD-WK&periodType=week')->assertJsonCount(2, 'rows');

        // Clearing a week removes only that week.
        $this->putJson('/api/past-sales', ['productId' => 'PRD-WK', 'periodType' => 'week', 'records' => [
            ['week' => '2026-08-31', 'unitsSold' => null],
        ]])->assertOk()->assertJsonCount(1, 'rows');
        $this->assertSame(1, PastSale::where('period_type', 'month')->count());
    }

    public function test_weekly_forecast_uses_weekly_past_sales_and_monthly_view_ignores_them(): void
    {
        $product = $this->product('PRD-WF', 'Weekly Forecast Item');
        foreach (['2026-09-28' => 10, '2026-10-05' => 20, '2026-10-12' => 40] as $week => $units) {
            PastSale::create(['product_id' => $product->id, 'period_type' => 'week', 'period_date' => $week, 'units_sold' => $units]);
        }

        $this->postJson('/api/forecasts', ['productId' => 'PRD-WF', 'periodType' => 'week'])
            ->assertOk()
            ->assertJsonPath('dataPoints', 3)
            ->assertJsonPath('baseForecast', 28.3)   // (10×1 + 20×2 + 40×3) ÷ 6
            ->assertJsonPath('forecastPeriod', '2026-10-19');
        $this->getJson('/api/forecasts/history?product=PRD-WF&periodType=month')
            ->assertOk()
            ->assertJsonPath('dataPoints', 0);
    }

    public function test_weeks_are_split_into_months_by_days_and_always_add_back_to_the_weekly_total(): void
    {
        $service = app(\App\Services\SalesForecastService::class);

        // Mon Sep 28 – Sun Oct 4, 2026: 3 days in September, 4 in October.
        $months = $service->monthsFromWeeks(['2026-09-28' => 22]);
        $this->assertSame(9, $months['2026-09-01']['unitsSold']);   // 22 × 3/7 = 9.43 → 9
        $this->assertSame(13, $months['2026-10-01']['unitsSold']);  // the rest: 22 − 9
        $this->assertSame(22, $months['2026-09-01']['unitsSold'] + $months['2026-10-01']['unitsSold']);

        // A week fully inside one month counts fully for that month.
        $this->assertSame(['2026-09-01'], array_keys($service->monthsFromWeeks(['2026-09-07' => 13])));
        $this->assertSame(13, $service->monthsFromWeeks(['2026-09-07' => 13])['2026-09-01']['unitsSold']);

        // Weeks touching a month: Sep 2026 (Tue 1st – Wed 30th) = 5, Feb 2027 (Mon 1st – Sun 28th) = 4, Nov 2026 = 6.
        $this->assertSame(5, $service->weeksTouchingMonth(Carbon::parse('2026-09-01')));
        $this->assertSame(4, $service->weeksTouchingMonth(Carbon::parse('2027-02-01')));
        $this->assertSame(6, $service->weeksTouchingMonth(Carbon::parse('2026-11-01')));
    }

    public function test_monthly_forecast_uses_complete_weekly_months_and_typed_months_win(): void
    {
        $product = $this->product('PRD-AUTO', 'Auto Month Item');
        // Every week touching August 2026 (Jul 27 … Aug 31) → August is complete.
        // Jul 27 – Aug 2: 5 days July, 2 days August → 14 × 2/7 = 4 to August.
        // Aug 31 – Sep 6: 1 day August → 14 × 1/7 = 2 to August.
        foreach (['2026-07-27' => 14, '2026-08-03' => 10, '2026-08-10' => 10, '2026-08-17' => 10, '2026-08-24' => 10, '2026-08-31' => 14] as $week => $units) {
            PastSale::create(['product_id' => $product->id, 'period_type' => 'week', 'period_date' => $week, 'units_sold' => $units]);
        }
        // Only some weeks of September → incomplete, not used.
        PastSale::create(['product_id' => $product->id, 'period_type' => 'week', 'period_date' => '2026-09-07', 'units_sold' => 99]);
        // June is typed as a monthly entry.
        PastSale::create(['product_id' => $product->id, 'period_type' => 'month', 'period_date' => '2026-06-01', 'units_sold' => 30]);

        $rows = $this->getJson('/api/forecasts/history?product=PRD-AUTO')->assertOk()->json('rows');
        $this->assertSame(
            ['2026-06-01:30:past:typed', '2026-07-01:0:none:typed', '2026-08-01:46:past:weeks', '2026-09-01:0:none:typed'],
            array_map(fn ($r) => "{$r['periodDate']}:{$r['unitsSold']}:{$r['source']}:".(! empty($r['fromWeeks']) ? 'weeks' : 'typed'), $rows)
        );

        // A typed August entry replaces the weekly total (never both).
        PastSale::create(['product_id' => $product->id, 'period_type' => 'month', 'period_date' => '2026-08-01', 'units_sold' => 40]);
        $this->getJson('/api/forecasts/history?product=PRD-AUTO')
            ->assertOk()
            ->assertJsonPath('rows.2.unitsSold', 40)
            ->assertJsonMissingPath('rows.2.fromWeeks');

        // The weekly forecast still uses the weeks themselves.
        $this->getJson('/api/forecasts/history?product=PRD-AUTO&periodType=week')
            ->assertOk()
            ->assertJsonPath('rows.0.periodDate', '2026-07-27')
            ->assertJsonPath('rows.0.unitsSold', 14);
    }

    public function test_month_grid_reports_weekly_totals_with_completeness_and_whether_they_are_used(): void
    {
        $product = $this->product('PRD-GRID', 'Grid Item');
        foreach (['2026-07-27' => 14, '2026-08-03' => 10, '2026-08-10' => 10, '2026-08-17' => 10, '2026-08-24' => 10, '2026-08-31' => 14, '2026-09-07' => 13] as $week => $units) {
            PastSale::create(['product_id' => $product->id, 'period_type' => 'week', 'period_date' => $week, 'units_sold' => $units]);
        }
        PastSale::create(['product_id' => $product->id, 'period_type' => 'month', 'period_date' => '2026-09-01', 'units_sold' => 35]);

        $fromWeeks = collect($this->getJson('/api/past-sales?product=PRD-GRID')->assertOk()->json('fromWeeks'))->keyBy('month');

        $this->assertSame(['month' => '2026-08', 'unitsSold' => 46, 'weeksEntered' => 6, 'weeksNeeded' => 6, 'complete' => true, 'used' => true], $fromWeeks['2026-08']);
        // September: 1 day of the Aug 31 week (12) + Sep 7 week (13) = 25 from 2 of 5 weeks; the typed 35 is used instead.
        $this->assertSame(['month' => '2026-09', 'unitsSold' => 25, 'weeksEntered' => 2, 'weeksNeeded' => 5, 'complete' => false, 'used' => false], $fromWeeks['2026-09']);
    }

    private function product(string $code, string $name): Product
    {
        return Product::create(['code' => $code, 'name' => $name, 'stock_on_hand' => 30]);
    }

    private function movement(Product $product, string $date, string $type, int $qty): void
    {
        StockMovement::create([
            'product_id' => $product->id,
            'product_name' => $product->name,
            'movement_type' => $type,
            'is_adjustment' => false,
            'qty' => $qty,
            'remaining_stock' => 0,
            'movement_date' => $date,
        ]);
    }
}
