<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\SafetyStock;
use App\Models\StockMovement;
use App\Models\Supplier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\AuthenticatesBusinessApi;
use Tests\TestCase;

/** The policy is safety stock + optional lead-time override; costs live in EOQ. */
class SafetyStockPolicyTest extends TestCase
{
    use RefreshDatabase;
    use AuthenticatesBusinessApi;

    public function test_policy_saves_safety_stock_and_lead_time_and_returns_the_reorder_point(): void
    {
        $supplier = Supplier::create(['name' => 'Fast Supplier', 'company' => 'Fast Supplier', 'lead_time_days' => 3]);
        $product = $this->postJson('/api/products', [
            'name' => 'Policy Test Product',
            'supplierName' => 'Fast Supplier',
        ])->assertCreated()->json();
        $model = Product::where('code', $product['id'])->first();
        StockMovement::create([
            'product_id' => $model->id, 'product_name' => $model->name, 'movement_type' => 'out',
            'is_adjustment' => false, 'qty' => 730, 'remaining_stock' => 0, 'movement_date' => now()->toDateString(),
        ]);

        // Not configured yet: default 20 + 2/day × supplier's 3 days = 26.
        $this->getJson('/api/safety-stock')
            ->assertOk()
            ->assertJsonFragment([
                'productId' => $product['id'],
                'configured' => false,
                'supplierLeadTimeDays' => 3,
                'demandFromHistory' => 730,
                'reorderPoint' => 26,
            ]);

        // Override lead time to 10 days: 32 + 2 × 10 = 52.
        $this->putJson('/api/safety-stock', [
            'policies' => [[
                'productId' => $product['id'],
                'safetyStock' => 32,
                'leadTimeDays' => 10,
                // Removed fields are ignored if an old screen still sends them.
                'annualDemand' => 840,
                'orderCycleDays' => 30,
            ]],
        ])
            ->assertOk()
            ->assertJsonFragment([
                'productId' => $product['id'],
                'safetyStock' => 32,
                'leadTimeDays' => 10,
                'reorderPoint' => 52,
                'configured' => true,
            ]);

        $this->getJson('/api/products')
            ->assertOk()
            ->assertJsonFragment(['id' => $product['id'], 'safetyStock' => 32, 'leadTimeDays' => 10, 'annualDemand' => 730]);
        $this->assertDatabaseHas('safety_stock', ['product_id' => $model->id, 'safety_stock' => 32, 'lead_time_days' => 10, 'annual_demand' => null]);
    }

    public function test_saving_the_policy_never_wipes_saved_eoq_costs(): void
    {
        $product = $this->postJson('/api/products', ['name' => 'Cost Product'])->assertCreated()->json();

        $this->putJson("/api/products/{$product['id']}/eoq-costs", ['orderingCost' => 250.5, 'holdingCost' => 18.25])
            ->assertOk()
            ->assertJsonPath('orderingCost', '250.50');

        $this->putJson('/api/safety-stock', [
            'policies' => [['productId' => $product['id'], 'safetyStock' => 12, 'leadTimeDays' => null]],
        ])->assertOk();

        $this->assertDatabaseHas('safety_stock', [
            'product_id' => Product::where('code', $product['id'])->value('id'),
            'safety_stock' => 12,
            'ordering_cost' => 250.50,
            'holding_cost' => 18.25,
        ]);
        $this->getJson('/api/products')->assertJsonFragment(['orderingCost' => '250.50', 'holdingCost' => '18.25']);
    }

    public function test_validation(): void
    {
        $product = $this->postJson('/api/products', ['name' => 'Another Policy Product'])->assertCreated()->json();

        $this->putJson('/api/safety-stock', [
            'policies' => [['productId' => 'MISSING', 'safetyStock' => 5]],
        ])->assertUnprocessable();

        $this->putJson('/api/safety-stock', [
            'policies' => [['productId' => $product['id'], 'safetyStock' => -1]],
        ])->assertUnprocessable();

        $this->putJson("/api/products/{$product['id']}/eoq-costs", ['orderingCost' => 0, 'holdingCost' => 10])
            ->assertUnprocessable();
    }
}
