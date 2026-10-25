<?php

namespace Tests\Feature;

use App\Models\AppSetting;
use App\Models\Product;
use App\Models\RestockRequest;
use App\Models\User;
use App\Services\RoleAccessService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Staff "Notify" button in Reorder Alerts → Admin / Super Admin bell. */
class RestockRequestTest extends TestCase
{
    use RefreshDatabase;

    private User $staff;
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->staff = User::factory()->create(['role' => User::ROLE_STAFF, 'status' => User::STATUS_ACTIVE, 'name' => 'Maria']);
        $this->admin = User::factory()->create(['role' => User::ROLE_ADMIN, 'status' => User::STATUS_ACTIVE]);
        Product::create(['code' => 'PRD-N1', 'name' => 'Notify Cap', 'stock_on_hand' => 0]);
    }

    public function test_staff_sends_a_request_with_a_note_and_admin_sees_it(): void
    {
        $this->actingAs($this->staff)
            ->postJson('/api/restock-requests', ['productId' => 'PRD-N1', 'note' => 'Customer asking for size L'])
            ->assertCreated()
            ->assertJsonPath('requestedBy', 'Maria')
            ->assertJsonPath('note', 'Customer asking for size L');

        $this->actingAs($this->admin)
            ->getJson('/api/restock-requests')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.productName', 'Notify Cap');

        $this->assertDatabaseHas('activity_logs', ['action' => 'restock.request']);
    }

    public function test_a_second_notify_for_the_same_product_does_not_duplicate(): void
    {
        $this->actingAs($this->staff)->postJson('/api/restock-requests', ['productId' => 'PRD-N1'])->assertCreated();
        $this->actingAs($this->staff)
            ->postJson('/api/restock-requests', ['productId' => 'PRD-N1', 'note' => 'Still waiting'])
            ->assertOk()
            ->assertJsonPath('alreadyOpen', true)
            ->assertJsonPath('note', 'Still waiting');

        $this->assertSame(1, RestockRequest::count());
    }

    public function test_admin_can_close_it_but_staff_cannot(): void
    {
        $id = $this->actingAs($this->staff)->postJson('/api/restock-requests', ['productId' => 'PRD-N1'])->json('id');

        $this->actingAs($this->staff)->putJson("/api/restock-requests/{$id}/done")->assertForbidden();
        $this->actingAs($this->admin)->putJson("/api/restock-requests/{$id}/done")->assertOk()->assertJsonPath('status', 'done');

        $this->actingAs($this->admin)->getJson('/api/restock-requests')->assertJsonCount(0);
    }

    public function test_recording_a_stock_in_closes_the_request(): void
    {
        $this->actingAs($this->staff)->postJson('/api/restock-requests', ['productId' => 'PRD-N1'])->assertCreated();

        $this->actingAs($this->admin)->postJson('/api/stock-movements', [
            'productId' => 'PRD-N1', 'type' => 'Stock In', 'qty' => 10, 'date' => now('Asia/Manila')->toDateString(),
        ])->assertCreated();

        $this->assertSame(RestockRequest::STATUS_DONE, RestockRequest::first()->status);
    }

    public function test_role_access_controls_who_can_notify(): void
    {
        RoleAccessService::save(['staff' => ['reorder.notify' => false]]);
        $this->actingAs($this->staff)->postJson('/api/restock-requests', ['productId' => 'PRD-N1'])->assertForbidden();
    }

    public function test_settings_saved_before_notify_existed_still_give_staff_the_notify_button(): void
    {
        // Old format: only the ON codes, no "|" (Staff defaults as of the first release).
        AppSetting::put(RoleAccessService::SETTING_PREFIX.'staff', 'kv,kc,ke,kd,kx,kh,rv,tv,t1,t2,t3,t4,t5,t6,t7,t8,tx,nv');

        $matrix = RoleAccessService::matrix();
        $this->assertTrue($matrix['staff']['reorder.notify']);     // new feature → its default
        $this->assertFalse($matrix['staff']['reorder.requests']);  // new feature → its default
        $this->assertFalse($matrix['staff']['products.view']);     // old feature, saved as off
        $this->assertTrue($matrix['staff']['stock.delete']);       // old feature, saved as on
    }
}
