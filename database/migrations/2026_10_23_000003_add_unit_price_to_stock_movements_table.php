<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Unit price per stock movement: the cost per unit on a Stock In (supplier
 * delivery) or the selling price per unit on a Stock Out (sale). Optional.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stock_movements', function (Blueprint $table) {
            $table->decimal('unit_price', 12, 2)->nullable()->after('qty');
        });
    }

    public function down(): void
    {
        Schema::table('stock_movements', function (Blueprint $table) {
            $table->dropColumn('unit_price');
        });
    }
};
