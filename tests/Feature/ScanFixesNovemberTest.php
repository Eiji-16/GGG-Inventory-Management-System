<?php

namespace Tests\Feature;

use App\Models\PastSale;
use App\Models\Product;
use App\Models\SafetyStock;
use App\Models\StockMovement;
use App\Models\User;
use App\Services\ReorderPointService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\Concerns\AuthenticatesBusinessApi;
use Tests\TestCase;

/**
 * Fixes from the 2026-11-07 system scan (the "GGG Shirt" examples).
 */
class ScanFixesNovemberTest extends TestCase
{
    use RefreshDatabase;
    use AuthenticatesBusinessApi;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function shirt(int $stock): Product
    {
        $product = Product::create(['code' => 'PRD-SHIRT', 'name' => 'GGG Shirt', 'stock_on_hand' => $stock]);
        StockMovement::create([
            'product_id' => $product->id, 'product_name' => $product->name, 'movement_type' => 'in',
            'is_adjustment' => false, 'qty' => $stock, 'remaining_stock' => $stock,
            'movement_date' => now()->toDateString(),
        ]);

        return $product;
    }

    /** Fix 1: saving ordering/holding cost must not change the Low and Critical levels. */
    public function test_saving_costs_keeps_the_default_low_and_critical_levels(): void
    {
        $product = $this->shirt(8);
        $service = new ReorderPointService();
        $this->assertSame('low', $service->statusFor($product->fresh()));   // Low at 10

        $this->putJson('/api/products/PRD-SHIRT/eoq-costs', ['orderingCost' => 50, 'holdingCost' => 10])->assertOk();

        $fresh = Product::with('safetyStock')->find($product->id);
        $this->assertSame('low', (new ReorderPointService())->statusFor($fresh), 'Still Low after saving costs.');
        $this->assertSame(['mode' => 'manual', 'low' => 10, 'critical' => 5], (new ReorderPointService())->statusPoints($fresh));
        $this->getJson('/api/safety-stock')->assertJsonFragment([
            'productId' => 'PRD-SHIRT', 'statusMode' => 'manual', 'lowPoint' => 10, 'criticalPoint' => 5,
        ]);
    }

    /** Fix 1: a product that already has a policy keeps it exactly as it was. */
    public function test_saving_costs_does_not_touch_an_existing_policy(): void
    {
        $product = $this->shirt(8);
        SafetyStock::create(['product_id' => $product->id, 'safety_stock' => 4, 'status_mode' => 'auto']);

        $this->putJson('/api/products/PRD-SHIRT/eoq-costs', ['orderingCost' => 50, 'holdingCost' => 10])->assertOk();

        $this->assertDatabaseHas('safety_stock', ['product_id' => $product->id, 'safety_stock' => 4, 'status_mode' => 'auto']);
    }

    /** Fix 3: imported Past Sales count toward the reorder point. */
    public function test_imported_past_sales_count_toward_annual_demand(): void
    {
        $this->travelTo(Carbon::parse('2026-11-07'));
        $product = $this->shirt(20);   // Stock Control starts in November
        SafetyStock::create(['product_id' => $product->id, 'safety_stock' => 3, 'lead_time_days' => 14]);
        // Imported: 30 a month for the 12 months before November.
        for ($month = Carbon::parse('2025-11-01'); $month->lt(Carbon::parse('2026-11-01')); $month->addMonth()) {
            PastSale::create(['product_id' => $product->id, 'period_date' => $month->toDateString(), 'units_sold' => 30]);
        }
        // Older than 12 months: not counted.
        PastSale::create(['product_id' => $product->id, 'period_date' => '2025-10-01', 'units_sold' => 999]);

        $service = new ReorderPointService();
        $fresh = Product::with(['safetyStock', 'supplier'])->find($product->id);
        $this->assertSame(360, $service->annualDemand($fresh));
        // ceil(3 + 360 ÷ 365 × 14) = ceil(16.8) = 17, not 3.
        $this->assertSame(17, $service->forProduct($fresh));

        // The preloaded path (Dashboard, Reports, product list) gives the same numbers.
        $preloaded = (new ReorderPointService())->preload(collect([$fresh]));
        $this->assertSame(360, $preloaded->annualDemand($fresh));
        $this->getJson('/api/products')->assertJsonFragment(['id' => 'PRD-SHIRT', 'annualDemand' => 360]);
        $this->getJson('/api/dashboard/summary')->assertJsonPath('products.0.annualDemand', 360);
    }

