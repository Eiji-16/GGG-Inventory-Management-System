<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\User;
use App\Services\RoleAccessService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * 2026-11-11: an Admin with Role Access "Open Trash Bin and restore" can see
 * the Trash Bin and restore items, but never accounts, the Archive, or
 * permanent delete.
 */
class AdminTrashRestoreTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $role): User
    {
        return User::factory()->create(['role' => $role, 'status' => User::STATUS_ACTIVE]);
    }

    private function trashedShirt(): Product
    {
        $product = Product::create(['code' => 'PRD-SHIRT', 'name' => 'GGG Shirt', 'stock_on_hand' => 0]);
        $product->delete();

        return $product;
    }

    public function test_admin_without_the_box_cannot_open_the_trash_bin(): void
    {
        $this->actingAs($this->user(User::ROLE_ADMIN))->getJson('/api/trash')->assertForbidden();
    }

    public function test_admin_with_the_box_can_see_and_restore_a_product(): void
    {
        RoleAccessService::save(['admin' => ['trash.restore' => true]]);
        $this->trashedShirt();
        $admin = $this->user(User::ROLE_ADMIN);

        $this->actingAs($admin)->getJson('/api/trash')
            ->assertOk()
            ->assertJsonPath('records.0.kind', 'product')
            ->assertJsonPath('records.0.id', 'PRD-SHIRT');

        $this->actingAs($admin)->postJson('/api/trash/bulk', [
            'space' => 'trash', 'action' => 'restore', 'items' => [['kind' => 'product', 'id' => 'PRD-SHIRT']],
        ])->assertOk()->assertJsonPath('done', 1);

        $this->assertNull(Product::where('code', 'PRD-SHIRT')->first()?->deleted_at);
    }

    public function test_admin_cannot_archive_purge_open_archive_or_touch_accounts(): void
    {
        RoleAccessService::save(['admin' => ['trash.restore' => true]]);
        $this->trashedShirt();
        $deletedStaff = $this->user(User::ROLE_STAFF);
        $deletedStaff->delete();
        $admin = $this->user(User::ROLE_ADMIN);
        $this->actingAs($admin);

        $this->getJson('/api/trash?space=archive')->assertForbidden();
        $this->getJson('/api/trash?kind=account')->assertForbidden();
        $this->postJson('/api/trash/bulk', ['space' => 'trash', 'action' => 'archive', 'items' => [['kind' => 'product', 'id' => 'PRD-SHIRT']]])->assertForbidden();
        $this->postJson('/api/trash/bulk', ['space' => 'archive', 'action' => 'purge', 'items' => [['kind' => 'product', 'id' => 'PRD-SHIRT']]])->assertForbidden();
        $this->postJson('/api/trash/bulk', ['space' => 'trash', 'action' => 'restore', 'items' => [['kind' => 'account', 'id' => $deletedStaff->id]]])->assertForbidden();

        // The deleted account is not listed or counted for the Admin.
        $this->getJson('/api/trash')
            ->assertOk()
            ->assertJsonPath('counts.account', 0)
            ->assertJsonCount(1, 'records');
        $this->assertSoftDeleted('users', ['id' => $deletedStaff->id]);
        $this->assertSoftDeleted('products', ['code' => 'PRD-SHIRT']);
    }

    public function test_staff_can_never_get_the_trash_bin(): void
    {
        RoleAccessService::save(['staff' => ['trash.restore' => true]]);
        $this->actingAs($this->user(User::ROLE_STAFF))->getJson('/api/trash')->assertForbidden();
    }
}
