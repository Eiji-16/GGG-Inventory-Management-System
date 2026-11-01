<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('past_sales', function (Blueprint $table): void {
            $table->decimal('units_sold', 22, 11)->unsigned()->change();
        });
    }

    public function down(): void
    {
        if (DB::table('past_sales')->whereRaw('units_sold <> ROUND(units_sold, 0)')->exists()) {
            throw new RuntimeException('Cannot restore whole-number past sales while fractional quantities remain.');
        }

        Schema::table('past_sales', function (Blueprint $table): void {
            $table->unsignedInteger('units_sold')->change();
        });
    }
};
