<?php

namespace Tests\Feature;

use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SafetyStockPolicyTest extends TestCase
{
    use RefreshDatabase;

    public function test_policy_is_saved_by_product_id_and_exposed_to_product_consumers(): void
    {
        $product = $this->postJson('/api/products', [
            'name' => 'Policy Test Product',
        ])->assertCreated()->json();

        $this->getJson('/api/safety-stock')
            ->assertOk()
            ->assertJsonFragment([
                'productId' => $product['id'],
                'productName' => 'Policy Test Product',
                'configured' => false,
            ]);

        $this->putJson('/api/safety-stock', [
            'policies' => [[
                'productId' => $product['id'],
                'safetyStock' => 32,
                'annualDemand' => 840,
                'leadTimeDays' => 12,
                'orderCycleDays' => 30,
            ]],
        ])
            ->assertOk()
            ->assertJsonFragment([
                'productId' => $product['id'],
                'productName' => 'Policy Test Product',
                'safetyStock' => 32,
                'annualDemand' => 840,
                'leadTimeDays' => 12,
                'orderCycleDays' => 30,
                'configured' => true,
            ]);

        $this->getJson('/api/products')
            ->assertOk()
            ->assertJsonFragment([
                'id' => $product['id'],
                'safetyStock' => 32,
                'annualDemand' => 840,
                'leadTimeDays' => 12,
                'orderCycleDays' => 30,
            ]);

        $this->assertDatabaseHas('safety_stock', [
            'product_id' => Product::where('code', $product['id'])->value('id'),
            'safety_stock' => 32,
            'annual_demand' => 840,
            'lead_time_days' => 12,
            'order_cycle_days' => 30,
        ]);
    }

    public function test_policy_rejects_unknown_products_and_invalid_order_cycles(): void
    {
        $product = $this->postJson('/api/products', [
            'name' => 'Another Policy Product',
        ])->assertCreated()->json();

        $this->putJson('/api/safety-stock', [
            'policies' => [[
                'productId' => 'MISSING',
                'safetyStock' => 5,
                'annualDemand' => null,
                'leadTimeDays' => null,
                'orderCycleDays' => null,
            ]],
        ])->assertUnprocessable();

        $this->putJson('/api/safety-stock', [
            'policies' => [[
                'productId' => $product['id'],
                'safetyStock' => 5,
                'annualDemand' => null,
                'leadTimeDays' => null,
                'orderCycleDays' => 0,
            ]],
        ])->assertUnprocessable();
    }
}
