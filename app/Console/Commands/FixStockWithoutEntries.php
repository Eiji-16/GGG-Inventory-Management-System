<?php

namespace App\Console\Commands;

use App\Models\ActivityLog;
use App\Models\Product;
use App\Models\StockMovement;
use Illuminate\Console\Command;

/**
 * php artisan inventory:fix-stock-without-entries          → preview only (changes nothing)
 * php artisan inventory:fix-stock-without-entries --apply  → set them to 0
 *
 * 2026-11-10: a product could keep a saved stock (e.g. Aula Keyboard: 3) with
 * NO Stock Control entries behind it — Reports showed 3, Stock Control showed
 * nothing. (Cause: an entry permanently deleted from the Trash Bin while its
 * product was there too, an old starting stock typed on the product, or an
 * old import.) This sets the saved stock of those products to 0, so every
 * screen matches Stock Control.
 *
 * Only active products with NO active stock entries are changed. Products in
 * the Trash Bin are skipped (their entries are in the Trash Bin with them).
 * No entry or product is deleted.
 */
class FixStockWithoutEntries extends Command
{
    protected $signature = 'inventory:fix-stock-without-entries
        {--apply : Actually set the stock to 0 (otherwise only a preview)}';

    protected $description = 'Set the stock to 0 for products that have stock but no Stock Control entries (preview unless --apply)';

    public function handle(): int
    {
        $apply = (bool) $this->option('apply');
        $this->info($apply ? 'Fixing…' : 'PREVIEW — nothing will be changed. Add --apply to save.');

        $withEntries = StockMovement::query()->distinct()->pluck('product_id')->filter()->all();

        $products = Product::query()            // active products only (Trash Bin skipped)
            ->where('stock_on_hand', '!=', 0)
            ->whereNotIn('id', $withEntries)
            ->orderBy('name')
            ->get(['id', 'code', 'name', 'stock_on_hand']);

        if ($products->isEmpty()) {
            $this->info('Nothing to fix — every product with stock has Stock Control entries.');

            return self::SUCCESS;
        }

        foreach ($products as $product) {
            $this->line("  {$product->code} {$product->name}: {$product->stock_on_hand} → 0 (no Stock Control entries)");
        }

        if (! $apply) {
            $this->info($products->count().' product(s) would be set to 0. Run again with --apply to save.');

            return self::SUCCESS;
        }

        foreach ($products as $product) {
            $old = (int) $product->stock_on_hand;
            $product->forceFill(['stock_on_hand' => 0])->save();
            ActivityLog::record('product.update', "Stock set from {$old} to 0 for {$product->name} (no Stock Control entries — data fix)", 'boxes', [
                'productId' => $product->code,
                'product' => $product->name,
                'from' => $old,
                'to' => 0,
            ]);
        }

        $this->info('Done: '.$products->count().' product(s) set to 0.');

        return self::SUCCESS;
    }
}
