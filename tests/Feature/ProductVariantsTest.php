<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\StockMovement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\AuthenticatesBusinessApi;
use Tests\TestCase;

/** Products keep their own variant list, edited in the product modal. */
class ProductVariantsTest extends TestCase
{
    use RefreshDatabase;
    use AuthenticatesBusinessApi;

    public function test_variants_are_saved_cleaned_and_returned(): void
    {
        $created = $this->postJson('/api/products', [
            'name' => 'Classic Tee',
            'variants' => [' Black / M ', 'White / L', 'black / m', '', 'Gray / XL'],
        ])->assertCreated()
            ->assertJsonPath('definedVariants', ['Black / M', 'White / L', 'Gray / XL'])
            ->assertJsonPath('variants', ['Black / M', 'White / L', 'Gray / XL'])
            ->json();

        $this->putJson('/api/products/'.$created['id'], ['variants' => ['Red / S']])
            ->assertOk()
            ->assertJsonPath('definedVariants', ['Red / S']);

        // Saving other fields without "variants" keeps the list.
        $this->putJson('/api/products/'.$created['id'], ['brand' => 'GGG'])
            ->assertOk()
            ->assertJsonPath('definedVariants', ['Red / S']);

        // An empty list clears it.
        $this->putJson('/api/products/'.$created['id'], ['variants' => []])
            ->assertOk()
            ->assertJsonPath('definedVariants', []);
    }

    public function test_names_used_on_older_stock_movements_are_still_listed(): void
    {
        $product = Product::create(['code' => 'PRD-VAR', 'name' => 'Cap', 'stock_on_hand' => 5, 'variants' => ['White / OS']]);
        StockMovement::create([
            'product_id' => $product->id,
            'product_name' => $product->name,
            'movement_type' => 'in',
            'is_adjustment' => false,
            'qty' => 5,
            'remaining_stock' => 5,
            'variant_name' => 'Black / OS',
            'movement_date' => now()->toDateString(),
        ]);

        $this->getJson('/api/products')
            ->assertOk()
            ->assertJsonPath('0.definedVariants', ['White / OS'])
            ->assertJsonPath('0.recordedVariants', ['Black / OS'])
            ->assertJsonPath('0.variants', ['White / OS', 'Black / OS']);
        $this->assertSame(5, $product->fresh()->stock_on_hand);
    }

    public function test_variant_validation(): void
    {
        $this->postJson('/api/products', [
            'name' => 'Too many',
            'variants' => array_map(fn ($i) => "V{$i}", range(1, 51)),
        ])->assertUnprocessable()->assertJsonValidationErrors(['variants']);
    }
}
