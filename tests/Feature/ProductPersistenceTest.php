<?php

namespace Tests\Feature;

use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;
use Tests\Concerns\AuthenticatesBusinessApi;

class ProductPersistenceTest extends TestCase
{
    use RefreshDatabase;
    use AuthenticatesBusinessApi;

    public function test_deleting_a_product_hides_it_but_preserves_historical_records(): void
    {
        $product = $this->postJson('/api/products', [
            'name' => 'Aula',
            'category' => 'Phone',
            'stock' => 12,
        ])->assertCreated()->json();

        $movement = $this->postJson('/api/stock-movements', [
            'productId' => $product['id'],
            'type' => 'Stock In',
            'qty' => 3,
            'date' => now()->toDateString(),
        ])->assertCreated()->json();
        $outgoingMovement = $this->postJson('/api/stock-movements', [
            'productId' => $product['id'],
            'type' => 'Stock Out',
            'qty' => 2,
            'date' => now()->toDateString(),
        ])->assertCreated()->json();

        $this->postJson('/api/sales-history', [
            'productId' => $product['id'],
            'periodDate' => '2026-09-01',
            'unitsSold' => 8,
        ])->assertCreated();

        $this->deleteJson('/api/products/'.$product['id'])
            ->assertOk()
            ->assertJsonPath('deleted', true);

        $this->assertDatabaseHas('products', [
            'code' => $product['id'],
            'name' => 'Aula',
        ]);
        $this->assertNotNull(Product::withTrashed()->where('code', $product['id'])->firstOrFail()->deleted_at);
        $this->assertDatabaseHas('stock_movements', ['id' => $movement['id']]);
        $this->assertDatabaseHas('stock_movements', ['id' => $outgoingMovement['id']]);
        $this->assertDatabaseHas('sales_history', [
            'product_id' => Product::withTrashed()->where('code', $product['id'])->value('id'),
            'units_sold' => 8,
        ]);
        $this->getJson('/api/products')->assertOk()->assertJsonMissing(['id' => $product['id']]);
        $this->getJson('/api/products/'.$product['id'])->assertNotFound();
        $this->getJson('/api/stock-movements')
            ->assertOk()
            ->assertJsonFragment(['id' => $movement['id'], 'productName' => 'Aula']);
        $this->getJson('/api/sales-history?product='.$product['id'])
            ->assertOk()
            ->assertJsonFragment(['productId' => $product['id'], 'unitsSold' => 8]);
        $this->getJson('/api/reports')
            ->assertOk()
            ->assertJsonPath('topMoving.rows.0.product', 'Aula');
        $this->assertDatabaseHas('activity_logs', [
            'action' => 'product.delete',
        ]);
    }

    public function test_deleted_products_cannot_be_used_for_new_operations_but_active_products_still_work(): void
    {
        $deletedProduct = $this->postJson('/api/products', ['name' => 'Aula'])
            ->assertCreated()
            ->json();
        $activeProduct = $this->postJson('/api/products', ['name' => 'Active Item'])
            ->assertCreated()
            ->json();

        $this->deleteJson('/api/products/'.$deletedProduct['id'])->assertOk();

        $this->postJson('/api/stock-movements', [
            'productId' => $deletedProduct['id'],
            'type' => 'Stock In',
            'qty' => 1,
        ])->assertUnprocessable()->assertJsonValidationErrors('productId');

        $this->postJson('/api/sales-history', [
            'productId' => $deletedProduct['id'],
            'periodDate' => '2026-10-01',
            'unitsSold' => 1,
        ])->assertUnprocessable()->assertJsonValidationErrors('productId');

        $this->postJson('/api/forecasts', [
            'productId' => $deletedProduct['id'],
        ])->assertUnprocessable()->assertJsonValidationErrors('productId');

        $this->postJson('/calculations', [
            'formula' => 'EOQ',
            'productId' => $deletedProduct['id'],
            'demandSource' => 'historical',
            'inputs' => [
                'annualDemand' => 100,
                'orderingCost' => 50,
                'holdingCost' => 2,
            ],
        ])->assertUnprocessable()->assertJsonValidationErrors('productId');

        $this->postJson('/api/stock-movements', [
            'productId' => $activeProduct['id'],
            'type' => 'Stock In',
            'qty' => 1,
        ])->assertCreated();
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
