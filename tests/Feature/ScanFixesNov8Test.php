<?php

namespace Tests\Feature;

use App\Models\AccountRequest;
use App\Models\PastSale;
use App\Models\Product;
use App\Models\StockMovement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Tests\Concerns\AuthenticatesBusinessApi;
use Tests\TestCase;

/**
 * Fixes from the 2026-11-08 system scan (the "GGG Shirt" examples).
 */
class ScanFixesNov8Test extends TestCase
{
    use RefreshDatabase;
    use AuthenticatesBusinessApi;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    /**
     * GGG Shirt: 10 Large in, 20 Small in, 8 Large out.
     * Large has 2, Small has 20, total 22.
     *
     * @return array{in: int, out: int}
     */
    private function shirtWithVariants(): array
    {
        Product::create(['code' => 'PRD-SHIRT', 'name' => 'GGG Shirt', 'variants' => ['Small', 'Large'], 'stock_on_hand' => 0]);
        $day = now('Asia/Manila')->subDay()->toDateString();
        $entry = fn (array $data) => $this->postJson('/api/stock-movements', $data + [
            'productId' => 'PRD-SHIRT', 'unitPrice' => 150, 'date' => $day,
        ])->assertCreated()->json('id');

        $in = $entry(['variantName' => 'Large', 'type' => 'Stock In', 'qty' => 10]);
        $entry(['variantName' => 'Small', 'type' => 'Stock In', 'qty' => 20]);
        $out = $entry(['variantName' => 'Large', 'type' => 'Stock Out', 'qty' => 8, 'unitPrice' => 250]);

        return ['in' => $in, 'out' => $out];
    }

    /** Fix 1: changing a Stock In's variant may not leave Large at -8. */
    public function test_editing_the_variant_cannot_make_a_variant_negative(): void
    {
        $ids = $this->shirtWithVariants();

        $this->putJson("/api/stock-movements/{$ids['in']}", [
            'detailsOnly' => true, 'variantName' => 'Small', 'unitPrice' => 150,
        ])->assertUnprocessable()->assertJsonValidationErrors('qty');

        $this->assertSame('Large', StockMovement::find($ids['in'])->variant_name, 'Nothing was changed.');

        // Changing only the note is still fine.
        $this->putJson("/api/stock-movements/{$ids['in']}", [
            'detailsOnly' => true, 'variantName' => 'Large', 'unitPrice' => 150, 'notes' => 'Box 2',
        ])->assertOk();
    }

    /** Fix 1: deleting the Large Stock In would leave Large at -8 (the total is still 12). */
    public function test_deleting_an_entry_cannot_make_a_variant_negative(): void
    {
        $ids = $this->shirtWithVariants();

        $this->deleteJson("/api/stock-movements/{$ids['in']}")
            ->assertUnprocessable()->assertJsonValidationErrors('qty');

        $this->assertNotNull(StockMovement::find($ids['in']), 'The entry is still there.');
        $this->assertSame(22, Product::where('code', 'PRD-SHIRT')->value('stock_on_hand'));

        // Deleting the Stock Out first is fine (Large goes back to 10).
        $this->deleteJson("/api/stock-movements/{$ids['out']}")->assertOk();
    }

    /** Fix 4: a product with no stock entries is not in the Reorder Point report (same as the Reorder List). */
    public function test_reorder_report_skips_products_with_no_stock_entries(): void
    {
        Product::create(['code' => 'PRD-CAP', 'name' => 'GGG Cap', 'stock_on_hand' => 0]);
        $mug = Product::create(['code' => 'PRD-MUG', 'name' => 'GGG Mug', 'stock_on_hand' => 0]);
        StockMovement::create([
            'product_id' => $mug->id, 'product_name' => $mug->name, 'movement_type' => 'in',
            'is_adjustment' => false, 'qty' => 0, 'remaining_stock' => 0, 'movement_date' => now()->toDateString(),
        ]);

        $report = $this->getJson('/api/reports')->assertOk()->json();

        $this->assertSame(['PRD-MUG'], array_column($report['reorderPoint']['rows'], 'productId'));
        $this->assertSame(1, $report['stockSummary']['kpis']['outOfStock']);
        $this->getJson('/api/dashboard/summary')->assertJsonPath('kpis.lowStockItems', 1);
    }

    /** Fix 3: the Dashboard gets the last 12 months and the 12 newest entries, not the whole history. */
    public function test_dashboard_leaves_out_old_stock_history(): void
    {
        $product = Product::create(['code' => 'PRD-SHIRT', 'name' => 'GGG Shirt', 'stock_on_hand' => 99]);
        $row = fn (string $date) => StockMovement::create([
            'product_id' => $product->id, 'product_name' => $product->name, 'movement_type' => 'in',
            'is_adjustment' => false, 'qty' => 1, 'remaining_stock' => 1, 'movement_date' => $date,
        ]);
        $old = $row(now()->subYears(2)->toDateString());
        foreach (range(1, 13) as $day) {
            $row(now()->subDays($day)->toDateString());
        }

        $ids = array_column($this->getJson('/api/dashboard/summary')->assertOk()->json('stockMovements'), 'id');

        $this->assertCount(13, $ids);
        $this->assertNotContains($old->id, $ids);
    }

