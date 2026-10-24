<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\SafetyStock;
use App\Models\SeasonalEvent;
use App\Models\StockMovement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\Concerns\AuthenticatesBusinessApi;
use Tests\TestCase;

/** Reports & Analytics numbers match the rest of the system. */
class ReportsAccuracyTest extends TestCase
{
    use RefreshDatabase;
    use AuthenticatesBusinessApi;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function product(string $code, int $stock, array $extra = []): Product
    {
        return Product::create(array_merge(['code' => $code, 'name' => "Item {$code}", 'stock_on_hand' => $stock], $extra));
    }

    private function move(Product $p, string $type, int $qty, string $date, ?float $price = null, bool $adjustment = false): void
    {
        StockMovement::create([
            'product_id' => $p->id,
            'product_name' => $p->name,
            'movement_type' => $type,
            'is_adjustment' => $adjustment,
            'qty' => $qty,
            'unit_price' => $price,
            'remaining_stock' => 0,
            'movement_date' => $date,
        ]);
    }

    public function test_inventory_value_uses_the_latest_stock_in_price(): void
    {
        $this->travelTo(Carbon::parse('2026-10-24'));
        $a = $this->product('PRD-A', 10);
        $this->move($a, 'in', 5, '2026-10-01', 100);
        $this->move($a, 'in', 5, '2026-10-10', 120);     // latest cost → 120
        $b = $this->product('PRD-B', 4);                  // no price yet
        $c = $this->product('PRD-C', 2, ['unit_cost' => 50]); // product cost wins

        $kpis = $this->getJson('/api/reports')->assertOk()->json('stockSummary.kpis');

        $this->assertEquals(10 * 120 + 2 * 50, $kpis['inventoryValue']);
        $this->assertSame(1, $kpis['unpricedProducts']);
        $this->assertSame(16, $kpis['totalStock']);
    }

    public function test_stock_summary_uses_the_same_statuses_as_stock_control(): void
    {
        // No policy → default points: Low at 10, Critical at 5.
        $this->product('PRD-OUT', 0);
        $this->product('PRD-CRIT', 4);
        $this->product('PRD-LOW', 8);
        $this->product('PRD-OK', 50);

        $summary = $this->getJson('/api/reports')->assertOk()->json('stockSummary');
        $status = collect($summary['rows'])->pluck('status', 'productId');

        $this->assertSame('Out of Stock', $status['PRD-OUT']);
        $this->assertSame('Critical', $status['PRD-CRIT']);
        $this->assertSame('Low Stock', $status['PRD-LOW']);
        $this->assertSame('In Stock', $status['PRD-OK']);
        $this->assertSame(2, $summary['kpis']['lowStock']);      // Low + Critical
        $this->assertSame(1, $summary['kpis']['criticalStock']);
        $this->assertSame(1, $summary['kpis']['outOfStock']);
    }

    public function test_top_moving_value_uses_the_selling_price_on_each_sale(): void
    {
        $p = $this->product('PRD-T', 0);
        $this->move($p, 'out', 2, now()->toDateString(), 500);
        $this->move($p, 'out', 3, now()->toDateString(), 450);
        $this->move($p, 'out', 1, now()->toDateString());          // no price: units only
        $this->move($p, 'out', 9, now()->toDateString(), 999, true); // correction: ignored

        $this->getJson('/api/reports')->assertOk()
            ->assertJsonPath('topMoving.rows.0.productId', 'PRD-T')
            ->assertJsonPath('topMoving.rows.0.unitsSold', 6)
            ->assertJsonPath('topMoving.rows.0.value', 2350);
    }

    public function test_renamed_product_stays_one_row_in_top_moving(): void
    {
        $p = $this->product('PRD-R', 0);
        $this->move($p, 'out', 2, now()->toDateString());
        $p->update(['name' => 'Renamed Item']);
        StockMovement::create([
            'product_id' => $p->id, 'product_name' => 'Renamed Item', 'movement_type' => 'out',
            'is_adjustment' => false, 'qty' => 3, 'remaining_stock' => 0, 'movement_date' => now()->toDateString(),
        ]);

        $this->getJson('/api/reports')->assertOk()
            ->assertJsonCount(1, 'topMoving.rows')
            ->assertJsonPath('topMoving.rows.0.product', 'Renamed Item')
            ->assertJsonPath('topMoving.rows.0.unitsSold', 5);
    }

