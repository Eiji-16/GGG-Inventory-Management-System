<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\StockMovement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** A stock quantity can have at most 4 digits (9,999). */
class StockQuantityLimitTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAs(User::factory()->create(['role' => User::ROLE_SUPER_ADMIN, 'status' => User::STATUS_ACTIVE]));
        Product::create(['code' => 'PRD-QL', 'name' => 'Limit Case', 'stock_on_hand' => 0]);
    }

    private function stockIn(int $qty)
    {
        return $this->postJson('/api/stock-movements', [
            'productId' => 'PRD-QL', 'type' => 'Stock In', 'qty' => $qty, 'unitPrice' => 10,
            'date' => now('Asia/Manila')->toDateString(),
        ]);
    }

    public function test_four_digit_quantity_is_accepted(): void
    {
        $this->stockIn(9999)->assertCreated();
        $this->assertSame(9999, Product::where('code', 'PRD-QL')->value('stock_on_hand'));
    }

    public function test_five_digit_quantity_is_rejected_with_a_clear_message(): void
    {
        $this->stockIn(10000)
            ->assertStatus(422)
            ->assertJsonPath('errors.qty.0', 'The quantity can have at most 4 digits (up to 9,999).');

        $this->assertSame(0, StockMovement::count());
    }
}
