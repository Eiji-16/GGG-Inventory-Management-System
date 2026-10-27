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
use Tests\Concerns\AuthenticatesBusinessApi;

class DashboardSummaryTest extends TestCase
{
    use RefreshDatabase;
    use AuthenticatesBusinessApi;

    public function test_dashboard_summary_returns_live_inventory_sales_and_account_data(): void
    {
        $supplier = Supplier::create([
            'name' => 'Local Supplier',
            'contact' => null,
            'company' => 'Local Supplier',
        ]);
        Supplier::create([
            'name' => 'Unused Supplier',
            'contact' => null,
            'company' => 'Unused Supplier',
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
            // Sales come from Stock Out entries (1 sold), not an unrelated saved row.
            ->assertJsonPath('salesHistory.0.unitsSold', 1)
            ->assertJsonPath('stockMovements.1.productId', 'PRD-TEST')
            ->assertJsonPath('stockMovements.1.type', 'in')
            ->assertJsonPath('stockMovements.1.isAdjustment', false)
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

    public function test_dashboard_leaves_out_products_in_the_trash_bin_and_their_history(): void
    {
        $product = Product::create([
            'code' => 'PRD-ARCHIVED',
            'name' => 'Archived Product',
            'stock_on_hand' => 0,
        ]);
        SalesHistory::create([
            'product_id' => $product->id,
            'period_date' => now()->startOfMonth()->toDateString(),
            'units_sold' => 4,
        ]);
        StockMovement::create([
            'product_id' => $product->id,
            'product_name' => $product->name,
            'movement_type' => 'out',
            'qty' => 4,
            'remaining_stock' => 0,
            'movement_date' => now()->toDateString(),
        ]);
        // Delete the same way the Delete button does (moves it to the Trash Bin with its entries).
        $this->deleteJson('/api/products/PRD-ARCHIVED')->assertOk();

        $this->getJson('/api/dashboard/summary')
            ->assertOk()
            ->assertJsonPath('kpis.totalProducts', 0)
            ->assertJsonMissing(['id' => 'PRD-ARCHIVED'])
            // Trash Bin rule: a deleted product's sales are left out of the
            // Dashboard numbers. (Its rows are kept in the database.)
            ->assertJsonMissing(['productId' => 'PRD-ARCHIVED']);
        $this->assertDatabaseHas('sales_history', ['product_id' => $product->id]);
    }
}
