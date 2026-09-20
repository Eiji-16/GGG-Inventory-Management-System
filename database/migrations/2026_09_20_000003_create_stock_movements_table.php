<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * stock_movements — append-only ledger of every Stock In / Stock Out event.
 *
 * Column names map to stockControl.json:
 *   date            -> movement_date
 *   productName     -> product_id (FK) + denormalised product_name for display
 *   category        -> product_category (denormalised snapshot at time of movement)
 *   type            -> movement_type enum ('in' | 'out')  (UI shows "Stock In"/"Stock Out")
 *   qty             -> qty (always positive; the sign is implied by movement_type)
 *   remainingStock  -> remaining_stock (snapshot of the balance right after this row)
 *   notes           -> notes
 *   recordedBy      -> recorded_by (free text now; becomes users FK in the auth phase)
 *
 * Ledger rule: this table is never edited or deleted in normal use — corrections
 * are new rows. products.stock_on_hand is updated in the SAME transaction that
 * inserts a movement, so the cache can never drift from the ledger.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_movements', function (Blueprint $table) {
            $table->id();

            $table->foreignId('product_id')
                  ->constrained('products')
                  ->cascadeOnDelete();

            // Denormalised snapshots so a historical ledger row still reads
            // correctly even if the product is later renamed/recategorised.
            $table->string('product_name');
            $table->string('product_category')->nullable();

            $table->enum('movement_type', ['in', 'out']);
            $table->integer('qty');                 // positive count of units moved
            $table->integer('remaining_stock');     // balance immediately after this movement
            $table->string('notes')->nullable();
            $table->string('recorded_by')->nullable();
            $table->date('movement_date');

            $table->timestamps();

            $table->index('product_id');
            $table->index('movement_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_movements');
    }
};
