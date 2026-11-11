<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Product;
use App\Models\SafetyStock;
use App\Services\ReorderPointService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\AuthenticatesBusinessApi;
use Tests\TestCase;

/**
 * Hitting safety stock: warn, never block. Statuses come from the policy:
 * Critical ≤ safety stock < Low ≤ reorder point < Healthy.
 */
class SafetyStockCrossingTest extends TestCase
{
    use RefreshDatabase;
    use AuthenticatesBusinessApi;

    private function product(int $stock, int $safety = 5, ?int $lead = 7): Product
    {
        $product = Product::create(['code' => 'PRD-SAFE', 'name' => 'Poco X6 Pro', 'stock_on_hand' => $stock]);
        SafetyStock::create(['product_id' => $product->id, 'safety_stock' => $safety, 'lead_time_days' => $lead]);

        return $product;
    }

    private function sell(Product $product, int $qty)
    {
        return $this->postJson('/api/stock-movements', [
            'unitPrice' => 10,
            'productId' => $product->code, 'type' => 'Stock Out', 'qty' => $qty, 'date' => now()->toDateString(),
        ]);
    }

    public function test_a_sale_crossing_safety_stock_is_saved_and_logged_once(): void
    {
        $product = $this->product(8);

        $this->sell($product, 4)->assertCreated();       // 8 → 4, safety 5: crossed
        $this->assertSame(4, $product->fresh()->stock_on_hand, 'The sale is never blocked.');
        $this->assertSame(1, ActivityLog::where('action', 'stock.safety')->count());
        $log = ActivityLog::where('action', 'stock.safety')->first();
        $this->assertSame('Poco X6 Pro fell below safety stock (4 left, minimum 5)', $log->description);
        $this->assertSame(['PRD-SAFE', 8, 4, 5], [$log->meta['productId'], $log->meta['stockBefore'], $log->meta['totalQty'], $log->meta['safetyStock']]);

        $this->sell($product, 1)->assertCreated();       // 4 → 3: already below, no repeat
        $this->assertSame(1, ActivityLog::where('action', 'stock.safety')->count());

        // Shown in Stock Control's activity feed for the product.
        $this->getJson('/api/stock-activities?productId=PRD-SAFE')
            ->assertOk()
            ->assertJsonFragment(['action' => 'stock.safety']);
    }

    public function test_selling_the_last_units_logs_out_of_stock(): void
    {
        $product = $this->product(3);
        $this->sell($product, 3)->assertCreated();

        $this->assertSame(0, $product->fresh()->stock_on_hand);
        $this->assertDatabaseHas('activity_logs', ['action' => 'stock.safety', 'description' => 'Poco X6 Pro is now out of stock']);
    }

    public function test_stock_in_and_sales_that_stay_above_safety_stock_are_not_logged(): void
    {
        $product = $this->product(20);
        $this->sell($product, 5)->assertCreated();       // 20 → 15
        $this->postJson('/api/stock-movements', [
            'unitPrice' => 10,
            'productId' => $product->code, 'type' => 'Stock In', 'qty' => 5, 'date' => now()->toDateString(),
        ])->assertCreated();

        $this->assertSame(0, ActivityLog::where('action', 'stock.safety')->count());
    }

    public function test_status_bands_follow_safety_stock_and_reorder_point(): void
    {
        // Safety 5, lead 7 days, 365 sold in the last year → 1/day → reorder point 12.
        $product = $this->product(400);
        $this->sell($product, 365)->assertCreated();     // 400 → 35
        $points = app(ReorderPointService::class);
        $product = $product->fresh(['safetyStock', 'supplier']);
        $this->assertSame(12, $points->forProduct($product));

        $this->assertSame('healthy', $points->statusFor($product, 13));
        $this->assertSame('low', $points->statusFor($product, 12));
        $this->assertSame('low', $points->statusFor($product, 6));
        $this->assertSame('critical', $points->statusFor($product, 5));
        $this->assertSame('critical', $points->statusFor($product, 1));
        $this->assertSame('out', $points->statusFor($product, 0));
    }

