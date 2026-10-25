<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Product;
use App\Models\StockMovement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\AuthenticatesBusinessApi;
use Tests\TestCase;

/**
 * Same product + same day + same action = one row: a Stock In / Stock Out for
 * the same product, type, date, variant and unit price is added to the
 * existing entry instead of creating a second row.
 */
class StockSameDayMergeTest extends TestCase
{
    use RefreshDatabase;
    use AuthenticatesBusinessApi;

    private function product(int $stock = 0): Product
    {
        return Product::create(['code' => 'PRD-MRG', 'name' => 'Poco X6 Pro', 'stock_on_hand' => $stock]);
    }

    private function move(array $fields)
    {
        return $this->postJson('/api/stock-movements', array_merge([
            'productId' => 'PRD-MRG',
            'type' => 'Stock In',
            'date' => '2026-10-24',
            'unitPrice' => 10,
        ], $fields));
    }

    public function test_same_day_stock_in_is_added_to_the_existing_entry(): void
    {
        $product = $this->product();
        $first = $this->move(['qty' => 20, 'notes' => 'Opening stock'])->assertCreated()->json();

        $this->move(['qty' => 10, 'notes' => 'Delivery'])
            ->assertCreated()
            ->assertJsonPath('id', $first['id'])
            ->assertJsonPath('merged', true)
            ->assertJsonPath('mergedFromQty', 20)
            ->assertJsonPath('addedQty', 10)
            ->assertJsonPath('qty', 30)
            ->assertJsonPath('remainingStock', 30)
            ->assertJsonPath('notes', 'Opening stock; Delivery');

        $this->assertSame(1, StockMovement::count());
        $this->assertSame(30, $product->fresh()->stock_on_hand);
    }

    public function test_same_day_sales_merge_and_still_count_once_in_monthly_sales(): void
    {
        $product = $this->product(50);
        $this->move(['type' => 'Stock Out', 'qty' => 4])->assertCreated();
        $this->move(['type' => 'Stock Out', 'qty' => 6])->assertCreated()->assertJsonPath('qty', 10);

        $this->assertSame(1, StockMovement::count());
        $this->assertSame(40, $product->fresh()->stock_on_hand);
        $this->assertDatabaseHas('sales_history', [
            'product_id' => $product->id,
            'period_type' => 'month',
            'units_sold' => 10,
        ]);
    }

    public function test_different_type_day_variant_or_price_makes_a_new_row(): void
    {
        $this->product(100);
        $this->move(['qty' => 5])->assertCreated();

        $this->move(['qty' => 1, 'type' => 'Stock Out'])->assertCreated()->assertJsonMissing(['merged' => true]);
        $this->move(['qty' => 1, 'date' => '2026-10-25'])->assertCreated()->assertJsonMissing(['merged' => true]);
        $this->move(['qty' => 1, 'variantName' => 'Black'])->assertCreated()->assertJsonMissing(['merged' => true]);
        $this->move(['qty' => 1, 'unitPrice' => 150])->assertCreated()->assertJsonMissing(['merged' => true]);

        $this->assertSame(5, StockMovement::count());
    }

    public function test_variant_and_price_match_ignoring_case_and_spaces(): void
    {
        $this->product();
        $this->move(['qty' => 5, 'variantName' => 'Black', 'unitPrice' => 150])->assertCreated();
        $this->move(['qty' => 2, 'variantName' => ' black ', 'unitPrice' => '150.00'])
            ->assertCreated()
            ->assertJsonPath('merged', true)
            ->assertJsonPath('qty', 7);

        $this->assertSame(1, StockMovement::count());
    }

    public function test_corrections_never_merge(): void
    {
        $this->product(10);
        $this->move(['type' => 'Adjustment', 'countedStock' => 8])->assertCreated();
        $this->move(['type' => 'Adjustment', 'countedStock' => 7])->assertCreated()->assertJsonMissing(['merged' => true]);

        $this->assertSame(2, StockMovement::count());
    }

    public function test_a_merged_sale_still_cannot_make_stock_negative(): void
    {
        $product = $this->product(5);
        $this->move(['type' => 'Stock Out', 'qty' => 3])->assertCreated();
        $this->move(['type' => 'Stock Out', 'qty' => 3])->assertUnprocessable();

        $this->assertSame(3, StockMovement::first()->qty);
        $this->assertSame(2, $product->fresh()->stock_on_hand);
    }

    public function test_activity_log_shows_the_amount_added_not_the_new_total(): void
    {
        $this->product();
        $this->move(['qty' => 20])->assertCreated();
        $this->move(['qty' => 10])->assertCreated();

        $log = ActivityLog::where('action', 'stock.in')->latest('id')->first();
        $this->assertSame(10, $log->meta['change']);
        $this->assertStringContainsString('+10', $log->description);
        $this->assertStringContainsString('now +30', $log->description);
    }

    public function test_deleting_the_merged_entry_removes_the_whole_day_total(): void
    {
        $product = $this->product();
        $entry = $this->move(['qty' => 20])->assertCreated()->json();
        $this->move(['qty' => 10])->assertCreated();

        $this->deleteJson('/api/stock-movements/'.$entry['id'])->assertOk();
        $this->assertSame(0, $product->fresh()->stock_on_hand);
    }
}
