<?php

namespace App\Console\Commands;

use App\Models\ActivityLog;
use App\Models\Product;
use App\Models\StockMovement;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * php artisan inventory:add-opening-stock                 → preview only (changes nothing)
 * php artisan inventory:add-opening-stock --apply         → add the entries
 * php artisan inventory:add-opening-stock --product=PRD-1 → only that product
 *
 * Some products had stock before their first Stock Control entry (old
 * sample data, a starting stock typed on the product, or an edited amount:
 * an edit keeps the old amount). Their entries then don't add up to the stock.
 * This adds the missing "Opening stock" Stock In, dated the day before the
 * product's first entry, for exactly the units no entry explains.
 *
 * The stock on hand does NOT change, and no entry is deleted, so sales
 * history (Forecasting, Reports) is kept. Only use it when the stock on hand
 * is the real count; if the count is wrong, Clear stock and re-record instead.
 */
class AddOpeningStock extends Command
{
    protected $signature = 'inventory:add-opening-stock
        {--apply : Actually add the entries (otherwise only a preview)}
        {--product= : Only this product code}';

    protected $description = 'Add the missing Opening stock entry where entries do not add up to the stock on hand (preview unless --apply)';

    public function handle(): int
    {
        $apply = (bool) $this->option('apply');
        $this->info($apply ? 'Adding Opening stock entries…' : 'PREVIEW — nothing will be changed. Add --apply to save.');

        $products = Product::query()
            ->when($this->option('product'), fn ($q, $code) => $q->where('code', $code))
            ->orderBy('id')
            ->get();

        $planned = [];
        foreach ($products as $product) {
            $rows = StockMovement::where('product_id', $product->id)->orderBy('movement_date')->orderBy('id')->get();
            if ($rows->isEmpty()) {
                continue;
            }
            $sum = $rows->sum(fn (StockMovement $m) => $m->movement_type === 'in' ? (int) $m->qty : -(int) $m->qty);
            $hidden = (int) $product->stock_on_hand - $sum;
            if ($hidden > 0) {
                $date = Carbon::parse($rows->first()->movement_date)->subDay()->toDateString();
                $planned[] = [$product, $hidden, $date];
                $this->line("  {$product->code} {$product->name}: +{$hidden} Opening stock on {$date} (stock on hand stays {$product->stock_on_hand})");
            }
        }

        if ($planned === []) {
            $this->info('Nothing to add — every product\'s entries already add up to its stock on hand.');

            return self::SUCCESS;
        }
        if (! $apply) {
            $this->info(count($planned).' entr'.(count($planned) === 1 ? 'y' : 'ies').' would be added. Check each stock on hand is the real count, then run again with --apply.');

            return self::SUCCESS;
        }

        foreach ($planned as [$product, $hidden, $date]) {
            DB::transaction(function () use ($product, $hidden, $date): void {
                StockMovement::create([
                    'product_id' => $product->id,
                    'product_name' => $product->name,
                    'product_category' => $product->category,
                    'movement_type' => 'in',
                    'is_adjustment' => false,
                    'qty' => $hidden,
                    'remaining_stock' => $hidden,
                    'notes' => 'Opening stock (added by data fix)',
                    'recorded_by' => 'System',
                    'movement_date' => $date,
                ]);

                // Rewrite every Balance After from the start, in date order.
                $balance = 0;
                $rows = StockMovement::where('product_id', $product->id)->orderBy('movement_date')->orderBy('id')->get();
                foreach ($rows as $row) {
                    $balance += $row->movement_type === 'in' ? (int) $row->qty : -(int) $row->qty;
                    if ((int) $row->remaining_stock !== $balance) {
                        $row->forceFill(['remaining_stock' => $balance])->saveQuietly();
                    }
                }
            });
            ActivityLog::record('stock.in', "Opening stock +{$hidden} for {$product->name} (added by data fix)", 'boxes', [
                'productId' => $product->code,
                'product' => $product->name,
                'change' => $hidden,
                'qty' => $hidden,
                'type' => 'Stock In',
                'date' => $date,
                'totalQty' => (int) $product->stock_on_hand,
            ]);
        }

        $this->info('Done: added '.count($planned).' Opening stock entr'.(count($planned) === 1 ? 'y' : 'ies').'. Stock on hand did not change.');

        return self::SUCCESS;
    }
}
