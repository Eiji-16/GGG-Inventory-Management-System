<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Past Sales can now be entered per WEEK as well as per month.
 *
 *   period_type  'month' (period_date = first day of the month)
 *                'week'  (period_date = the Monday that starts the week)
 *
 * Every existing row becomes 'month' (that is what they all are), so nothing
 * changes for data already saved. Only ADDS a column; no rows are erased.
 *
 * The "one row per product + date" rule becomes "one row per product +
 * period type + date". The new rule is added BEFORE the old one is removed,
 * because MySQL needs an index that starts with product_id for its link to
 * the products table.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('past_sales', function (Blueprint $table) {
            $table->string('period_type', 10)->default('month')->after('product_id');
        });

        Schema::table('past_sales', function (Blueprint $table) {
            $table->unique(['product_id', 'period_type', 'period_date'], 'past_sales_product_type_date_unique');
        });

        Schema::table('past_sales', function (Blueprint $table) {
            $table->dropUnique(['product_id', 'period_date']);
        });
    }

    public function down(): void
    {
        // Rolling back would leave weekly rows looking like monthly ones.
        $weekly = DB::table('past_sales')->where('period_type', 'week')->count();
        if ($weekly > 0) {
            throw new RuntimeException("There are {$weekly} weekly past sales rows. Remove them in Forecasting → Past Sales before rolling back this migration.");
        }

        Schema::table('past_sales', function (Blueprint $table) {
            $table->unique(['product_id', 'period_date']);
        });

        Schema::table('past_sales', function (Blueprint $table) {
            $table->dropUnique('past_sales_product_type_date_unique');
            $table->dropColumn('period_type');
        });
    }
};
