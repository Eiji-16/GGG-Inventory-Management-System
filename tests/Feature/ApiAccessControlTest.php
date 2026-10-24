<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ApiAccessControlTest extends TestCase
{
    use RefreshDatabase;

    public function test_business_api_requires_a_session(): void
    {
        $this->getJson('/api/dashboard/summary')->assertUnauthorized();
    }

    public function test_staff_can_read_inventory_but_cannot_manage_catalog(): void
    {
        $staff = User::factory()->create([
            'role' => User::ROLE_STAFF,
            'status' => User::STATUS_ACTIVE,
        ]);
        $product = Product::create([
            'code' => 'PRD-STAFF',
            'name' => 'Staff Stock Item',
            'stock_on_hand' => 2,
        ]);

        $this->actingAs($staff)
            ->getJson('/api/dashboard/summary')
            ->assertOk();

        $this->actingAs($staff)
            ->postJson('/api/products', ['name' => 'Forbidden Product'])
            ->assertForbidden();

        $this->assertDatabaseHas('products', ['id' => $product->id]);
    }

    public function test_only_admins_can_clear_all_stock_for_a_product(): void
    {
        $product = Product::create([
            'code' => 'PRD-CLEAR',
            'name' => 'Clear Test Item',
            'stock_on_hand' => 5,
        ]);
        $staff = User::factory()->create(['role' => User::ROLE_STAFF, 'status' => User::STATUS_ACTIVE]);
        $admin = User::factory()->create(['role' => User::ROLE_ADMIN, 'status' => User::STATUS_ACTIVE]);

        $this->actingAs($staff)
            ->deleteJson('/api/stock-movements/products/PRD-CLEAR')
            ->assertForbidden();
        $this->assertSame(5, $product->fresh()->stock_on_hand);

        $this->actingAs($admin)
            ->deleteJson('/api/stock-movements/products/PRD-CLEAR')
            ->assertOk();
        $this->assertSame(0, $product->fresh()->stock_on_hand);
    }
}
