<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales_history', function (Blueprint $table) {
            $table->index('product_id', 'sales_history_product_id_index');
        });

        Schema::table('sales_history', function (Blueprint $table) {
            $table->dropUnique('sales_history_product_id_period_date_unique');
        });

        Schema::table('sales_history', function (Blueprint $table) {
            $table->string('period_type', 10)->default('month')->after('period_date');
            $table->unique(
                ['product_id', 'period_type', 'period_date'],
                'sales_history_product_period_type_date_unique'
            );
        });
    }

    public function down(): void
    {
        Schema::table('sales_history', function (Blueprint $table) {
            $table->dropUnique('sales_history_product_period_type_date_unique');
        });

        Schema::table('sales_history', function (Blueprint $table) {
            $table->unique(
                ['product_id', 'period_date'],
                'sales_history_product_id_period_date_unique'
            );
            $table->dropColumn('period_type');
        });

        Schema::table('sales_history', function (Blueprint $table) {
            $table->dropIndex('sales_history_product_id_index');
        });
    }
};
