<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\SeasonalEvent;
use App\Models\StockMovement;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Trash Bin rework: suppliers + seasonal events, tabs/filters, bulk actions, Empty Trash. */
class TrashBinReworkTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        $this->owner = User::factory()->create([
            'name' => 'Owner Ana', 'role' => User::ROLE_SUPER_ADMIN, 'status' => User::STATUS_ACTIVE,
        ]);
        $this->actingAs($this->owner);
    }

    private function event(string $name = 'Christmas Sale'): SeasonalEvent
    {
        return SeasonalEvent::create([
            'name' => $name, 'start_date' => '2026-12-01', 'end_date' => '2026-12-31',
            'adjustment_pct' => 20, 'scope' => 'all', 'is_active' => true,
        ]);
    }

    public function test_deleting_a_supplier_moves_it_to_the_trash_and_restoring_brings_the_link_back(): void
    {
        $supplier = Supplier::create(['name' => 'Aula Inc.', 'lead_time_days' => 5]);
        $product = Product::create(['code' => 'PRD-1', 'name' => 'Aula Keyboard', 'supplier_id' => $supplier->id, 'stock_on_hand' => 0]);

        $this->deleteJson("/api/suppliers/{$supplier->id}")->assertOk();
        $this->assertSoftDeleted('suppliers', ['id' => $supplier->id, 'deleted_by_name' => 'Owner Ana']);
        $this->getJson('/api/suppliers')->assertJsonMissing(['name' => 'Aula Inc.']);
        $this->getJson('/api/trash?kind=supplier')
            ->assertOk()
            ->assertJsonPath('records.0.kind', 'supplier')
            ->assertJsonPath('records.0.details.linkedProducts', 1)
            ->assertJsonPath('counts.supplier', 1);

        $this->postJson("/api/trash/suppliers/{$supplier->id}/restore")->assertOk();
        $this->assertNotSoftDeleted('suppliers', ['id' => $supplier->id]);
        $this->assertSame($supplier->id, $product->fresh()->supplier->id);
    }

    public function test_permanently_deleting_a_supplier_keeps_its_products_without_a_supplier(): void
    {
        $supplier = Supplier::create(['name' => 'Gone Co.']);
        $product = Product::create(['code' => 'PRD-2', 'name' => 'Item', 'supplier_id' => $supplier->id, 'stock_on_hand' => 0]);
        $supplier->delete();

        $this->deleteJson("/api/trash/suppliers/{$supplier->id}", ['current_password' => 'wrong'])->assertJsonValidationErrors('current_password');
        $this->deleteJson("/api/trash/suppliers/{$supplier->id}", ['current_password' => 'password'])->assertOk();

        $this->assertDatabaseMissing('suppliers', ['id' => $supplier->id]);
        $this->assertNull($product->fresh()->supplier_id);
    }

    public function test_typing_a_trashed_supplier_name_on_a_product_restores_it_instead_of_failing(): void
    {
        $supplier = Supplier::create(['name' => 'Kanata Inc.']);
        $supplier->delete();

        $this->postJson('/api/products', ['name' => 'Kanata Mouse', 'category' => 'Peripherals', 'supplierName' => 'Kanata Inc.'])->assertCreated();

        $this->assertNotSoftDeleted('suppliers', ['id' => $supplier->id]);
        $this->assertSame(1, Supplier::withTrashed()->count());
    }

    public function test_restoring_a_product_also_restores_its_trashed_supplier(): void
    {
        $supplier = Supplier::create(['name' => 'Both Gone']);
        $product = Product::create(['code' => 'PRD-3', 'name' => 'Linked', 'supplier_id' => $supplier->id, 'stock_on_hand' => 0]);
        $this->deleteJson("/api/products/{$product->code}")->assertOk();
        $this->deleteJson("/api/suppliers/{$supplier->id}")->assertOk();

        $this->postJson("/api/trash/products/{$product->code}/restore")->assertOk()->assertJsonPath('restoredSupplier', 'Both Gone');
        $this->assertNotSoftDeleted('suppliers', ['id' => $supplier->id]);
    }

    public function test_seasonal_events_go_to_the_trash_and_stop_affecting_forecasts_until_restored(): void
    {
        $event = $this->event();
        $this->deleteJson("/api/seasonal-events/{$event->id}")->assertOk();

        $this->getJson('/api/seasonal-events')->assertJsonMissing(['name' => 'Christmas Sale']);
        $this->getJson('/api/trash?kind=event')->assertJsonPath('records.0.productName', 'Christmas Sale');

        $this->postJson("/api/trash/seasonal-events/{$event->id}/restore")->assertOk();
        $this->getJson('/api/seasonal-events')->assertJsonFragment(['name' => 'Christmas Sale']);
    }

    public function test_tabs_counts_and_deleted_by_filter(): void
    {
        $staff = User::factory()->create(['name' => 'Staff Ben', 'role' => User::ROLE_STAFF, 'status' => User::STATUS_ACTIVE]);
        $this->event('By Owner')->forceFill(['deleted_by_name' => 'Owner Ana'])->save();
        SeasonalEvent::first()->delete();
        $other = $this->event('By Staff');
        $other->forceFill(['deleted_by_name' => 'Staff Ben'])->save();
        $other->delete();

        $this->getJson('/api/trash')
            ->assertJsonPath('counts.event', 2)
            ->assertJsonPath('counts.all', 2)
            ->assertJsonPath('deleters', ['Owner Ana', 'Staff Ben']);
        $this->getJson('/api/trash?deleted_by=Staff%20Ben')
            ->assertJsonPath('pagination.total', 1)
            ->assertJsonPath('records.0.productName', 'By Staff')
            ->assertJsonPath('records.0.daysInTrash', 0);
        $this->assertNotNull($staff);
    }

    public function test_bulk_restore_and_bulk_delete(): void
    {
        $a = $this->event('A');
        $b = $this->event('B');
        $a->delete();
        $b->delete();

        $this->postJson('/api/trash/bulk', ['action' => 'restore', 'items' => [['kind' => 'event', 'id' => $a->id]]])
            ->assertOk()->assertJsonPath('done', 1);
        $this->assertNotSoftDeleted('seasonal_events', ['id' => $a->id]);

        $this->postJson('/api/trash/bulk', ['action' => 'purge', 'items' => [['kind' => 'event', 'id' => $b->id]]])
            ->assertJsonValidationErrors('current_password');
        $this->postJson('/api/trash/bulk', ['action' => 'purge', 'current_password' => 'password', 'items' => [['kind' => 'event', 'id' => $b->id]]])
            ->assertOk()->assertJsonPath('done', 1);
        $this->assertDatabaseMissing('seasonal_events', ['id' => $b->id]);
    }

    public function test_empty_trash_deletes_everything_in_it_and_nothing_else(): void
    {
        $keep = Product::create(['code' => 'PRD-KEEP', 'name' => 'Keep me', 'stock_on_hand' => 0]);
        $gone = Product::create(['code' => 'PRD-GONE', 'name' => 'Gone', 'stock_on_hand' => 0]);
        $this->deleteJson("/api/products/{$gone->code}")->assertOk();
        $event = $this->event();
        $event->delete();
        $supplier = Supplier::create(['name' => 'Old Co.']);
        $supplier->delete();

        $this->deleteJson('/api/trash', ['current_password' => 'wrong'])->assertJsonValidationErrors('current_password');
        $this->deleteJson('/api/trash', ['current_password' => 'password'])->assertOk()->assertJsonPath('deleted', 3);

        $this->getJson('/api/trash')->assertJsonPath('counts.all', 0);
        $this->assertNotNull(Product::find($keep->id));
        $this->assertDatabaseHas('activity_logs', ['action' => 'trash.empty']);
    }

    public function test_staff_cannot_bulk_delete_or_empty_the_trash(): void
    {
        $staff = User::factory()->create(['role' => User::ROLE_STAFF, 'status' => User::STATUS_ACTIVE]);
        $this->actingAs($staff);
        $this->deleteJson('/api/trash', ['current_password' => 'password'])->assertForbidden();
        $this->postJson('/api/trash/bulk', ['action' => 'purge', 'current_password' => 'password', 'items' => [['kind' => 'event', 'id' => 1]]])->assertForbidden();
    }
}
