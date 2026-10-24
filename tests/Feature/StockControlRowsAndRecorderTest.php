<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\StockMovement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Stock Control rows show each transaction's own quantity and the balance
 * right after it, and Recorded By comes from the signed-in account.
 * These tests only read the existing stock logic; they do not change it.
 */
class StockControlRowsAndRecorderTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        $this->owner = User::factory()->create([
            'name' => 'Owner Ana',
            'role' => User::ROLE_SUPER_ADMIN,
            'status' => User::STATUS_ACTIVE,
        ]);
        $this->actingAs($this->owner);
    }

    private function createProduct(int $stock = 0): Product
    {
        return Product::create([
            'code' => 'PRD-ROWS',
            'name' => 'Row Test Item',
            'category' => 'Test',
            'stock_on_hand' => $stock,
        ]);
    }

    private function move(Product $product, string $type, int $qty, string $date): array
    {
        return $this->postJson('/api/stock-movements', [
            'productId' => $product->code,
            'type' => $type,
            'qty' => $qty,
            'date' => $date,
        ])->assertCreated()->json();
    }

    public function test_each_row_keeps_its_own_quantity_and_balance_after_it(): void
    {
        $product = $this->createProduct();
        $in = $this->move($product, 'Stock In', 10, '2026-10-01');
        $out = $this->move($product, 'Stock Out', 3, '2026-10-02');
        $in2 = $this->move($product, 'Stock In', 5, '2026-10-03');
        $count = $this->postJson('/api/stock-movements', [
            'productId' => $product->code,
            'type' => 'Adjustment',
            'countedStock' => 11,
            'date' => '2026-10-04',
        ])->assertCreated()->json();

        // Stock In +10 → 10, Stock Out −3 → 7, Stock In +5 → 12, Correction to 11 → 11
        $rows = collect($this->getJson('/api/stock-movements')->assertOk()->json())->keyBy('id');
        $this->assertSame([10, 10], [$rows[$in['id']]['qty'], $rows[$in['id']]['remainingStock']]);
        $this->assertSame([3, 7], [$rows[$out['id']]['qty'], $rows[$out['id']]['remainingStock']]);
        $this->assertSame([5, 12], [$rows[$in2['id']]['qty'], $rows[$in2['id']]['remainingStock']]);
        $this->assertSame(-1, $rows[$count['id']]['variance']);
        $this->assertSame(11, $rows[$count['id']]['remainingStock']);
        // Current stock is unchanged by the display fix and still on every row.
        $this->assertSame(11, $product->fresh()->stock_on_hand);
        $this->assertSame(11, $rows[$in['id']]['totalQty']);
    }

    public function test_deleting_a_middle_row_recomputes_later_balances_and_current_stock(): void
    {
        $product = $this->createProduct();
        $this->move($product, 'Stock In', 10, '2026-10-01');
        $out = $this->move($product, 'Stock Out', 3, '2026-10-02');
        $last = $this->move($product, 'Stock In', 5, '2026-10-03');

        $this->deleteJson('/api/stock-movements/'.$out['id'])->assertOk();

        $this->assertSame(15, $product->fresh()->stock_on_hand);
        $this->assertSame(15, StockMovement::find($last['id'])->remaining_stock);
    }

    public function test_recorded_by_is_the_signed_in_user_not_the_form_value(): void
    {
        $product = $this->createProduct(5);
        $created = $this->postJson('/api/stock-movements', [
            'productId' => $product->code,
            'type' => 'Stock In',
            'qty' => 2,
            'recordedBy' => 'Someone Else',
        ])->assertCreated()
            ->assertJsonPath('recordedBy', 'Owner Ana')
            ->json();

        $this->assertSame(7, $product->fresh()->stock_on_hand);
        $this->assertDatabaseHas('stock_movements', ['id' => $created['id'], 'recorded_by' => 'Owner Ana']);
    }

    public function test_edits_keep_the_original_recorder(): void
    {
        $product = $this->createProduct(5);
        $created = $this->move($product, 'Stock In', 2, now()->toDateString());

        $staff = User::factory()->create([
            'name' => 'Staff Ben',
            'role' => User::ROLE_SUPER_ADMIN,
            'status' => User::STATUS_ACTIVE,
        ]);
        $this->actingAs($staff);

        $this->putJson('/api/stock-movements/'.$created['id'], [
            'detailsOnly' => true,
            'notes' => 'checked',
            'recordedBy' => 'Staff Ben',
        ])->assertOk()->assertJsonPath('recordedBy', 'Owner Ana');

        $this->putJson('/api/stock-movements/'.$created['id'], [
            'productId' => $product->code,
            'type' => 'Stock In',
            'qty' => 2,
            'date' => now()->toDateString(),
        ])->assertOk()->assertJsonPath('recordedBy', 'Owner Ana');
    }

    public function test_older_rows_without_a_recorder_get_the_editor(): void
    {
        $product = $this->createProduct(5);
        $movement = StockMovement::create([
            'product_id' => $product->id,
            'product_name' => $product->name,
            'product_category' => $product->category,
            'movement_type' => 'in',
            'is_adjustment' => false,
            'qty' => 5,
            'remaining_stock' => 5,
            'movement_date' => now()->toDateString(),
        ]);

        $this->putJson('/api/stock-movements/'.$movement->id, ['detailsOnly' => true, 'notes' => 'x'])
            ->assertOk()
            ->assertJsonPath('recordedBy', 'Owner Ana');
        $this->assertSame(5, $product->fresh()->stock_on_hand);
    }
}
