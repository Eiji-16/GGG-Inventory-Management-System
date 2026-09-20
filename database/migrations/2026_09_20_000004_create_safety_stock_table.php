<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * safety_stock — per-product reorder policy owned by the Super Admin.
 *
 * Maps to src/data/safetyStock.js (SAFETY_STOCK_DEFAULTS):
 *   { safetyStock, annualDemand } keyed by product name  ->  one row per product_id
 *
 * This is the shared authority the whole system leans on: Stock Control reads
 * `safety_stock` to flag low/critical items, and the Auto Calculator pulls
 * `annual_demand` from here during the EOQ handoff. One row per product.
 *
 * The global fallback (DEFAULT_SAFETY_STOCK = 20) is NOT stored here — it belongs
 * in app config / a settings row, applied when a product has no policy row.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('safety_stock', function (Blueprint $table) {
            $table->id();

            $table->foreignId('product_id')
                  ->constrained('products')
                  ->cascadeOnDelete();

            $table->integer('safety_stock')->default(20);   // reorder threshold
            $table->integer('annual_demand')->nullable();   // units/year — feeds EOQ

            $table->timestamps();

            // One policy row per product.
            $table->unique('product_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('safety_stock');
    }
};
