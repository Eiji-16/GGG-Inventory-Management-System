<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The old sales-history and "sales seasonal adjustments" screens were
 * replaced by Past Sales and Seasonal Events (Forecasting). Their API routes
 * were removed; this makes sure they stay gone.
 */
class LegacySalesHistoryTest extends TestCase
{
    use RefreshDatabase;

    public function test_old_sales_routes_are_removed(): void
    {
        $this->actingAs(User::factory()->create(['role' => User::ROLE_SUPER_ADMIN, 'status' => User::STATUS_ACTIVE]));

        // (A plain GET would just get the app's page from the catch-all route,
        // so check that writing is refused and nothing is saved.)
        $responses = [
            $this->postJson('/api/sales-history', ['productId' => 'X', 'periodDate' => '2026-09-01', 'unitsSold' => 1]),
            $this->putJson('/api/sales-history/bulk', ['records' => []]),
            $this->putJson('/api/sales-seasonal-adjustments', ['product' => 'X']),
        ];
        foreach ($responses as $response) {
            $this->assertContains($response->status(), [404, 405]);
        }
        $this->assertDatabaseCount('sales_history', 0);
    }
}
