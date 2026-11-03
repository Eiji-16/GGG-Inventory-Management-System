<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\SeasonalEvent;
use App\Models\StockMovement;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Trash and Archive lifecycle coverage. */
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

    private function retentionAction(string $action, string $kind, int|string $id, string $space = 'trash')
    {
        return $this->postJson('/api/trash/bulk', [
            'space' => $space,
            'action' => $action,
            'items' => [['kind' => $kind, 'id' => $id]],
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

        $this->retentionAction('restore', 'supplier', $supplier->id)->assertOk()->assertJsonPath('done', 1);
        $this->assertNotSoftDeleted('suppliers', ['id' => $supplier->id]);
        $this->assertSame($supplier->id, $product->fresh()->supplier->id);
    }

    public function test_archiving_then_permanently_deleting_a_supplier_keeps_its_products_without_a_supplier(): void
    {
        $supplier = Supplier::create(['name' => 'Gone Co.']);
        $product = Product::create(['code' => 'PRD-2', 'name' => 'Item', 'supplier_id' => $supplier->id, 'stock_on_hand' => 0]);
        $supplier->delete();

        $this->retentionAction('archive', 'supplier', $supplier->id)->assertOk();
        $this->getJson('/api/trash?space=archive&kind=supplier')->assertJsonPath('records.0.id', $supplier->id);
        $this->retentionAction('purge', 'supplier', $supplier->id, 'archive')->assertOk();

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

    public function test_product_creation_does_not_implicitly_restore_an_archived_supplier(): void
    {
        $supplier = Supplier::create(['name' => 'Archived Supplier']);
        $supplier->delete();
        $this->retentionAction('archive', 'supplier', $supplier->id)->assertOk();

        $this->postJson('/api/products', [
            'name' => 'New Product',
            'category' => 'Peripherals',
            'supplierName' => 'Archived Supplier',
        ])->assertUnprocessable()->assertJsonValidationErrors('supplierName');

        $this->assertSoftDeleted('suppliers', ['id' => $supplier->id]);
        $this->assertNotNull(Supplier::withTrashed()->findOrFail($supplier->id)->archived_at);
    }

    public function test_restoring_a_product_also_restores_its_trashed_supplier(): void
    {
        $supplier = Supplier::create(['name' => 'Both Gone']);
        $product = Product::create(['code' => 'PRD-3', 'name' => 'Linked', 'supplier_id' => $supplier->id, 'stock_on_hand' => 0]);
        $this->deleteJson("/api/products/{$product->code}")->assertOk();
        $this->deleteJson("/api/suppliers/{$supplier->id}")->assertOk();

        $this->retentionAction('restore', 'product', $product->code)->assertOk()->assertJsonPath('done', 1);
        $this->assertNotSoftDeleted('suppliers', ['id' => $supplier->id]);
    }

    public function test_seasonal_events_go_to_the_trash_and_stop_affecting_forecasts_until_restored(): void
    {
        $event = $this->event();
        $this->deleteJson("/api/seasonal-events/{$event->id}")->assertOk();

        $this->getJson('/api/seasonal-events')->assertJsonMissing(['name' => 'Christmas Sale']);
        $this->getJson('/api/trash?kind=event')->assertJsonPath('records.0.productName', 'Christmas Sale');

        $this->retentionAction('restore', 'event', $event->id)->assertOk()->assertJsonPath('done', 1);
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

        $this->retentionAction('restore', 'event', $a->id)
            ->assertOk()->assertJsonPath('done', 1);
        $this->assertNotSoftDeleted('seasonal_events', ['id' => $a->id]);

        $this->retentionAction('archive', 'event', $b->id)->assertOk();
        $this->retentionAction('purge', 'event', $b->id, 'archive')
            ->assertOk()->assertJsonPath('done', 1);
        $this->assertDatabaseMissing('seasonal_events', ['id' => $b->id]);
    }

    public function test_archiving_moves_records_out_of_trash_without_permanent_deletion(): void
    {
        $keep = Product::create(['code' => 'PRD-KEEP', 'name' => 'Keep me', 'stock_on_hand' => 0]);
        $gone = Product::create(['code' => 'PRD-GONE', 'name' => 'Gone', 'stock_on_hand' => 0]);
        $this->deleteJson("/api/products/{$gone->code}")->assertOk();
        $event = $this->event();
        $event->delete();
        $supplier = Supplier::create(['name' => 'Old Co.']);
        $supplier->delete();

        $this->postJson('/api/trash/bulk', [
            'space' => 'trash',
            'action' => 'archive',
            'items' => [
                ['kind' => 'product', 'id' => $gone->code],
                ['kind' => 'event', 'id' => $event->id],
                ['kind' => 'supplier', 'id' => $supplier->id],
            ],
        ])->assertOk()->assertJsonPath('done', 3);

        $this->getJson('/api/trash')->assertJsonPath('counts.all', 0);
        $this->getJson('/api/trash?space=archive')->assertJsonPath('counts.all', 3);
        $this->assertNotNull(Product::find($keep->id));
        $this->assertSoftDeleted('products', ['id' => $gone->id]);
        $this->assertDatabaseHas('activity_logs', ['action' => 'trash.archive']);
    }

    public function test_archived_product_and_its_stock_entries_restore_to_active(): void
    {
        $product = Product::create(['code' => 'PRD-ARCHIVE', 'name' => 'Archived Product', 'stock_on_hand' => 0]);
        $movement = StockMovement::create([
            'product_id' => $product->id,
            'product_name' => $product->name,
            'movement_type' => 'in',
            'qty' => 3,
            'remaining_stock' => 3,
            'movement_date' => now()->toDateString(),
        ]);
        $product->update(['stock_on_hand' => 3]);
        $this->deleteJson("/api/products/{$product->code}")->assertOk();

        $this->retentionAction('archive', 'product', $product->code)->assertOk();
        $this->getJson('/api/trash?space=archive&kind=entry')
            ->assertJsonPath('records.0.id', $movement->id);
        $this->retentionAction('restore', 'product', $product->code, 'archive')->assertOk();

        $this->assertNotSoftDeleted('products', ['id' => $product->id]);
        $this->assertNotSoftDeleted('stock_movements', ['id' => $movement->id]);
        $this->assertDatabaseHas('products', ['id' => $product->id, 'deleted_at' => null, 'archived_at' => null]);
    }

    public function test_deleted_accounts_appear_in_trash_and_restore_from_trash_or_archive(): void
    {
        $account = User::factory()->create([
            'name' => 'Deleted Staff',
            'email' => 'deleted.staff@example.com',
            'role' => User::ROLE_STAFF,
            'status' => User::STATUS_INACTIVE,
            'department' => 'Sales',
        ]);

        $this->deleteJson("/staff/{$account->id}", ['confirmation' => 'DELETE'])
            ->assertOk()->assertJson(['trashed' => true]);
        $this->assertSoftDeleted('users', ['id' => $account->id, 'deleted_by' => $this->owner->id]);
        $this->getJson('/api/trash?kind=account')
            ->assertJsonPath('records.0.details.email', 'deleted.staff@example.com')
            ->assertJsonPath('records.0.details.role', 'Staff');
        $this->getJson('/staff?status=inactive')->assertJsonMissing(['email' => $account->email]);

        $this->retentionAction('restore', 'account', $account->id)->assertOk();
        $this->assertNotSoftDeleted('users', ['id' => $account->id]);
        $this->assertDatabaseHas('users', ['id' => $account->id, 'status' => User::STATUS_ACTIVE]);

        $this->patchJson("/staff/{$account->id}", ['status' => User::STATUS_INACTIVE])->assertOk();
        $this->deleteJson("/staff/{$account->id}", ['confirmation' => 'DELETE'])->assertOk();
        $this->retentionAction('archive', 'account', $account->id)->assertOk();
        $this->getJson('/api/trash?space=archive&kind=account')
            ->assertJsonPath('records.0.archivedBy', 'Owner Ana');
        $this->retentionAction('restore', 'account', $account->id, 'archive')->assertOk();

        $this->assertNotSoftDeleted('users', ['id' => $account->id]);
        $this->assertDatabaseHas('users', ['id' => $account->id, 'status' => User::STATUS_ACTIVE]);
    }

    public function test_account_permanent_deletion_is_only_available_after_archive(): void
    {
        $account = User::factory()->create(['status' => User::STATUS_INACTIVE]);
        $this->deleteJson("/staff/{$account->id}", ['confirmation' => 'DELETE'])->assertOk();
        $this->retentionAction('purge', 'account', $account->id, 'trash')->assertUnprocessable();
        $this->retentionAction('archive', 'account', $account->id)->assertOk();
        $this->retentionAction('purge', 'account', $account->id, 'archive')->assertOk()->assertJsonPath('done', 1);
        $this->assertDatabaseMissing('users', ['id' => $account->id]);
    }

    public function test_only_super_admin_can_access_trash_and_archive_routes(): void
    {
        $staff = User::factory()->create(['role' => User::ROLE_STAFF, 'status' => User::STATUS_ACTIVE]);
        $this->actingAs($staff);
        $this->getJson('/api/trash')->assertForbidden();
        $this->getJson('/api/trash?space=archive')->assertForbidden();
        $this->postJson('/api/trash/bulk', ['space' => 'archive', 'action' => 'purge', 'items' => [['kind' => 'event', 'id' => 1]]])->assertForbidden();
    }
}
