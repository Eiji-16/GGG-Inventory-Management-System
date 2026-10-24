<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds the product's own list of variants (e.g. "Black / M", "White / L"),
 * managed in the Add/Edit Product modal. Stock Control picks a transaction's
 * variant from this list. Stock is still counted per product, not per variant.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->json('variants')->nullable()->after('unit_measure');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn('variants');
        });
    }
};