    public function test_reorder_report_marks_critical_at_safety_stock_not_half_the_reorder_point(): void
    {
        $product = $this->product(400, safety: 5, lead: 7);
        $this->sell($product, 365)->assertCreated();     // reorder point 12
        $this->sell($product, 29)->assertCreated();      // 35 → 6: Low (old rule said Critical at ≤ 6)

        $this->getJson('/api/reports')->assertOk()->assertJsonPath('reorderPoint.rows.0.urgency', 'Low');

        $this->sell($product, 1)->assertCreated();       // → 5: Critical
        $this->getJson('/api/reports')->assertOk()->assertJsonPath('reorderPoint.rows.0.urgency', 'Critical');
    }

    /* ===== Stock alert email to the Super Admin (2026-11-11) ===== */

    private function manualProduct(int $stock): Product
    {
        $product = Product::create(['code' => 'PRD-ALERT', 'name' => 'SonicPulse Headphones', 'stock_on_hand' => $stock]);
        SafetyStock::create([
            'product_id' => $product->id, 'safety_stock' => 5, 'lead_time_days' => 7,
            'status_mode' => 'manual', 'low_point' => 10, 'critical_point' => 5,
        ]);

        return $product;
    }

    public function test_super_admin_gets_one_email_each_time_the_status_gets_worse(): void
    {
        \Illuminate\Support\Facades\Mail::fake();
        $boss = \App\Models\User::factory()->create(['role' => \App\Models\User::ROLE_SUPER_ADMIN, 'status' => \App\Models\User::STATUS_ACTIVE, 'email' => 'owner@example.com']);
        \App\Models\User::factory()->create(['role' => \App\Models\User::ROLE_ADMIN, 'status' => \App\Models\User::STATUS_ACTIVE, 'email' => 'admin@example.com']);
        $product = $this->manualProduct(12);

        $this->sell($product, 3)->assertCreated();   // 12 → 9: Low
        \Illuminate\Support\Facades\Mail::assertSent(\App\Mail\StockAlertMail::class, 1);
        \Illuminate\Support\Facades\Mail::assertSent(\App\Mail\StockAlertMail::class, fn ($mail) => $mail->hasTo('owner@example.com') && $mail->status === 'low' && $mail->stock === 9);
        \Illuminate\Support\Facades\Mail::assertNotSent(\App\Mail\StockAlertMail::class, fn ($mail) => $mail->hasTo('admin@example.com'));

        $this->sell($product, 1)->assertCreated();   // 9 → 8: still Low, no new email
        \Illuminate\Support\Facades\Mail::assertSent(\App\Mail\StockAlertMail::class, 1);

        $this->sell($product, 4)->assertCreated();   // 8 → 4: Critical
        $this->sell($product, 4)->assertCreated();   // 4 → 0: Out
        \Illuminate\Support\Facades\Mail::assertSent(\App\Mail\StockAlertMail::class, 3);
        \Illuminate\Support\Facades\Mail::assertSent(\App\Mail\StockAlertMail::class, fn ($mail) => $mail->status === 'out' && $mail->stock === 0);
        $this->assertSame($boss->email, 'owner@example.com');
    }

    public function test_no_stock_alert_email_when_stock_stays_healthy_or_goes_up(): void
    {
        \Illuminate\Support\Facades\Mail::fake();
        \App\Models\User::factory()->create(['role' => \App\Models\User::ROLE_SUPER_ADMIN, 'status' => \App\Models\User::STATUS_ACTIVE]);
        $product = $this->manualProduct(30);

        $this->sell($product, 5)->assertCreated();   // 30 → 25: still Healthy
        $this->postJson('/api/stock-movements', [
            'unitPrice' => 10,
            'productId' => $product->code, 'type' => 'Stock In', 'qty' => 5, 'date' => now()->toDateString(),
        ])->assertCreated();

        \Illuminate\Support\Facades\Mail::assertNothingSent();
    }
}
