<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\StockMovement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;
use Tests\Concerns\AuthenticatesBusinessApi;

class StockMovementPersistenceTest extends TestCase
{
    use RefreshDatabase;
    use AuthenticatesBusinessApi;

    private function createProduct(int $stock = 10): Product
    {
        return Product::create([
            'code' => 'PRD-STOCK',
            'name' => 'Stock Test Item',
            'category' => 'Test',
            'stock_on_hand' => $stock,
        ]);
    }

    public function test_new_stock_in_uses_current_product_stock_as_its_starting_balance(): void
    {
        $product = $this->createProduct(20);

        $movement = $this->postJson('/api/stock-movements', [
            'productId' => $product->code,
            'type' => 'Stock In',
            'qty' => 5,
            'date' => now()->toDateString(),
        ])
            ->assertCreated()
            ->assertJsonPath('type', 'Stock In')
            ->assertJsonPath('qty', 5)
            ->assertJsonPath('remainingStock', 25)
            ->json();

        $this->assertSame(25, $product->fresh()->stock_on_hand);
        $this->assertDatabaseHas('stock_movements', [
            'id' => $movement['id'],
            'movement_type' => 'in',
            'qty' => 5,
            'remaining_stock' => 25,
        ]);
    }

    public function test_new_stock_out_uses_current_product_stock_as_its_starting_balance(): void
    {
        $product = $this->createProduct(20);

        $movement = $this->postJson('/api/stock-movements', [
            'productId' => $product->code,
            'type' => 'Stock Out',
            'qty' => 5,
            'date' => now()->toDateString(),
        ])
            ->assertCreated()
            ->assertJsonPath('type', 'Stock Out')
            ->assertJsonPath('qty', 5)
            ->assertJsonPath('remainingStock', 15)
            ->json();

        $this->assertSame(15, $product->fresh()->stock_on_hand);
        $this->assertDatabaseHas('stock_movements', [
            'id' => $movement['id'],
            'movement_type' => 'out',
            'qty' => 5,
            'remaining_stock' => 15,
        ]);
    }

    public function test_stock_movement_list_shows_the_current_product_total_on_every_row(): void
    {
        $product = $this->createProduct(0);

        foreach ([9, 9, 37] as $qty) {
            $this->postJson('/api/stock-movements', [
                'productId' => $product->code,
                'type' => 'Stock In',
                'qty' => $qty,
                'date' => now()->toDateString(),
            ])->assertCreated();
        }

        $response = $this->getJson('/api/stock-movements')->assertOk();

        $this->assertSame(3, count($response->json()));
        foreach ($response->json() as $movement) {
            $this->assertSame(55, $movement['totalQty']);
        }
    }

    public function test_stock_add_edit_delete_activity_is_persistent_and_filterable_by_product(): void
    {
        $product = $this->createProduct(10);
        $movement = $this->postJson('/api/stock-movements', [
            'productId' => $product->code,
            'type' => 'Stock In',
            'qty' => 5,
            'date' => now()->toDateString(),
        ])->assertCreated()->json();

        $this->putJson('/api/stock-movements/'.$movement['id'], [
            'productId' => $product->code,
            'type' => 'Stock Out',
            'qty' => 2,
            'date' => now()->toDateString(),
        ])->assertOk();

        $this->deleteJson('/api/stock-movements/'.$movement['id'])->assertOk();

        $otherProduct = Product::create([
            'code' => 'PRD-OTHER',
            'name' => 'Other Stock Item',
            'category' => 'Test',
            'stock_on_hand' => 0,
        ]);
        $this->postJson('/api/stock-movements', [
            'productId' => $otherProduct->code,
            'type' => 'Stock In',
            'qty' => 1,
            'date' => now()->toDateString(),
        ])->assertCreated();

        $this->getJson('/api/stock-activities?productId='.$product->code)
            ->assertOk()
            ->assertJsonCount(3)
            ->assertJsonFragment(['action' => 'stock.in'])
            ->assertJsonFragment(['action' => 'stock.edit'])
            ->assertJsonFragment(['action' => 'stock.delete'])
            ->assertJsonFragment(['productId' => $product->code])
            ->assertJsonFragment(['previousChange' => 5]);

        $this->getJson('/api/stock-activities')->assertOk()->assertJsonCount(4);
        $this->assertDatabaseCount('activity_logs', 4);
    }

