<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const TABLES = ['stock_movements', 'sales_history', 'past_sales'];

    public function up(): void
    {
        foreach (self::TABLES as $tableName) {
            Schema::table($tableName, function (Blueprint $table): void {
                $table->dropForeign(['product_id']);
                $table->unsignedBigInteger('product_id')->nullable()->change();
                $table->foreign('product_id')->references('id')->on('products')->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        foreach (self::TABLES as $tableName) {
            if (DB::table($tableName)->whereNull('product_id')->exists()) {
                throw new RuntimeException(
                    "Cannot roll back history preservation while {$tableName} contains records whose product was permanently deleted."
                );
            }
        }

        foreach (self::TABLES as $tableName) {
            Schema::table($tableName, function (Blueprint $table): void {
                $table->dropForeign(['product_id']);
                $table->unsignedBigInteger('product_id')->nullable(false)->change();
                $table->foreign('product_id')->references('id')->on('products')->cascadeOnDelete();
            });
        }
    }
};
