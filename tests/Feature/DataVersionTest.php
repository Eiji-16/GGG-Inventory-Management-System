<?php

namespace Tests\Feature;

use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\AuthenticatesBusinessApi;
use Tests\TestCase;

/** /api/data-version changes whenever report data changes. */
class DataVersionTest extends TestCase
{
    use RefreshDatabase;
    use AuthenticatesBusinessApi;

    public function test_the_version_changes_after_a_stock_entry_and_stays_the_same_otherwise(): void
    {
        Product::create(['code' => 'PRD-V', 'name' => 'Version Item', 'stock_on_hand' => 0]);

        $first = $this->getJson('/api/data-version')->assertOk()->json('version');
        $this->assertSame($first, $this->getJson('/api/data-version')->json('version'));

        $this->postJson('/api/stock-movements', ['productId' => 'PRD-V', 'type' => 'Stock In', 'qty' => 3])->assertCreated();

        $this->assertNotSame($first, $this->getJson('/api/data-version')->json('version'));
    }
}