    public function test_stock_activity_includes_the_name_of_the_authenticated_user(): void
    {
        $staff = User::factory()->create([
            'name' => 'Inventory Staff',
            'role' => User::ROLE_STAFF,
            'status' => User::STATUS_ACTIVE,
        ]);
        $this->actingAs($staff);
        $product = $this->createProduct(10);

        $this->postJson('/api/stock-movements', [
            'productId' => $product->code,
            'type' => 'Stock Out',
            'qty' => 1,
            'date' => now()->toDateString(),
        ])->assertCreated();

        $this->getJson('/api/stock-activities?productId='.$product->code)
            ->assertOk()
            ->assertJsonPath('0.userName', 'Inventory Staff')
            ->assertJsonPath('0.action', 'stock.out');
    }

    public function test_edit_applies_the_new_movement_amount_to_current_stock(): void
    {
        $product = $this->createProduct(20);
        $movement = StockMovement::create([
            'product_id' => $product->id,
            'product_name' => $product->name,
            'product_category' => $product->category,
            'movement_type' => 'in',
            'is_adjustment' => false,
            'qty' => 20,
            'remaining_stock' => 20,
            'movement_date' => now()->toDateString(),
        ]);

        $this->putJson('/api/stock-movements/'.$movement->id, [
            'productId' => $product->code,
            'type' => 'Stock In',
            'qty' => 5,
            'date' => now()->toDateString(),
        ])
            ->assertOk()
            ->assertJsonPath('type', 'Stock In')
            ->assertJsonPath('qty', 5)
            ->assertJsonPath('remainingStock', 25);

        $this->assertSame(25, $product->fresh()->stock_on_hand);
        $this->assertDatabaseCount('stock_movements', 1);
        $this->assertDatabaseHas('stock_movements', [
            'id' => $movement->id,
            'movement_type' => 'in',
            'qty' => 5,
            'remaining_stock' => 25,
        ]);
    }

    public function test_editing_stock_out_applies_the_new_amount_to_current_stock(): void
    {
        $product = $this->createProduct(20);
        $movement = $this->postJson('/api/stock-movements', [
            'productId' => $product->code,
            'type' => 'Stock Out',
            'qty' => 5,
            'date' => now()->toDateString(),
        ])->assertCreated()->assertJsonPath('remainingStock', 15)->json();

        $this->putJson('/api/stock-movements/'.$movement['id'], [
            'productId' => $product->code,
            'type' => 'Stock Out',
            'qty' => 10,
            'date' => now()->toDateString(),
        ])
            ->assertOk()
            ->assertJsonPath('type', 'Stock Out')
            ->assertJsonPath('qty', 10)
            ->assertJsonPath('remainingStock', 5);

        $this->assertSame(5, $product->fresh()->stock_on_hand);
        $this->assertDatabaseHas('stock_movements', [
            'id' => $movement['id'],
            'movement_type' => 'out',
            'qty' => 10,
            'remaining_stock' => 5,
        ]);
    }

    public function test_editing_an_opening_in_movement_by_five_shows_five_and_total_fifteen(): void
    {
        $product = $this->createProduct(0);
        $movement = $this->postJson('/api/stock-movements', [
            'productId' => $product->code,
            'type' => 'Stock In',
            'qty' => 10,
            'date' => now()->toDateString(),
        ])->assertCreated()->json();

        $this->putJson('/api/stock-movements/'.$movement['id'], [
            'productId' => $product->code,
            'type' => 'Stock In',
            'qty' => 5,
            'date' => now()->toDateString(),
        ])->assertOk()
            ->assertJsonPath('qty', 5)
            ->assertJsonPath('remainingStock', 15);

        $this->getJson('/api/stock-movements')
            ->assertOk()
            ->assertJsonPath('0.qty', 5)
            ->assertJsonPath('0.totalQty', 15);
        $this->assertSame(15, $product->fresh()->stock_on_hand);
    }

