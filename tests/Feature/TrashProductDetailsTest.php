<?php

namespace Tests\Feature;

use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\AuthenticatesBusinessApi;
use Tests\TestCase;

/* ===== TRASH BIN: PRODUCT "DELETED BY" AND ARCHIVE DATE (2026-11-22) ===== */
class TrashProductDetailsTest extends TestCase
{
    use RefreshDatabase;
    use AuthenticatesBusinessApi;

    public function test_a_trashed_product_shows_who_deleted_it(): void
    {
        $product = Product::create(['code' => 'PRD-TB1', 'name' => 'Glue Brushes', 'stock_on_hand' => 0]);
        $product->forceFill(['deleted_by_name' => 'GGG Admin'])->save();
        $product->delete();

        $record = collect($this->getJson('/api/trash')->assertOk()->json('records'))->firstWhere('kind', 'product');

        $this->assertSame('GGG Admin', $record['deletedBy']);
    }

    public function test_an_archived_product_shows_its_archive_details(): void
    {
        $product = Product::create(['code' => 'PRD-TB2', 'name' => 'Old Caster', 'stock_on_hand' => 0]);
        $product->forceFill(['deleted_by_name' => 'GGG Admin', 'archived_at' => now()->subDay(), 'archived_by_name' => 'Wrenz'])->save();
        $product->delete();

        $record = collect($this->getJson('/api/trash?space=archive')->assertOk()->json('records'))->firstWhere('kind', 'product');

        $this->assertNotNull($record['archivedAt']);
        $this->assertSame('Wrenz', $record['archivedBy']);
    }
}
