<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\PastSale;
use App\Models\Product;
use App\Models\SalesHistory;
use App\Models\StockMovement;
use App\Models\User;
use App\Services\RoleAccessService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Trash Bin: deleting moves products and stock entries to the Trash Bin
 * (soft delete) with who/when; they can be restored or permanently deleted,
 * and are left out of stock totals and lists meanwhile.
 */
class TrashBinTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        $this->owner = User::factory()->create([
            'name' => 'Owner Ana',
            'role' => User::ROLE_SUPER_ADMIN,
            'status' => User::STATUS_ACTIVE,
        ]);
        $this->actingAs($this->owner);
    }

    private function product(string $code = 'PRD-TRASH', int $stock = 0): Product
    {
        return Product::create(['code' => $code, 'name' => 'Trash Mouse', 'category' => 'Peripherals', 'stock_on_hand' => $stock]);
    }

    private function entry(string $code, string $type, int $qty, ?string $date = null): array
    {
        return $this->postJson('/api/stock-movements', [
            'productId' => $code, 'type' => $type, 'qty' => $qty, 'unitPrice' => 100,
            'date' => $date ?? now('Asia/Manila')->toDateString(),
        ])->assertCreated()->json();
    }

    public function test_deleting_an_entry_moves_it_to_the_trash_bin_with_who_and_when(): void
    {
        $product = $this->product();
        $this->entry($product->code, 'Stock In', 10, now('Asia/Manila')->subDay()->toDateString());
        $out = $this->entry($product->code, 'Stock Out', 3);

        $this->deleteJson("/api/stock-movements/{$out['id']}")->assertOk();

        $this->assertSame(10, $product->fresh()->stock_on_hand);                 // same balance logic as before
        $this->assertSoftDeleted('stock_movements', ['id' => $out['id'], 'deleted_by' => $this->owner->id, 'deleted_by_name' => 'Owner Ana']);
        $this->assertCount(1, $this->getJson('/api/stock-movements')->json());  // left out of Stock Control

        $this->getJson('/api/trash')
            ->assertOk()
            ->assertJsonPath('records.0.kind', 'entry')
            ->assertJsonPath('records.0.id', $out['id'])
            ->assertJsonPath('records.0.type', 'Stock Entry')
            ->assertJsonPath('records.0.deletedBy', 'Owner Ana')
            ->assertJsonPath('records.0.details.quantity', -3)
            ->assertJsonPath('records.0.withProduct', false);
        $this->assertNotNull($this->getJson('/api/trash')->json('records.0.deletedAt'));
    }

    public function test_unified_trash_search_and_pagination_include_both_record_types(): void
    {
        $product = $this->product('PRD-MIXED');
        $entry = $this->entry($product->code, 'Stock In', 10);
        $this->deleteJson("/api/stock-movements/{$entry['id']}")->assertOk();
        $this->deleteJson("/api/products/{$product->code}")->assertOk();

        $firstPage = $this->getJson('/api/trash?search=trash%20mouse&per_page=1&page=1')
            ->assertOk()
            ->assertJsonPath('pagination.total', 2)
            ->assertJsonPath('pagination.lastPage', 2);
        $secondPage = $this->getJson('/api/trash?search=trash%20mouse&per_page=1&page=2')
            ->assertOk()
            ->assertJsonPath('pagination.total', 2);

        $kinds = [
            $firstPage->json('records.0.kind'),
            $secondPage->json('records.0.kind'),
        ];
        sort($kinds);
        $this->assertSame(['entry', 'product'], $kinds);
        $this->assertSame(1, count($firstPage->json('records')));
        $this->assertSame(1, count($secondPage->json('records')));
    }

    public function test_restoring_an_entry_puts_its_quantity_back_and_recalculates_balances(): void
    {
        $product = $this->product();
        $in = $this->entry($product->code, 'Stock In', 10, now('Asia/Manila')->subDays(2)->toDateString());
        $out = $this->entry($product->code, 'Stock Out', 4, now('Asia/Manila')->subDay()->toDateString());
        $this->deleteJson("/api/stock-movements/{$out['id']}")->assertOk();
        $this->assertSame(10, $product->fresh()->stock_on_hand);

        $this->postJson("/api/trash/stock-movements/{$out['id']}/restore")->assertOk();

        $this->assertSame(6, $product->fresh()->stock_on_hand);
        $this->assertNotSoftDeleted('stock_movements', ['id' => $out['id']]);
        $this->assertSame(10, StockMovement::findOrFail($in['id'])->remaining_stock);
        $this->assertSame(6, StockMovement::findOrFail($out['id'])->remaining_stock);
        $this->assertNull(StockMovement::findOrFail($out['id'])->deleted_by_name);
        $this->assertSame(1, ActivityLog::where('action', 'stock.restore')->count());
    }

    public function test_restoring_a_stock_in_whose_units_were_already_sold_is_refused(): void
    {
        $product = $this->product();
        $in = $this->entry($product->code, 'Stock In', 5, now('Asia/Manila')->subDays(2)->toDateString());
        $this->entry($product->code, 'Stock In', 5, now('Asia/Manila')->subDay()->toDateString());
        $this->deleteJson("/api/stock-movements/{$in['id']}")->assertOk();      // 5 left
        $this->entry($product->code, 'Stock Out', 5);                            // 0 left

        // Fine: restoring a Stock In only adds stock.
        $this->postJson("/api/trash/stock-movements/{$in['id']}/restore")->assertOk();
        $this->assertSame(5, $product->fresh()->stock_on_hand);

        // A Stock Out that would push stock below zero cannot come back.
        $out = StockMovement::where('movement_type', 'out')->firstOrFail();
        $this->deleteJson("/api/stock-movements/{$out->id}")->assertOk();      // 10 again
        $this->entry($product->code, 'Stock Out', 8);                            // 2 left
        $this->postJson("/api/trash/stock-movements/{$out->id}/restore")->assertStatus(422);
        $this->assertSame(2, $product->fresh()->stock_on_hand);
        $this->assertSoftDeleted('stock_movements', ['id' => $out->id]);
    }

    public function test_permanently_deleting_an_entry_requires_password_and_does_not_change_stock(): void
    {
        $product = $this->product();
        $this->entry($product->code, 'Stock In', 10, now('Asia/Manila')->subDay()->toDateString());
        $out = $this->entry($product->code, 'Stock Out', 3);
        $this->deleteJson("/api/stock-movements/{$out['id']}")->assertOk();

        $url = "/api/trash/stock-movements/{$out['id']}";
        $this->deleteJson($url)->assertUnprocessable()->assertJsonValidationErrors('current_password');
        $this->deleteJson($url, ['current_password' => 'wrong-password'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('current_password');
        $this->assertSoftDeleted('stock_movements', ['id' => $out['id']]);
        $this->deleteJson($url, ['current_password' => 'password'])->assertOk();

        $this->assertDatabaseMissing('stock_movements', ['id' => $out['id']]);
        $this->assertSame(10, $product->fresh()->stock_on_hand);
        // Only trashed entries can be permanently deleted from here.
        $active = StockMovement::firstOrFail();
        $this->deleteJson("/api/trash/stock-movements/{$active->id}", ['current_password' => 'password'])->assertNotFound();
    }

    public function test_a_product_goes_to_the_trash_bin_with_its_entries_and_comes_back_with_them(): void
    {
        $product = $this->product();
        $this->entry($product->code, 'Stock In', 10, now('Asia/Manila')->subDays(2)->toDateString());
        $loose = $this->entry($product->code, 'Stock Out', 2, now('Asia/Manila')->subDay()->toDateString());
        $this->entry($product->code, 'Stock Out', 3);
        $this->deleteJson("/api/stock-movements/{$loose['id']}")->assertOk();   // trashed on its own first
        $this->assertSame(7, $product->fresh()->stock_on_hand);

        $this->deleteJson("/api/products/{$product->code}")->assertOk()->assertJsonPath('trashedEntries', 2);

        $this->assertSame([], $this->getJson('/api/stock-movements')->json());
        $this->getJson('/api/products')->assertJsonMissing(['id' => $product->code]);
        $this->getJson('/api/trash')
            ->assertJsonFragment([
                'kind' => 'product',
                'id' => $product->code,
                'deletedBy' => 'Owner Ana',
            ]);
        // Entries of a product in the Trash Bin can't be restored on their own.
        $withProduct = StockMovement::onlyTrashed()->where('deleted_with_product', true)->firstOrFail();
        $this->postJson("/api/trash/stock-movements/{$withProduct->id}/restore")->assertStatus(422);

        $this->postJson("/api/trash/products/{$product->code}/restore")->assertOk()->assertJsonPath('restoredEntries', 2);

        $this->assertSame(7, $product->fresh()->stock_on_hand);
        $this->assertCount(2, $this->getJson('/api/stock-movements')->json());
        // The entry that was trashed on its own stays in the Trash Bin.
        $this->assertSoftDeleted('stock_movements', ['id' => $loose['id']]);
        $this->getJson('/api/products')->assertJsonFragment(['id' => $product->code]);
    }

    public function test_restoring_a_product_is_refused_if_an_identical_product_now_exists(): void
    {
        $product = $this->product();
        $this->deleteJson("/api/products/{$product->code}")->assertOk();
        Product::create(['code' => 'PRD-AGAIN', 'name' => 'Trash Mouse', 'category' => 'Peripherals']);

        $this->postJson("/api/trash/products/{$product->code}/restore")->assertStatus(422);
        $this->assertSoftDeleted('products', ['id' => $product->id]);
    }

    public function test_deleted_products_are_excluded_from_active_data_and_restore_preserves_sales_history(): void
    {
        $product = $this->product('PRD-HISTORY');
        $this->entry($product->code, 'Stock In', 8, now('Asia/Manila')->subDay()->toDateString());
        $this->entry($product->code, 'Stock Out', 3);
        $savedSales = SalesHistory::where('product_id', $product->id)->value('units_sold');
        $this->assertSame(3, $savedSales);

        $this->deleteJson("/api/products/{$product->code}")->assertOk();

        $this->getJson('/api/products')->assertJsonMissing(['id' => $product->code]);
        $this->getJson('/api/dashboard/summary')
            ->assertOk()
            ->assertJsonPath('kpis.totalProducts', 0)
            ->assertJsonPath('salesHistory', []);
        $this->postJson('/api/forecasts', ['productId' => $product->code])->assertStatus(422);
        $this->getJson("/api/forecasts/history?product={$product->code}")->assertNotFound();
        $this->assertSame(3, SalesHistory::where('product_id', $product->id)->value('units_sold'));
        $this->assertSame(2, StockMovement::onlyTrashed()->where('product_id', $product->id)->count());

        $this->postJson("/api/trash/products/{$product->code}/restore")->assertOk();

        $this->getJson('/api/products')->assertJsonFragment(['id' => $product->code]);
        $this->assertSame($savedSales, SalesHistory::where('product_id', $product->id)->value('units_sold'));
        $this->assertSame(5, $product->fresh()->stock_on_hand);
    }

    public function test_permanently_deleting_a_product_preserves_historical_stock_and_sales_records(): void
    {
        $product = $this->product();
        $entry = $this->entry($product->code, 'Stock In', 4);
        SalesHistory::create([
            'product_id' => $product->id,
            'period_date' => '2026-09-01',
            'period_type' => 'month',
            'units_sold' => 6,
        ]);
        PastSale::create([
            'product_id' => $product->id,
            'period_type' => 'month',
            'period_date' => '2026-08-01',
            'units_sold' => 4,
        ]);
        $this->deleteJson("/api/products/{$product->code}")->assertOk();

        $this->deleteJson("/api/trash/products/{$product->code}", ['current_password' => 'password'])
            ->assertOk()
            ->assertJsonPath('retainedEntries', 1);

        $this->assertDatabaseMissing('products', ['id' => $product->id]);
        $this->assertDatabaseHas('stock_movements', [
            'id' => $entry['id'],
            'product_id' => null,
            'deleted_at' => StockMovement::withTrashed()->findOrFail($entry['id'])->deleted_at,
        ]);
        $this->assertDatabaseHas('sales_history', ['product_id' => null, 'units_sold' => 6]);
        $this->assertDatabaseHas('past_sales', ['product_id' => null, 'units_sold' => 4]);
        $this->getJson('/api/trash')
            ->assertJsonPath('records.0.kind', 'entry')
            ->assertJsonPath('records.0.productMissing', true);
        $this->postJson("/api/trash/stock-movements/{$entry['id']}/restore")->assertStatus(422);
        // An active product can't be permanently deleted from the Trash Bin.
        $active = $this->product('PRD-LIVE');
        $this->deleteJson("/api/trash/products/{$active->code}", ['current_password' => 'password'])->assertNotFound();
    }

    public function test_clear_stock_moves_every_entry_to_the_trash_bin(): void
    {
        $product = $this->product();
        $this->entry($product->code, 'Stock In', 4, now('Asia/Manila')->subDay()->toDateString());
        $this->entry($product->code, 'Stock Out', 1);

        $this->deleteJson("/api/stock-movements/products/{$product->code}")->assertOk();

        $this->assertSame(0, $product->fresh()->stock_on_hand);
        $this->assertSame(0, StockMovement::count());
        $this->assertSame(2, StockMovement::onlyTrashed()->count());
    }

    public function test_trashed_entries_do_not_merge_with_a_new_same_day_entry(): void
    {
        $product = $this->product();
        $first = $this->entry($product->code, 'Stock In', 4);
        $this->deleteJson("/api/stock-movements/{$first['id']}")->assertOk();

        $second = $this->entry($product->code, 'Stock In', 2);

        $this->assertNotSame($first['id'], $second['id']);
        $this->assertSame(2, $product->fresh()->stock_on_hand);
    }

    public function test_admin_can_restore_but_not_purge_and_staff_cannot_open_it_by_default(): void
    {
        $defaults = RoleAccessService::defaults();
        $this->assertTrue($defaults['admin']['trash.view']);
        $this->assertTrue($defaults['admin']['trash.restore']);
        $this->assertFalse($defaults['admin']['trash.purge']);
        $this->assertFalse($defaults['staff']['trash.view']);

        $product = $this->product();
        $in = $this->entry($product->code, 'Stock In', 4);
        $this->deleteJson("/api/stock-movements/{$in['id']}")->assertOk();

        $admin = User::factory()->create(['role' => User::ROLE_ADMIN, 'status' => User::STATUS_ACTIVE]);
        $this->actingAs($admin)->getJson('/api/trash')->assertOk();
        $this->actingAs($admin)->deleteJson("/api/trash/stock-movements/{$in['id']}", ['current_password' => 'password'])->assertForbidden();
        $this->actingAs($admin)->postJson("/api/trash/stock-movements/{$in['id']}/restore")->assertOk();

        $staff = User::factory()->create(['role' => User::ROLE_STAFF, 'status' => User::STATUS_ACTIVE]);
        $this->actingAs($staff)->getJson('/api/trash')->assertForbidden();
    }

    public function test_permanent_deletion_requires_the_authenticated_users_current_password(): void
    {
        $product = $this->product();
        $this->deleteJson("/api/products/{$product->code}")->assertOk();

        $url = "/api/trash/products/{$product->code}";
        $this->deleteJson($url)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('current_password');
        $this->deleteJson($url, ['current_password' => 'wrong-password'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('current_password');

        $this->assertSoftDeleted('products', ['id' => $product->id]);
        $this->deleteJson($url, ['current_password' => 'password'])->assertOk();
        $this->assertDatabaseMissing('products', ['id' => $product->id]);
    }
}
