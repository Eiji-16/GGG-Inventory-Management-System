<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\Supplier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\AuthenticatesBusinessApi;
use Tests\TestCase;

/**
 * A product identical in name, category, brand, model, unit measure and
 * supplier is blocked. If even one of those differs, it is saved.
 */
class DuplicateProductTest extends TestCase
{
    use RefreshDatabase;
    use AuthenticatesBusinessApi;

    private array $phone = [
        'name' => 'Poco X6 Pro',
        'category' => 'Phones',
        'brand' => 'Xiaomi',
        'model' => 'X6 Pro',
        'unitMeasure' => 'pc',
        'supplierName' => 'Cebu Gadgets',
    ];

    public function test_an_identical_product_is_blocked_with_a_clear_reason(): void
    {
        $code = $this->postJson('/api/products', $this->phone)->assertCreated()->json('id');

        $this->postJson('/api/products', $this->phone)
            ->assertStatus(422)
            ->assertJsonPath('message', "This product already exists ({$code}).")
            ->assertJsonPath('errors.name.0', "This product already exists ({$code}).");

        $this->assertSame(1, Product::count());
    }

    public function test_case_and_extra_spaces_do_not_make_a_product_different(): void
    {
        $this->postJson('/api/products', $this->phone)->assertCreated();

        $this->postJson('/api/products', array_merge($this->phone, [
            'name' => '  poco x6 PRO ',
            'brand' => 'XIAOMI',
        ]))->assertStatus(422);
    }

    public function test_one_different_attribute_is_enough_to_save(): void
    {
        $this->postJson('/api/products', $this->phone)->assertCreated();

        foreach ([
            'name' => 'Poco X6',
            'category' => 'Accessories',
            'brand' => 'Redmi',
            'model' => 'X6',
            'unitMeasure' => 'box',
            'supplierName' => 'Manila Phones',
        ] as $field => $value) {
            $this->postJson('/api/products', array_merge($this->phone, [$field => $value]))
                ->assertCreated();
        }

        $this->assertSame(7, Product::count());
    }

    public function test_a_blocked_save_does_not_create_a_new_supplier(): void
    {
        $this->postJson('/api/products', $this->phone)->assertCreated();
        $this->postJson('/api/products', $this->phone)->assertStatus(422);

        $this->assertSame(1, Supplier::count());
    }

    public function test_editing_a_product_into_a_copy_of_another_is_blocked(): void
    {
        $first = $this->postJson('/api/products', $this->phone)->assertCreated()->json('id');
        $second = $this->postJson('/api/products', array_merge($this->phone, ['model' => 'X6']))
            ->assertCreated()->json('id');

        $this->putJson("/api/products/{$second}", ['model' => 'X6 Pro'])
            ->assertStatus(422)
            ->assertJsonPath('message', "This product already exists ({$first}).");
    }

    public function test_saving_a_product_without_changes_is_allowed(): void
    {
        $code = $this->postJson('/api/products', $this->phone)->assertCreated()->json('id');

        $this->putJson("/api/products/{$code}", $this->phone)->assertOk();
    }

    public function test_a_deleted_product_can_be_added_again(): void
    {
        $code = $this->postJson('/api/products', $this->phone)->assertCreated()->json('id');
        $this->deleteJson("/api/products/{$code}")->assertOk();

        $this->postJson('/api/products', $this->phone)->assertCreated();
    }
}
