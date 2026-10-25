<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\StockMovement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use App\Models\User;
use Tests\TestCase;

/** Unit Price is required on every Stock In / Stock Out (Stock Control). */
class StockPriceRequiredTest extends TestCase
{
    use RefreshDatabase;

    private function entry(array $fields): \Illuminate\Testing\TestResponse
    {
        return $this->postJson('/api/stock-movements', $fields + [
            'productId' => 'PRD-PR', 'qty' => 2, 'date' => now('Asia/Manila')->toDateString(),
        ]);
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAs(User::factory()->create(['role' => User::ROLE_SUPER_ADMIN, 'status' => User::STATUS_ACTIVE]));
        Product::create(['code' => 'PRD-PR', 'name' => 'Price Case', 'stock_on_hand' => 10]);
    }

    public function test_stock_in_and_stock_out_need_a_unit_price(): void
    {
        $this->entry(['type' => 'Stock In'])->assertStatus(422)->assertJsonValidationErrors('unitPrice');
        $this->entry(['type' => 'Stock Out', 'unitPrice' => ''])->assertStatus(422)->assertJsonValidationErrors('unitPrice');

        $this->assertSame(0, StockMovement::count());
        $this->assertSame(10, Product::where('code', 'PRD-PR')->value('stock_on_hand'));
    }

    public function test_a_price_of_zero_is_allowed(): void
    {
        $this->entry(['type' => 'Stock In', 'unitPrice' => 0])->assertCreated()->assertJsonPath('unitPrice', 0);
    }

    public function test_editing_details_keeps_the_price_required(): void
    {
        $id = $this->entry(['type' => 'Stock In', 'unitPrice' => 120])->json('id');

        $this->putJson("/api/stock-movements/{$id}", ['detailsOnly' => true, 'notes' => 'Box 2', 'unitPrice' => null])
            ->assertStatus(422)
            ->assertJsonValidationErrors('unitPrice');
        $this->putJson("/api/stock-movements/{$id}", ['detailsOnly' => true, 'notes' => 'Box 2', 'unitPrice' => 125])
            ->assertOk()
            ->assertJsonPath('unitPrice', 125);
    }

    public function test_older_count_corrections_have_no_price_and_stay_editable(): void
    {
        $product = Product::where('code', 'PRD-PR')->first();
        $correction = StockMovement::create([
            'product_id' => $product->id, 'product_name' => $product->name, 'movement_type' => 'out',
            'is_adjustment' => true, 'qty' => 1, 'remaining_stock' => 9, 'movement_date' => now('Asia/Manila')->toDateString(),
        ]);

        $this->putJson("/api/stock-movements/{$correction->id}", ['detailsOnly' => true, 'notes' => 'Recount'])
            ->assertOk()
            ->assertJsonPath('notes', 'Recount');
    }
}
