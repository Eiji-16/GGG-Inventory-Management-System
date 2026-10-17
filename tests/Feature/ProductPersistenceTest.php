<?php

namespace Tests\Feature;

use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProductPersistenceTest extends TestCase
{
    use RefreshDatabase;

    public function test_deleting_a_product_removes_its_stock_movements_and_quantity(): void
    {
        $product = $this->postJson('/api/products', [
            'name' => 'Cherry Mobile',
            'category' => 'Phone',
            'stock' => 12,
        ])->assertCreated()->json();

        $movement = $this->postJson('/api/stock-movements', [
            'productId' => $product['id'],
            'type' => 'Stock In',
            'qty' => 3,
            'date' => now()->toDateString(),
        ])->assertCreated()->json();

        $this->deleteJson('/api/products/'.$product['id'])
            ->assertOk()
            ->assertJsonPath('deleted', true);

        $this->assertDatabaseMissing('products', ['code' => $product['id']]);
        $this->assertDatabaseMissing('stock_movements', ['id' => $movement['id']]);
        $this->getJson('/api/products')->assertOk()->assertJsonMissing(['id' => $product['id']]);
        $this->getJson('/api/stock-movements')->assertOk()->assertJsonMissing(['id' => $movement['id']]);
        $this->assertDatabaseHas('activity_logs', [
            'action' => 'product.delete',
        ]);
    }

    public function test_created_product_and_edits_remain_in_the_database_and_api_list(): void
    {
        $created = $this->postJson('/api/products', [
            'name' => 'Poco X6 Pro',
            'category' => 'Phone',
            'brand' => 'Poco',
            'model' => 'X6 Pro',
            'unitMeasure' => 'Units',
            'supplierName' => 'Poco Inc',
            'supplierContact' => '123456789',
        ])
            ->assertCreated()
            ->assertJsonPath('name', 'Poco X6 Pro')
            ->assertJsonPath('supplierName', 'Poco Inc')
            ->json();

        $this->putJson('/api/products/'.$created['id'], [
            'name' => 'Poco X6 Pro Updated',
            'category' => 'Phone',
            'brand' => 'Poco',
            'model' => 'X6 Pro',
            'unitMeasure' => 'Units',
            'supplierName' => 'Poco Supplier',
            'supplierContact' => '987654321',
        ])
            ->assertOk()
            ->assertJsonPath('id', $created['id'])
            ->assertJsonPath('name', 'Poco X6 Pro Updated')
            ->assertJsonPath('supplierName', 'Poco Supplier')
            ->assertJsonPath('supplierContact', '987654321');

        $this->assertDatabaseHas('products', [
            'code' => $created['id'],
            'name' => 'Poco X6 Pro Updated',
        ]);

        $this->getJson('/api/products')
            ->assertOk()
            ->assertJsonFragment([
                'id' => $created['id'],
                'name' => 'Poco X6 Pro Updated',
                'supplierName' => 'Poco Supplier',
            ]);

        $this->assertDatabaseHas('products', [
            'code' => $created['id'],
            'name' => 'Poco X6 Pro Updated',
        ]);
        $this->assertSame(1, Product::where('code', $created['id'])->count());
    }
}
