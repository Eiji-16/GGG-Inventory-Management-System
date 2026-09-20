<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * sales_history — monthly units-sold per product, feeds the Forecasting chart
 * and the moving-average / trend forecast.
 *
 * Maps to Forecasting SAMPLE_HISTORY: { period: 'Jan', units: 18 }
 *   period -> stored as a real `period_date` (first of the month) so rows sort
 *             and range-query correctly; the API formats it back to 'Jan' etc.
 *   units  -> units_sold
 *
 * Storing an actual date (not just a 'Jan' label) avoids ambiguity across years
 * and lets forecasting do proper ORDER BY / date-range queries.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sales_history', function (Blueprint $table) {
            $table->id();

            $table->foreignId('product_id')
                  ->constrained('products')
                  ->cascadeOnDelete();

            $table->date('period_date');            // first day of the sales month
            $table->integer('units_sold')->default(0);

            $table->timestamps();

            // One sales figure per product per month.
            $table->unique(['product_id', 'period_date']);
            $table->index('period_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sales_history');
    }
};
