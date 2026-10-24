<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Stock status points per product (Settings → Advanced Options).
 *   status_mode = 'auto'   → Critical at safety stock, Low at reorder point
 *   status_mode = 'manual' → Critical at critical_point, Low at low_point
 * Healthy is anything above the Low point.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('safety_stock', function (Blueprint $table) {
            $table->string('status_mode', 10)->default('auto');
            $table->integer('low_point')->nullable();
            $table->integer('critical_point')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('safety_stock', function (Blueprint $table) {
            $table->dropColumn(['status_mode', 'low_point', 'critical_point']);
        });
    }
};