    /** Fix 8: on Monday 7:30 AM in Manila (still Sunday in UTC) the weekly chart already shows this week. */
    public function test_report_weeks_use_the_shop_clock(): void
    {
        $this->travelTo(Carbon::parse('2026-11-08 23:30:00', 'UTC'));   // Mon Nov 9, 7:30 AM Manila
        $product = Product::create(['code' => 'PRD-SHIRT', 'name' => 'GGG Shirt', 'stock_on_hand' => 5]);
        StockMovement::create([
            'product_id' => $product->id, 'product_name' => $product->name, 'movement_type' => 'out',
            'is_adjustment' => false, 'qty' => 3, 'remaining_stock' => 5, 'movement_date' => '2026-11-09',
        ]);

        $weeks = $this->getJson('/api/reports')->assertOk()->json('stockMovement.rows');

        $this->assertSame('2026-11-09', end($weeks)['weekStart']);
        $this->assertSame(3, end($weeks)['out']);
    }

    /** Fix 9: the oldest Past Sales month counts only for its days inside the last 12 months. */
    public function test_past_sales_count_exactly_twelve_months(): void
    {
        $this->travelTo(Carbon::parse('2026-11-16'));
        $product = Product::create(['code' => 'PRD-SHIRT', 'name' => 'GGG Shirt', 'stock_on_hand' => 0]);
        // November 2025: only Nov 16–30 (15 of 30 days) is inside → 60 × 15 ÷ 30 = 30.
        PastSale::create(['product_id' => $product->id, 'period_date' => '2025-11-01', 'units_sold' => 60]);
        PastSale::create(['product_id' => $product->id, 'period_date' => '2026-05-01', 'units_sold' => 10]);

        $this->getJson('/api/products')->assertJsonFragment(['id' => 'PRD-SHIRT', 'annualDemand' => 40]);
    }

    /** Fix 2: the backup keeps account requests and delivery proof photos; an import never mixes photos up. */
    public function test_backup_keeps_account_requests_and_delivery_photos(): void
    {
        Storage::fake('local');
        $owner = User::factory()->create(['role' => User::ROLE_SUPER_ADMIN, 'status' => User::STATUS_ACTIVE, 'password' => 'owner-secret-1']);
        $product = Product::create(['code' => 'PRD-SHIRT', 'name' => 'GGG Shirt', 'stock_on_hand' => 10]);
        $entry = StockMovement::create([
            'product_id' => $product->id, 'product_name' => $product->name, 'movement_type' => 'in',
            'is_adjustment' => false, 'qty' => 10, 'remaining_stock' => 10, 'movement_date' => now()->toDateString(),
        ]);
        Storage::disk('local')->put("delivery-proofs/{$entry->id}/20261108-proof.jpg", 'JPGDATA');
        AccountRequest::create(['name' => 'Ana', 'email' => 'ana@example.com', 'status' => 'pending']);

        $backup = $this->actingAs($owner)
            ->post('/api/system/export', ['password' => 'owner-secret-1'], ['Accept' => 'application/json'])
            ->assertOk()->getContent();
        $payload = json_decode(json_decode(gzdecode($backup), true)['payload'], true);
        $this->assertCount(1, $payload['tables']['account_requests']['rows']);
        $this->assertSame('JPGDATA', base64_decode($payload['files']["delivery-proofs/{$entry->id}/20261108-proof.jpg"]));

        // A photo saved after the backup belongs to an entry the backup doesn't have.
        Storage::disk('local')->put('delivery-proofs/999/later.jpg', 'OTHER');
        $path = tempnam(sys_get_temp_dir(), 'ggg');
        file_put_contents($path, $backup);
        $this->actingAs($owner)->post('/api/system/import', [
            'backup' => new UploadedFile($path, 'backup.gggbackup', 'application/octet-stream', null, true),
            'password' => 'owner-secret-1', 'confirmPhrase' => 'IMPORT GGG BACKUP',
        ], ['Accept' => 'application/json'])->assertOk();

        Storage::disk('local')->assertExists("delivery-proofs/{$entry->id}/20261108-proof.jpg");
        Storage::disk('local')->assertMissing('delivery-proofs/999/later.jpg');
        $this->assertSame(1, AccountRequest::count());
    }

    /** Past Sales: locked weeks/months show the units Stock Control recorded (display only). */
    public function test_past_sales_shows_stock_control_sales_in_locked_periods(): void
    {
        $this->travelTo(Carbon::parse('2026-11-08'));
        $product = Product::create(['code' => 'PRD-BOOK', 'name' => 'AeroBook', 'stock_on_hand' => 2]);
        $entry = fn (string $type, int $qty, string $date) => StockMovement::create([
            'product_id' => $product->id, 'product_name' => $product->name, 'movement_type' => $type,
            'is_adjustment' => false, 'qty' => $qty, 'remaining_stock' => 0, 'movement_date' => $date,
        ]);
        $entry('in', 10, '2026-10-24');   // first Stock Control entry (a Saturday)
        $entry('out', 3, '2026-10-25');
        $entry('out', 5, '2026-10-28');

        $this->getJson('/api/past-sales?product=PRD-BOOK&periodType=week')->assertOk()
            ->assertJsonPath('recordingStart', '2026-10-24')
            ->assertJsonPath('stockSales.2026-10-19', 3)
            ->assertJsonPath('stockSales.2026-10-26', 5);

        $this->getJson('/api/past-sales?product=PRD-BOOK&periodType=month')->assertOk()
            ->assertJsonPath('firstEntryDate', '2026-10-24')
            ->assertJsonPath('stockSales.2026-10', 8);
    }
}