    /** Fix 3: a month is never counted from both Past Sales and Stock Out. */
    public function test_past_sales_after_stock_control_began_are_not_counted_twice(): void
    {
        $this->travelTo(Carbon::parse('2026-11-07'));
        $product = Product::create(['code' => 'PRD-SHIRT', 'name' => 'GGG Shirt', 'stock_on_hand' => 0]);
        StockMovement::create([
            'product_id' => $product->id, 'product_name' => $product->name, 'movement_type' => 'in',
            'is_adjustment' => false, 'qty' => 50, 'remaining_stock' => 50, 'movement_date' => '2026-09-01',
        ]);
        StockMovement::create([
            'product_id' => $product->id, 'product_name' => $product->name, 'movement_type' => 'out',
            'is_adjustment' => false, 'qty' => 12, 'remaining_stock' => 38, 'movement_date' => '2026-09-15',
        ]);
        PastSale::create(['product_id' => $product->id, 'period_date' => '2026-08-01', 'units_sold' => 20]);   // before → counted
        PastSale::create(['product_id' => $product->id, 'period_date' => '2026-09-01', 'units_sold' => 99]);   // Stock Control month → ignored

        $this->assertSame(32, (new ReorderPointService())->annualDemand($product->fresh()));
    }

    /** Fix 5: two people's same-day entries stay as two rows, each with its own name. */
    public function test_same_day_entries_from_two_people_are_not_combined(): void
    {
        Product::create(['code' => 'PRD-SHIRT', 'name' => 'GGG Shirt', 'stock_on_hand' => 20]);
        $entry = fn () => ['productId' => 'PRD-SHIRT', 'type' => 'Stock Out', 'date' => '2026-10-24', 'unitPrice' => 250];

        $ana = User::factory()->create(['name' => 'Ana', 'role' => User::ROLE_SUPER_ADMIN, 'status' => User::STATUS_ACTIVE]);
        $ben = User::factory()->create(['name' => 'Ben', 'role' => User::ROLE_SUPER_ADMIN, 'status' => User::STATUS_ACTIVE]);

        $this->actingAs($ana)->postJson('/api/stock-movements', $entry() + ['qty' => 3])->assertCreated();
        $this->actingAs($ben)->postJson('/api/stock-movements', $entry() + ['qty' => 2])
            ->assertCreated()
            ->assertJsonMissing(['merged' => true]);
        // Ana again on the same day: added to her own row.
        $this->actingAs($ana)->postJson('/api/stock-movements', $entry() + ['qty' => 1])
            ->assertCreated()
            ->assertJsonPath('merged', true);

        $this->assertDatabaseHas('stock_movements', ['recorded_by' => 'Ana', 'qty' => 4]);
        $this->assertDatabaseHas('stock_movements', ['recorded_by' => 'Ben', 'qty' => 2]);
        $this->assertSame(2, StockMovement::count());
    }

    /** Fix 7: at 6 AM on November 1 (Philippine time) the forecast is already for November. */
    public function test_forecast_month_follows_the_philippine_clock(): void
    {
        // 2026-10-31 22:00 UTC = 2026-11-01 06:00 in Manila.
        $this->travelTo(Carbon::parse('2026-10-31 22:00:00', 'UTC'));
        $product = Product::create(['code' => 'PRD-SHIRT', 'name' => 'GGG Shirt', 'stock_on_hand' => 0]);
        foreach (['2026-08-10', '2026-09-10', '2026-10-10'] as $date) {
            StockMovement::create([
                'product_id' => $product->id, 'product_name' => $product->name, 'movement_type' => 'out',
                'is_adjustment' => false, 'qty' => 6, 'remaining_stock' => 0, 'movement_date' => $date,
            ]);
        }

        $this->postJson('/api/forecasts', ['productId' => 'PRD-SHIRT', 'periodType' => 'month'])
            ->assertOk()
            ->assertJsonPath('forecastPeriod', '2026-11-01')
            ->assertJsonPath('dataPoints', 3);
    }

