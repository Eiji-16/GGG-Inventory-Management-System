<?php

namespace Tests\Feature;

use App\Models\StockMovement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** How stock entries follow their product: rename, delete, and variants. */
class ProductStockLinkTest extends TestCase
{
    use RefreshDatabase;

    private string $code;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAs(User::factory()->create(['role' => User::ROLE_SUPER_ADMIN, 'status' => User::STATUS_ACTIVE]));
        $this->code = $this->postJson('/api/products', ['name' => 'Link Shirt', 'category' => 'Tops', 'variants' => ['Red', 'Blue']])->assertCreated()->json('id');
    }

    private function entry(array $extra = [])
    {
        return $this->postJson('/api/stock-movements', $extra + [
            'productId' => $this->code, 'type' => 'Stock In', 'qty' => 5, 'unitPrice' => 10, 'date' => now('Asia/Manila')->toDateString(),
        ]);
    }

    public function test_stock_rows_show_the_products_current_name_after_a_rename(): void
    {
        $this->entry()->assertCreated();
        $this->putJson("/api/products/{$this->code}", ['name' => 'Link Shirt V2', 'category' => 'Shirts'])->assertOk();

        $row = $this->getJson('/api/stock-movements')->json('0');
        $this->assertSame('Link Shirt V2', $row['productName']);
        $this->assertSame('Shirts', $row['category']);
        $this->assertFalse($row['productDeleted']);
    }

    public function test_rows_of_a_deleted_product_go_to_the_trash_bin_with_it(): void
    {
        $this->entry()->assertCreated();
        $this->deleteJson("/api/products/{$this->code}")->assertOk();   // allowed even with stock (screen warns first)

        $this->assertSame([], $this->getJson('/api/stock-movements')->json());
        $row = collect($this->getJson('/api/trash')->json('records'))->firstWhere('kind', 'entry');
        $this->assertSame('Link Shirt', $row['productName']);
        $this->assertTrue($row['withProduct']);
        $this->assertTrue($row['productInTrash']);
    }

    public function test_variant_must_be_one_of_the_products_variants(): void
    {
        $this->entry(['variantName' => 'red'])->assertCreated();              // case doesn't matter
        $this->entry(['variantName' => 'Purple'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('variantName');
        $this->entry(['variantName' => ''])->assertCreated();                 // no variant is fine
    }

    public function test_old_entries_keep_working_after_a_variant_is_removed_from_the_product(): void
    {
        $this->entry(['variantName' => 'Blue'])->assertCreated();
        $id = StockMovement::firstOrFail()->id;
        $this->putJson("/api/products/{$this->code}", ['name' => 'Link Shirt', 'category' => 'Tops', 'variants' => ['Red']])->assertOk();

        // Editing notes on the old "Blue" entry still works (variant unchanged) ...
        $this->putJson("/api/stock-movements/{$id}", ['unitPrice' => 10, 'detailsOnly' => true, 'variantName' => 'Blue', 'notes' => 'checked'])->assertOk();
        // ... but switching it to an unknown variant does not.
        $this->putJson("/api/stock-movements/{$id}", ['unitPrice' => 10, 'detailsOnly' => true, 'variantName' => 'Green'])->assertStatus(422);
    }
}
