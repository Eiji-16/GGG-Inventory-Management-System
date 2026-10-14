<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\SafetyStock;
use App\Models\SalesHistory;
use App\Models\StockMovement;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DashboardSummaryTest extends TestCase
{
    use RefreshDatabase;

    public function test_dashboard_summary_returns_live_inventory_sales_and_account_data(): void
    {
        $supplier = Supplier::create([
            'name' => 'Local Supplier',
            'contact' => null,
            'company' => 'Local Supplier',
        ]);
        $product = Product::create([
            'code' => 'PRD-TEST',
            'name' => 'Test Product',
            'category' => 'Test Category',
            'supplier_id' => $supplier->id,
            'stock_on_hand' => 5,
        ]);
        SafetyStock::create([
            'product_id' => $product->id,
            'safety_stock' => 10,
        ]);
        SalesHistory::create([
            'product_id' => $product->id,
            'period_date' => now()->startOfMonth()->toDateString(),
            'units_sold' => 9,
        ]);
        StockMovement::create([
            'product_id' => $product->id,
            'product_name' => $product->name,
            'product_category' => $product->category,
            'movement_type' => 'in',
            'qty' => 5,
            'remaining_stock' => 5,
            'movement_date' => now()->toDateString(),
        ]);
        StockMovement::create([
            'product_id' => $product->id,
            'product_name' => $product->name,
            'product_category' => $product->category,
            'movement_type' => 'out',
            'qty' => 1,
            'remaining_stock' => 4,
            'movement_date' => now()->subDay()->toDateString(),
        ]);
        Product::create([
            'code' => 'PRD-UNTRACKED',
            'name' => 'Untracked Product',
            'category' => 'Test Category',
            'stock_on_hand' => 7,
        ]);
        User::factory()->create();

        $this->getJson('/api/dashboard/summary')
            ->assertOk()
            ->assertJsonPath('kpis.totalProducts', 2)
            ->assertJsonPath('kpis.totalStockUnits', 12)
            ->assertJsonPath('kpis.lowStockItems', 1)
            ->assertJsonPath('kpis.stockMovementsToday', 1)
            ->assertJsonPath('products.0.id', 'PRD-TEST')
            ->assertJsonPath('products.0.stock', 5)
            ->assertJsonPath('products.0.safetyStock', 10)
            ->assertJsonPath('salesHistory.0.unitsSold', 9)
            ->assertJsonPath('stockMovements.1.type', 'in')
            ->assertJsonPath('supplierCount', 1)
            ->assertJsonPath('userCount', 1);
    }

    public function test_dashboard_kpis_return_zero_values_when_inventory_and_movement_data_are_empty(): void
    {
        $this->getJson('/api/dashboard/summary')
            ->assertOk()
            ->assertJsonPath('kpis.totalProducts', 0)
            ->assertJsonPath('kpis.totalStockUnits', 0)
            ->assertJsonPath('kpis.lowStockItems', 0)
            ->assertJsonPath('kpis.stockMovementsToday', 0);
    }
}
