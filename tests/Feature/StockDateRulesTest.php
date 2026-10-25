<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\StockMovement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Stock entries must make sense on the date they are recorded:
 *  - a back-dated entry cannot push any day's balance below zero
 *  - no entries dated in the future (shop's date, Philippines)
 */
class StockDateRulesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAs(User::factory()->create(['role' => User::ROLE_SUPER_ADMIN, 'status' => User::STATUS_ACTIVE]));
        Product::create(['code' => 'PRD-D1', 'name' => 'Date Shirt', 'stock_on_hand' => 0]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function entry(string $type, int $qty, string $date)
    {
        return $this->postJson('/api/stock-movements', ['unitPrice' => 10, 'productId' => 'PRD-D1', 'type' => $type, 'qty' => $qty, 'date' => $date]);
    }

    private function day(int $daysAgo): string
    {
        return now('Asia/Manila')->subDays($daysAgo)->toDateString();
    }

    /** 10 in (30 days ago), 10 out (20 days ago), 10 in (yesterday): today = 10. */
    private function makeHistory(): void
    {
        $this->entry('Stock In', 10, $this->day(30))->assertCreated();
        $this->entry('Stock Out', 10, $this->day(20))->assertCreated();
        $this->entry('Stock In', 10, $this->day(1))->assertCreated();
    }

    public function test_backdated_stock_out_cannot_make_an_earlier_day_negative(): void
    {
        $this->makeHistory();

        $this->entry('Stock Out', 5, $this->day(25))
            ->assertStatus(422)
            ->assertJsonValidationErrors('qty');

        $this->assertSame(10, Product::first()->stock_on_hand);
        $this->assertSame(3, StockMovement::count());
        $this->assertSame(0, StockMovement::where('remaining_stock', '<', 0)->count());
    }

    public function test_message_says_the_most_that_can_be_taken_out_that_day(): void
    {
        $this->entry('Stock In', 10, $this->day(30))->assertCreated();
        $this->entry('Stock Out', 7, $this->day(20))->assertCreated();
        $this->entry('Stock In', 10, $this->day(1))->assertCreated();

        $message = $this->entry('Stock Out', 5, $this->day(25))->assertStatus(422)->json('errors.qty.0');
        $this->assertStringContainsString('below zero', $message);
        $this->assertStringContainsString('The most you can take out', $message);
        $this->assertStringContainsString('is 3', $message);

        $this->entry('Stock Out', 3, $this->day(25))->assertCreated();   // exactly the limit is fine
    }

    public function test_normal_backdated_entries_that_stay_positive_still_work(): void
    {
        $this->makeHistory();
        $this->entry('Stock In', 4, $this->day(25))->assertCreated();    // adding stock in the past is always fine
        $this->entry('Stock Out', 4, $this->day(22))->assertCreated();   // 14 on hand by then, stays >= 0
        $this->assertSame(10, Product::first()->stock_on_hand);
    }

    public function test_editing_or_deleting_cannot_make_history_negative(): void
    {
        $this->makeHistory();
        $firstIn = StockMovement::orderBy('movement_date')->first();

        // Deleting the first Stock In would leave the 10 sold 20 days ago with nothing behind them.
        $this->deleteJson("/api/stock-movements/{$firstIn->id}")->assertStatus(422);

        $this->assertSame(3, StockMovement::count());
        $this->assertSame(0, StockMovement::where('remaining_stock', '<', 0)->count());

        // An edit keeps the old amount in the opening balance (existing design),
        // so whatever it saves, no day may end up below zero.
        $this->putJson("/api/stock-movements/{$firstIn->id}", [
            'unitPrice' => 10,
            'productId' => 'PRD-D1', 'type' => 'Stock In', 'qty' => 4, 'date' => $this->day(30),
        ])->assertOk();
        $this->assertSame(0, StockMovement::where('remaining_stock', '<', 0)->count());
    }

    public function test_old_negative_rows_do_not_lock_the_product(): void
    {
        $this->makeHistory();
        // Simulate a record saved before this rule existed: history dips to -5.
        StockMovement::create([
            'product_id' => Product::first()->id, 'product_name' => 'Date Shirt', 'movement_type' => 'out',
            'is_adjustment' => false, 'qty' => 5, 'remaining_stock' => 5, 'movement_date' => $this->day(25),
        ]);
        Product::first()->update(['stock_on_hand' => 5]);

        // New entries that don't make it worse are still accepted.
        $this->entry('Stock In', 2, $this->day(0))->assertCreated();
        $this->entry('Stock Out', 1, $this->day(0))->assertCreated();
    }

    public function test_future_dates_are_rejected(): void
    {
        $this->entry('Stock In', 5, now('Asia/Manila')->addDay()->toDateString())
            ->assertStatus(422)
            ->assertJsonValidationErrors('date');
        $this->assertSame(0, StockMovement::count());
    }

    public function test_today_in_the_philippines_is_allowed_even_when_utc_is_still_yesterday(): void
    {
        // 7:00 AM in Manila on Oct 26 = 11:00 PM Oct 25 in UTC.
        Carbon::setTestNow(Carbon::parse('2026-10-25 23:00:00', 'UTC'));

        $this->entry('Stock In', 5, '2026-10-26')->assertCreated();
        $this->entry('Stock In', 5, '2026-10-27')->assertStatus(422);
    }
}
