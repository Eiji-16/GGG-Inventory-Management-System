<?php

namespace App\Console\Commands;

use App\Models\Product;
use App\Models\SalesHistory;
use App\Models\StockMovement;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * php artisan inventory:sync-sales            → preview only (changes nothing)
 * php artisan inventory:sync-sales --apply    → rebuild the saved monthly sales
 *
 * sales_history keeps each product's monthly Stock Out total. It is normally
 * updated automatically, but rows could be left behind (e.g. older manual
 * entries, or before "clear stock" also cleared them). This rebuilds it from
 * the Stock Out entries. Stock, the ledger, Past Sales and forecasts are not
 * touched.
 */
class SyncMonthlySales extends Command
{
    protected $signature = 'inventory:sync-sales {--apply : Actually save the changes (otherwise only a preview)}';

    protected $description = 'Rebuild saved monthly sales from Stock Out entries (preview unless --apply)';

    public function handle(): int
    {
        $apply = (bool) $this->option('apply');
        $this->info($apply ? 'Rebuilding monthly sales from Stock Out…' : 'PREVIEW — nothing will be changed. Add --apply to save.');

        $fromLedger = StockMovement::where('movement_type', 'out')
            ->where('is_adjustment', false)
            ->get(['product_id', 'qty', 'movement_date'])
            ->groupBy(fn ($m) => $m->product_id.'|'.$m->movement_date->copy()->startOfMonth()->toDateString())
            ->map(fn ($g) => (int) $g->sum('qty'));

        $saved = SalesHistory::where('period_type', 'month')->get()
            ->keyBy(fn ($h) => $h->product_id.'|'.$h->period_date->toDateString());

        $names = Product::withTrashed()->pluck('name', 'id');
        $changes = [];
        foreach ($saved as $key => $row) {
            $correct = $fromLedger[$key] ?? 0;
            if ($correct === 0) {
                $changes[] = ['remove', $row->product_id, $row->period_date->format('Y-m'), (int) $row->units_sold, 0];
            } elseif ($correct !== (int) $row->units_sold) {
                $changes[] = ['update', $row->product_id, $row->period_date->format('Y-m'), (int) $row->units_sold, $correct];
            }
        }
        foreach ($fromLedger as $key => $units) {
            if (! isset($saved[$key])) {
                [$productId, $month] = explode('|', $key);
                $changes[] = ['add', (int) $productId, substr($month, 0, 7), 0, $units];
            }
        }

        if ($changes === []) {
            $this->info('Nothing to change — monthly sales already match Stock Out.');
            return self::SUCCESS;
        }

        $this->table(
            ['Action', 'Product', 'Month', 'Saved now', 'From Stock Out'],
            array_map(fn ($c) => [$c[0], $names[$c[1]] ?? "#{$c[1]}", $c[2], $c[3], $c[4]], $changes)
        );

        if (! $apply) {
            $this->line(count($changes).' change(s) would be made. Run again with --apply to save them.');
            return self::SUCCESS;
        }

        DB::transaction(function () use ($changes): void {
            foreach ($changes as [$action, $productId, $month, , $units]) {
                $date = $month.'-01';
                if ($action === 'remove') {
                    SalesHistory::where('product_id', $productId)->where('period_type', 'month')
                        ->whereDate('period_date', $date)->delete();
                } else {
                    SalesHistory::updateOrCreate(
                        ['product_id' => $productId, 'period_type' => 'month', 'period_date' => $date],
                        ['units_sold' => $units]
                    );
                }
            }
        });

        $this->info(count($changes).' change(s) saved.');

        return self::SUCCESS;
    }
}
