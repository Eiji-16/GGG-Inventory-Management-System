<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\SafetyStock;
use App\Models\SeasonalEvent;
use App\Models\StockMovement;
use App\Models\Supplier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\Concerns\AuthenticatesBusinessApi;
use Tests\TestCase;

/**
 * Dashboard reorder suggestions use forecast demand (Demand-Linked Reordering)
 * with current stock, safety stock and lead time — and never change stock.
 */
class DemandLinkedReorderTest extends TestCase
{
    use RefreshDatabase;
    use AuthenticatesBusinessApi;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function product(string $code, int $stock, ?int $safety = null, ?int $leadTime = null, ?int $supplierLead = null): Product
    {
        $supplier = $supplierLead !== null
            ? Supplier::create(['name' => "Supplier {$code}", 'company' => "Supplier {$code}", 'lead_time_days' => $supplierLead])
            : null;
        $product = Product::create([
            'code' => $code,
            'name' => "Item {$code}",
            'category' => 'Tops',
            'stock_on_hand' => $stock,
            'supplier_id' => $supplier?->id,
        ]);
        if ($safety !== null || $leadTime !== null) {
            SafetyStock::create([
                'product_id' => $product->id,
                'safety_stock' => $safety ?? 20,
                'lead_time_days' => $leadTime,
            ]);
        }

        return $product;
    }

    private function sold(Product $product, string $date, int $qty): void
    {
        StockMovement::create([
            'product_id' => $product->id,
            'product_name' => $product->name,
            'product_category' => $product->category,
            'movement_type' => 'out',
            'is_adjustment' => false,
            'qty' => $qty,
            'remaining_stock' => 0,
            'movement_date' => $date,
        ]);
    }

    public function test_suggestion_uses_next_months_forecast_and_explains_why(): void
    {
        $this->travelTo(Carbon::parse('2026-05-15'));
        $product = $this->product('PRD-A', 30, safety: 10, leadTime: 7);
        foreach (['2026-02-10', '2026-03-10', '2026-04-10'] as $date) {
            $this->sold($product, $date, 31);
        }

        // F = 31/month, May has 31 days → 1/day. ROP = 10 + 1 × 7 = 17.
        // 30 in stock > 17, but 31 forecast > 30 − 10 = 20 available.
        // Suggested = ceil(10 + 7 + 31 − 30) = 18.
        $response = $this->getJson('/api/dashboard/summary')->assertOk();
        $response->assertJsonCount(1, 'reorderSuggestions')
            ->assertJsonPath('reorderSuggestions.0.productId', 'PRD-A')
            ->assertJsonPath('reorderSuggestions.0.basis', 'forecast')
            ->assertJsonPath('reorderSuggestions.0.forecastDemand', 31)
            ->assertJsonPath('reorderSuggestions.0.reorderPoint', 17)
            ->assertJsonPath('reorderSuggestions.0.daysOfCover', 30)
            ->assertJsonPath('reorderSuggestions.0.suggestedQty', 18)
            ->assertJsonCount(1, 'reorderSuggestions.0.reasons');
        $this->assertStringContainsString('forecast demand', $response->json('reorderSuggestions.0.reasons.0'));
        $this->assertSame(30, $product->fresh()->stock_on_hand, 'Suggestions must not change stock.');
        $this->assertDatabaseCount('stock_movements', 3);
    }

    public function test_seasonal_forecast_can_trigger_a_suggestion_and_supplier_lead_time_is_used(): void
    {
        $this->travelTo(Carbon::parse('2026-11-15'));
        $product = $this->product('PRD-B', 40, safety: 5, supplierLead: 10);
        foreach (['2026-08-10', '2026-09-10', '2026-10-10'] as $date) {
            $this->sold($product, $date, 30);
        }

        // Without the event: F = 30, ROP = ceil(5 + 1 × 10) = 15, 30 ≤ 35 → no suggestion.
        $this->getJson('/api/dashboard/summary')->assertJsonCount(0, 'reorderSuggestions');

        SeasonalEvent::create([
            'name' => 'Sale', 'start_date' => '2026-11-01', 'end_date' => '2026-11-30',
            'adjustment_pct' => 50, 'scope' => 'all', 'is_active' => true,
        ]);
        // With +50% all month: F = 45 > 35 available → suggested.
        $this->getJson('/api/dashboard/summary')
            ->assertJsonCount(1, 'reorderSuggestions')
            ->assertJsonPath('reorderSuggestions.0.forecastDemand', 45)
            ->assertJsonPath('reorderSuggestions.0.leadTimeDays', 10);
    }

    public function test_healthy_products_are_not_suggested(): void
    {
        $this->travelTo(Carbon::parse('2026-05-15'));
        $product = $this->product('PRD-C', 500, safety: 10, leadTime: 7);
        foreach (['2026-02-10', '2026-03-10', '2026-04-10'] as $date) {
            $this->sold($product, $date, 31);
        }

        $this->getJson('/api/dashboard/summary')->assertJsonCount(0, 'reorderSuggestions');
    }

    public function test_products_without_a_forecast_fall_back_to_the_reorder_point(): void
    {
        $this->travelTo(Carbon::parse('2026-05-15'));
        $product = $this->product('PRD-D', 5);
        $this->sold($product, '2026-05-02', 3);   // current month only → no forecast yet

        // No policy yet → default Low point 10 (the same point that marks it
        // Low/Critical in Stock Alerts), so stock 5 is suggested.
        $this->getJson('/api/dashboard/summary')
            ->assertJsonCount(1, 'reorderSuggestions')
            ->assertJsonPath('reorderSuggestions.0.basis', 'reorder_point')
            ->assertJsonPath('reorderSuggestions.0.reorderPoint', 10)
            ->assertJsonPath('reorderSuggestions.0.forecastDemand', null);
        $this->assertSame(5, $product->fresh()->stock_on_hand);
    }
}
