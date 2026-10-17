<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('safety_stock', function (Blueprint $table) {
            $table->unsignedInteger('lead_time_days')->nullable();
            $table->unsignedInteger('order_cycle_days')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('safety_stock', function (Blueprint $table) {
            $table->dropColumn(['lead_time_days', 'order_cycle_days']);
        });
    }
};
