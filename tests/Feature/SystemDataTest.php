<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\AppSetting;
use App\Models\PastSale;
use App\Models\Product;
use App\Models\StockMovement;
use App\Models\Supplier;
use App\Models\User;
use App\Services\ProductPhotoService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** Settings → Data & System: backup export / import and System Reset. */
class SystemDataTest extends TestCase
{
    use RefreshDatabase;

    private const RESET = 'RESET GGG INVENTORY';
    private const IMPORT = 'IMPORT GGG BACKUP';

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        $this->owner = User::factory()->create([
            'role' => User::ROLE_SUPER_ADMIN,
            'status' => User::STATUS_ACTIVE,
            'password' => 'owner-secret-1',
        ]);
    }

    private function seedShop(): Product
    {
        $supplier = Supplier::create(['name' => 'Aula Inc.', 'lead_time_days' => 5]);
        Storage::disk('local')->put('product-photos/PRD-1-photo.png', 'PNGDATA');
        $product = Product::create([
            'code' => 'PRD-1', 'name' => 'Aula Keyboard', 'category' => 'Keyboard',
            'supplier_id' => $supplier->id, 'stock_on_hand' => 7,
            'image' => ProductPhotoService::PREFIX.'product-photos/PRD-1-photo.png',
        ]);
        StockMovement::create([
            'product_id' => $product->id, 'product_name' => $product->name, 'movement_type' => 'in',
            'is_adjustment' => false, 'qty' => 10, 'unit_price' => 450, 'remaining_stock' => 10,
            'movement_date' => now()->subDays(3)->toDateString(),
        ]);
        StockMovement::create([
            'product_id' => $product->id, 'product_name' => $product->name, 'movement_type' => 'out',
            'is_adjustment' => false, 'qty' => 3, 'unit_price' => 600, 'remaining_stock' => 7,
            'movement_date' => now()->subDays(1)->toDateString(),
        ]);
        PastSale::create(['product_id' => $product->id, 'period_type' => 'month', 'period_date' => now()->subYear()->startOfMonth()->toDateString(), 'units_sold' => 12]);
        AppSetting::put('currency', 'PHP');

        return $product;
    }

    private function exportFile(): string
    {
        return $this->actingAs($this->owner)
            ->post('/api/system/export', ['password' => 'owner-secret-1'], ['Accept' => 'application/json'])
            ->assertOk()
            ->getContent();
    }

    private function upload(string $contents): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'ggg');
        file_put_contents($path, $contents);

        return new UploadedFile($path, 'backup.gggbackup', 'application/octet-stream', null, true);
    }

    /* ----- who can use it ----- */

    public function test_admin_and_staff_cannot_use_any_system_action(): void
    {
        foreach ([User::ROLE_ADMIN, User::ROLE_STAFF] as $role) {
            $user = User::factory()->create(['role' => $role, 'status' => User::STATUS_ACTIVE, 'password' => 'pw-123456']);
            $this->actingAs($user)->getJson('/api/system/overview')->assertForbidden();
            $this->actingAs($user)->postJson('/api/system/export', ['password' => 'pw-123456'])->assertForbidden();
            $this->actingAs($user)->postJson('/api/system/reset', ['password' => 'pw-123456', 'confirmPhrase' => self::RESET, 'groups' => ['stock']])->assertForbidden();
            $this->actingAs($user)->post('/api/system/import', ['password' => 'pw-123456', 'confirmPhrase' => self::IMPORT], ['Accept' => 'application/json'])->assertForbidden();
        }
    }

    public function test_guests_are_refused(): void
    {
        $this->getJson('/api/system/overview')->assertUnauthorized();
        $this->postJson('/api/system/reset', [])->assertUnauthorized();
    }

    /* ----- export ----- */

    public function test_export_needs_the_password(): void
    {
        $this->actingAs($this->owner)->postJson('/api/system/export', [])->assertJsonValidationErrors('password');
        $this->actingAs($this->owner)->postJson('/api/system/export', ['password' => 'wrong'])->assertJsonValidationErrors('password');
        $this->assertDatabaseHas('activity_logs', ['action' => 'system.denied']);
    }

    public function test_export_contains_every_table_and_the_photo_with_a_valid_checksum(): void
    {
        $this->seedShop();
        $document = json_decode(gzdecode($this->exportFile()), true);

        $this->assertSame('ggg-inventory-backup', $document['format']);
        $this->assertSame(hash('sha256', $document['payload']), $document['checksum']);
        $payload = json_decode($document['payload'], true);
        $this->assertCount(1, $payload['tables']['products']['rows']);
        $this->assertCount(2, $payload['tables']['stock_movements']['rows']);
        $this->assertCount(1, $payload['tables']['past_sales']['rows']);
        $this->assertArrayNotHasKey('sessions', $payload['tables']);
        $this->assertSame('PNGDATA', base64_decode($payload['files']['product-photos/PRD-1-photo.png']));
        $this->assertDatabaseHas('activity_logs', ['action' => 'system.export']);
    }

    /* ----- reset ----- */

    public function test_reset_needs_password_and_exact_phrase_and_changes_nothing_otherwise(): void
    {
        $this->seedShop();
        $this->actingAs($this->owner)->postJson('/api/system/reset', ['groups' => ['stock'], 'password' => 'wrong', 'confirmPhrase' => self::RESET])
            ->assertJsonValidationErrors('password');
        $this->actingAs($this->owner)->postJson('/api/system/reset', ['groups' => ['stock'], 'password' => 'owner-secret-1', 'confirmPhrase' => 'reset ggg inventory'])
            ->assertJsonValidationErrors('confirmPhrase');

        $this->assertSame(2, StockMovement::count());
        $this->assertSame(7, Product::first()->stock_on_hand);
    }

    public function test_stock_reset_erases_entries_and_sets_stock_to_zero_but_keeps_products(): void
    {
        $this->seedShop();
        $this->actingAs($this->owner)->postJson('/api/system/reset', [
            'groups' => ['stock'], 'password' => 'owner-secret-1', 'confirmPhrase' => self::RESET,
        ])->assertOk()->assertJsonPath('erased.stock', 2);

        $this->assertSame(0, StockMovement::withTrashed()->count());
        $this->assertSame(0, Product::first()->stock_on_hand);
        $this->assertSame(1, PastSale::count());            // other groups untouched
        $this->assertSame(1, Supplier::count());
        $this->assertDatabaseHas('activity_logs', ['action' => 'system.reset']);
        // A safety copy was saved on the server first.
        $this->assertCount(1, Storage::disk('local')->files('system-backups'));
    }

    public function test_catalog_reset_also_erases_linked_records_and_photos(): void
    {
        $this->seedShop();
        $this->actingAs($this->owner)->postJson('/api/system/reset', [
            'groups' => ['catalog'], 'password' => 'owner-secret-1', 'confirmPhrase' => self::RESET,
        ])->assertOk()->assertJsonPath('groups', ['catalog', 'stock', 'sales']);

        $this->assertSame(0, Product::withTrashed()->count());
        $this->assertSame(0, Supplier::count());
        $this->assertSame(0, StockMovement::withTrashed()->count());
        $this->assertSame(0, PastSale::count());
        Storage::disk('local')->assertMissing('product-photos/PRD-1-photo.png');
        $this->assertSame('PHP', AppSetting::get('currency'));   // settings kept
    }

    public function test_accounts_reset_keeps_every_super_admin(): void
    {
        $other = User::factory()->create(['role' => User::ROLE_SUPER_ADMIN, 'status' => User::STATUS_ACTIVE]);
        User::factory()->create(['role' => User::ROLE_ADMIN, 'status' => User::STATUS_ACTIVE]);
        User::factory()->create(['role' => User::ROLE_STAFF, 'status' => User::STATUS_ACTIVE]);

        $this->actingAs($this->owner)->postJson('/api/system/reset', [
            'groups' => ['accounts'], 'password' => 'owner-secret-1', 'confirmPhrase' => self::RESET,
        ])->assertOk()->assertJsonPath('erased.accounts', 2);

        $this->assertEqualsCanonicalizing([$this->owner->id, $other->id], User::pluck('id')->all());
    }

    /* ----- import ----- */

    public function test_import_restores_the_backup_exactly_and_signs_everyone_out(): void
    {
        $product = $this->seedShop();
        $backup = $this->exportFile();

        // Things change after the backup...
        StockMovement::query()->delete();
        $product->update(['name' => 'Renamed', 'stock_on_hand' => 0]);
        Storage::disk('local')->delete('product-photos/PRD-1-photo.png');
        Product::create(['code' => 'PRD-2', 'name' => 'Added later', 'stock_on_hand' => 0]);

        $this->actingAs($this->owner)->post('/api/system/import', [
            'backup' => $this->upload($backup), 'password' => 'owner-secret-1', 'confirmPhrase' => self::IMPORT,
        ], ['Accept' => 'application/json'])->assertOk()->assertJsonPath('loggedOut', true);

        $this->assertSame(['Aula Keyboard'], Product::pluck('name')->all());
        $this->assertSame(7, Product::first()->stock_on_hand);
        $this->assertSame(2, StockMovement::count());
        Storage::disk('local')->assertExists('product-photos/PRD-1-photo.png');
        $this->assertGuest();
        $this->assertTrue(ActivityLog::where('action', 'system.import')->exists());
        $this->assertCount(1, Storage::disk('local')->files('system-backups'));
    }

    public function test_a_changed_backup_is_refused_and_nothing_is_imported(): void
    {
        $this->seedShop();
        $document = json_decode(gzdecode($this->exportFile()), true);
        $document['payload'] = str_replace('Aula Keyboard', 'Hacked Keyboard', $document['payload']);
        Product::first()->update(['name' => 'Current']);

        $this->actingAs($this->owner)->post('/api/system/import', [
            'backup' => $this->upload(gzencode(json_encode($document))), 'password' => 'owner-secret-1', 'confirmPhrase' => self::IMPORT,
        ], ['Accept' => 'application/json'])->assertJsonValidationErrors('backup');

        $this->assertSame('Current', Product::first()->name);
        $this->assertAuthenticatedAs($this->owner);
    }

    public function test_random_files_and_wrong_phrase_are_refused(): void
    {
        $this->actingAs($this->owner)->post('/api/system/import', [
            'backup' => $this->upload('hello'), 'password' => 'owner-secret-1', 'confirmPhrase' => self::IMPORT,
        ], ['Accept' => 'application/json'])->assertJsonValidationErrors('backup');

        $this->actingAs($this->owner)->post('/api/system/import', [
            'backup' => $this->upload($this->exportFile()), 'password' => 'owner-secret-1', 'confirmPhrase' => 'yes',
        ], ['Accept' => 'application/json'])->assertJsonValidationErrors('confirmPhrase');
    }

    public function test_a_backup_without_an_active_super_admin_is_refused(): void
    {
        $service = app(\App\Services\SystemDataService::class);
        $document = json_decode(gzdecode($this->exportFile()), true);
        $payload = json_decode($document['payload'], true);
        $roleAt = array_search('role', $payload['tables']['users']['columns'], true);
        foreach ($payload['tables']['users']['rows'] as &$row) {
            $row[$roleAt] = User::ROLE_STAFF;
        }
        $document['payload'] = json_encode($payload);
        $document['checksum'] = hash('sha256', $document['payload']);

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('no active Super Admin');
        $service->readBackup(json_encode($document));
    }

    /* ----- rate limit ----- */

    public function test_too_many_attempts_are_blocked_for_a_while(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->actingAs($this->owner)->postJson('/api/system/export', ['password' => 'wrong'])->assertStatus(422);
        }
        $this->actingAs($this->owner)->postJson('/api/system/export', ['password' => 'owner-secret-1'])->assertStatus(429);
    }

    public function test_overview_lists_what_each_reset_part_would_erase(): void
    {
        $this->seedShop();
        $groups = collect($this->actingAs($this->owner)->getJson('/api/system/overview')->assertOk()
            ->assertJsonPath('resetPhrase', self::RESET)
            ->json('groups'))->keyBy('key');

        $this->assertSame(2, $groups['stock']['rows']);     // the 2 stock entries
        $this->assertSame(1, $groups['sales']['rows']);     // the Past Sales row
        $this->assertSame(2, $groups['catalog']['rows']);   // 1 product + 1 supplier
        $this->assertSame(0, $groups['accounts']['rows']);  // only the Super Admin exists
    }
}
