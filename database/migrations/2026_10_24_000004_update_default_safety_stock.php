<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('safety_stock', function (Blueprint $table) {
            $table->integer('safety_stock')->default(3)->change();
        });
    }

    public function down(): void
    {
        Schema::table('safety_stock', function (Blueprint $table) {
            $table->integer('safety_stock')->default(20)->change();
        });
    }
};
