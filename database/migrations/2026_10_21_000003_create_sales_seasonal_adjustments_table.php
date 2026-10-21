<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sales_seasonal_adjustments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->unsignedSmallInteger('year');
            $table->unsignedTinyInteger('month');
            $table->boolean('enabled')->default(false);
            $table->json('events');
            $table->timestamps();
            $table->unique(
                ['product_id', 'year', 'month'],
                'sales_seasonal_adjustments_product_period_unique'
            );
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sales_seasonal_adjustments');
    }
};
