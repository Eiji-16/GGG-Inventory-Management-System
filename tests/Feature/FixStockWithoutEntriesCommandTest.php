<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\StockMovement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** 2026-11-10: products with stock but no Stock Control entries (Aula Keyboard case). */
class FixStockWithoutEntriesCommandTest extends TestCase
{
    use RefreshDatabase;

    private function setUpProducts(): array
    {
        $keyboard = Product::create(['code' => 'PRD-KB', 'name' => 'Aula Keyboard', 'stock_on_hand' => 3]);
        $shirt = Product::create(['code' => 'PRD-SHIRT', 'name' => 'GGG Shirt', 'stock_on_hand' => 5]);
        StockMovement::create([
            'product_id' => $shirt->id, 'product_name' => $shirt->name, 'movement_type' => 'in',
            'is_adjustment' => false, 'qty' => 5, 'remaining_stock' => 5, 'movement_date' => now()->toDateString(),
        ]);
        $trashed = Product::create(['code' => 'PRD-CAP', 'name' => 'GGG Cap', 'stock_on_hand' => 2]);
        $trashed->delete();

        return [$keyboard, $shirt, $trashed];
    }

    public function test_preview_changes_nothing(): void
    {
        [$keyboard] = $this->setUpProducts();

        $this->artisan('inventory:fix-stock-without-entries')
            ->expectsOutputToContain('Aula Keyboard: 3 → 0')
            ->assertSuccessful();

        $this->assertSame(3, $keyboard->fresh()->stock_on_hand);
    }

    public function test_apply_sets_only_products_without_entries_to_zero(): void
    {
        [$keyboard, $shirt, $trashed] = $this->setUpProducts();

        $this->artisan('inventory:fix-stock-without-entries --apply')->assertSuccessful();

        $this->assertSame(0, $keyboard->fresh()->stock_on_hand);
        $this->assertSame(5, $shirt->fresh()->stock_on_hand, 'Has entries: not touched.');
        $this->assertSame(2, Product::withTrashed()->find($trashed->id)->stock_on_hand, 'In the Trash Bin: not touched.');
    }
}
