<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * products — the catalogue shown in Product & Supplier and referenced everywhere.
 *
 * Column names map to productSupplier.json:
 *   id (PRD-9402)  -> `code`   (kept as a human SKU, not the primary key)
 *   name, category, brand, model, unitMeasure  -> matching columns
 *   supplier*      -> replaced by supplier_id (FK) — see suppliers migration
 *
 * We use a numeric auto-increment `id` as the real primary key (clean FKs) and a
 * separate unique `code` for the "PRD-XXXX" the UI displays. `stock_on_hand` is a
 * cached running balance kept in sync by the stock_movements ledger, so the
 * Stock/Dashboard/Forecast tabs don't have to re-sum the whole ledger each read.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('products', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();            // "PRD-9402" — the UI-facing product id
            $table->string('name');
            $table->string('category')->nullable();
            $table->string('brand')->nullable();
            $table->string('model')->nullable();
            $table->string('unit_measure')->nullable();  // "Units" / "Pairs" / "Boxes" / "Trays"

            // Supplier relationship. nullOnDelete so removing a supplier doesn't
            // wipe the product — it just becomes unassigned.
            $table->foreignId('supplier_id')
                  ->nullable()
                  ->constrained('suppliers')
                  ->nullOnDelete();

            // Cached current balance, maintained by stock_movements (signed ledger).
            $table->integer('stock_on_hand')->default(0);

            // Money is DECIMAL, never FLOAT. Nullable for now — the UI doesn't
            // collect cost yet, but EOQ/holding-cost work will need it.
            $table->decimal('unit_cost', 12, 2)->nullable();

            $table->timestamps();

            $table->index('name');
            $table->index('category');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('products');
    }
};
