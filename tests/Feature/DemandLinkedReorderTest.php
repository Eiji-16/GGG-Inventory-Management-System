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
 * The Dashboard's Reorder List card shows the same products as the Reorder
 * List page (stock at or below the Low level); the forecast only adds
 * "about N days left". It never changes stock. (Updated 2026-11-07.)
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

    public function test_card_lists_the_same_products_as_the_reorder_list_page(): void
    {
        $this->travelTo(Carbon::parse('2026-05-15'));
        // 93 sold in the last year → reorder point = ceil(10 + 93 ÷ 365 × 7) = 12.
        $product = $this->product('PRD-A', 11, safety: 10, leadTime: 7);
        foreach (['2026-02-10', '2026-03-10', '2026-04-10'] as $date) {
            $this->sold($product, $date, 31);
        }

        // 11 ≤ 12 → Low, the same as the Reorder List page. May forecast
        // 31 units over 31 days = 1 a day → about 11 days left.
        $response = $this->getJson('/api/dashboard/summary')->assertOk();
        $response->assertJsonCount(1, 'reorderSuggestions')
            ->assertJsonPath('reorderSuggestions.0.productId', 'PRD-A')
            ->assertJsonPath('reorderSuggestions.0.status', 'low')
            ->assertJsonPath('reorderSuggestions.0.reorderPoint', 12)
            ->assertJsonPath('reorderSuggestions.0.daysOfCover', 11)
            ->assertJsonMissingPath('reorderSuggestions.0.suggestedQty');
        $this->assertSame(11, $product->fresh()->stock_on_hand, 'The card must not change stock.');
        $this->assertDatabaseCount('stock_movements', 3);
    }

    public function test_stock_above_the_low_level_is_not_listed_even_if_the_forecast_is_high(): void
    {
        $this->travelTo(Carbon::parse('2026-05-15'));
        // Before 2026-11-07 the card listed this product ("not enough for
        // next month") while the Reorder List page did not.
        $product = $this->product('PRD-B', 30, safety: 10, leadTime: 7);
        foreach (['2026-02-10', '2026-03-10', '2026-04-10'] as $date) {
            $this->sold($product, $date, 31);
        }
        SeasonalEvent::create([
            'name' => 'Sale', 'start_date' => '2026-05-01', 'end_date' => '2026-05-31',
            'adjustment_pct' => 50, 'scope' => 'all', 'is_active' => true,
        ]);

        $this->getJson('/api/dashboard/summary')->assertJsonCount(0, 'reorderSuggestions');
    }

    public function test_healthy_products_are_not_listed(): void
    {
        $this->travelTo(Carbon::parse('2026-05-15'));
        $product = $this->product('PRD-C', 500, safety: 10, leadTime: 7);
        foreach (['2026-02-10', '2026-03-10', '2026-04-10'] as $date) {
            $this->sold($product, $date, 31);
        }

        $this->getJson('/api/dashboard/summary')->assertJsonCount(0, 'reorderSuggestions');
    }

    public function test_products_without_a_policy_or_forecast_use_the_default_low_level(): void
    {
        $this->travelTo(Carbon::parse('2026-05-15'));
        $product = $this->product('PRD-D', 5);
        $this->sold($product, '2026-05-02', 3);   // current month only → no forecast yet

        // No policy yet → default Low 10 / Critical 5, so stock 5 is Critical.
        $this->getJson('/api/dashboard/summary')
            ->assertJsonCount(1, 'reorderSuggestions')
            ->assertJsonPath('reorderSuggestions.0.status', 'critical')
            ->assertJsonPath('reorderSuggestions.0.reorderPoint', 10)
            ->assertJsonPath('reorderSuggestions.0.daysOfCover', null);
        $this->assertSame(5, $product->fresh()->stock_on_hand);
    }
}
