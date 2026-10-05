<?php

namespace Tests\Feature;

use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProductPersistenceTest extends TestCase
{
    use RefreshDatabase;

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