    public function test_stock_movement_shows_eight_whole_weeks_without_corrections(): void
    {
        $this->travelTo(Carbon::parse('2026-10-24'));  // Saturday; week starts Mon Oct 19
        $p = $this->product('PRD-M', 0);
        $this->move($p, 'in', 10, '2026-10-19');
        $this->move($p, 'out', 4, '2026-10-21');
        $this->move($p, 'in', 7, '2026-10-22', null, true);   // correction: left out
        $this->move($p, 'in', 3, '2026-08-20');               // older than 8 weeks

        $rows = $this->getJson('/api/reports')->assertOk()->json('stockMovement.rows');

        $this->assertCount(8, $rows);
        $this->assertSame('2026-08-31', $rows[0]['weekStart']);
        $last = end($rows);
        $this->assertSame(['Oct 19', 10, 4, 6], [$last['period'], $last['in'], $last['out'], $last['net']]);
        $this->assertSame(0, $rows[0]['in']);   // Aug 20 is before the window
        $this->assertSame(10, array_sum(array_column($rows, 'in')));
    }

    public function test_demand_forecast_matches_the_forecasting_page_including_seasonal_events(): void
    {
        $this->travelTo(Carbon::parse('2026-05-15'));
        $p = $this->product('PRD-F', 10);
        SafetyStock::create(['product_id' => $p->id, 'safety_stock' => 5, 'lead_time_days' => 7]);
        foreach (['2026-02-10', '2026-03-10', '2026-04-10'] as $date) {
            $this->move($p, 'out', 31, $date);
        }
        SeasonalEvent::create([
            'name' => 'Sale', 'start_date' => '2026-05-01', 'end_date' => '2026-05-31',
            'adjustment_pct' => 100, 'scope' => 'all', 'is_active' => true,
        ]);

        $forecast = $this->postJson('/api/forecasts', ['productId' => 'PRD-F'])->assertOk()->json();
        $row = $this->getJson('/api/reports')->assertOk()->json('demandForecast.rows.0');

        $this->assertEquals($forecast['adjustedForecast'], $row['forecastedDemand']);
        $this->assertEquals(62, $row['forecastedDemand']);   // 31 × (1 + 100%)
        $this->assertEquals(31, $row['baseForecast']);
        // ceil(5 + 2/day × 7 + 62 − 10) = 71
        $this->assertSame(71, $row['suggestedReorder']);
    }

    public function test_fast_and_slow_lists_keep_two_products_with_the_same_name_apart(): void
    {
        $fast = Product::create(['code' => 'PRD-1', 'name' => 'Poco X6 Pro', 'stock_on_hand' => 5, 'brand' => 'Poco']);
        Product::create(['code' => 'PRD-2', 'name' => 'Poco X6 Pro', 'stock_on_hand' => 30, 'brand' => 'Other']);
        $this->move($fast, 'out', 20, now()->subDays(3)->toDateString());

        $report = $this->getJson('/api/reports')->assertOk()->json('fastSlowMoving');

        $this->assertSame(['PRD-1'], array_column($report['fast'], 'productId'));
        $this->assertSame(['PRD-2'], array_column($report['slow'], 'productId'));
    }

    public function test_inventory_aging_ignores_corrections(): void
    {
        $this->travelTo(Carbon::parse('2026-10-24'));
        $p = $this->product('PRD-AG', 5);
        $this->move($p, 'in', 5, '2026-06-01');                 // real delivery: 145 days ago
        $this->move($p, 'in', 1, '2026-10-20', null, true);     // correction: not a delivery

        $this->getJson('/api/reports')->assertOk()
            ->assertJsonPath('inventoryAging.rows.0.daysInStock', 145)
            ->assertJsonPath('inventoryAging.rows.0.status', 'Slow Mover');
    }

    public function test_reorder_point_report_shows_the_point_that_decides_the_status(): void
    {
        $p = $this->product('PRD-MAN', 8);
        SafetyStock::create([
            'product_id' => $p->id, 'safety_stock' => 2,
            'status_mode' => 'manual', 'low_point' => 12, 'critical_point' => 4,
        ]);

        $this->getJson('/api/reports')->assertOk()
            ->assertJsonPath('reorderPoint.rows.0.urgency', 'Low')
            ->assertJsonPath('reorderPoint.rows.0.reorderPoint', 12)
            ->assertJsonPath('reorderPoint.rows.0.criticalPoint', 4)
            ->assertJsonPath('reorderPoint.rows.0.mode', 'manual');
    }

    public function test_dashboard_sends_the_supplier_lead_time_when_the_policy_has_none(): void
    {
        $supplier = \App\Models\Supplier::create(['name' => 'Fast Supplier', 'company' => 'Fast Supplier', 'lead_time_days' => 9]);
        $p = $this->product('PRD-SUP', 20, ['supplier_id' => $supplier->id]);
        $this->move($p, 'out', 5, now()->toDateString());

        $this->getJson('/api/dashboard/summary')->assertOk()
            ->assertJsonPath('products.0.leadTimeDays', 9);
    }
}
