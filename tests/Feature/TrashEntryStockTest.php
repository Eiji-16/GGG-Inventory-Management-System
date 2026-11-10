<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\StockMovement;
use App\Services\StockMovementService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * 2026-11-10: a product deleted together with its entries, whose entry is
 * then permanently deleted from the Trash Bin, must not come back with stock
 * but no entries (Reports showed "3, Critical", Stock Control showed nothing).
 */
class TrashEntryStockTest extends TestCase
{
    use RefreshDatabase;

    /** GGG Shirt with one Stock In of 3 (stock on hand 3). */
    private function shirtWithThree(): array
    {
        $product = Product::create(['code' => 'PRD-SHIRT', 'name' => 'GGG Shirt', 'stock_on_hand' => 3]);
        $entry = StockMovement::create([
            'product_id' => $product->id, 'product_name' => $product->name, 'movement_type' => 'in',
            'is_adjustment' => false, 'qty' => 3, 'unit_price' => 150, 'remaining_stock' => 3,
            'movement_date' => now()->subDay()->toDateString(),
        ]);

        return [$product, $entry];
    }

    public function test_purging_an_entry_deleted_with_its_product_takes_it_out_of_the_stock(): void
    {
        [$product, $entry] = $this->shirtWithThree();
        $service = app(StockMovementService::class);

        $service->trashProduct($product);
        $this->assertSame(3, Product::withTrashed()->find($product->id)->stock_on_hand, 'Kept while in the Trash Bin.');

        StockMovement::onlyTrashed()->whereKey($entry->id)->update(['archived_at' => now()]);
        $service->forceDelete($entry->id);

        $service->restoreProduct(Product::onlyTrashed()->find($product->id));

        $this->assertSame(0, Product::find($product->id)->stock_on_hand, 'No entries left = no stock left.');
        $this->assertSame(0, StockMovement::where('product_id', $product->id)->count());
    }

    public function test_purging_an_entry_deleted_on_its_own_does_not_change_the_stock_again(): void
    {
        [$product, $entry] = $this->shirtWithThree();
        $service = app(StockMovementService::class);

        $service->delete($entry);   // stock 3 → 0 here
        $this->assertSame(0, Product::find($product->id)->stock_on_hand);

        StockMovement::onlyTrashed()->whereKey($entry->id)->update(['archived_at' => now()]);
        $service->forceDelete($entry->id);

        $this->assertSame(0, Product::find($product->id)->stock_on_hand, 'Not taken out twice.');
    }
}
