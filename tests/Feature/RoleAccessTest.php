<?php

namespace Tests\Feature;

use App\Models\AppSetting;
use App\Models\Product;
use App\Models\StockMovement;
use App\Models\User;
use App\Services\RoleAccessService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RoleAccessTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $role): User
    {
        return User::factory()->create(['role' => $role, 'status' => User::STATUS_ACTIVE]);
    }

    public function test_defaults_match_how_the_system_worked_before(): void
    {
        $defaults = RoleAccessService::defaults();

        $this->assertTrue($defaults['admin']['products.create']);
        $this->assertTrue($defaults['admin']['calculator.use']);
        $this->assertTrue($defaults['admin']['stock.clear']);

        $this->assertTrue($defaults['staff']['stock.view']);
        $this->assertTrue($defaults['staff']['stock.delete']);
        $this->assertTrue($defaults['staff']['reports.tab.order_quantity']);
        $this->assertFalse($defaults['staff']['products.view']);
        $this->assertFalse($defaults['staff']['stock.clear']);
        $this->assertFalse($defaults['staff']['calculator.use']);
        $this->assertFalse($defaults['staff']['forecast.view']);
        $this->assertFalse($defaults['staff']['settings.currency']);
    }

    public function test_everyone_gets_their_own_permissions_but_only_super_admin_gets_the_boxes(): void
    {
        $staff = $this->actingAs($this->user(User::ROLE_STAFF))
            ->getJson('/api/role-access')
            ->assertOk()
            ->assertJsonMissingPath('matrix')
            ->json();
        $this->assertTrue($staff['permissions']['stock.view']);
        $this->assertFalse($staff['permissions']['products.view']);
        $this->assertNotEmpty($staff['catalog']);   // feature names for the Profile page

        $super = $this->actingAs($this->user(User::ROLE_SUPER_ADMIN))
            ->getJson('/api/role-access')
            ->assertOk()
            ->assertJsonStructure(['catalog' => [['key', 'group', 'label', 'parent']]])
            ->json();
        $this->assertTrue($super['permissions']['products.view']);
        $this->assertFalse($super['matrix']['staff']['products.view']);
    }

    public function test_only_super_admin_can_save_role_access(): void
    {
        $this->actingAs($this->user(User::ROLE_ADMIN))
            ->putJson('/api/role-access', ['admin' => ['products.view' => true], 'staff' => ['products.view' => true]])
            ->assertForbidden();

        $this->actingAs($this->user(User::ROLE_STAFF))
            ->putJson('/api/role-access', ['staff' => ['products.view' => true]])
            ->assertForbidden();

        $saved = $this->actingAs($this->user(User::ROLE_SUPER_ADMIN))
            ->putJson('/api/role-access', ['staff' => ['products.view' => true, 'not.a.real.key' => true]])
            ->assertOk()
            ->json();
        $this->assertTrue($saved['matrix']['staff']['products.view']);
        $this->assertArrayNotHasKey('not.a.real.key', $saved['matrix']['staff']);

        $this->assertDatabaseHas('activity_logs', ['action' => 'settings.role_access']);
    }

    public function test_turning_off_delete_blocks_staff_on_the_server(): void
    {
        $product = Product::create(['code' => 'PRD-RA1', 'name' => 'Role Item', 'stock_on_hand' => 0]);
        $staff = $this->user(User::ROLE_STAFF);

        $this->actingAs($staff)->postJson('/api/stock-movements', [
            'unitPrice' => 10,
            'productId' => 'PRD-RA1', 'type' => 'Stock In', 'qty' => 5, 'date' => now()->toDateString(),
        ])->assertCreated();
        $entry = StockMovement::firstOrFail();

        RoleAccessService::save(['staff' => ['stock.delete' => false, 'stock.create' => false]]);

        $this->actingAs($staff)->deleteJson("/api/stock-movements/{$entry->id}")->assertForbidden();
        $this->actingAs($staff)->postJson('/api/stock-movements', [
            'unitPrice' => 10,
            'productId' => 'PRD-RA1', 'type' => 'Stock In', 'qty' => 1, 'date' => now()->toDateString(),
        ])->assertForbidden();
        $this->assertSame(5, $product->fresh()->stock_on_hand);
    }

    public function test_turning_on_a_feature_lets_staff_use_it(): void
    {
        $staff = $this->user(User::ROLE_STAFF);
        $this->actingAs($staff)->putJson('/api/settings/currency', ['currency' => 'PHP'])->assertForbidden();

        RoleAccessService::save(['staff' => ['settings.currency' => true]]);

        $this->actingAs($staff)->putJson('/api/settings/currency', ['currency' => 'PHP'])->assertOk();
        $this->assertSame('PHP', AppSetting::currency());
    }

    public function test_a_small_feature_needs_its_page_turned_on_too(): void
    {
        $staff = $this->user(User::ROLE_STAFF);
        // "Add products" on, but the Products page itself still off.
        RoleAccessService::save(['staff' => ['products.create' => true]]);

        $this->assertFalse(RoleAccessService::allows($staff, 'products.create'));
        $this->actingAs($staff)->postJson('/api/products', ['name' => 'Blocked'])->assertForbidden();

        RoleAccessService::save(['staff' => ['products.view' => true]]);
        $this->assertTrue(RoleAccessService::allows($staff, 'products.create'));
    }

    public function test_admin_can_be_restricted_but_super_admin_never_is(): void
    {
        RoleAccessService::save(['admin' => ['products.view' => false, 'calculator.use' => false]]);

        $admin = $this->user(User::ROLE_ADMIN);
        $this->actingAs($admin)->postJson('/api/products', ['name' => 'No'])->assertForbidden();
        $this->actingAs($admin)->postJson('/calculations', [])->assertForbidden();

        $super = $this->user(User::ROLE_SUPER_ADMIN);
        $this->assertTrue(RoleAccessService::allows($super, 'products.view'));
        $this->assertTrue(RoleAccessService::allows($super, 'calculator.use'));
    }

    public function test_reports_only_send_the_tabs_the_role_may_see(): void
    {
        $staff = $this->user(User::ROLE_STAFF);
        RoleAccessService::save(['staff' => ['reports.tab.order_quantity' => false, 'reports.tab.stock_summary' => false]]);

        $this->actingAs($staff)->getJson('/api/reports')
            ->assertOk()
            ->assertJsonMissingPath('autoCalculator')
            ->assertJsonMissingPath('stockSummary')
            ->assertJsonStructure(['stockMovement', 'reorderPoint']);

        RoleAccessService::save(['staff' => ['reports.view' => false]]);
        $this->actingAs($staff)->getJson('/api/reports')->assertForbidden();
    }

    public function test_calculator_access_is_enough_to_ask_for_a_forecast_from_order_now(): void
    {
        $admin = $this->user(User::ROLE_ADMIN);
        RoleAccessService::save(['admin' => ['forecast.view' => false]]);

        $this->actingAs($admin)->getJson('/api/seasonal-events')->assertForbidden();
        $this->actingAs($admin)->postJson('/api/forecasts', [])->assertStatus(422); // allowed in, then validation
    }

    public function test_saved_value_always_fits_the_255_character_settings_column(): void
    {
        // MySQL's app_settings.value is VARCHAR(255); the test database (SQLite) does not enforce that.
        $allOn = array_fill_keys(array_keys(RoleAccessService::FEATURES), true);
        $this->assertLessThanOrEqual(255, strlen(RoleAccessService::encode($allOn)));

        RoleAccessService::save(['admin' => $allOn, 'staff' => $allOn]);
        foreach (RoleAccessService::ROLES as $role) {
            $value = AppSetting::get(RoleAccessService::SETTING_PREFIX.$role);
            $this->assertNotNull($value);
            $this->assertLessThanOrEqual(255, strlen($value));
        }
    }

    public function test_codes_are_unique_and_choices_survive_a_save_and_reload(): void
    {
        $codes = array_column(RoleAccessService::FEATURES, 'code');
        $this->assertSame(count($codes), count(array_unique($codes)));

        RoleAccessService::save(['staff' => ['stock.delete' => false, 'products.view' => true], 'admin' => ['stock.clear' => false]]);
        $matrix = RoleAccessService::matrix();

        $this->assertFalse($matrix['staff']['stock.delete']);
        $this->assertTrue($matrix['staff']['products.view']);
        $this->assertTrue($matrix['staff']['stock.view']);      // untouched box keeps its value
        $this->assertFalse($matrix['admin']['stock.clear']);
        $this->assertTrue($matrix['admin']['products.view']);

        // Turning everything off is saved too (an empty list, not "use defaults").
        RoleAccessService::save(['staff' => array_fill_keys(array_keys(RoleAccessService::FEATURES), false)]);
        $this->assertNotContains(true, RoleAccessService::matrix()['staff']);
    }

    public function test_login_payload_includes_permissions(): void
    {
        $user = $this->actingAs($this->user(User::ROLE_STAFF))
            ->getJson('/auth/user')
            ->assertOk()
            ->json('user');
        $this->assertTrue($user['permissions']['reorder.view']);
        $this->assertFalse($user['permissions']['forecast.view']);
    }
}
