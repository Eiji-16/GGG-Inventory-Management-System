<?php

namespace App\Console\Commands;

use App\Models\AppSetting;
use App\Models\Product;
use App\Models\SafetyStock;
use App\Models\SalesHistory;
use App\Models\StockMovement;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

/**
 * php artisan inventory:check
 *
 * READ-ONLY health check of the live database. It never changes, deletes or
 * fixes anything — it only reports. Each check prints PASS, WARN (worth a
 * look) or FAIL (numbers that disagree), with the products involved.
 */
class InventoryCheck extends Command
{
    protected $signature = 'inventory:check';

    protected $description = 'Read-only check that stock, ledger, sales and settings agree (changes nothing)';

    private int $failures = 0;

    private int $warnings = 0;

    public function handle(): int
    {
        $this->info('GGG Inventory — data check (read-only, nothing is changed)');
        $this->newLine();

        $products = Product::withTrashed()->with('safetyStock')->orderBy('id')->get();
        $movementsByProduct = StockMovement::orderBy('movement_date')->orderBy('id')->get()->groupBy('product_id');

        $this->checkStockMatchesLedger($products, $movementsByProduct);
        $this->checkRunningBalances($products, $movementsByProduct);
        $this->checkNegativeStock($products);
        $this->checkMonthlySales($products, $movementsByProduct);
        $this->checkFutureDates();
        $this->checkDuplicateProducts($products);
        $this->checkPolicies();
        $this->checkDeletedProductsWithStock($products);
        $this->checkSettings();

        $this->newLine();
        if ($this->failures === 0 && $this->warnings === 0) {
            $this->info('All checks passed.');
        } else {
            $this->line("Done: {$this->failures} failed, {$this->warnings} warning(s). Nothing was changed.");
        }

        return $this->failures === 0 ? self::SUCCESS : self::FAILURE;
    }

    private function delta(StockMovement $m): int
    {
        return $m->movement_type === 'in' ? (int) $m->qty : -(int) $m->qty;
    }

    private function label(Product $p): string
    {
        return "{$p->code} {$p->name}".($p->trashed() ? ' (deleted)' : '');
    }

    private function result(string $name, array $problems, bool $isFailure = true, string $passNote = ''): void
    {
        if ($problems === []) {
            $this->line("  <fg=green>PASS</>  {$name}".($passNote ? " — {$passNote}" : ''));
            return;
        }
        if ($isFailure) {
            $this->failures++;
            $this->line("  <fg=red>FAIL</>  {$name}");
        } else {
            $this->warnings++;
            $this->line("  <fg=yellow>WARN</>  {$name}");
        }
        foreach (array_slice($problems, 0, 15) as $problem) {
            $this->line("          - {$problem}");
        }
        if (count($problems) > 15) {
            $this->line('          … and '.(count($problems) - 15).' more');
        }
    }

    /** Current stock = the balance after the product's last ledger entry. */
    private function checkStockMatchesLedger($products, $movementsByProduct): void
    {
        $problems = [];
        foreach ($products as $p) {
            $rows = $movementsByProduct[$p->id] ?? collect();
            if ($rows->isEmpty()) {
                continue;
            }
            $last = $rows->last();
            if ((int) $last->remaining_stock !== (int) $p->stock_on_hand) {
                $problems[] = "{$this->label($p)}: stock on hand {$p->stock_on_hand}, but the last entry's Balance After is {$last->remaining_stock}";
            }
        }
        $this->result('Current stock matches the last Balance After', $problems);
    }

    /** Each row's Balance After = previous balance + this row's change. */
    private function checkRunningBalances($products, $movementsByProduct): void
    {
        $problems = [];
        foreach ($products as $p) {
            $rows = $movementsByProduct[$p->id] ?? collect();
            if ($rows->isEmpty()) {
                continue;
            }
            $balance = (int) $p->stock_on_hand - $rows->sum(fn ($m) => $this->delta($m));
            if ($balance < 0) {
                $problems[] = "{$this->label($p)}: the entries add up to more than its stock (opening balance would be {$balance})";
                continue;
            }
            foreach ($rows as $m) {
                $balance += $this->delta($m);
                if ((int) $m->remaining_stock !== $balance) {
                    $problems[] = "{$this->label($p)}: entry #{$m->id} on {$m->movement_date->toDateString()} shows Balance After {$m->remaining_stock}, expected {$balance}";
                    break;
                }
            }
        }
        $this->result('Running balances (Balance After) add up', $problems);
    }

    private function checkNegativeStock($products): void
    {
        $problems = $products->filter(fn ($p) => (int) $p->stock_on_hand < 0)
            ->map(fn ($p) => "{$this->label($p)}: stock {$p->stock_on_hand}")
            ->values()->all();
        $negativeRows = StockMovement::where('remaining_stock', '<', 0)->count();
        if ($negativeRows) {
            $problems[] = "{$negativeRows} ledger entr".($negativeRows === 1 ? 'y has' : 'ies have').' a negative Balance After';
        }
        $this->result('No negative stock', $problems);
    }

