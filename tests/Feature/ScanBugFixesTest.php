<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Product;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Fixes from the Oct 25 scan: new security token after sign-in, Staffs
 * "Last active" text and clock, Philippine "today" for the Dashboard and
 * undated entries, and clearing product / supplier fields.
 */
class ScanBugFixesTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function signInSuperAdmin(): User
    {
        $user = User::factory()->create(['role' => User::ROLE_SUPER_ADMIN, 'status' => User::STATUS_ACTIVE]);
        $this->actingAs($user);

        return $user;
    }

    public function test_login_sends_back_the_new_security_token(): void
    {
        User::factory()->create(['email' => 'owner@example.com', 'password' => 'password123', 'status' => 'active']);

        $response = $this->postJson('/auth/login', ['email' => 'owner@example.com', 'password' => 'password123'])
            ->assertOk();

        $this->assertNotEmpty($response->json('csrfToken'));
        $this->assertSame(session()->token(), $response->json('csrfToken'));
    }

    public function test_staff_last_active_shows_readable_philippine_time(): void
    {
        $this->signInSuperAdmin();
        Carbon::setTestNow(Carbon::parse('2026-10-25 02:30:00', 'UTC'));   // 10:30 AM in Manila
        $ana = User::factory()->create(['name' => 'Ana', 'role' => 'staff', 'status' => 'active']);
        $log = ActivityLog::create(['user_id' => $ana->id, 'action' => 'login', 'description' => 'Signed in', 'icon' => 'login']);
        $log->forceFill(['created_at' => now()->subHours(2)])->saveQuietly();   // 8:30 AM Manila

        $row = collect($this->getJson('/staff')->assertOk()->json())->firstWhere('name', 'Ana');

        $this->assertSame('Today · 08:30 AM', $row['lastActive']);
    }

    public function test_staff_last_active_says_yesterday_by_philippine_date(): void
    {
        $this->signInSuperAdmin();
        Carbon::setTestNow(Carbon::parse('2026-10-25 02:30:00', 'UTC'));   // Oct 25, 10:30 AM Manila
        $ben = User::factory()->create(['name' => 'Ben', 'role' => 'staff', 'status' => 'active']);
        $log = ActivityLog::create(['user_id' => $ben->id, 'action' => 'login', 'description' => 'Signed in', 'icon' => 'login']);
        $log->forceFill(['created_at' => now()->subHours(13)])->saveQuietly();   // Oct 24, 9:30 PM Manila

        $row = collect($this->getJson('/staff')->assertOk()->json())->firstWhere('name', 'Ben');

        $this->assertSame('Yesterday · 09:30 PM', $row['lastActive']);
    }

    public function test_dashboard_counts_todays_entries_early_in_the_morning(): void
    {
        $this->signInSuperAdmin();
        Carbon::setTestNow(Carbon::parse('2026-10-24 22:00:00', 'UTC'));   // Oct 25, 6:00 AM Manila
        Product::create(['code' => 'PRD-1001', 'name' => 'Phone Case', 'stock_on_hand' => 0]);
        $this->postJson('/api/stock-movements', [
            'unitPrice' => 10,
            'productId' => 'PRD-1001', 'type' => 'Stock In', 'qty' => 5, 'date' => '2026-10-25',
        ])->assertCreated();

        $this->getJson('/api/dashboard/summary')
            ->assertOk()
            ->assertJsonPath('kpis.stockMovementsToday', 1);
    }

    public function test_entry_without_a_date_gets_the_philippine_date(): void
    {
        $this->signInSuperAdmin();
        Carbon::setTestNow(Carbon::parse('2026-10-24 22:00:00', 'UTC'));   // Oct 25, 6:00 AM Manila
        Product::create(['code' => 'PRD-1002', 'name' => 'Charger', 'stock_on_hand' => 0]);

        $this->postJson('/api/stock-movements', ['unitPrice' => 10, 'productId' => 'PRD-1002', 'type' => 'Stock In', 'qty' => 3])
            ->assertCreated()
            ->assertJsonPath('date', '2026-10-25');
    }

    public function test_product_fields_and_supplier_can_be_cleared(): void
    {
        $this->signInSuperAdmin();
        $product = $this->postJson('/api/products', [
            'name' => 'Screen Guard', 'category' => 'Accessories', 'brand' => 'Acme',
            'model' => 'X1', 'unitMeasure' => 'pcs', 'supplierName' => 'Acme Supply',
        ])->assertCreated()->json();

        // The product form sends every field; empty ones mean "remove it".
        $this->putJson('/api/products/'.$product['id'], [
            'name' => 'Screen Guard', 'category' => '', 'brand' => '', 'model' => '',
            'unitMeasure' => '', 'supplierName' => null, 'supplierContact' => null,
        ])->assertOk()
            ->assertJsonPath('category', null)
            ->assertJsonPath('brand', null)
            ->assertJsonPath('model', null)
            ->assertJsonPath('unitMeasure', null)
            ->assertJsonPath('supplierName', null);

        // The supplier itself is kept; only the link is removed.
        $this->assertDatabaseHas('suppliers', ['name' => 'Acme Supply']);
    }

    public function test_fields_left_out_of_a_product_save_are_kept(): void
    {
        $this->signInSuperAdmin();
        $product = $this->postJson('/api/products', [
            'name' => 'Cable', 'category' => 'Accessories', 'brand' => 'Acme', 'supplierName' => 'Acme Supply',
        ])->assertCreated()->json();

        $this->putJson('/api/products/'.$product['id'], ['name' => 'USB Cable'])
            ->assertOk()
            ->assertJsonPath('name', 'USB Cable')
            ->assertJsonPath('category', 'Accessories')
            ->assertJsonPath('brand', 'Acme')
            ->assertJsonPath('supplierName', 'Acme Supply');
    }

    public function test_clearing_a_field_still_blocks_an_exact_duplicate(): void
    {
        $this->signInSuperAdmin();
        $this->postJson('/api/products', ['name' => 'Earbuds'])->assertCreated();
        $second = $this->postJson('/api/products', ['name' => 'Earbuds', 'brand' => 'Acme'])->assertCreated()->json();

        // Removing the brand would make it identical to the first product.
        $this->putJson('/api/products/'.$second['id'], ['name' => 'Earbuds', 'brand' => ''])
            ->assertStatus(422)
            ->assertJsonValidationErrors('name');
    }

    public function test_supplier_contact_can_be_cleared(): void
    {
        $this->signInSuperAdmin();
        $supplier = Supplier::create(['name' => 'Acme Supply', 'contact' => '0917 000 0000', 'company' => 'Acme Supply']);

        $this->putJson('/api/suppliers/'.$supplier->id, ['name' => 'Acme Supply', 'contact' => null, 'leadTimeDays' => 7])
            ->assertOk()
            ->assertJsonPath('contact', null)
            ->assertJsonPath('company', 'Acme Supply')
            ->assertJsonPath('leadTimeDays', 7);
    }
}
