<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * past_sales — monthly units sold BEFORE the business started recording in
 * Stock Control (e.g. taken from the owner's old Excel sheets). Used only as
 * forecasting history; it never changes stock on hand.
 *
 *   period_date  first day of the month (e.g. 2026-03-01)
 *   units_sold   total units sold in that month
 *   source       manual (typed in the month grid) | import (Excel upload)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('past_sales', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->date('period_date');
            $table->unsignedInteger('units_sold');
            $table->string('source', 20)->default('manual');
            $table->timestamps();

            $table->unique(['product_id', 'period_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('past_sales');
    }
};