    /** sales_history (used by older screens) = Stock Out per month. */
    private function checkMonthlySales($products, $movementsByProduct): void
    {
        $problems = [];
        $history = SalesHistory::where('period_type', 'month')->get()->groupBy('product_id');
        foreach ($products as $p) {
            $fromLedger = ($movementsByProduct[$p->id] ?? collect())
                ->filter(fn ($m) => $m->movement_type === 'out' && ! $m->is_adjustment)
                ->groupBy(fn ($m) => $m->movement_date->copy()->startOfMonth()->toDateString())
                ->map(fn ($g) => (int) $g->sum('qty'));
            $saved = ($history[$p->id] ?? collect())
                ->mapWithKeys(fn ($h) => [$h->period_date->toDateString() => (int) $h->units_sold]);

            foreach ($fromLedger->keys()->merge($saved->keys())->unique() as $month) {
                $a = $fromLedger[$month] ?? 0;
                $b = $saved[$month] ?? 0;
                if ($a !== $b) {
                    $problems[] = "{$this->label($p)}: ".substr($month, 0, 7)." Stock Out total {$a}, saved monthly sales {$b}";
                }
            }
        }
        $this->result('Monthly sales match Stock Out totals', $problems, false);
        if ($problems !== []) {
            $this->line('          Forecasts, Reports and the Dashboard read Stock Out directly, so these old rows');
            $this->line('          no longer affect any screen. To remove them: php artisan inventory:sync-sales');
            $this->line('          (preview first), then php artisan inventory:sync-sales --apply');
        }
    }

    private function checkFutureDates(): void
    {
        $future = StockMovement::where('movement_date', '>', today()->toDateString())->get();
        $problems = $future->map(fn ($m) => "entry #{$m->id} for {$m->product_name} is dated {$m->movement_date->toDateString()}")->all();
        $this->result('No stock entries dated in the future', $problems, false);
    }

    /** Same name, category, brand, model, unit and supplier (ignoring case and spaces). */
    private function checkDuplicateProducts($products): void
    {
        $key = fn ($p) => implode('|', array_map(
            fn ($v) => mb_strtolower(trim((string) $v)),
            [$p->name, $p->category, $p->brand, $p->model, $p->unit_measure, $p->supplier_id]
        ));
        $problems = $products->filter(fn ($p) => ! $p->trashed())
            ->groupBy($key)
            ->filter(fn ($g) => $g->count() > 1)
            ->map(fn ($g) => 'same product saved '.$g->count().' times: '.$g->pluck('code')->implode(', ').' ('.$g->first()->name.')')
            ->values()->all();
        $this->result('No duplicate products (saved before the duplicate check existed)', $problems, false);
    }

    private function checkPolicies(): void
    {
        $problems = [];
        foreach (SafetyStock::with('product')->get() as $policy) {
            $name = $policy->product ? $this->label($policy->product) : "policy #{$policy->id}";
            if ((int) $policy->safety_stock < 0) {
                $problems[] = "{$name}: safety stock is negative";
            }
            if (($policy->status_mode ?? 'auto') === 'manual') {
                if ($policy->low_point === null || $policy->critical_point === null) {
                    $problems[] = "{$name}: Manual mode without both Low and Critical points (Auto is used instead)";
                } elseif ((int) $policy->critical_point > (int) $policy->low_point) {
                    $problems[] = "{$name}: Critical point ({$policy->critical_point}) is above Low point ({$policy->low_point})";
                }
            }
        }
        $this->result('Safety Stock Policy values are valid', $problems, false);
    }

    private function checkDeletedProductsWithStock($products): void
    {
        $problems = $products->filter(fn ($p) => $p->trashed() && (int) $p->stock_on_hand > 0)
            ->map(fn ($p) => "{$this->label($p)} still has {$p->stock_on_hand} in stock (not counted in reports)")
            ->values()->all();
        $this->result('Deleted products have no stock left', $problems, false);
    }

    private function checkSettings(): void
    {
        $problems = [];
        $currency = AppSetting::get('currency');
        if ($currency !== null && ! in_array($currency, AppSetting::CURRENCIES, true)) {
            $problems[] = "currency is '{$currency}', which isn't supported (PHP is used instead)";
        }
        $logo = AppSetting::get('logo');
        if ($logo && ! Storage::disk('local')->exists($logo)) {
            $problems[] = 'the sidebar picture file is missing (the default icon is shown)';
        }
        $this->result('System settings', $problems, false, 'currency '.AppSetting::currency());
    }
}
