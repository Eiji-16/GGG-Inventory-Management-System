<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\SafetyStock;
use App\Models\StockMovement;
use App\Services\ReorderPointService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;
use Tests\Concerns\AuthenticatesBusinessApi;

class ReorderPointTest extends TestCase
{
    use RefreshDatabase;
    use AuthenticatesBusinessApi;

    public function test_reorder_point_includes_demand_during_lead_time_across_dashboard_and_reports(): void
    {
        $product = Product::create([
            'code' => 'PRD-ROP',
            'name' => 'ROP Test Product',
            'stock_on_hand' => 28,
        ]);
        SafetyStock::create([
            'product_id' => $product->id,
            'safety_stock' => 20,
            'annual_demand' => 9999,   // old typed value — must be ignored now
            'lead_time_days' => 10,
        ]);
        // Real sales: 365 units in the last 12 months → 1/day.
        StockMovement::create([
            'product_id' => $product->id,
            'product_name' => $product->name,
            'movement_type' => 'out',
            'is_adjustment' => false,
            'qty' => 365,
            'remaining_stock' => 28,
            'movement_date' => now()->toDateString(),
        ]);

        $this->getJson('/api/dashboard/summary')
            ->assertOk()
            ->assertJsonPath('products.0.annualDemand', 365)
            ->assertJsonPath('products.0.leadTimeDays', 10)
            ->assertJsonPath('kpis.lowStockItems', 1);

        $this->getJson('/api/reports')
            ->assertOk()
            ->assertJsonPath('reorderPoint.rows.0.reorderPoint', 30)
            ->assertJsonPath('reorderPoint.rows.0.currentStock', 28);
    }

    public function test_reorder_point_falls_back_to_safety_stock_when_demand_or_lead_time_is_missing(): void
    {
        $service = new ReorderPointService();
        $productWithoutLeadTime = Product::create([
            'code' => 'PRD-NOLEAD',
            'name' => 'Product Without Lead Time',
            'stock_on_hand' => 100,
        ]);
        SafetyStock::create([
            'product_id' => $productWithoutLeadTime->id,
            'safety_stock' => 20,
        ]);
        StockMovement::create([
            'product_id' => $productWithoutLeadTime->id,
            'product_name' => $productWithoutLeadTime->name,
            'movement_type' => 'out',
            'is_adjustment' => false,
            'qty' => 365,
            'remaining_stock' => 100,
            'movement_date' => now()->toDateString(),
        ]);
        $productWithoutDemand = Product::create([
            'code' => 'PRD-NODEMAND',
            'name' => 'Product Without Demand',
            'stock_on_hand' => 100,
        ]);
        SafetyStock::create([
            'product_id' => $productWithoutDemand->id,
            'safety_stock' => 15,
            'lead_time_days' => 10,
        ]);

        $this->assertSame(20, $service->forProduct($productWithoutLeadTime));
        $this->assertSame(15, $service->forProduct($productWithoutDemand));
    }
}
