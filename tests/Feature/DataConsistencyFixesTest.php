<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Product;
use App\Models\SalesHistory;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\AuthenticatesBusinessApi;
use Tests\TestCase;

class DataConsistencyFixesTest extends TestCase
{
    use RefreshDatabase;
    use AuthenticatesBusinessApi;

    private function sell(string $code, int $qty, string $date): void
    {
        $this->postJson('/api/stock-movements', ['productId' => $code, 'type' => 'Stock Out', 'qty' => $qty, 'date' => $date])
            ->assertCreated();
    }

    public function test_clearing_a_products_stock_also_clears_its_monthly_sales(): void
    {
        Product::create(['code' => 'PRD-CLR', 'name' => 'Clear Me', 'stock_on_hand' => 10]);
        $this->sell('PRD-CLR', 4, now()->toDateString());
        $this->assertSame(1, SalesHistory::count());

        $this->deleteJson('/api/stock-movements/products/PRD-CLR')->assertOk();

        $this->assertSame(0, SalesHistory::count());
        $this->artisan('inventory:check')->expectsOutputToContain('PASS  Monthly sales match Stock Out totals');
    }

    public function test_sync_sales_previews_first_and_only_changes_data_with_apply(): void
    {
        $product = Product::create(['code' => 'PRD-OLD', 'name' => 'Old Row', 'stock_on_hand' => 0]);
        SalesHistory::create(['product_id' => $product->id, 'period_type' => 'month', 'period_date' => '2026-01-01', 'units_sold' => 12]);

        $this->artisan('inventory:sync-sales')->expectsOutputToContain('PREVIEW')->assertExitCode(0);
        $this->assertSame(1, SalesHistory::count(), 'Preview must not change anything.');

        $this->artisan('inventory:sync-sales', ['--apply' => true])->assertExitCode(0);
        $this->assertSame(0, SalesHistory::count());
    }

    public function test_dashboard_sales_come_from_stock_out_not_leftover_rows(): void
    {
        $product = Product::create(['code' => 'PRD-DSH', 'name' => 'Dash Item', 'stock_on_hand' => 10]);
        SalesHistory::create(['product_id' => $product->id, 'period_type' => 'month', 'period_date' => '2025-01-01', 'units_sold' => 50]);
        $this->sell('PRD-DSH', 3, now()->toDateString());

        $sales = $this->getJson('/api/dashboard/summary')->assertOk()->json('salesHistory');

        $this->assertCount(1, $sales);
        $this->assertSame(3, $sales[0]['unitsSold']);
    }

    public function test_last_active_uses_the_activity_log_after_logout(): void
    {
        $staff = User::factory()->create(['role' => User::ROLE_STAFF, 'status' => User::STATUS_ACTIVE, 'name' => 'Staff Ben']);
        ActivityLog::create(['user_id' => $staff->id, 'action' => 'login', 'description' => 'Signed in']);

        $owner = User::factory()->create(['role' => User::ROLE_SUPER_ADMIN, 'status' => User::STATUS_ACTIVE]);
        $row = collect($this->actingAs($owner)->getJson('/staff')->assertOk()->json())->firstWhere('id', $staff->id);

        $this->assertNotSame('Never', $row['lastActive']);
        $this->assertSame('Just now', $row['lastActive']);
    }
}
