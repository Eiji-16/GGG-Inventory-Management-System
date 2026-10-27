<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Trash Bin.
 *
 * Deleting a product or a stock entry now moves it to the Trash Bin
 * (soft delete) instead of erasing it. These columns remember who deleted
 * it; deleted_at (already on products) remembers when.
 *
 *  stock_movements.deleted_at            when the entry was moved to the Trash Bin
 *  stock_movements.deleted_by / _name    who did it (the name is kept even if the account is removed later)
 *  stock_movements.deleted_with_product  true = it went to the Trash Bin together with its product,
 *                                        so restoring the product brings it back too
 *  products.deleted_by / _name           who moved the product to the Trash Bin
 *
 * Only ADDS columns. No rows are erased.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stock_movements', function (Blueprint $table) {
            $table->softDeletes();
            $table->foreignId('deleted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('deleted_by_name')->nullable();
            $table->boolean('deleted_with_product')->default(false);
            $table->index('deleted_at');
        });

        Schema::table('products', function (Blueprint $table) {
            $table->foreignId('deleted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('deleted_by_name')->nullable();
        });

        // Products deleted BEFORE the Trash Bin existed kept their stock
        // entries as visible history. Under the new rule a product's entries
        // go to the Trash Bin with it, so mark those entries the same way
        // (same date as the product). Nothing is erased: restoring the
        // product from the Trash Bin brings them back.
        DB::table('products')
            ->whereNotNull('deleted_at')
            ->orderBy('id')
            ->get(['id', 'deleted_at'])
            ->each(function ($product): void {
                DB::table('stock_movements')
                    ->where('product_id', $product->id)
                    ->whereNull('deleted_at')
                    ->update([
                        'deleted_at' => $product->deleted_at,
                        'deleted_with_product' => true,
                    ]);
            });
    }

    public function down(): void
    {
        // Rolling back would bring every trashed stock entry back into the
        // stock totals without updating them. Refuse while any exist; restore
        // or permanently delete them from the Trash Bin first.
        $trashedEntries = DB::table('stock_movements')
            ->whereNotNull('deleted_at')
            ->where('deleted_with_product', false)
            ->count();
        if ($trashedEntries > 0) {
            throw new RuntimeException(
                "There are {$trashedEntries} stock entries in the Trash Bin. Restore or permanently delete them before rolling back this migration."
            );
        }

        Schema::table('products', function (Blueprint $table) {
            $table->dropConstrainedForeignId('deleted_by');
            $table->dropColumn('deleted_by_name');
        });

        Schema::table('stock_movements', function (Blueprint $table) {
            $table->dropIndex(['deleted_at']);
            $table->dropConstrainedForeignId('deleted_by');
            $table->dropColumn(['deleted_by_name', 'deleted_with_product']);
            $table->dropSoftDeletes();
        });
    }
};
