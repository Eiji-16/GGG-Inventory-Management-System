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

    public function test_deleting_a_product_moves_it_and_its_entries_to_the_trash_bin(): void
    {
        $product = $this->postJson('/api/products', [
            'name' => 'Aula',
            'category' => 'Phone',
            'stock' => 12,
        ])->assertCreated()->json();

        $movement = $this->postJson('/api/stock-movements', [
            'unitPrice' => 10,
            'productId' => $product['id'],
            'type' => 'Stock In',
            'qty' => 3,
            'date' => now()->toDateString(),
        ])->assertCreated()->json();
        $outgoingMovement = $this->postJson('/api/stock-movements', [
            'unitPrice' => 10,
            'productId' => $product['id'],
            'type' => 'Stock Out',
            'qty' => 2,
            'date' => now()->toDateString(),
        ])->assertCreated()->json();

        \App\Models\SalesHistory::create([
            'product_id' => Product::where('code', $product['id'])->value('id'),
            'period_date' => '2026-09-01',
            'period_type' => 'month',
            'units_sold' => 8,
        ]);

        $this->deleteJson('/api/products/'.$product['id'])
            ->assertOk()
            ->assertJsonPath('deleted', true);

        $this->assertDatabaseHas('products', [
            'code' => $product['id'],
            'name' => 'Aula',
        ]);
        $this->assertNotNull(Product::withTrashed()->where('code', $product['id'])->firstOrFail()->deleted_at);
        // Entries are kept (not erased) but went to the Trash Bin with the product.
        $this->assertSoftDeleted('stock_movements', ['id' => $movement['id']]);
        $this->assertSoftDeleted('stock_movements', ['id' => $outgoingMovement['id']]);
        $this->assertDatabaseHas('sales_history', [
            'product_id' => Product::withTrashed()->where('code', $product['id'])->value('id'),
            'units_sold' => 8,
        ]);
        $this->getJson('/api/products')->assertOk()->assertJsonMissing(['id' => $product['id']]);
        $this->getJson('/api/products/'.$product['id'])->assertNotFound();
        // Left out of Stock Control and reports while in the Trash Bin ...
        $this->getJson('/api/stock-movements')
            ->assertOk()
            ->assertJsonMissing(['id' => $movement['id']]);
        $topMoving = collect($this->getJson('/api/reports')->assertOk()->json('topMoving.rows'));
        $this->assertFalse($topMoving->contains(fn ($row) => ($row['product'] ?? null) === 'Aula'));
        // ... and listed in the Trash Bin with its 2 entries.
        $this->getJson('/api/trash')
            ->assertOk()
            ->assertJsonPath('products.0.id', $product['id'])
            ->assertJsonPath('products.0.entries', 2);
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
            'unitPrice' => 10,
            'productId' => $deletedProduct['id'],
            'type' => 'Stock In',
            'qty' => 1,
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
            'unitPrice' => 10,
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
