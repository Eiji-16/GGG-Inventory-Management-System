<?php

namespace Database\Seeders;

use App\Models\Product;
use App\Models\SafetyStock;
use App\Models\SalesHistory;
use App\Models\StockMovement;
use App\Models\Supplier;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * InventorySeeder — loads the existing frontend mock data into the real tables so
 * there's realistic data to build the API against.
 *
 * Sources:
 *   public/productSupplier.json  -> suppliers + products
 *   src/data/safetyStock.js      -> safety_stock (hardcoded below; can't require a JS file)
 *   public/stockControl.json     -> stock_movements (+ recomputes products.stock_on_hand)
 *   Forecasting SAMPLE_HISTORY    -> sales_history for the sample product
 *
 * Idempotent: uses firstOrCreate / updateOrCreate, so running it again won't
 * create duplicates.
 */
class InventorySeeder extends Seeder
{
    public function run(): void
    {
        $this->seedProductsAndSuppliers();
        $this->seedSafetyStock();
        $this->seedStockMovements();
        $this->seedSalesHistory();
    }

    /** productSupplier.json -> suppliers (deduped) + products (deduped by code). */
    private function seedProductsAndSuppliers(): void
    {
        $rows = $this->readJson(public_path('productSupplier.json'));
        if (! $rows) {
            $this->command?->warn('productSupplier.json not found or empty — skipping products.');
            return;
        }

        foreach ($rows as $row) {
            // The JSON denormalises supplier info onto each product and repeats
            // products many times. Dedupe both here.
            $supplier = null;
            $supplierName = $row['supplierName'] ?? $row['company'] ?? null;
            if ($supplierName) {
                $supplier = Supplier::firstOrCreate(
                    ['name' => $supplierName],
                    [
                        'contact' => $row['supplierContact'] ?? null,
                        'company' => $row['company'] ?? $supplierName,
                    ]
                );
            }

            Product::updateOrCreate(
                ['code' => $row['id']],                 // "PRD-9402"
                [
                    'name'         => $row['name'] ?? '',
                    'category'     => $row['category'] ?? null,
                    'brand'        => $row['brand'] ?? null,
                    'model'        => $row['model'] ?? null,
                    'unit_measure' => $row['unitMeasure'] ?? null,
                    'supplier_id'  => $supplier?->id,
                ]
            );
        }

        $this->command?->info('Seeded '.Supplier::count().' suppliers, '.Product::count().' products.');
    }

    /**
     * safety_stock rows. These live in src/data/safetyStock.js (a JS module we
     * can't require from PHP), so the policy is mirrored here, keyed by product
     * name -> resolved to product_id.
     */
    private function seedSafetyStock(): void
    {
        $policy = [
            'Premium Calfskin Band'        => ['safetyStock' => 25, 'annualDemand' => 960],
            'Water-Resistant Diver Strap'  => ['safetyStock' => 45, 'annualDemand' => 1240],
            'Precision Steel Chronograph'  => ['safetyStock' => 40, 'annualDemand' => 1500],
            'Sapphire Crystal Glass Face'  => ['safetyStock' => 60, 'annualDemand' => 2100],
        ];

        foreach ($policy as $productName => $values) {
            $product = Product::where('name', $productName)->first();
            if (! $product) {
                continue;
            }

            SafetyStock::updateOrCreate(
                ['product_id' => $product->id],
                [
                    'safety_stock'  => $values['safetyStock'],
                    'annual_demand' => $values['annualDemand'],
                ]
            );
        }

        $this->command?->info('Seeded '.SafetyStock::count().' safety-stock policies.');
    }

    /**
     * stockControl.json -> stock_movements ledger. Also sets each product's
     * cached stock_on_hand from its most recent movement's remaining_stock.
     */
    private function seedStockMovements(): void
    {
        $rows = $this->readJson(public_path('stockControl.json'));
        if (! $rows) {
            $this->command?->warn('stockControl.json not found or empty — skipping movements.');
            return;
        }

        // Start clean so re-running doesn't stack duplicate ledger rows.
        StockMovement::query()->delete();

        foreach ($rows as $row) {
            $product = Product::where('name', $row['productName'] ?? null)->first();
            if (! $product) {
                continue; // movement references a product not in the catalogue
            }

            StockMovement::create([
                'product_id'       => $product->id,
                'product_name'     => $row['productName'],
                'product_category' => $row['category'] ?? null,
                'movement_type'    => ($row['type'] ?? '') === 'Stock In' ? 'in' : 'out',
                'qty'              => (int) ($row['qty'] ?? 0),
                'remaining_stock'  => (int) ($row['remainingStock'] ?? 0),
                'notes'            => $row['notes'] ?? null,
                'recorded_by'      => $row['recordedBy'] ?? null,
                'movement_date'    => $row['date'] ?? now()->toDateString(),
            ]);
        }

        // Cache stock_on_hand = remaining_stock of the latest movement per product.
        $latest = StockMovement::orderBy('movement_date')->orderBy('id')->get()
            ->groupBy('product_id');

        foreach ($latest as $productId => $movements) {
            $last = $movements->last();
            Product::where('id', $productId)->update(['stock_on_hand' => $last->remaining_stock]);
        }

        $this->command?->info('Seeded '.StockMovement::count().' stock movements.');
    }

    /**
     * sales_history for the Forecasting sample product (Precision Steel
     * Chronograph). 12 months of the current year, matching SAMPLE_HISTORY.
     */
    private function seedSalesHistory(): void
    {
        $product = Product::where('name', 'Precision Steel Chronograph')->first();
        if (! $product) {
            return;
        }

        $monthly = [18, 22, 19, 25, 30, 28, 33, 31, 29, 36, 40, 38]; // Jan..Dec
        $year = (int) now()->year;

        foreach ($monthly as $i => $units) {
            $periodDate = Carbon::create($year, $i + 1, 1)->toDateString();

            SalesHistory::updateOrCreate(
                ['product_id' => $product->id, 'period_date' => $periodDate],
                ['units_sold' => $units]
            );
        }

        $this->command?->info('Seeded '.SalesHistory::count().' sales-history rows.');
    }

    /** Read + decode a JSON file, returning an array (or null if missing/invalid). */
    private function readJson(string $path): ?array
    {
        if (! is_file($path)) {
            return null;
        }

        $decoded = json_decode(file_get_contents($path), true);

        return is_array($decoded) ? $decoded : null;
    }
}