    /** Fix 4: the server refuses a Stock Out that would make one variant negative. */
    public function test_stock_out_of_a_variant_cannot_go_below_zero(): void
    {
        Product::create(['code' => 'PRD-SHIRT', 'name' => 'GGG Shirt', 'variants' => ['Small', 'Large'], 'stock_on_hand' => 0]);
        $day = now('Asia/Manila')->subDay()->toDateString();
        $this->postJson('/api/stock-movements', [
            'productId' => 'PRD-SHIRT', 'variantName' => 'Small', 'type' => 'Stock In', 'qty' => 5, 'unitPrice' => 150, 'date' => $day,
        ])->assertCreated();

        // Total is 5, but Large has 0.
        $this->postJson('/api/stock-movements', [
            'productId' => 'PRD-SHIRT', 'variantName' => 'Large', 'type' => 'Stock Out', 'qty' => 2, 'unitPrice' => 250, 'date' => $day,
        ])->assertUnprocessable()->assertJsonValidationErrors('qty');

        // Small has 5, so selling 2 Small is fine.
        $this->postJson('/api/stock-movements', [
            'productId' => 'PRD-SHIRT', 'variantName' => 'small ', 'type' => 'Stock Out', 'qty' => 2, 'unitPrice' => 250, 'date' => $day,
        ])->assertCreated();
        $this->assertSame(3, Product::where('code', 'PRD-SHIRT')->value('stock_on_hand'));
    }

    /** Fix 4: Received asks which variant arrived and adds it to that variant. */
    public function test_received_needs_the_variant_for_products_with_variants(): void
    {
        Product::create(['code' => 'PRD-SHIRT', 'name' => 'GGG Shirt', 'variants' => ['Small', 'Large'], 'stock_on_hand' => 0]);
        $delivery = [
            'productId' => 'PRD-SHIRT', 'qty' => 20, 'unitPrice' => 150,
            'date' => now('Asia/Manila')->toDateString(), 'choice' => 'custom',
        ];

        $this->post('/api/reorder/receive', $delivery, ['Accept' => 'application/json'])
            ->assertUnprocessable()->assertJsonValidationErrors('variantName');
        $this->assertSame(0, StockMovement::count());

        $this->post('/api/reorder/receive', $delivery + ['variantName' => 'Large'], ['Accept' => 'application/json'])
            ->assertCreated()->assertJsonPath('variantName', 'Large');
        $this->assertSame(20, Product::where('code', 'PRD-SHIRT')->value('stock_on_hand'));

        // Now 2 Large can be sold.
        $this->postJson('/api/stock-movements', [
            'productId' => 'PRD-SHIRT', 'variantName' => 'Large', 'type' => 'Stock Out', 'qty' => 2, 'unitPrice' => 250,
        ])->assertCreated();
    }

    /** Fix 6: turning a page off in Role Access also blocks reading its data. */
    public function test_role_access_also_protects_reading_stock_records_and_costs(): void
    {
        Product::create(['code' => 'PRD-SHIRT', 'name' => 'GGG Shirt', 'stock_on_hand' => 3, 'unit_cost' => 120]);
        $staff = User::factory()->create(['role' => User::ROLE_STAFF, 'status' => User::STATUS_ACTIVE]);

        // Staff can open Stock Control by default, but not Products → no cost price.
        $this->actingAs($staff)->getJson('/api/stock-movements')->assertOk();
        $this->actingAs($staff)->getJson('/api/products')->assertOk()->assertJsonPath('0.unitCost', null);
        $this->actingAs($staff)->getJson('/api/suppliers')->assertForbidden();

        // The Super Admin turns off Stock Control and the Reorder List for Staff.
        $super = User::factory()->create(['role' => User::ROLE_SUPER_ADMIN, 'status' => User::STATUS_ACTIVE]);
        $this->actingAs($super)->putJson('/api/role-access', ['staff' => ['stock.view' => false, 'reorder.view' => false]])->assertOk();
        $this->actingAs($super)->getJson('/api/products')->assertJsonPath('0.unitCost', '120.00');

        $this->actingAs($staff)->getJson('/api/stock-movements')->assertForbidden();
    }
}
