<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('safety_stock', function (Blueprint $table) {
            $table->decimal('ordering_cost', 12, 2)->nullable();
            $table->decimal('holding_cost', 12, 2)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('safety_stock', function (Blueprint $table) {
            $table->dropColumn(['ordering_cost', 'holding_cost']);
        });
    }
};
