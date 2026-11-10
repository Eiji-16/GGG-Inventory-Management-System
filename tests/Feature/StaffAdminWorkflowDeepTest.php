<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\RestockRequest;
use App\Models\StockMovement;
use App\Models\User;
use App\Services\RoleAccessService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/** 2026-11-10: what Staff and Admin do every day, checked for wrong results. */
class StaffAdminWorkflowDeepTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
    }

    private function user(string $role, array $extra = []): User
    {
        return User::factory()->create(array_merge(['role' => $role, 'status' => User::STATUS_ACTIVE], $extra));
    }

    private function shirt(int $stock = 10, array $extra = []): Product
    {
        $product = Product::create(array_merge(['code' => 'PRD-SHIRT', 'name' => 'GGG Shirt', 'stock_on_hand' => 0], $extra));
        if ($stock > 0) {
            $this->actingAs($this->user(User::ROLE_SUPER_ADMIN))->postJson('/api/stock-movements', [
                'productId' => 'PRD-SHIRT', 'type' => 'Stock In', 'qty' => $stock, 'unitPrice' => 100,
                'date' => now('Asia/Manila')->subDays(3)->toDateString(),
                'variantName' => $extra['variants'][0] ?? null,
            ])->assertCreated();
        }

        return $product->fresh();
    }

    public function test_staff_cannot_raise_own_role_or_status_from_profile(): void
    {
        $staff = $this->user(User::ROLE_STAFF);
        $this->actingAs($staff)->putJson('/profile', ['name' => 'Ana', 'role' => 'super_admin', 'status' => 'active', 'auth_version' => 99])->assertOk();
        $staff->refresh();
        $this->assertSame('Ana', $staff->name);
        $this->assertSame(User::ROLE_STAFF, $staff->role);
    }

    public function test_password_change_needs_the_current_password(): void
    {
        $staff = $this->user(User::ROLE_STAFF, ['password' => Hash::make('OldPassword1!')]);
        $this->actingAs($staff)->postJson('/profile/password', [
            'current_password' => 'wrong-one', 'password' => 'NewPassword1!', 'password_confirmation' => 'NewPassword1!',
        ])->assertUnprocessable();
        $this->assertTrue(Hash::check('OldPassword1!', $staff->fresh()->password));
    }

    public function test_staff_cannot_sell_more_than_on_hand(): void
    {
        $this->shirt(5);
        $staff = $this->user(User::ROLE_STAFF);
        $this->actingAs($staff)->postJson('/api/stock-movements', [
            'productId' => 'PRD-SHIRT', 'type' => 'Stock Out', 'qty' => 6, 'unitPrice' => 250,
        ])->assertUnprocessable();
        $this->assertSame(5, Product::where('code', 'PRD-SHIRT')->value('stock_on_hand'));

        $this->actingAs($staff)->postJson('/api/stock-movements', [
            'productId' => 'PRD-SHIRT', 'type' => 'Stock Out', 'qty' => 5, 'unitPrice' => 250,
        ])->assertCreated();
        $this->assertSame(0, Product::where('code', 'PRD-SHIRT')->value('stock_on_hand'));
    }

    public function test_staff_cannot_record_a_future_date(): void
    {
        $this->shirt(5);
        $this->actingAs($this->user(User::ROLE_STAFF))->postJson('/api/stock-movements', [
            'productId' => 'PRD-SHIRT', 'type' => 'Stock In', 'qty' => 1, 'unitPrice' => 100,
            'date' => now('Asia/Manila')->addDays(2)->toDateString(),
        ])->assertUnprocessable();
    }

    public function test_received_needs_the_variant_and_adds_stock(): void
    {
        $this->shirt(4, ['variants' => ['Small', 'Large']]);
        $staff = $this->user(User::ROLE_STAFF);
        $this->actingAs($staff)->postJson('/api/reorder/receive', [
            'productId' => 'PRD-SHIRT', 'qty' => 3, 'unitPrice' => 100, 'date' => now('Asia/Manila')->toDateString(),
        ])->assertUnprocessable();
        $this->actingAs($staff)->postJson('/api/reorder/receive', [
            'productId' => 'PRD-SHIRT', 'qty' => 3, 'unitPrice' => 100, 'date' => now('Asia/Manila')->toDateString(), 'variantName' => 'Large',
        ])->assertSuccessful();
        $this->assertSame(7, Product::where('code', 'PRD-SHIRT')->value('stock_on_hand'));
        $this->assertSame('Large', StockMovement::latest('id')->value('variant_name'));
    }

    public function test_recorded_by_is_the_person_signed_in(): void
    {
        $this->shirt(5);
        $staff = $this->user(User::ROLE_STAFF, ['name' => 'Ana Staff']);
        $id = $this->actingAs($staff)->postJson('/api/stock-movements', [
            'productId' => 'PRD-SHIRT', 'type' => 'Stock Out', 'qty' => 1, 'unitPrice' => 250, 'recordedBy' => 'Someone Else',
        ])->assertCreated()->json('id');
        $this->assertSame('Ana Staff', StockMovement::find($id)->recorded_by, 'Recorded By must not be faked.');
    }

    public function test_a_second_request_for_the_same_product_is_not_a_duplicate(): void
    {
        $this->shirt(2);
        $staff = $this->user(User::ROLE_STAFF);
        $this->actingAs($staff)->postJson('/api/restock-requests', ['productId' => 'PRD-SHIRT'])->assertSuccessful();
        $this->actingAs($staff)->postJson('/api/restock-requests', ['productId' => 'PRD-SHIRT']);
        $this->assertSame(1, RestockRequest::query()->where('status', RestockRequest::STATUS_OPEN)->count());
    }

    public function test_admin_deactivates_staff_and_the_staff_is_signed_out_at_once(): void
    {
        RoleAccessService::save(['admin' => ['staff.manage' => true]]);
        $admin = $this->user(User::ROLE_ADMIN);
        $staff = $this->user(User::ROLE_STAFF);
        $this->actingAs($staff)->getJson('/api/stock-movements')->assertOk();

        $this->actingAs($admin)->putJson("/staff/{$staff->id}", ['status' => 'inactive'])->assertOk();
        $this->actingAs($staff->fresh())->getJson('/api/stock-movements')->assertUnauthorized();
    }

    public function test_admin_moves_a_deactivated_staff_to_trash_but_cannot_open_the_trash(): void
    {
        RoleAccessService::save(['admin' => ['staff.manage' => true]]);
        $admin = $this->user(User::ROLE_ADMIN);
        $staff = $this->user(User::ROLE_STAFF);

        $this->actingAs($admin)->deleteJson("/staff/{$staff->id}", ['confirmation' => 'DELETE'])->assertUnprocessable();   // still active
        $this->actingAs($admin)->putJson("/staff/{$staff->id}", ['status' => 'inactive'])->assertOk();
        $this->actingAs($admin)->deleteJson("/staff/{$staff->id}", ['confirmation' => 'DELETE'])->assertOk();
        $this->assertSoftDeleted('users', ['id' => $staff->id]);
        $this->actingAs($admin)->getJson('/api/trash')->assertForbidden();
        $this->actingAs($admin)->deleteJson("/staff/{$admin->id}", ['confirmation' => 'DELETE'])->assertForbidden();
    }

    public function test_only_super_admin_resets_an_authenticator(): void
    {
        RoleAccessService::save(['admin' => ['staff.manage' => true]]);
        $staff = $this->user(User::ROLE_STAFF);
        $this->actingAs($this->user(User::ROLE_ADMIN))->deleteJson("/staff/{$staff->id}/two-factor")->assertForbidden();
    }

    public function test_staff_cannot_change_someone_elses_photo(): void
    {
        $other = $this->user(User::ROLE_STAFF);
        $this->actingAs($this->user(User::ROLE_STAFF))->deleteJson("/staff/{$other->id}/avatar")->assertForbidden();
        $this->actingAs($this->user(User::ROLE_STAFF))->getJson("/staff/{$other->id}/avatar")->assertForbidden();
    }

    public function test_dashboard_numbers_match_for_staff_and_super_admin(): void
    {
        $this->shirt(8);
        $staffView = $this->actingAs($this->user(User::ROLE_STAFF))->getJson('/api/dashboard/summary')->assertOk()->json('kpis');
        $superView = $this->actingAs($this->user(User::ROLE_SUPER_ADMIN))->getJson('/api/dashboard/summary')->assertOk()->json('kpis');
        $this->assertSame($superView, $staffView, 'Everyone sees the same stock numbers.');
        $this->assertSame(8, $staffView['totalStockUnits']);
    }

    public function test_reports_stock_numbers_match_for_staff_and_admin(): void
    {
        $this->shirt(8);
        $staffView = $this->actingAs($this->user(User::ROLE_STAFF))->getJson('/api/reports')->assertOk()->json('stockSummary.kpis');
        $adminView = $this->actingAs($this->user(User::ROLE_ADMIN))->getJson('/api/reports')->assertOk()->json('stockSummary.kpis');
        $this->assertSame($adminView, $staffView);
    }
}
