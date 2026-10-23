<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\StockMovement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\AuthenticatesBusinessApi;
use Tests\TestCase;

class FastSlowMovingReportTest extends TestCase
{
    use RefreshDatabase;
    use AuthenticatesBusinessApi;

    public function test_small_catalog_still_shows_both_fast_and_slow_movers(): void
    {
        foreach ([['A', 500, 10], ['B', 60, 10], ['C', 20, 10], ['D', 12, 0], ['E', 6, 15]] as [$code, $sold, $stock]) {
            $product = Product::create(['code' => 'PRD-'.$code, 'name' => 'Item '.$code, 'stock_on_hand' => $stock]);
            StockMovement::create([
                'product_id' => $product->id,
                'product_name' => $product->name,
                'movement_type' => 'out',
                'is_adjustment' => false,
                'qty' => $sold,
                'remaining_stock' => $stock,
                'movement_date' => now()->subDays(10)->toDateString(),
            ]);
        }

        $report = $this->getJson('/api/reports')->assertOk()->json('fastSlowMoving');

        // 5 products → top 3 are fast; the rest that are still in stock are slow.
        $this->assertSame(['Item A', 'Item B', 'Item C'], array_column($report['fast'], 'product'));
        $this->assertSame(['Item E'], array_column($report['slow'], 'product')); // Item D is out of stock
        $this->assertEmpty(array_intersect(array_column($report['fast'], 'product'), array_column($report['slow'], 'product')));
        $this->assertCount(8, $report['trend']);
    }
}
