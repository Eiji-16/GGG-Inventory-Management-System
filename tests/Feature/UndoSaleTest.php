<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\StockMovement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\AuthenticatesBusinessApi;
use Tests\TestCase;

/* ===== UNDO A SALE (2026-11-22) =====
   + / a higher typed count on a product sold today can take the sale back:
   the stock goes up AND the sales chart goes down. */
class UndoSaleTest extends TestCase
{
    use RefreshDatabase;
    use AuthenticatesBusinessApi;

    private function today(): string
    {
        return now('Asia/Manila')->toDateString();
    }

    private function move(array $fields): array
    {
        return $this->postJson('/api/stock-movements', $fields + ['productId' => 'PRD-U1', 'date' => $this->today()])
            ->assertCreated()->json();
    }

    private function chartUnits(): int
    {
        return (int) collect($this->getJson('/api/dashboard/summary')->assertOk()->json('salesHistory'))->sum('unitsSold');
    }

    private function product(): Product
    {
        $product = Product::create(['code' => 'PRD-U1', 'name' => 'Glue', 'stock_on_hand' => 0, 'variants' => ['Small', 'Large']]);
        $this->move(['type' => 'Stock In', 'qty' => 5, 'unitPrice' => 10]);

        return $product;
    }

    public function test_sell_one_then_undo_brings_stock_and_chart_back(): void
    {
        $product = $this->product();
        $sale = $this->move(['type' => 'Stock Out', 'qty' => 1, 'unitPrice' => 10]);
        $this->assertSame(1, $this->chartUnits());

        $this->postJson('/api/stock-movements/undo-sale', ['productId' => 'PRD-U1', 'qty' => 1])
            ->assertOk()->assertJsonPath('undone', 1)->assertJsonPath('trashed', 1)->assertJsonPath('stock', 5);

        $this->assertSame(5, $product->fresh()->stock_on_hand);
        $this->assertSame(0, $this->chartUnits());
        $this->assertSoftDeleted('stock_movements', ['id' => $sale['id']]);
        $this->assertDatabaseMissing('sales_history', ['product_id' => $product->id, 'period_type' => 'month']);
    }

    public function test_undo_part_of_a_sale_lowers_that_entry(): void
    {
        $product = $this->product();
        $sale = $this->move(['type' => 'Stock Out', 'qty' => 3, 'unitPrice' => 10]);

        $this->postJson('/api/stock-movements/undo-sale', ['productId' => 'PRD-U1', 'qty' => 1])
            ->assertOk()->assertJsonPath('changed', 1)->assertJsonPath('trashed', 0);

        $this->assertSame(2, StockMovement::find($sale['id'])->qty);
        $this->assertSame(3, $product->fresh()->stock_on_hand);
        $this->assertSame(2, $this->chartUnits());
        $this->assertSame([5, 3], StockMovement::orderBy('id')->pluck('remaining_stock')->all());
    }

    public function test_undo_takes_newest_sales_first_across_entries(): void
    {
        $product = $this->product();
        $first = $this->move(['type' => 'Stock Out', 'qty' => 2, 'unitPrice' => 10, 'mergeSameDay' => false, 'sourceMovementId' => 1]);
        $second = $this->move(['type' => 'Stock Out', 'qty' => 1, 'unitPrice' => 10, 'mergeSameDay' => false, 'sourceMovementId' => 1]);

        $this->postJson('/api/stock-movements/undo-sale', ['productId' => 'PRD-U1', 'qty' => 2])->assertOk();

        $this->assertSoftDeleted('stock_movements', ['id' => $second['id']]);
        $this->assertSame(1, StockMovement::find($first['id'])->qty);
        $this->assertSame(4, $product->fresh()->stock_on_hand);
        $this->assertSame(1, $this->chartUnits());
    }

    public function test_only_the_same_variant_is_undone(): void
    {
        $product = $this->product();
        $this->move(['type' => 'Stock In', 'qty' => 5, 'unitPrice' => 10, 'variantName' => 'Large']);
        $this->move(['type' => 'Stock Out', 'qty' => 1, 'unitPrice' => 10, 'variantName' => 'Large']);

        $this->postJson('/api/stock-movements/undo-sale', ['productId' => 'PRD-U1', 'qty' => 1, 'variantName' => 'Small'])
            ->assertUnprocessable()->assertJsonValidationErrors('qty');
        $this->postJson('/api/stock-movements/undo-sale', ['productId' => 'PRD-U1', 'qty' => 1, 'variantName' => 'large'])
            ->assertOk();

        $this->assertSame(10, $product->fresh()->stock_on_hand);
        $this->assertSame(0, $this->chartUnits());
    }

    public function test_cannot_undo_more_than_sold_today_and_nothing_changes(): void
    {
        $product = $this->product();
        $this->move(['type' => 'Stock Out', 'qty' => 1, 'unitPrice' => 10]);

        $this->postJson('/api/stock-movements/undo-sale', ['productId' => 'PRD-U1', 'qty' => 2])
            ->assertUnprocessable()->assertJsonValidationErrors('qty');

        $this->assertSame(4, $product->fresh()->stock_on_hand);
        $this->assertSame(1, $this->chartUnits());
    }

    public function test_older_sales_and_corrections_are_never_touched(): void
    {
        $product = Product::create(['code' => 'PRD-U1', 'name' => 'Glue', 'stock_on_hand' => 0]);
        $yesterday = now('Asia/Manila')->subDay()->toDateString();
        $this->move(['type' => 'Stock In', 'qty' => 5, 'unitPrice' => 10, 'date' => $yesterday]);
        $this->move(['type' => 'Stock Out', 'qty' => 1, 'unitPrice' => 10, 'date' => $yesterday]);
        $this->move(['type' => 'Adjustment', 'countedStock' => 3]);

        $this->postJson('/api/stock-movements/undo-sale', ['productId' => 'PRD-U1', 'qty' => 1])
            ->assertUnprocessable()->assertJsonValidationErrors('qty');
        $this->assertSame(3, $product->fresh()->stock_on_hand);
    }

    public function test_the_trashed_sale_can_be_restored(): void
    {
        $product = $this->product();
        $sale = $this->move(['type' => 'Stock Out', 'qty' => 1, 'unitPrice' => 10]);
        $this->postJson('/api/stock-movements/undo-sale', ['productId' => 'PRD-U1', 'qty' => 1])->assertOk();

        $this->postJson('/api/trash/bulk', ['space' => 'trash', 'action' => 'restore', 'items' => [['kind' => 'entry', 'id' => (string) $sale['id']]]])->assertOk();

        $this->assertSame(4, $product->fresh()->stock_on_hand);
        $this->assertSame(1, $this->chartUnits());
    }

    public function test_needs_the_edit_permission(): void
    {
        $this->product();
        $this->move(['type' => 'Stock Out', 'qty' => 1, 'unitPrice' => 10]);
        $this->putJson('/api/role-access', ['staff' => ['stock.edit' => false]])->assertOk();
        $this->actingAs(User::factory()->create(['role' => User::ROLE_STAFF, 'status' => User::STATUS_ACTIVE]));

        $this->postJson('/api/stock-movements/undo-sale', ['productId' => 'PRD-U1', 'qty' => 1])->assertForbidden();
    }
}
