<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\StockMovement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Stock Control "On hand" box per variant: typing a new count for one
 * variant saves a normal Correction (countedStock = product total changed by
 * that variant's difference), tagged with the variant. The product total
 * stays the single number the rest of the system uses.
 */
class StockVariantCountTest extends TestCase
{
    use RefreshDatabase;

    public function test_counting_one_variant_corrects_only_that_variant_and_the_product_total(): void
    {
        $this->actingAs(User::factory()->create(['role' => User::ROLE_SUPER_ADMIN, 'status' => User::STATUS_ACTIVE]));
        $product = Product::create(['code' => 'PRD-V', 'name' => 'Aula Keyboard', 'variants' => ['Pink', 'Black'], 'stock_on_hand' => 0]);
        $day = now('Asia/Manila')->subDay()->toDateString();
        foreach ([['Pink', 6], ['Black', 4]] as [$variant, $qty]) {
            $this->postJson('/api/stock-movements', [
                'productId' => 'PRD-V', 'variantName' => $variant, 'type' => 'Stock In', 'qty' => $qty, 'unitPrice' => 450, 'date' => $day,
            ])->assertCreated();
        }
        $this->assertSame(10, $product->fresh()->stock_on_hand);

        // Pink counted as 4 (was 6): product total 10 − 2 = 8.
        $this->postJson('/api/stock-movements', [
            'productId' => 'PRD-V', 'variantName' => 'Pink', 'type' => 'Adjustment', 'countedStock' => 8,
            'date' => now('Asia/Manila')->toDateString(),
        ])->assertCreated()
            ->assertJsonPath('type', 'Adjustment')
            ->assertJsonPath('variance', -2)
            ->assertJsonPath('variantName', 'Pink');

        $this->assertSame(8, $product->fresh()->stock_on_hand);
        $pink = StockMovement::where('variant_name', 'Pink')->get()
            ->sum(fn ($m) => $m->movement_type === 'in' ? $m->qty : -$m->qty);
        $black = StockMovement::where('variant_name', 'Black')->get()
            ->sum(fn ($m) => $m->movement_type === 'in' ? $m->qty : -$m->qty);
        $this->assertSame(4, $pink);
        $this->assertSame(4, $black);   // the other variant is untouched
    }

    public function test_stock_entries_include_when_they_were_recorded(): void
    {
        $this->actingAs(User::factory()->create(['role' => User::ROLE_SUPER_ADMIN, 'status' => User::STATUS_ACTIVE]));
        Product::create(['code' => 'PRD-T', 'name' => 'Timed', 'stock_on_hand' => 0]);
        $this->postJson('/api/stock-movements', [
            'productId' => 'PRD-T', 'type' => 'Stock In', 'qty' => 2, 'unitPrice' => 10,
        ])->assertCreated();

        $this->assertNotNull($this->getJson('/api/stock-movements')->json('0.createdAt'));
    }
}
