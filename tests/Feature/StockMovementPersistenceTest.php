<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\StockMovement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockMovementPersistenceTest extends TestCase
{
    use RefreshDatabase;

    private function createProduct(int $stock = 10): Product
    {
        return Product::create([
            'code' => 'PRD-STOCK',
            'name' => 'Stock Test Item',
            'category' => 'Test',
            'stock_on_hand' => $stock,
        ]);
    }

    public function test_stock_out_cannot_make_balance_negative(): void
    {
        $product = $this->createProduct(5);

        $this->postJson('/api/stock-movements', [
            'productId' => $product->code,
            'type' => 'Stock Out',
            'qty' => 6,
            'date' => now()->toDateString(),
        ])->assertUnprocessable();

        $this->assertSame(5, $product->fresh()->stock_on_hand);
        $this->assertDatabaseCount('stock_movements', 0);
    }

    public function test_adjustments_edits_and_deletions_persist_and_reconcile_product_balance(): void
    {
        $product = $this->createProduct(10);

        $firstMovement = $this->postJson('/api/stock-movements', [
            'productId' => $product->code,
            'type' => 'Stock Out',
            'qty' => 4,
            'date' => now()->toDateString(),
        ])
            ->assertCreated()
            ->assertJsonPath('remainingStock', 6)
            ->json();

        $adjustment = $this->postJson('/api/stock-movements', [
            'productId' => $product->code,
            'type' => 'Adjustment',
            'countedStock' => 3,
            'date' => now()->toDateString(),
        ])
            ->assertCreated()
            ->assertJsonPath('type', 'Adjustment')
            ->assertJsonPath('variance', -3)
            ->assertJsonPath('remainingStock', 3)
            ->json();

        $this->assertSame(3, $product->fresh()->stock_on_hand);

        $this->putJson('/api/stock-movements/'.$firstMovement['id'], [
            'productId' => $product->code,
            'type' => 'Stock In',
            'qty' => 8,
            'date' => now()->toDateString(),
        ])
            ->assertOk()
            ->assertJsonPath('type', 'Stock In')
            ->assertJsonPath('remainingStock', 18);

        $this->assertSame(15, $product->fresh()->stock_on_hand);
        $this->assertSame(15, $adjustment['id'] ? StockMovement::findOrFail($adjustment['id'])->remaining_stock : null);

        $this->deleteJson('/api/stock-movements/'.$adjustment['id'])
            ->assertOk()
            ->assertJsonPath('deleted', true);

        $this->assertSame(18, $product->fresh()->stock_on_hand);
        $this->assertDatabaseMissing('stock_movements', ['id' => $adjustment['id']]);
    }

    public function test_stock_movement_edit_and_delete_appear_in_the_database_after_reload(): void
    {
        $product = $this->createProduct();
        $movement = $this->postJson('/api/stock-movements', [
            'productId' => $product->code,
            'type' => 'Stock In',
            'qty' => 2,
            'date' => now()->toDateString(),
        ])->assertCreated()->json();

        $this->putJson('/api/stock-movements/'.$movement['id'], [
            'productId' => $product->code,
            'type' => 'Stock In',
            'qty' => 7,
            'date' => now()->toDateString(),
            'notes' => 'Edited entry',
        ])->assertOk()->assertJsonPath('notes', 'Edited entry');

        $this->getJson('/api/stock-movements')
            ->assertOk()
            ->assertJsonFragment(['id' => $movement['id'], 'qty' => 7, 'notes' => 'Edited entry']);

        $this->deleteJson('/api/stock-movements/'.$movement['id'])->assertOk();

        $this->getJson('/api/stock-movements')->assertOk()->assertJsonMissing(['id' => $movement['id']]);
        $this->assertSame(10, $product->fresh()->stock_on_hand);
    }

    public function test_editing_a_past_adjustment_preserves_later_stock_movements(): void
    {
        $product = $this->createProduct(10);
        $adjustmentDate = now()->subDays(2)->toDateString();
        $laterDate = now()->subDay()->toDateString();

        $adjustment = $this->postJson('/api/stock-movements', [
            'productId' => $product->code,
            'type' => 'Adjustment',
            'countedStock' => 10,
            'date' => $adjustmentDate,
        ])->assertCreated()->json();

        $this->postJson('/api/stock-movements', [
            'productId' => $product->code,
            'type' => 'Stock Out',
            'qty' => 3,
            'date' => $laterDate,
        ])->assertCreated()->assertJsonPath('remainingStock', 7);

        $this->putJson('/api/stock-movements/'.$adjustment['id'], [
            'productId' => $product->code,
            'type' => 'Adjustment',
            'countedStock' => 12,
            'date' => $adjustmentDate,
        ])->assertOk()->assertJsonPath('remainingStock', 12);

        $this->assertSame(9, $product->fresh()->stock_on_hand);
        $this->assertSame(
            9,
            StockMovement::where('movement_type', 'out')->firstOrFail()->remaining_stock
        );
    }
}
