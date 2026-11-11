<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * 2026-11-11: Trash Bin "Deleted by" can filter by role (Super Admin,
 * Admin, Staff) and the name list comes with each name's role.
 */
class TrashFilterRoleTest extends TestCase
{
    use RefreshDatabase;

    private function trashed(string $code, string $deletedBy): void
    {
        $product = Product::create(['code' => $code, 'name' => $code, 'stock_on_hand' => 0]);
        $product->forceFill(['deleted_by_name' => $deletedBy])->save();
        $product->delete();
    }

    public function test_filter_by_role_and_role_tags(): void
    {
        $boss = User::factory()->create(['name' => 'Owner Ana', 'role' => User::ROLE_SUPER_ADMIN, 'status' => User::STATUS_ACTIVE]);
        User::factory()->create(['name' => 'Admin Ben', 'role' => User::ROLE_ADMIN, 'status' => User::STATUS_ACTIVE]);
        $this->trashed('PRD-A', 'Owner Ana');
        $this->trashed('PRD-B', 'Admin Ben');
        $this->actingAs($boss);

        $this->getJson('/api/trash?actor_role=admin')
            ->assertOk()
            ->assertJsonCount(1, 'records')
            ->assertJsonPath('records.0.id', 'PRD-B');
        $this->getJson('/api/trash?actor_role=staff')->assertOk()->assertJsonCount(0, 'records');
        $this->getJson('/api/trash?actor_role=boss')->assertStatus(422);

        $this->getJson('/api/trash')
            ->assertOk()
            ->assertJsonPath('deleterRoles.Owner Ana', 'Super Admin')
            ->assertJsonPath('deleterRoles.Admin Ben', 'Admin');
    }
}
