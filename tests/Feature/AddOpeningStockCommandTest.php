<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\StockMovement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** php artisan inventory:add-opening-stock — shows starting stock as an entry. */
class AddOpeningStockCommandTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAs(User::factory()->create(['role' => User::ROLE_SUPER_ADMIN, 'status' => User::STATUS_ACTIVE]));
    }

    /** Like the Aula Keyboard: 3 units before any entry, then 3 sold. */
    private function productWithHiddenStartingStock(): Product
    {
        $product = Product::create(['code' => 'PRD-AULA', 'name' => 'Aula Keyboard', 'stock_on_hand' => 3]);
        $this->postJson('/api/stock-movements', [
            'productId' => 'PRD-AULA', 'type' => 'Stock Out', 'qty' => 3, 'unitPrice' => 1500, 'date' => '2026-10-10',
        ])->assertCreated();

        return $product;
    }

    public function test_preview_changes_nothing(): void
    {
        $product = $this->productWithHiddenStartingStock();

        $this->artisan('inventory:add-opening-stock')
            ->expectsOutputToContain('PRD-AULA Aula Keyboard: +3 Opening stock on 2026-10-09')
            ->assertSuccessful();

        $this->assertSame(1, StockMovement::count());
        $this->assertSame(0, $product->fresh()->stock_on_hand);
    }

    public function test_apply_adds_the_opening_entry_and_keeps_stock_and_sales(): void
    {
        $product = $this->productWithHiddenStartingStock();
        $salesBefore = \App\Models\SalesHistory::where('product_id', $product->id)->sum('units_sold');

        $this->artisan('inventory:add-opening-stock', ['--apply' => true])->assertSuccessful();

        $rows = StockMovement::where('product_id', $product->id)->orderBy('movement_date')->get();
        $this->assertCount(2, $rows);
        $this->assertSame(['in', 3, 3, '2026-10-09'], [$rows[0]->movement_type, (int) $rows[0]->qty, (int) $rows[0]->remaining_stock, $rows[0]->movement_date->toDateString()]);
        $this->assertSame(['out', 0], [$rows[1]->movement_type, (int) $rows[1]->remaining_stock]);
        $this->assertSame(0, $product->fresh()->stock_on_hand);                 // stock unchanged
        $this->assertSame($salesBefore, \App\Models\SalesHistory::where('product_id', $product->id)->sum('units_sold'));   // sales kept

        // Now everything adds up.
        $this->artisan('inventory:check')->expectsOutputToContain('PASS  Every unit on hand is explained by an entry')->assertSuccessful();
        $this->artisan('inventory:add-opening-stock')->expectsOutputToContain('Nothing to add')->assertSuccessful();
    }

    public function test_product_option_limits_it_to_one_product(): void
    {
        $this->productWithHiddenStartingStock();
        Product::create(['code' => 'PRD-OTHER', 'name' => 'Other', 'stock_on_hand' => 5]);
        $this->postJson('/api/stock-movements', [
            'productId' => 'PRD-OTHER', 'type' => 'Stock Out', 'qty' => 1, 'unitPrice' => 10, 'date' => '2026-10-10',
        ])->assertCreated();

        $this->artisan('inventory:add-opening-stock', ['--apply' => true, '--product' => 'PRD-OTHER'])->assertSuccessful();

        $this->assertSame(1, StockMovement::whereHas('product', fn ($q) => $q->where('code', 'PRD-AULA'))->count());
        $this->assertSame(2, StockMovement::whereHas('product', fn ($q) => $q->where('code', 'PRD-OTHER'))->count());
    }
}
