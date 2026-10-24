<?php

namespace Tests\Feature;

use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\AuthenticatesBusinessApi;
use Tests\TestCase;

/** php artisan inventory:check — read-only data check. */
class InventoryCheckCommandTest extends TestCase
{
    use RefreshDatabase;
    use AuthenticatesBusinessApi;

    private function seedConsistentData(): Product
    {
        $product = Product::create(['code' => 'PRD-CHK', 'name' => 'Check Item', 'stock_on_hand' => 0]);
        foreach ([['Stock In', 10, '2026-10-01'], ['Stock Out', 3, '2026-10-02'], ['Stock In', 5, '2026-10-03']] as [$type, $qty, $date]) {
            $this->postJson('/api/stock-movements', [
                'productId' => 'PRD-CHK', 'type' => $type, 'qty' => $qty, 'date' => $date,
            ])->assertCreated();
        }

        return $product;
    }

    public function test_consistent_data_passes(): void
    {
        $this->seedConsistentData();

        $this->artisan('inventory:check')
            ->expectsOutputToContain('PASS  Current stock matches the last Balance After')
            ->expectsOutputToContain('PASS  Running balances (Balance After) add up')
            ->assertExitCode(0);
    }

    public function test_a_stock_mismatch_is_reported_and_nothing_is_changed(): void
    {
        $product = $this->seedConsistentData();
        $product->forceFill(['stock_on_hand' => 99])->saveQuietly();   // simulate a bad edit

        $this->artisan('inventory:check')
            ->expectsOutputToContain('FAIL  Current stock matches the last Balance After')
            ->assertExitCode(1);

        $this->assertSame(99, $product->fresh()->stock_on_hand, 'The check must never change data.');
    }
}
