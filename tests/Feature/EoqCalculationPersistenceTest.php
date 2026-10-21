<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Product;
use App\Models\SalesHistory;
use App\Models\SalesSeasonalAdjustment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EoqCalculationPersistenceTest extends TestCase
{
    use RefreshDatabase;

    public function test_historical_eoq_is_recalculated_and_saved_with_authenticated_user(): void
    {
        $user = User::factory()->create([
            'role' => User::ROLE_ADMIN,
            'status' => User::STATUS_ACTIVE,
        ]);
        $product = $this->createProduct();

        $this->actingAs($user)->postJson('/calculations', [
            'formula' => 'EOQ',
            'productId' => $product->code,
            'demandSource' => 'historical',
            'inputs' => [
                'annualDemand' => 100,
                'orderingCost' => 500,
                'holdingCost' => 50,
            ],
        ])->assertCreated()
            ->assertJsonPath('saved', true)
            ->assertJsonPath('recommendedOrderQuantity', 45);

        $log = ActivityLog::where('action', 'formula.compute')->firstOrFail();
        $this->assertSame($user->id, $log->user_id);
        $this->assertSame($product->name, $log->meta['product']);
        $this->assertSame('historical', $log->meta['demandSource']);
        $this->assertEquals(sqrt(2000), $log->meta['result']);
        $this->assertSame(45, $log->meta['recommendedOrderQuantity']);
    }

    public function test_forecast_eoq_revalidates_current_wma_and_saves_seasonal_metadata(): void
    {
        $user = User::factory()->create([
            'role' => User::ROLE_SUPER_ADMIN,
            'status' => User::STATUS_ACTIVE,
        ]);
        $product = $this->createProduct();
        foreach ([
            ['2026-01-01', 1000],
            ['2026-02-01', 10],
            ['2026-03-01', 20],
            ['2026-04-01', 40],
        ] as [$date, $units]) {
            SalesHistory::create([
                'product_id' => $product->id,
                'period_date' => $date,
                'period_type' => 'month',
                'units_sold' => $units,
            ]);
        }
        SalesSeasonalAdjustment::create([
            'product_id' => $product->id,
            'year' => 2026,
            'month' => 5,
            'enabled' => true,
            'events' => [['name' => 'Christmas', 'adjustmentPct' => 25]],
        ]);

        $this->actingAs($user)->postJson('/calculations', [
            'formula' => 'EOQ',
            'productId' => $product->code,
            'demandSource' => 'forecast',
            'inputs' => [
                'annualDemand' => 425,
                'orderingCost' => 500,
                'holdingCost' => 50,
            ],
            'forecast' => [
                'productId' => $product->code,
                'periodType' => 'month',
                'forecastPeriod' => '2026-05-01',
                'baseForecast' => 28.3,
                'seasonalEnabled' => true,
                'seasonalEvent' => 'Christmas',
                'adjustmentPct' => 25,
                'adjustedForecast' => 35.4,
            ],
        ])->assertCreated()
            ->assertJsonPath('recommendedOrderQuantity', 92);

        $log = ActivityLog::where('action', 'formula.compute')->firstOrFail();
        $this->assertSame('forecast', $log->meta['demandSource']);
        $this->assertSame(425, $log->meta['inputs']['annualDemand']);
        $this->assertSame('2026-05-01', $log->meta['forecast']['forecastPeriod']);
        $this->assertEquals(28.3, $log->meta['forecast']['baseForecast']);
        $this->assertEquals(35.4, $log->meta['forecast']['adjustedForecast']);
        $this->assertEquals(25.0, $log->meta['forecast']['adjustmentPct']);

        $this->getJson('/api/reports')
            ->assertOk()
            ->assertJsonPath('autoCalculator.rows.0.demandSource', 'forecast')
            ->assertJsonPath('autoCalculator.rows.0.productId', $product->code)
            ->assertJsonPath('autoCalculator.rows.0.annualDemand', 425)
            ->assertJsonPath('autoCalculator.rows.0.forecast.forecastPeriod', '2026-05-01')
            ->assertJsonPath('autoCalculator.rows.0.recommendedOrderQuantity', 92);
    }

    public function test_forecast_eoq_rejects_stale_or_tampered_forecast_values(): void
    {
        $user = User::factory()->create([
            'role' => User::ROLE_ADMIN,
            'status' => User::STATUS_ACTIVE,
        ]);
        $product = $this->createProduct();
        foreach ([
            ['2026-02-01', 10],
            ['2026-03-01', 20],
            ['2026-04-01', 40],
        ] as [$date, $units]) {
            SalesHistory::create([
                'product_id' => $product->id,
                'period_date' => $date,
                'period_type' => 'month',
                'units_sold' => $units,
            ]);
        }

        $this->actingAs($user)->postJson('/calculations', [
            'formula' => 'EOQ',
            'productId' => $product->code,
            'demandSource' => 'forecast',
            'inputs' => [
                'annualDemand' => 1200,
                'orderingCost' => 500,
                'holdingCost' => 50,
            ],
            'forecast' => [
                'productId' => $product->code,
                'periodType' => 'month',
                'forecastPeriod' => '2026-05-01',
                'baseForecast' => 999,
                'seasonalEnabled' => false,
                'seasonalEvent' => null,
                'adjustmentPct' => 0,
                'adjustedForecast' => 999,
            ],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('forecast');

        $this->assertDatabaseCount('activity_logs', 0);
    }

    public function test_only_administrators_can_save_eoq_reports(): void
    {
        $user = User::factory()->create([
            'role' => User::ROLE_STAFF,
            'status' => User::STATUS_ACTIVE,
        ]);

        $this->actingAs($user)->postJson('/calculations', [
            'formula' => 'EOQ',
            'inputs' => [
                'annualDemand' => 100,
                'orderingCost' => 500,
                'holdingCost' => 50,
            ],
        ])->assertForbidden();
    }

    private function createProduct(): Product
    {
        return Product::create([
            'code' => 'PRD-EOQ-TEST',
            'name' => 'EOQ Forecast Test Item',
            'stock_on_hand' => 12,
        ]);
    }
}