    public function test_new_stock_in_from_zero_saves_five(): void
    {
        $product = $this->createProduct(0);

        $this->postJson('/api/stock-movements', [
            'productId' => $product->code,
            'type' => 'Stock In',
            'qty' => 5,
            'date' => now()->toDateString(),
        ])->assertCreated()->assertJsonPath('remainingStock', 5);

        $this->assertSame(5, $product->fresh()->stock_on_hand);
    }

    public function test_stock_out_equal_to_current_stock_saves_zero(): void
    {
        $product = $this->createProduct(5);

        $this->postJson('/api/stock-movements', [
            'productId' => $product->code,
            'type' => 'Stock Out',
            'qty' => 5,
            'date' => now()->toDateString(),
        ])->assertCreated()->assertJsonPath('remainingStock', 0);

        $this->assertSame(0, $product->fresh()->stock_on_hand);
    }

    public function test_deleting_stock_in_and_stock_out_reverses_each_movement_delta(): void
    {
        $product = $this->createProduct(20);
        $stockIn = $this->postJson('/api/stock-movements', [
            'productId' => $product->code,
            'type' => 'Stock In',
            'qty' => 5,
            'date' => now()->toDateString(),
        ])->assertCreated()->json();

        $this->deleteJson('/api/stock-movements/'.$stockIn['id'])->assertOk();
        $this->assertSame(20, $product->fresh()->stock_on_hand);

        $stockOut = $this->postJson('/api/stock-movements', [
            'productId' => $product->code,
            'type' => 'Stock Out',
            'qty' => 5,
            'date' => now()->toDateString(),
        ])->assertCreated()->json();

        $this->deleteJson('/api/stock-movements/'.$stockOut['id'])->assertOk();
        $this->assertSame(20, $product->fresh()->stock_on_hand);
    }

    public function test_clearing_product_stock_removes_movements_but_keeps_product_and_sets_stock_to_zero(): void
    {
        $product = $this->createProduct(12);
        $movement = $this->postJson('/api/stock-movements', [
            'productId' => $product->code,
            'type' => 'Stock In',
            'qty' => 3,
            'date' => now()->toDateString(),
        ])->assertCreated()->json();

        $this->deleteJson('/api/stock-movements/products/'.$product->code)
            ->assertOk()
            ->assertJsonPath('cleared', true)
            ->assertJsonPath('deletedMovements', 1)
            ->assertJsonPath('totalQty', 0);

        $this->assertDatabaseHas('products', [
            'code' => $product->code,
            'name' => 'Stock Test Item',
            'stock_on_hand' => 0,
        ]);
        $this->assertDatabaseMissing('stock_movements', ['id' => $movement['id']]);
        $this->getJson('/api/products')
            ->assertOk()
            ->assertJsonFragment(['id' => $product->code, 'stock' => 0]);
        $this->assertDatabaseHas('activity_logs', [
            'action' => 'stock.clear',
            'meta->productId' => $product->code,
            'meta->totalQty' => 0,
        ]);
    }

    public function test_clearing_product_stock_works_when_opening_stock_has_no_movement_row(): void
    {
        $product = $this->createProduct(952);

        $this->deleteJson('/api/stock-movements/products/'.$product->code)
            ->assertOk()
            ->assertJsonPath('cleared', true)
            ->assertJsonPath('deletedMovements', 0)
            ->assertJsonPath('totalQty', 0);

        $this->assertDatabaseHas('products', [
            'code' => $product->code,
            'stock_on_hand' => 0,
        ]);
        $this->assertDatabaseHas('products', ['code' => $product->code]);
        $this->assertDatabaseCount('stock_movements', 0);
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
            ->assertJsonPath('remainingStock', 14);

        $this->assertSame(11, $product->fresh()->stock_on_hand);
        $this->assertSame(11, $adjustment['id'] ? StockMovement::findOrFail($adjustment['id'])->remaining_stock : null);

        $this->deleteJson('/api/stock-movements/'.$adjustment['id'])
            ->assertOk()
            ->assertJsonPath('deleted', true);

        $this->assertSame(14, $product->fresh()->stock_on_hand);
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
        $this->assertSame(12, $product->fresh()->stock_on_hand);
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
