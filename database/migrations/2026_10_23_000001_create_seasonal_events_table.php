<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * seasonal_events — owner-flagged promotions / holidays that adjust the WMA
 * forecast (Chapter 1: Seasonal Adjustments; Figure 12).
 *
 *   name            e.g. "Christmas Sale"
 *   start_date      first day of the event
 *   end_date        last day of the event
 *   adjustment_pct  e.g. 35 for +35%, -10 for -10%
 *   scope           all | categories | products  (affected products)
 *   categories      JSON list of category names when scope = categories
 *   product_ids     JSON list of product codes when scope = products
 *   is_active       paused events are ignored by the forecast
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('seasonal_events', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120);
            $table->date('start_date');
            $table->date('end_date');
            $table->decimal('adjustment_pct', 7, 2);
            $table->string('scope', 20)->default('all');
            $table->json('categories')->nullable();
            $table->json('product_ids')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['start_date', 'end_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('seasonal_events');
    }
};
