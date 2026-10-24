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

        // Not configured yet: default 3 + 2/day × supplier's 3 days = 9.
        $this->getJson('/api/safety-stock')
            ->assertOk()
            ->assertJsonFragment([
                'productId' => $product['id'],
                'configured' => false,
                'safetyStock' => 3,
                'statusMode' => 'manual',
                'lowPoint' => 10,
                'criticalPoint' => 5,
                'supplierLeadTimeDays' => 3,
                'demandFromHistory' => 730,
                'reorderPoint' => 9,
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

    public function test_default_policy_marks_ten_as_healthy_and_uses_specification_fields(): void
    {
        $product = $this->postJson('/api/products', [
            'name' => 'Default Policy Laptop',
            'category' => 'Computers',
            'brand' => 'Example Tech',
            'model' => 'ET-100',
        ])->assertCreated()->json();
        $model = Product::where('code', $product['id'])->firstOrFail();
        $service = new \App\Services\ReorderPointService();

        $this->assertSame('low', $service->statusFor($model, 10));
        $this->assertSame('healthy', $service->statusFor($model, 11));
        $this->assertSame('low', $service->statusFor($model, 6));
        $this->assertSame('critical', $service->statusFor($model, 5));
        $this->assertSame('out', $service->statusFor($model, 0));

        $this->getJson('/api/safety-stock')
            ->assertOk()
            ->assertJsonFragment([
                'productId' => $product['id'],
                'productName' => 'Default Policy Laptop',
                'category' => 'Computers',
                'brand' => 'Example Tech',
                'model' => 'ET-100',
            ]);
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

    public function test_manual_status_points_drive_every_status(): void
    {
        $product = $this->postJson('/api/products', ['name' => 'Manual Points'])->assertCreated()->json();
        $model = Product::where('code', $product['id'])->first();
        $model->update(['stock_on_hand' => 15]);
        StockMovement::create([
            'product_id' => $model->id, 'product_name' => $model->name, 'movement_type' => 'in',
            'is_adjustment' => false, 'qty' => 15, 'remaining_stock' => 15, 'movement_date' => now()->toDateString(),
        ]);

        // Auto: safety 5, no lead time → Low and Critical both at 5 → 15 is healthy.
        $this->putJson('/api/safety-stock', ['policies' => [[
            'productId' => $product['id'], 'safetyStock' => 5, 'leadTimeDays' => null, 'statusMode' => 'auto',
        ]]])->assertOk()->assertJsonFragment(['statusMode' => 'auto', 'lowPoint' => null]);
        $this->getJson('/api/reports')->assertJsonCount(0, 'reorderPoint.rows');

        // Manual: Low at 20, Critical at 10 → 15 is Low.
        $this->putJson('/api/safety-stock', ['policies' => [[
            'productId' => $product['id'], 'safetyStock' => 5, 'leadTimeDays' => null,
            'statusMode' => 'manual', 'lowPoint' => 20, 'criticalPoint' => 10,
        ]]])->assertOk()->assertJsonFragment(['statusMode' => 'manual', 'lowPoint' => 20, 'criticalPoint' => 10]);

        $this->getJson('/api/reports')->assertJsonPath('reorderPoint.rows.0.urgency', 'Low');
        $this->getJson('/api/dashboard/summary')->assertJsonPath('kpis.lowStockItems', 1);

        $model->update(['stock_on_hand' => 10]);
        $this->getJson('/api/reports')->assertJsonPath('reorderPoint.rows.0.urgency', 'Critical');

        // Back to Automatic clears the manual points.
        $this->putJson('/api/safety-stock', ['policies' => [[
            'productId' => $product['id'], 'safetyStock' => 5, 'leadTimeDays' => null, 'statusMode' => 'auto',
        ]]])->assertOk();
        $this->assertDatabaseHas('safety_stock', ['product_id' => $model->id, 'status_mode' => 'auto', 'low_point' => null, 'critical_point' => null]);
    }

    public function test_manual_points_are_validated(): void
    {
        $product = $this->postJson('/api/products', ['name' => 'Bad Points'])->assertCreated()->json();

        $this->putJson('/api/safety-stock', ['policies' => [[
            'productId' => $product['id'], 'safetyStock' => 5, 'statusMode' => 'manual', 'lowPoint' => 10, 'criticalPoint' => 12,
        ]]])->assertUnprocessable()->assertJsonValidationErrors(['policies.0.criticalPoint']);

        $this->putJson('/api/safety-stock', ['policies' => [[
            'productId' => $product['id'], 'safetyStock' => 5, 'statusMode' => 'manual',
        ]]])->assertUnprocessable();
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
