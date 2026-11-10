<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\RestockRequest;
use App\Models\SeasonalEvent;
use App\Models\StockMovement;
use App\Models\Supplier;
use App\Models\User;
use App\Services\RoleAccessService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * 2026-11-10 deep check: every screen action as Staff and as Admin, with the
 * default Role Access boxes and with boxes switched off. "Allowed" means the
 * server does not answer 403 (it may still answer 422 for a missing field);
 * "Blocked" means 403.
 */
class RoleMatrixDeepTest extends TestCase
{
    use RefreshDatabase;

    private Product $product;
    private StockMovement $entry;
    private Supplier $supplier;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        $this->supplier = Supplier::create(['name' => 'Acme Supply']);
        $this->product = Product::create(['code' => 'PRD-SHIRT', 'name' => 'GGG Shirt', 'stock_on_hand' => 10, 'unit_cost' => 120, 'supplier_id' => $this->supplier->id]);
        $this->entry = StockMovement::create([
            'product_id' => $this->product->id, 'product_name' => 'GGG Shirt', 'movement_type' => 'in',
            'is_adjustment' => false, 'qty' => 10, 'unit_price' => 120, 'remaining_stock' => 10,
            'movement_date' => now('Asia/Manila')->subDays(2)->toDateString(),
        ]);
    }

    private function user(string $role, array $extra = []): User
    {
        return User::factory()->create(array_merge(['role' => $role, 'status' => User::STATUS_ACTIVE], $extra));
    }

    /** [label, method, uri, body, permission that decides it (null = Super Admin only)] */
    private function actions(): array
    {
        $day = now('Asia/Manila')->toDateString();
        $event = SeasonalEvent::query()->first();

        return [
            ['products: list', 'GET', '/api/products', [], 'ALWAYS'],
            ['products: add', 'POST', '/api/products', ['name' => 'Cap'], 'products.create'],
            ['products: edit', 'PUT', '/api/products/PRD-SHIRT', ['name' => 'GGG Shirt'], 'products.edit'],
            ['products: delete', 'DELETE', '/api/products/PRD-SHIRT', [], 'products.delete'],
            ['suppliers: list', 'GET', '/api/suppliers', [], 'suppliers.view|products.create|products.edit'],
            ['suppliers: add', 'POST', '/api/suppliers', ['name' => 'New Supply'], 'suppliers.manage'],
            ['suppliers: edit', 'PUT', "/api/suppliers/{$this->supplier->id}", ['name' => 'Acme 2'], 'suppliers.manage'],
            ['stock: list', 'GET', '/api/stock-movements', [], 'stock.view|reorder.view'],
            ['stock: stock in', 'POST', '/api/stock-movements', ['productId' => 'PRD-SHIRT', 'type' => 'Stock In', 'qty' => 1, 'unitPrice' => 100, 'date' => $day], 'stock.create'],
            ['stock: edit', 'PUT', "/api/stock-movements/{$this->entry->id}", ['detailsOnly' => true, 'unitPrice' => 120, 'notes' => 'x'], 'stock.edit'],
            ['stock: activity', 'GET', '/api/stock-activities', [], 'stock.history'],
            ['stock: delete one', 'DELETE', "/api/stock-movements/{$this->entry->id}", [], 'stock.delete'],
            ['stock: clear all', 'DELETE', '/api/stock-movements/products/PRD-SHIRT', [], 'stock.clear'],
            ['reorder: restock report read', 'GET', '/api/restock-report', [], 'reorder.view'],
            ['reorder: restock report save', 'POST', '/api/restock-report', ['items' => [['productId' => 'PRD-SHIRT', 'qty' => 5]]], 'calculator.use'],
            ['reorder: send request', 'POST', '/api/restock-requests', ['productId' => 'PRD-SHIRT'], 'reorder.notify'],
            ['reorder: list requests', 'GET', '/api/restock-requests', [], 'reorder.notify|reorder.requests'],
            ['reorder: received', 'POST', '/api/reorder/receive', ['productId' => 'PRD-SHIRT', 'qty' => 2, 'unitPrice' => 100, 'date' => $day], 'reorder.receive'],
            ['calculator: compute', 'POST', '/calculations', [], 'calculator.use'],
            ['calculator: save costs', 'PUT', '/api/products/PRD-SHIRT/eoq-costs', ['orderingCost' => 50, 'holdingCost' => 10], 'calculator.save_costs'],
            ['forecast: compute', 'POST', '/api/forecasts', ['productId' => 'PRD-SHIRT', 'periodType' => 'month'], 'forecast.view|calculator.use'],
            ['forecast: past sales read', 'GET', '/api/past-sales?productId=PRD-SHIRT', [], 'forecast.view'],
            ['forecast: past sales save', 'PUT', '/api/past-sales', ['productId' => 'PRD-SHIRT', 'year' => 2025, 'periodType' => 'month', 'months' => []], 'forecast.past_sales'],
            ['forecast: events read', 'GET', '/api/seasonal-events', [], 'forecast.view'],
            ['forecast: events add', 'POST', '/api/seasonal-events', ['name' => 'Xmas'], 'forecast.events'],
            ['reports: open', 'GET', '/api/reports', [], 'reports.view'],
            ['settings: currency', 'PUT', '/api/settings/currency', ['currency' => 'PHP'], 'settings.currency'],
            ['settings: role access read', 'GET', '/api/role-access', [], 'ALWAYS'],
            ['settings: role access save', 'PUT', '/api/role-access', ['staff' => ['products.view' => true]], null],
            ['settings: safety policy read', 'GET', '/api/safety-stock', [], 'ALWAYS'],
            ['settings: safety policy save', 'PUT', '/api/safety-stock', ['policies' => []], null],
            ['settings: system logo', 'DELETE', '/branding/logo', [], null],
            ['settings: system name', 'PUT', '/branding/name', ['name' => 'Hacked'], null],
            ['settings: data overview', 'GET', '/api/system/overview', [], null],
            ['settings: data export', 'POST', '/api/system/export', [], null],
            ['settings: data reset', 'POST', '/api/system/reset', ['groups' => ['stock']], null],
            ['trash: open', 'GET', '/api/trash', [], null],
            ['trash: bulk', 'POST', '/api/trash/bulk', ['space' => 'trash', 'action' => 'restore', 'items' => [['kind' => 'entry', 'id' => 1]]], null],
            ['staffs: account requests', 'GET', '/staff/account-requests', [], null],
            ['staffs: list', 'GET', '/staff', [], 'staff.manage'],
            ['staffs: add staff', 'POST', '/staff', ['name' => 'New One', 'email' => 'new.one@example.com', 'role' => 'staff', 'password' => 'Password123!', 'password_confirmation' => 'Password123!'], 'staff.manage'],
            ['dashboard', 'GET', '/api/dashboard/summary', [], 'ALWAYS'],
            ['profile', 'GET', '/profile', [], 'ALWAYS'],
        ];
    }

    private function decide(User $user, ?string $rule): bool
    {
        if ($rule === 'ALWAYS') {
            return true;
        }
        if ($rule === null) {
            return $user->role === User::ROLE_SUPER_ADMIN;
        }
        $allowed = RoleAccessService::effectiveFor($user);
        foreach (explode('|', $rule) as $key) {
            if ($allowed[$key] ?? false) {
                return true;
            }
        }

        return false;
    }

    /** Runs every action; each on a fresh copy of the data (rolled back). */
    private function runMatrix(User $user): array
    {
        $wrong = [];
        foreach ($this->actions() as [$label, $method, $uri, $body, $rule]) {
            \DB::beginTransaction();
            try {
                $response = $this->actingAs($user)->json($method, $uri, $body);
                $expected = $this->decide($user, $rule);
                $status = $response->status();
                if ($expected && $status === 403) {
                    $wrong[] = "{$label}: should be ALLOWED but got 403";
                } elseif (! $expected && $status !== 403) {
                    $wrong[] = "{$label}: should be BLOCKED but got {$status}";
                }
                if ($status >= 500) {
                    $wrong[] = "{$label}: server error {$status} ".mb_substr((string) $response->getContent(), 0, 200);
                }
            } finally {
                \DB::rollBack();
                $this->flushSession();
            }
        }

        return $wrong;
    }

    public function test_staff_with_default_boxes(): void
    {
        $this->assertSame([], $this->runMatrix($this->user(User::ROLE_STAFF)));
    }

    public function test_admin_with_default_boxes(): void
    {
        $this->assertSame([], $this->runMatrix($this->user(User::ROLE_ADMIN)));
    }

    public function test_admin_with_manage_staff_on(): void
    {
        RoleAccessService::save(['admin' => ['staff.manage' => true]]);
        $this->assertSame([], $this->runMatrix($this->user(User::ROLE_ADMIN)));
    }

    public function test_staff_with_every_box_on(): void
    {
        RoleAccessService::save(['staff' => array_fill_keys(array_keys(RoleAccessService::FEATURES), true)]);
        $staff = $this->user(User::ROLE_STAFF);
        $this->assertFalse(RoleAccessService::allows($staff, 'staff.manage'), 'Staff can never get Manage Staff.');
        $this->assertSame([], $this->runMatrix($staff));
    }

    public function test_admin_with_every_box_off(): void
    {
        RoleAccessService::save(['admin' => array_fill_keys(array_keys(RoleAccessService::FEATURES), false)]);
        $this->assertSame([], $this->runMatrix($this->user(User::ROLE_ADMIN)));
    }

    public function test_a_page_switched_off_also_blocks_its_actions(): void
    {
        // "Add Stock In" stays ticked, but "Open Stock Control" is off.
        RoleAccessService::save(['staff' => ['stock.view' => false, 'stock.create' => true, 'reorder.view' => false]]);
        $staff = $this->user(User::ROLE_STAFF);
        $this->actingAs($staff)->postJson('/api/stock-movements', [
            'productId' => 'PRD-SHIRT', 'type' => 'Stock In', 'qty' => 1, 'unitPrice' => 10,
        ])->assertForbidden();
        $this->actingAs($staff)->getJson('/api/stock-movements')->assertForbidden();
    }

    public function test_cost_price_is_hidden_from_roles_without_products(): void
    {
        $staff = $this->user(User::ROLE_STAFF);
        $row = collect($this->actingAs($staff)->getJson('/api/products')->assertOk()->json())->firstWhere('id', 'PRD-SHIRT')
            ?? collect($this->actingAs($staff)->getJson('/api/products')->json('data'))->firstWhere('id', 'PRD-SHIRT');
        $this->assertNotNull($row);
        $this->assertNull($row['unitCost'] ?? null, 'Staff must not see the cost price.');

        $admin = $this->user(User::ROLE_ADMIN);
        $row = collect($this->actingAs($admin)->getJson('/api/products')->json())->firstWhere('id', 'PRD-SHIRT')
            ?? collect($this->actingAs($admin)->getJson('/api/products')->json('data'))->firstWhere('id', 'PRD-SHIRT');
        $this->assertEquals(120, $row['unitCost']);
    }

    public function test_reports_only_contain_the_sections_the_role_may_see(): void
    {
        RoleAccessService::save(['staff' => ['reports.tab.top_moving' => false, 'reports.tab.order_quantity' => false]]);
        $report = $this->actingAs($this->user(User::ROLE_STAFF))->getJson('/api/reports')->assertOk()->json();
        $this->assertArrayHasKey('stockSummary', $report);
        $this->assertArrayNotHasKey('topMoving', $report);
        $this->assertArrayNotHasKey('autoCalculator', $report);
    }

    public function test_admin_with_manage_staff_cannot_touch_admins_or_roles(): void
    {
        RoleAccessService::save(['admin' => ['staff.manage' => true]]);
        $admin = $this->user(User::ROLE_ADMIN);
        $otherAdmin = $this->user(User::ROLE_ADMIN);
        $super = $this->user(User::ROLE_SUPER_ADMIN);
        $staff = $this->user(User::ROLE_STAFF);

        $this->actingAs($admin)->postJson('/staff', [
            'name' => 'Sneaky', 'email' => 'sneaky@example.com', 'role' => 'admin',
            'password' => 'Password123!', 'password_confirmation' => 'Password123!',
        ])->assertForbidden();
        $this->actingAs($admin)->putJson("/staff/{$otherAdmin->id}", ['status' => 'inactive'])->assertForbidden();
        $this->actingAs($admin)->putJson("/staff/{$super->id}", ['status' => 'inactive'])->assertForbidden();
        $this->actingAs($admin)->deleteJson("/staff/{$super->id}")->assertForbidden();
        $this->actingAs($admin)->putJson("/staff/{$staff->id}", ['role' => 'admin'])->assertForbidden();
        $this->assertSame(User::ROLE_STAFF, $staff->fresh()->role);

        // What it may do: deactivate and reactivate a Staff account.
        $this->actingAs($admin)->putJson("/staff/{$staff->id}", ['status' => 'inactive'])->assertOk();
        $this->assertSame(User::STATUS_INACTIVE, $staff->fresh()->status);
    }

    public function test_deactivated_staff_is_signed_out_of_every_page(): void
    {
        $staff = $this->user(User::ROLE_STAFF, ['status' => User::STATUS_INACTIVE]);
        foreach (['/api/stock-movements', '/api/reports', '/api/dashboard/summary', '/auth/user'] as $uri) {
            $status = $this->actingAs($staff)->getJson($uri)->status();
            $this->assertContains($status, [401, 403], "{$uri} answered {$status} for a deactivated account");
        }
    }

    public function test_staff_cannot_close_a_restock_request_without_the_box(): void
    {
        $staff = $this->user(User::ROLE_STAFF);
        $this->actingAs($staff)->postJson('/api/restock-requests', ['productId' => 'PRD-SHIRT'])->assertSuccessful();
        $request = RestockRequest::query()->firstOrFail();
        $this->actingAs($staff)->putJson("/api/restock-requests/{$request->id}/done")->assertForbidden();
        $this->actingAs($this->user(User::ROLE_ADMIN))->putJson("/api/restock-requests/{$request->id}/done")->assertOk();
    }

    public function test_role_access_changes_apply_on_the_next_click(): void
    {
        $staff = $this->user(User::ROLE_STAFF);
        $this->actingAs($staff)->getJson('/api/reports')->assertOk();
        RoleAccessService::save(['staff' => ['reports.view' => false]]);
        $this->actingAs($staff)->getJson('/api/reports')->assertForbidden();
    }

    public function test_saved_order_costs_follow_the_calculator_box(): void
    {
        \App\Models\SafetyStock::create(['product_id' => $this->product->id, 'safety_stock' => 5, 'ordering_cost' => 50, 'holding_cost' => 10, 'status_mode' => 'manual', 'low_point' => 10, 'critical_point' => 5]);
        $staff = $this->user(User::ROLE_STAFF);
        $costOf = fn () => collect($this->actingAs($staff)->getJson('/api/safety-stock')->assertOk()->json())->firstWhere('productId', 'PRD-SHIRT');

        $this->assertNull($costOf()['orderingCost'], 'No calculator box: costs stay hidden.');

        RoleAccessService::save(['staff' => ['calculator.use' => true]]);
        $this->assertEquals(50, $costOf()['orderingCost'], 'With the calculator box, Staff see the saved costs.');
        $this->assertEquals(10, $costOf()['holdingCost']);
    }

    /** Security fix: taking the old SUPER_ADMIN_EMAIL in Profile gives no powers. */
    public function test_staff_cannot_become_super_admin_by_taking_the_env_email(): void
    {
        config(['auth.super_admin_email' => 'owner@ggg.test']);
        $boss = $this->user(User::ROLE_SUPER_ADMIN, ['email' => 'owner@ggg.test']);
        $this->actingAs($boss)->putJson('/profile', ['email' => 'new-owner@ggg.test'])->assertOk();

        $staff = $this->user(User::ROLE_STAFF);
        $this->actingAs($staff)->putJson('/profile', ['email' => 'owner@ggg.test'])->assertOk();

        foreach ([['GET', '/api/trash'], ['GET', '/api/system/overview'], ['PUT', '/api/role-access'], ['GET', '/staff/account-requests']] as [$method, $uri]) {
            $this->actingAs($staff->fresh())->json($method, $uri, [])->assertForbidden();
        }
        $this->assertFalse($this->actingAs($staff->fresh())->getJson('/auth/user')->json('user.isSuperAdmin'));
        // The real Super Admin keeps every power.
        $this->actingAs($boss->fresh())->getJson('/api/trash')->assertOk();
    }

    /** The .env email still works on an old database where nobody has the role yet. */
    public function test_env_email_still_works_when_nobody_has_the_role(): void
    {
        config(['auth.super_admin_email' => 'owner@ggg.test']);
        $legacy = $this->user(User::ROLE_ADMIN, ['email' => 'owner@ggg.test']);
        $this->actingAs($legacy)->getJson('/api/trash')->assertOk();
    }
}
