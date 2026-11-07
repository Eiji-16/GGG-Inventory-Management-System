<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Economic Order Quantity calculator limits (2026-11-07). */
class CalculatorLimitsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAs(User::factory()->create(['role' => User::ROLE_SUPER_ADMIN, 'status' => User::STATUS_ACTIVE]));
    }

    private function compute(array $inputs)
    {
        return $this->postJson('/calculations', [
            'formula' => 'EOQ',
            'inputs' => $inputs + ['annualDemand' => 360, 'orderingCost' => 50, 'holdingCost' => 10],
        ]);
    }

    public function test_numbers_inside_the_limits_are_accepted(): void
    {
        $this->compute(['annualDemand' => 99999, 'orderingCost' => 99999.99, 'holdingCost' => 0.01])->assertCreated();
        $this->compute(['orderingCost' => 3321.5, 'holdingCost' => 25.75])->assertCreated();
    }

    public function test_typing_mistakes_are_refused(): void
    {
        $this->compute(['holdingCost' => 2223333333])->assertUnprocessable()->assertJsonValidationErrors('inputs.holdingCost');
        $this->compute(['orderingCost' => 100000])->assertUnprocessable()->assertJsonValidationErrors('inputs.orderingCost');
        $this->compute(['annualDemand' => 100000])->assertUnprocessable()->assertJsonValidationErrors('inputs.annualDemand');
        $this->compute(['annualDemand' => 0.5])->assertUnprocessable()->assertJsonValidationErrors('inputs.annualDemand');
        $this->compute(['holdingCost' => 12.505])->assertUnprocessable()->assertJsonValidationErrors('inputs.holdingCost');
        $this->assertDatabaseCount('activity_logs', 0);
    }

    public function test_the_order_quantity_is_never_zero(): void
    {
        // √(2 × 1 × 0.01 ÷ 99,999.99) ≈ 0.0004 → shown as 1 unit, not 0.
        $this->compute(['annualDemand' => 1, 'orderingCost' => 0.01, 'holdingCost' => 99999.99])
            ->assertCreated()
            ->assertJsonPath('recommendedOrderQuantity', 1);
    }

    public function test_saved_cost_defaults_use_the_same_limits(): void
    {
        Product::create(['code' => 'PRD-LIM', 'name' => 'Limit Shirt', 'stock_on_hand' => 0]);

        $this->putJson('/api/products/PRD-LIM/eoq-costs', ['orderingCost' => 2223333333, 'holdingCost' => 10])
            ->assertUnprocessable()->assertJsonValidationErrors('orderingCost');
        $this->putJson('/api/products/PRD-LIM/eoq-costs', ['orderingCost' => 50, 'holdingCost' => 10.5])
            ->assertOk();
    }
}
